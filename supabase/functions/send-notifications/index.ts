import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
// Email provider auto-detect (Option A): Microsoft Graph if MS_* creds are set
// (Office365 blocks basic SMTP AUTH), otherwise SMTP via nodemailer (Gmail/any).
import nodemailer from "npm:nodemailer";
import ExcelJS from "npm:exceljs";

// Threshold: at or below this many rows -> inline HTML table.
// Above this -> short summary email + color-coded .xlsx attachment.
const INLINE_ROW_LIMIT = 5;

// ── Microsoft Graph (OAuth2 app-only) email sender ────────────────────────────
// True when Microsoft Graph credentials are configured.
function hasGraphCreds(): boolean {
  return !!(Deno.env.get("MS_TENANT_ID") && Deno.env.get("MS_CLIENT_ID") && Deno.env.get("MS_CLIENT_SECRET"));
}

// Acquire an app-only token using the Azure AD app registration.
async function getGraphToken(): Promise<string> {
  const tenantId = Deno.env.get("MS_TENANT_ID");
  const clientId = Deno.env.get("MS_CLIENT_ID");
  const clientSecret = Deno.env.get("MS_CLIENT_SECRET");
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET) missing");
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Failed to get Graph token: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

// Send an email (optionally with a single attachment) via Graph as `fromEmail`.
async function sendViaGraph(opts: {
  token: string;
  fromEmail: string;
  to: string[];
  subject: string;
  html: string;
  attachment?: { filename: string; contentBytes: string; contentType: string };
}): Promise<void> {
  const message: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.html },
    toRecipients: opts.to.map((address) => ({ emailAddress: { address } })),
  };
  if (opts.attachment) {
    message.attachments = [{
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: opts.attachment.filename,
      contentType: opts.attachment.contentType,
      contentBytes: opts.attachment.contentBytes,
    }];
  }
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(opts.fromEmail)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }
  );
  if (res.status !== 202) {
    const errText = await res.text();
    throw new Error(`Graph sendMail failed (${res.status}): ${errText}`);
  }
}

// Encode bytes to base64 (for Graph fileAttachment.contentBytes).
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface ResultRow {
  id: string;
  vendor: string;
  product_name: string;
  version: string | null;
  org_name: string | null;
  email_id: string;
  cve_match: string | null;
  severity_cve: string | null;
  cert_in: string | null;
  severity_cert_in: string | null;
  description: string | null;
  cvss_score: number | null;
  last_modified: string | null;
  reference_url: string | null;
}

// Normalized dedup key: user + product + specific advisory (cve or civn)
function advisoryKey(r: ResultRow): string {
  const adv = r.cve_match || r.cert_in || "";
  return [
    (r.vendor || "").toLowerCase(),
    (r.product_name || "").toLowerCase(),
    (r.version || "").toLowerCase(),
    adv.toLowerCase(),
  ].join("|");
}

function effectiveSeverity(r: ResultRow): string {
  const s = r.severity_cve || r.severity_cert_in || "Low";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function esc(s: any): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sevColor(sev: string): string {
  switch (sev) {
    case "Critical": return "#dc2626";
    case "High":     return "#ea580c";
    case "Medium":   return "#ca8a04";
    default:         return "#16a34a";
  }
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  try { return new Date(v).toISOString().slice(0, 10); } catch { return "—"; }
}

// Clean up description: NVD templates sometimes contain literal placeholders
// like "<insert attack vector here>" — strip those so customers don't see them.
function cleanDescription(d: string | null): string {
  if (!d) return "";
  return d.replace(/<insert[^>]*here>/gi, "").replace(/\s{2,}/g, " ").trim();
}

// ARGB fills for Excel severity cells (matches the email color scheme).
function sevArgb(sev: string): string {
  switch (sev) {
    case "Critical": return "FFDC2626";
    case "High":     return "FFEA580C";
    case "Medium":   return "FFCA8A04";
    default:         return "FF16A34A";
  }
}

// Build a real color-coded .xlsx (Uint8Array). Dark header band, colored
// severity cells, striped rows, hyperlinked CVE / CERT-In / Reference.
async function buildDigestExcel(rows: ResultRow[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vulnerix";
  wb.created = new Date();
  const ws = wb.addWorksheet("Advisories", { views: [{ state: "frozen", ySplit: 1 }] });

  const anyCivn = rows.some((r) => !!r.cert_in);
  const columns: any[] = [
    { header: "CVE ID", key: "cve", width: 20 },
    ...(anyCivn ? [{ header: "CERT-In", key: "civn", width: 20 }] : []),
    { header: "Severity", key: "sev", width: 12 },
    { header: "CVSS", key: "cvss", width: 8 },
    { header: "Vendor", key: "vendor", width: 16 },
    { header: "Product", key: "product", width: 18 },
    { header: "Version", key: "version", width: 12 },
    { header: "Last Modified", key: "published", width: 16 },
    { header: "Description", key: "description", width: 70 },
    { header: "Reference", key: "reference", width: 45 },
  ];
  ws.columns = columns;

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  const linkFont = { color: { argb: "FF2563EB" }, underline: true, size: 10 };

  rows.forEach((r, i) => {
    const sev = effectiveSeverity(r);
    const nvdLink = r.cve_match ? `https://nvd.nist.gov/vuln/detail/${r.cve_match}` : "";
    const civnLink = r.cert_in ? `https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES01&VLCODE=${encodeURIComponent(r.cert_in)}` : "https://www.cert-in.org.in/";
    const refLink = nvdLink || r.reference_url || "";

    const rowData: any = {
      cve: r.cve_match || "-",
      sev,
      cvss: r.cvss_score ?? "-",
      vendor: r.vendor || "",
      product: r.product_name || "",
      version: r.version || "-",
      published: fmtDate(r.last_modified),
      description: cleanDescription(r.description),
      reference: refLink,
    };
    if (anyCivn) rowData.civn = r.cert_in || "-";

    const row = ws.addRow(rowData);
    const bandArgb = i % 2 === 0 ? "FFFFFFFF" : "FFF1F5F9";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bandArgb } };
      cell.alignment = { vertical: "top", wrapText: true };
      cell.font = { size: 10, color: { argb: "FF0F172A" } };
    });

    // Severity — colored fill, white bold.
    const sevCell = row.getCell("sev");
    sevCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sevArgb(sev) } };
    sevCell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 10 };
    sevCell.alignment = { vertical: "middle", horizontal: "center" };

    // Hyperlinks: CVE ID, CERT-In, Reference.
    if (nvdLink) {
      const c = row.getCell("cve");
      c.value = { text: r.cve_match!, hyperlink: nvdLink } as any;
      c.font = linkFont;
    }
    if (anyCivn && r.cert_in) {
      const c = row.getCell("civn");
      c.value = { text: r.cert_in, hyperlink: civnLink } as any;
      c.font = linkFont;
    }
    if (refLink) {
      const c = row.getCell("reference");
      c.value = { text: refLink, hyperlink: refLink } as any;
      c.font = linkFont;
    }
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

// Summary email body used when the list is large and details are attached as
// a spreadsheet. Explains what happened in plain language (no jargon).
function buildAllClearHtml(products: {vendor: string; product: string; version: string}[], orgName: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const productRows = products.map((p, i) => {
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    return `<tr>
      <td style="padding:8px 10px;font-size:13px;color:#0f172a;border:1px solid #e2e8f0;background:${bg};">${esc(p.vendor)}</td>
      <td style="padding:8px 10px;font-size:13px;color:#0f172a;border:1px solid #e2e8f0;background:${bg};">${esc(p.product)}</td>
      <td style="padding:8px 10px;font-size:13px;color:#0f172a;border:1px solid #e2e8f0;background:${bg};">${esc(p.version || "All")}</td>
    </tr>`;
  }).join("");

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:900px;margin:0 auto;color:#0f172a;">
    <div style="padding:20px 24px;border:1px solid #e2e8f0;border-radius:10px;">
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
        <h2 style="margin:0 0 4px;color:#065f46;font-size:18px;">\u2705 All Clear \u2014 No New Vulnerabilities Found</h2>
        <p style="margin:0;color:#047857;font-size:14px;">
          Great news! No new CVE or CERT-In advisories have been found for <strong>${esc(orgName)}</strong> since the last report.
        </p>
      </div>
      <p style="font-size:14px;color:#334155;line-height:1.55;">
        The following products are being continuously monitored by Vulnerix:
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead>
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#ffffff;background:#1e293b;border:1px solid #334155;">Vendor</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#ffffff;background:#1e293b;border:1px solid #334155;">Product</th>
            <th style="padding:8px 10px;text-align:left;font-size:12px;color:#ffffff;background:#1e293b;border:1px solid #334155;">Version</th>
          </tr>
        </thead>
        <tbody>${productRows}</tbody>
      </table>
      <p style="font-size:14px;color:#334155;line-height:1.55;margin-top:16px;">
        Vulnerix checks your tech stack against the <strong>National Vulnerability Database (NVD)</strong>
        and <strong>CERT-In</strong> advisories. If any new vulnerability is discovered, you will be
        notified immediately as per your notification preferences.
      </p>
      <p style="font-size:14px;color:#334155;line-height:1.55;">
        Visit your <a href="https://vulnerix.avotrix.in/dashboard" style="color:#2563eb;text-decoration:none;font-weight:600;">Vulnerix Dashboard</a> for the full advisory history.
      </p>
    </div>
    <div style="padding:14px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;background:#f8fafc;">
      <p style="margin:0;color:#64748b;font-size:12px;">Powered by Vulnerix \u2022 Continuous vulnerability intelligence for your tech stack</p>
    </div>
  </div>`;
}

function buildSummaryHtml(rows: ResultRow[]): string {
  const anyCivn = rows.some((r) => !!r.cert_in);
  const sources = anyCivn
    ? "the National Vulnerability Database (NVD) and CERT-In"
    : "the National Vulnerability Database (NVD)";
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:700px;margin:0 auto;color:#0f172a;">
    <div style="background:#1e293b;padding:20px 24px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;">Vulnerix — Vulnerability Alert</h1>
      <p style="margin:6px 0 0;color:#cbd5e1;font-size:13px;">${rows.length} new advisories matched against your tech stack</p>
    </div>
    <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;">
      <p style="font-size:14px;">Hello Team,</p>
      <p style="font-size:14px;color:#334155;line-height:1.55;">
        Vulnerix has detected <strong>${rows.length}</strong> vulnerabilities in the technology
        stack you registered. These advisories are sourced from ${sources}.
      </p>
      <p style="font-size:14px;color:#334155;line-height:1.55;">
        The complete details are attached as an Excel spreadsheet
        (<strong>Vulnerix_Advisories.xlsx</strong>). Please review and take action.
      </p>
      <p style="font-size:14px;color:#334155;line-height:1.55;">
        You can get these details directly from <a href="https://vulnerix.avotrix.in/dashboard" style="color:#2563eb;text-decoration:none;font-weight:600;">Vulnerix</a>.
      </p>
    </div>
    <div style="padding:14px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;background:#f8fafc;">
      <p style="margin:0;color:#64748b;font-size:12px;">Powered by Vulnerix</p>
    </div>
  </div>`;
}

// Build the branded HTML digest for one recipient group.
function buildDigestHtml(rows: ResultRow[]): string {
  const anyCivn = rows.some((r) => !!r.cert_in);

  const headerCells = [
    "CVE ID",
    ...(anyCivn ? ["CERT-In"] : []),
    "Severity", "CVSS", "Vendor", "Product", "Version", "Last Modified", "Description",
  ];

  const th = (t: string) =>
    `<th style="padding:8px 10px;text-align:left;font-size:12px;color:#ffffff;background:#1e293b;border:1px solid #334155;white-space:nowrap;">${t}</th>`;

  const headRow = `<tr>${headerCells.map(th).join("")}</tr>`;

  const bodyRows = rows.map((r, i) => {
    const sev = effectiveSeverity(r);
    const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    const cveCell = r.cve_match
      ? `<a href="https://nvd.nist.gov/vuln/detail/${esc(r.cve_match)}" style="color:#2563eb;text-decoration:none;">${esc(r.cve_match)}</a>`
      : "—";
    const civnCell = r.cert_in
      ? `<a href="${esc(r.cert_in ? `https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES01&VLCODE=${encodeURIComponent(r.cert_in)}` : "https://www.cert-in.org.in/")}" style="color:#2563eb;text-decoration:none;">${esc(r.cert_in)}</a>`
      : "—";
    const desc = cleanDescription(r.description);
    const shortDesc = desc.length > 150 ? esc(desc.slice(0, 150)) + "…" : esc(desc);
    // "Read full" -> official NVD detail page (same as the CVE ID link), so the
    // user sees ALL references there and can pick any. For CIVN-only rows, use
    // the CERT-In advisory URL.
    const fullLink = r.cve_match
      ? `https://nvd.nist.gov/vuln/detail/${esc(r.cve_match)}`
      : (r.cert_in ? `https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES01&VLCODE=${encodeURIComponent(r.cert_in)}` : (r.reference_url || "https://www.cert-in.org.in/"));
    const readFull = desc.length > 150
      ? ` <a href="${fullLink}" style="color:#2563eb;">Read full</a>`
      : "";

    const td = (c: string, extra = "") =>
      `<td style="padding:8px 10px;font-size:12px;color:#0f172a;border:1px solid #e2e8f0;background:${bg};${extra}">${c}</td>`;

    const cells = [
      td(cveCell, "white-space:nowrap;"),
      ...(anyCivn ? [td(civnCell, "white-space:nowrap;")] : []),
      td(`<span style="color:${sevColor(sev)};font-weight:600;">${esc(sev)}</span>`, "white-space:nowrap;"),
      td(esc(r.cvss_score ?? "—"), "white-space:nowrap;"),
      td(esc(r.vendor)),
      td(esc(r.product_name)),
      td(esc(r.version || "—"), "white-space:nowrap;"),
      td(fmtDate(r.last_modified), "white-space:nowrap;"),
      td(`${shortDesc}${readFull}`, "min-width:260px;"),
    ];
    return `<tr>${cells.join("")}</tr>`;
  }).join("");

  const sources = anyCivn
    ? "the National Vulnerability Database (NVD) and CERT-In"
    : "the National Vulnerability Database (NVD)";

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:900px;margin:0 auto;color:#0f172a;">
    <div style="background:#1e293b;padding:20px 24px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;color:#ffffff;font-size:20px;">Vulnerix — Vulnerability Alert</h1>
      <p style="margin:6px 0 0;color:#cbd5e1;font-size:13px;">${rows.length} new advisories matched against your tech stack</p>
    </div>
    <div style="padding:20px 24px;border:1px solid #e2e8f0;border-top:none;">
      <p style="font-size:14px;">Hello Team,</p>
      <p style="font-size:14px;color:#334155;line-height:1.55;">
        Vulnerix has detected the following vulnerabilities in your registered technology stack.
        These advisories are sourced from ${sources}. Please review and take action.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px;">
        <thead>${headRow}</thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <p style="font-size:14px;color:#334155;line-height:1.55;margin-top:12px;">
        You can get these details directly from <a href="https://vulnerix.avotrix.in/dashboard" style="color:#2563eb;text-decoration:none;font-weight:600;">Vulnerix</a>.
      </p>
    </div>
    <div style="padding:14px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;background:#f8fafc;">
      <p style="margin:0;color:#64748b;font-size:12px;">Powered by Vulnerix</p>
    </div>
  </div>`;
}

// IST offset in minutes (UTC+5:30). The edge/DB containers run in UTC, but the
// UI shows IST and the customer picks an IST time. We compare everything in IST
// so "9:00 AM" in the UI actually fires at 9:00 AM IST.
const IST_OFFSET_MIN = 5 * 60 + 30;

// Parse "HH:MM_AM" / "HH:MM_PM" into 24-hour {hour, min}. Returns null if invalid.
function parseCronTime(cronTime: string | null): { hour: number; min: number } | null {
  if (!cronTime || !cronTime.includes("_")) return null;
  const [timeStr, period] = cronTime.split("_");
  if (!timeStr || !period) return null;
  const [hourStr, minStr] = timeStr.split(":");
  let hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  if (isNaN(hour) || isNaN(min)) return null;
  const p = period.toUpperCase();
  if (p === "PM" && hour !== 12) hour += 12;
  if (p === "AM" && hour === 12) hour = 0;
  return { hour, min };
}

// Check if the current moment (in IST) is within the scheduled hour for this
// user. The scheduler runs hourly, so we fire when the current IST hour equals
// the scheduled hour (and, for weekly, the day matches). This avoids both
// "never fires" and "fires every hour after the time passed".
// Scheduler runs every 5 minutes. A daily/weekly user is "due" when their chosen
// IST time falls in the window (now - 5min, now]. Because the UI restricts times
// to the 15-min grid (:00/:15/:30/:45) and the scheduler ticks every 5 min, a
// normal (pre-saved) schedule matches exactly on its minute. A save made just
// after the tick is caught by the next tick (≤5 min later). Dedup guarantees a
// single send. Immediate users are never swept here (they send on user action).
const SCHEDULER_WINDOW_MIN = 5;

function shouldSendNow(scheduleType: string, cronTime: string | null, cronDay: string | null): boolean {
  if (scheduleType === "immediate") return false;

  const nowUtc = new Date();
  const nowIst = new Date(nowUtc.getTime() + IST_OFFSET_MIN * 60 * 1000);
  const istHour = nowIst.getUTCHours();
  const istMin = nowIst.getUTCMinutes();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayIst = dayNames[nowIst.getUTCDay()].toLowerCase();

  const parsed = parseCronTime(cronTime);
  if (!parsed) return false;

  const nowMinutes = istHour * 60 + istMin;
  const schedMinutes = parsed.hour * 60 + parsed.min;
  // Due if scheduled time is within the last window: (now - 5min, now].
  const diff = nowMinutes - schedMinutes;
  const isDue = diff >= 0 && diff < SCHEDULER_WINDOW_MIN;

  if (scheduleType === "daily") {
    return isDue;
  }

  if (scheduleType === "weekly") {
    if (todayIst !== (cronDay || "").toLowerCase()) return false;
    return isDue;
  }

  return false;
}

// ── Engine ──────────────────────────────────────────────────────────────────
async function processUser(
  service: SupabaseClient,
  graphToken: string | null,
  smtpFromEmail: string,
  userEmail: string,
  orgName: string,
  bypassCron: boolean = true,
): Promise<{ sent: number; recipients: number; skipped: string }> {
  console.log(`[processUser] start for ${userEmail} / org=${orgName} (bypassCron=${bypassCron})`);
  
  // 1. Load prefs
  const { data: prefs } = await service
    .from("user_settings")
    .select("email_enabled, severities, cron_schedule_type, cron_time, cron_day, reassurance_enabled")
    .eq("email_id", userEmail)
    .maybeSingle();

  console.log(`[processUser] prefs loaded: email_enabled=${prefs?.email_enabled}, severities=${JSON.stringify(prefs?.severities)}`);
  
  if (!prefs || prefs.email_enabled === false) {
    console.log(`[processUser] email disabled, skipping`);
    return { sent: 0, recipients: 0, skipped: "email disabled" };
  }

  const scheduleType = prefs.cron_schedule_type || "immediate";
  const cronTime = prefs.cron_time || "09:00_AM";
  const cronDay = prefs.cron_day || "monday";

  // Decide whether to send in this invocation:
  //  - User-triggered (bypassCron=true, i.e. settings save / Refresh Now):
  //      send ONLY if the user is on "immediate". Daily/weekly users must NOT
  //      get an email from a save or refresh — they only get the scheduled digest.
  //  - Scheduled run (bypassCron=false, hourly cron): send only if the user's
  //      daily/weekly IST time is due now (shouldSendNow); immediate users are
  //      skipped here (they were handled by their own action).
  if (bypassCron) {
    if (scheduleType !== "immediate") {
      console.log(`[processUser] user-triggered but schedule is '${scheduleType}' (not immediate), skipping email`);
      return { sent: 0, recipients: 0, skipped: `not immediate (${scheduleType}); waits for scheduled digest` };
    }
  } else {
    if (!shouldSendNow(scheduleType, cronTime, cronDay)) {
      console.log(`[processUser] cron schedule not met (type=${scheduleType}, time=${cronTime}, day=${cronDay}), skipping`);
      return { sent: 0, recipients: 0, skipped: `cron schedule not met: ${scheduleType}` };
    }
  }
  console.log(`[processUser] send-eligible (schedule=${scheduleType}, ${bypassCron ? "user-triggered/immediate" : "scheduled/due"})`);

  const severities: string[] = (prefs.severities && prefs.severities.length > 0)
    ? prefs.severities
    : ["Critical", "High", "Medium", "Low"];

  // 2. Fetch this user's matched results
  console.log(`[processUser] fetching results...`);
  const { data: results } = await service
    .from("tech_stack_results")
    .select("id, vendor, product_name, version, org_name, email_id, cve_match, severity_cve, cert_in, severity_cert_in, description, cvss_score, last_modified, reference_url")
    .eq("email_id", userEmail)
    .eq("org_name", orgName);

  const rows: ResultRow[] = (results || []) as any;
  console.log(`[processUser] ${rows.length} results fetched`);
  
  // NOTE: do NOT return early when rows.length === 0.
  // A 0-match org (tech stack registered but nothing matched) must still fall
  // through to the all-clear reassurance block below (which builds the email
  // from tech_stack, not from results).

  // 3a. Recency filter.
  // v2.0.0: Match only CVEs published/modified in last 7 days for fresh tech stack entries.
  const RECENT_DAYS = 7;  // Changed from 0 (all-time) to 7 days
  let recent = rows;
  if (RECENT_DAYS > 0) {
    console.log(`[processUser] applying ${RECENT_DAYS}-day recency filter...`);
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    recent = rows.filter((r) => {
      if (!r.last_modified) return false;
      const t = new Date(r.last_modified).getTime();
      return !isNaN(t) && t >= cutoff;
    });
    console.log(`[processUser] ${recent.length} advisories within ${RECENT_DAYS} days`);
    // NOTE: do NOT return early when recent.length === 0.
    // Zero advisories in the window means "nothing new" -> fall through so the
    // all-clear / reassurance logic below can send a reassurance email.
  } else {
    console.log(`[processUser] recency filter DISABLED (all-time), ${recent.length} advisories`);
  }

  // 3b. Severity filter
  console.log(`[processUser] applying severity filter (${severities.join(", ")})...`);
  const sevFiltered = recent.filter((r) => severities.includes(effectiveSeverity(r)));
  console.log(`[processUser] ${sevFiltered.length} advisories after severity filter`);
  
  // NOTE: do NOT return early when sevFiltered.length === 0 -> fall through to all-clear reassurance.

  // 4. Dedup — drop advisories already emailed (present in sent_notifications)
  console.log(`[processUser] checking dedup...`);
  const { data: alreadySent } = await service
    .from("sent_notifications")
    .select("advisory_key")
    .eq("email_id", userEmail);
  const sentKeys = new Set((alreadySent || []).map((r: any) => r.advisory_key));
  console.log(`[processUser] ${sentKeys.size} advisories already sent`);

  // Collapse duplicate advisory rows (same CVE across NVD+CERT-In) by key
  const newByKey = new Map<string, ResultRow>();
  for (const r of sevFiltered) {
    const k = advisoryKey(r);
    if (sentKeys.has(k)) {
      console.log(`[processUser] skipping already-sent: ${k}`);
      continue;
    }
    if (!newByKey.has(k)) newByKey.set(k, r);
    else {
      // merge: prefer a row that has both cve + civn
      const ex = newByKey.get(k)!;
      if (!ex.cert_in && r.cert_in) ex.cert_in = r.cert_in;
      if (!ex.cve_match && r.cve_match) ex.cve_match = r.cve_match;
    }
  }
  const newRows = [...newByKey.values()];
  console.log(`[processUser] ${newRows.length} new advisories to send`);
  
  if (newRows.length === 0) {
    // User can disable the all-clear / reassurance email in Settings.
    // When off, send nothing when there is nothing new (only real CVE alerts go out).
    if (prefs.reassurance_enabled === false) {
      console.log(`[processUser] reassurance disabled by user ${userEmail}/${orgName}, skipping all-clear`);
      return { sent: 0, recipients: 0, skipped: "nothing new (reassurance disabled)" };
    }
    // ?????? "All Clear" reassurance email ??????
    // Nothing new to send, but the user has matched products. Send a branded
    // "no new vulnerabilities" email ??? once per org per digest period, deduped
    // via a sentinel key. Only on scheduled digest runs (not manual refresh).
    const allClearKey = `ALLCLEAR|${orgName}|${new Date().toISOString().slice(0, 10)}`;
    // Guard 1: if this org already received a REAL alert today, do NOT send all-clear
    // (prevents contradictory "all clear" after a real CVE alert on the same day).
    const todayStart = new Date(); todayStart.setUTCHours(0,0,0,0);
    const { data: realAlertToday } = await service
      .from("sent_notifications")
      .select("id")
      .eq("email_id", userEmail)
      .eq("org_name", orgName)
      .neq("severity", "CLEAR")
      .gte("sent_at", todayStart.toISOString())
      .limit(1)
      .maybeSingle();
    if (realAlertToday) {
      console.log(`[processUser] org ${orgName} already received a real alert today ??? skipping all-clear`);
      return { sent: 0, recipients: 0, skipped: "nothing new (real alert already sent today)" };
    }
    // Guard 2: check if all-clear was already sent today for this org
    const { data: alreadySentClear } = await service
      .from("sent_notifications")
      .select("id")
      .eq("email_id", userEmail)
      .eq("advisory_key", allClearKey)
      .maybeSingle();
    if (alreadySentClear) {
      console.log(`[processUser] all-clear already sent today for ${orgName}, skipping`);
      return { sent: 0, recipients: 0, skipped: "nothing new (all-clear already sent)" };
    }
    // Fetch this org's products for the email body.
    const { data: orgStacks } = await service
      .from("tech_stack")
      .select("vendor, product_name, version, email_list, email_id")
      .eq("email_id", userEmail)
      .eq("org_name", orgName);
    if (!orgStacks || orgStacks.length === 0) {
      console.log(`[processUser] no tech stacks for ${orgName}, skipping all-clear`);
      return { sent: 0, recipients: 0, skipped: "nothing new" };
    }
    const products = orgStacks.map((s: any) => ({ vendor: s.vendor, product: s.product_name, version: s.version }));
    // Build recipients (same as regular send).
    const clearRecipientSet = new Set<string>();
    orgStacks.forEach((s: any) => {
      const list = (s.email_list || s.email_id || "").split(",").map((e: string) => e.trim()).filter(Boolean);
      list.forEach((e: string) => clearRecipientSet.add(e));
    });
    if (clearRecipientSet.size === 0) clearRecipientSet.add(userEmail);
    const clearRecipients = [...clearRecipientSet];
    const clearHtml = buildAllClearHtml(products, orgName);
    const clearSubject = `Vulnerix: All Clear \u2014 No new vulnerabilities for ${orgName}`;
    console.log(`[processUser] sending all-clear email to ${clearRecipients.length} recipient(s) for ${orgName}`);
    try {
      if (graphToken) {
        await sendViaGraph({ token: graphToken, fromEmail: smtpFromEmail, to: clearRecipients, subject: clearSubject, html: clearHtml });
      } else {
        const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
        const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
        const smtpUser = Deno.env.get("SMTP_USER");
        const smtpPass = Deno.env.get("SMTP_PASS");
        if (smtpUser && smtpPass) {
          const transporter = nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass }, tls: { ciphers: "TLSv1.2", rejectUnauthorized: false } });
          await transporter.sendMail({ from: smtpFromEmail || smtpUser, to: clearRecipients.join(","), subject: clearSubject, html: clearHtml });
        }
      }
      console.log(`[processUser] all-clear email sent for ${orgName}`);
    } catch (clearErr: any) {
      console.error(`[processUser] all-clear send error:`, clearErr.message);
    }
    // Record sentinel so we don't re-send today.
    await service.from("sent_notifications").upsert([{
      email_id: userEmail,
      org_name: orgName,
      recipients: clearRecipients.join(", "),
      vendor: "ALL",
      product_name: "ALL",
      version: "ALL",
      cve_match: null,
      cert_in: null,
      severity: "CLEAR",
      advisory_key: allClearKey,
    }], { onConflict: "email_id,advisory_key", ignoreDuplicates: true });
    return { sent: 0, recipients: clearRecipients.length, skipped: "all-clear sent" };
  }

  // 5. Recipients — union of email_list from the user's tech_stack entries,
  //    fall back to the account email.
  console.log(`[processUser] fetching recipients...`);
  const { data: stacks } = await service
    .from("tech_stack")
    .select("email_list, email_id")
    .eq("email_id", userEmail)
    .eq("org_name", orgName);
  const recipientSet = new Set<string>();
  (stacks || []).forEach((s: any) => {
    const list = (s.email_list || s.email_id || "").split(",").map((e: string) => e.trim()).filter(Boolean);
    list.forEach((e: string) => recipientSet.add(e));
  });
  if (recipientSet.size === 0) recipientSet.add(userEmail);
  const recipients = [...recipientSet];
  console.log(`[processUser] sending to ${recipients.length} recipient(s): ${recipients.join(", ")}`);

  // 6. Send one digest — inline table for small sets, Excel attachment for large.
  const useExcel = newRows.length > INLINE_ROW_LIMIT;
  console.log(`[processUser] ${newRows.length} rows -> ${useExcel ? "Excel attachment" : "inline table"}`);

  const subject = `Vulnerix Alert: ${newRows.length} new advisory match(es) for your tech stack`;
  let html: string;
  let attachment: { filename: string; contentBytes: string; contentType: string } | undefined;

  if (useExcel) {
    console.log(`[processUser] building Excel report...`);
    const xlsx = await buildDigestExcel(newRows);
    html = buildSummaryHtml(newRows);
    attachment = {
      filename: "Vulnerix_Advisories.xlsx",
      contentBytes: toBase64(xlsx),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
    console.log(`[processUser] Excel built (${xlsx.length} bytes), sending...`);
  } else {
    html = buildDigestHtml(newRows);
    console.log(`[processUser] HTML built, sending...`);
  }

  try {
    // Provider auto-detect (Option A): use Graph if token exists, otherwise SMTP
    if (graphToken) {
      await sendViaGraph({
        token: graphToken,
        fromEmail: smtpFromEmail,
        to: recipients,
        subject,
        html,
        attachment,
      });
      console.log(`[processUser] email sent successfully via Graph`);
    } else {
      // SMTP fallback
      const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
      const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
      const smtpUser = Deno.env.get("SMTP_USER");
      const smtpPass = Deno.env.get("SMTP_PASS");
      if (!smtpUser || !smtpPass) throw new Error("No email provider configured: set MS_* (Graph) or SMTP_* (SMTP)");
      
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: smtpPort, secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { ciphers: "TLSv1.2", rejectUnauthorized: false },
      });
      
      const mailObj: any = {
        from: smtpFromEmail || smtpUser,
        to: recipients.join(","),
        subject,
        html,
      };
      if (attachment) {
        mailObj.attachments = [{
          filename: attachment.filename,
          content: Buffer.from(attachment.contentBytes, "base64"),
          contentType: attachment.contentType,
        }];
      }
      await transporter.sendMail(mailObj);
      console.log(`[processUser] email sent successfully via SMTP`);
    }
  } catch (emailErr: any) {
    console.error(`[processUser] send error:`, emailErr.message);
    throw emailErr;
  }

  // 7. Record as sent (dedup for next time)
  console.log(`[processUser] recording sent advisories...`);
  const recipientsCsv = recipients.join(", ");
  const toInsert = newRows.map((r) => ({
    email_id: userEmail,
    org_name: orgName,
    recipients: recipientsCsv,
    vendor: r.vendor,
    product_name: r.product_name,
    version: r.version,
    cve_match: r.cve_match,
    cert_in: r.cert_in,
    severity: effectiveSeverity(r),
    advisory_key: advisoryKey(r),
  }));
  // ignoreDuplicates so a race can't error on the unique index
  await service.from("sent_notifications").upsert(toInsert, { onConflict: "email_id,advisory_key", ignoreDuplicates: true });
  console.log(`[processUser] done. ${newRows.length} advisories recorded.`);

  return { sent: newRows.length, recipients: recipients.length, skipped: "" };
}

// ── HTTP handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  console.log("[send-notifications] handler started");
  
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    console.log("[send-notifications] checking auth...");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const service  = createClient(supabaseUrl, serviceRoleKey);

    const bearer = authHeader.replace(/^Bearer\s+/i, "");

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    // Server-to-server scheduled batch: authenticated by presenting the service
    // role key as the bearer token. This is the hourly cron path. It honors the
    // per-user cron schedule (bypassCron=false) and processes all enabled users.
    const isServiceAuth = bearer === serviceRoleKey;
    const isScheduledRun = body?.trigger === "scheduled" && isServiceAuth;
    const isImmediatePostRefresh = body?.trigger === "immediate_post_refresh" && isServiceAuth && !!body?.targetEmail;

    // ?????? Global notifications kill-switch (admin_settings.notificationsEnabled) ??????
    // If an admin has turned notifications OFF, send to NOBODY (any trigger).
    // When ON, the normal per-user schedule (immediate/daily/weekly) applies.
    {
      const { data: notifCfg } = await service
        .from("admin_settings").select("settings").limit(1).maybeSingle();
      if ((notifCfg?.settings as any)?.notificationsEnabled === false) {
        console.log("[send-notifications] notifications disabled by admin ??? sending to nobody");
        return new Response(
          JSON.stringify({ success: true, skipped: "notifications disabled by admin", sent: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let allUsers = false;
    let callerEmail: string | null = null;

    if (isImmediatePostRefresh) {
      // Server-side immediate: target just this one user (bypassCron=true).
      callerEmail = body.targetEmail.toString().trim();
      console.log(`[send-notifications] immediate_post_refresh for ${callerEmail}`);
    } else if (isScheduledRun) {
      // No user session; this is the cron. Process all enabled users.
      allUsers = true;
    } else {
      // Normal user-authenticated path (settings save / Refresh Now / admin all-users).
      const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user?.email) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      callerEmail = user.email;

      const wantsAll = body?.trigger === "manual";
      if (wantsAll) {
        const { data: adminRole } = await service.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
        if (!adminRole) {
          return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        allUsers = true;
      }
    }

    // Email sender — Microsoft Graph (if configured) or SMTP fallback.
    const smtpFromEmail = Deno.env.get("SMTP_FROM_EMAIL") || Deno.env.get("SMTP_USER") || "noreply@vulnerix.local";
    
    let graphToken: string | null = null;
    if (hasGraphCreds()) {
      console.log("[send-notifications] acquiring Microsoft Graph token...");
      graphToken = await getGraphToken();
      console.log("[send-notifications] Graph token acquired");
    } else {
      console.log("[send-notifications] Graph credentials not set, will use SMTP fallback");
    }

    /* ── DEPRECATED: Outlook SMTP via nodemailer (basic AUTH blocked → 535) ──────
    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.office365.com";
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "587");
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    const transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: false,
      auth: { user: smtpUser, pass: smtpPass },
      tls: { ciphers: "TLSv1.2", rejectUnauthorized: false },
    });
    ────────────────────────────────────────────────────────────────────────── */

    // Which users to process.
    let emails: string[] = callerEmail ? [callerEmail] : [];
    if (allUsers) {
      if (isScheduledRun) {
        // Scheduled run: only daily/weekly users can ever be due. Skip immediate
        // users entirely at the DB level so we don't waste CPU looping over them
        // (this is what was tripping the CPU hard limit).
        const { data: us } = await service
          .from("user_settings")
          .select("email_id")
          .eq("email_enabled", true)
          .in("cron_schedule_type", ["daily", "weekly"]);
        emails = [...new Set((us || []).map((u: any) => u.email_id).filter(Boolean))];
      } else {
        const { data: us } = await service.from("user_settings").select("email_id").eq("email_enabled", true);
        emails = [...new Set((us || []).map((u: any) => u.email_id).filter(Boolean))];
      }
    }
    console.log(`[send-notifications] processing ${emails.length} user(s), scheduled=${isScheduledRun}`);

    // Do the heavy work (SMTP handshake + sendMail) in the background so the
    // request isolate isn't killed by the wall-clock limit while waiting on
    // Gmail's SMTP. We respond immediately; the email sends asynchronously.
    const work = (async () => {
      for (const em of emails) {
        // Expand this account into its distinct organizations so each org gets
        // an isolated digest sent only to that org's recipient list.
        const { data: orgRows } = await service
          .from("tech_stack")
          .select("org_name")
          .eq("email_id", em);
        const orgs = [...new Set((orgRows || [])
          .map((o: any) => (o.org_name || "default"))
          .filter(Boolean))];
        if (orgs.length === 0) orgs.push("default");
        console.log(`[send-notifications] ${em} has ${orgs.length} org(s): ${orgs.join(", ")}`);
        for (const org of orgs) {
          try {
            const res = await processUser(service, graphToken, smtpFromEmail, em, org, !isScheduledRun);
            console.log(`[send-notifications] ${em} / ${org}:`, JSON.stringify(res));
          } catch (e: any) {
            console.error(`[send-notifications] ${em} / ${org} failed:`, e?.message || e);
          }
        }
      }
      console.log("[send-notifications] background work complete");
    })();

    // @ts-ignore - EdgeRuntime is provided by the Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work);
    } else {
      // Fallback: no background API available, so await inline.
      await work;
    }

    return new Response(JSON.stringify({
      success: true,
      scope: allUsers ? "all_users" : "single_user",
      users_processed: emails.length,
      queued: true,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("[send-notifications] error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
