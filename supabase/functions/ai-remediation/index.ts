import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "http://localhost", "http://localhost:80", "http://localhost:3000",
  "https://vulnerix.avotrix.in",
  ...(Deno.env.get("EXTRA_ALLOWED_ORIGINS") || "").split(",").filter(Boolean),
];
function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const ok = ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(o.replace(/\/$/, "")));
  return {
    "Access-Control-Allow-Origin": ok ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => parseInt(p, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) { const x = pa[i]||0, y = pb[i]||0; if (x<y) return -1; if (x>y) return 1; }
  return 0;
}
// pick the smallest versionEndExcluding whose range contains the installed version
function computeFixVersion(cpeMatches: any, vendor: string, product: string, installed: string): string | null {
  if (!Array.isArray(cpeMatches)) return null;
  let fix: string | null = null;
  for (const m of cpeMatches) {
    const crit = (m.criteria || "").toLowerCase();
    if (vendor && product && !(crit.includes(":"+vendor+":") && crit.includes(":"+product+":"))) {
      // still allow if product matches loosely
    }
    const vsi = m.versionStartIncluding, vse = m.versionStartExcluding, vee = m.versionEndExcluding;
    if (!vee) continue;
    if (installed) {
      if (vsi && compareVersions(installed, vsi) < 0) continue;
      if (vse && compareVersions(installed, vse) <= 0) continue;
      if (compareVersions(installed, vee) >= 0) continue;
    }
    if (!fix || compareVersions(vee, fix) < 0) fix = vee;
  }
  if (!fix) {
    for (const m of cpeMatches) { if (m.versionEndExcluding) { if (!fix || compareVersions(m.versionEndExcluding, fix) < 0) fix = m.versionEndExcluding; } }
  }
  return fix;
}
function computeVulnCeiling(cpeMatches: any): string | null {
  if (!Array.isArray(cpeMatches)) return null;
  let ceil: string | null = null;
  for (const m of cpeMatches) {
    if (m.versionEndIncluding) { if (!ceil || compareVersions(m.versionEndIncluding, ceil) > 0) ceil = m.versionEndIncluding; }
  }
  return ceil;
}

serve(async (req) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const svc = createClient(url, srk);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user?.email) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers });

    const body = await req.json().catch(() => ({}));
    const cveId = (body.cve_id || "").trim();
    const orgName = (body.org_name || "").trim();
    const force = !!body.force;
    const reqVersion = (body.installed_version || "").trim();
    const reqVendor = (body.vendor || "").trim().toLowerCase();
    const reqProduct = (body.product || "").trim().toLowerCase();
    if (!cveId) return new Response(JSON.stringify({ error: "cve_id required" }), { status: 400, headers });

    // 1) provider config. If browser sends a provider, use it; else pick the user's
    // MOST RECENTLY SAVED key (so switching provider in Settings just works).
    const reqProvider = (body.provider || "").trim();
    let cfgRows: any, cfgErr: any;
    if (reqProvider) {
      ({ data: cfgRows, error: cfgErr } = await svc.rpc("get_ai_key_full", { p_email: user.email, p_provider: reqProvider }));
    } else {
      const { data: latest } = await svc.from("ai_provider_config").select("provider").eq("email_id", user.email).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const pv = latest?.provider || "groq";
      ({ data: cfgRows, error: cfgErr } = await svc.rpc("get_ai_key_full", { p_email: user.email, p_provider: pv }));
    }
    if (cfgErr || !cfgRows || cfgRows.length === 0 || !cfgRows[0].api_key) {
      return new Response(JSON.stringify({ error: "no_ai_key", redirect: "settings" }), { status: 200, headers });
    }
    const provider = cfgRows[0].provider || "groq";
    const model = cfgRows[0].model || "qwen/qwen3.8-27b";
    const apiKey = cfgRows[0].api_key;

    // installed version from this org tech stack
    let installed = reqVersion;
    let vendor = reqVendor, product = reqProduct;
    if (!installed || !vendor || !product) {
      const { data: tsRows } = await svc.from("tech_stack_results")
        .select("vendor, product_name, version")
        .eq("email_id", user.email).eq("org_name", orgName).limit(1);
      if (tsRows && tsRows.length) {
        installed = installed || tsRows[0].version || "";
        vendor = vendor || (tsRows[0].vendor||"").toLowerCase();
        product = product || (tsRows[0].product_name||"").toLowerCase();
      }
    }

    // cfg updated_at for cache invalidation
    const { data: cfgMeta } = await svc.from("ai_provider_config").select("updated_at").eq("email_id", user.email).maybeSingle();
    const cfgUpdatedAt = cfgMeta?.updated_at || null;


    // 3) assemble facts
    const { data: nvd } = await svc.from("nvd_cves")
      .select("cve_id, description, cvss_score, severity, attack_vector, reference_url, cpe_matches")
      .eq("cve_id", cveId).maybeSingle();
    const { data: certRows } = await svc.from("cert_in_cves")
      .select("civn_id, url, solution, overview")
      .contains("cve_list", [cveId]).limit(1);
    const cert = certRows && certRows.length ? certRows[0] : null;

    const fixVersion = nvd?.cpe_matches ? computeFixVersion(nvd.cpe_matches, vendor, product, installed) : null;
    const vulnCeiling = (!fixVersion && nvd?.cpe_matches) ? computeVulnCeiling(nvd.cpe_matches) : null;
    const hasFix = !!fixVersion || !!cert?.solution;

    if (!nvd && !cert) return new Response(JSON.stringify({ error: "no_data" }), { status: 200, headers });

    const facts = {
      cve_id: cveId, vendor, product, installed_version: installed || "unknown",
      fix_version: fixVersion || "",
      vulnerable_up_to_including: vulnCeiling || "",
      has_official_fix: hasFix,
      severity: nvd?.severity || cert?.severity || "", cvss: nvd?.cvss_score || null,
      attack_vector: nvd?.attack_vector || "",
      description: nvd?.description || "",
      cert_in_solution: cert?.solution || "", cert_in_overview: cert?.overview || "",
    };
    const refs = [nvd?.reference_url, cert?.url].filter(Boolean);

    // 2) cache check (after facts so cached responses include fix_version + refs)
    if (!force) {
      const { data: cached } = await svc.from("ai_remediation_cache")
        .select("remediation, cfg_updated_at")
        .eq("cve_id", cveId).eq("installed_version", installed)
        .eq("provider", provider).eq("model", model).maybeSingle();
      if (cached && (!cfgUpdatedAt || cached.cfg_updated_at === cfgUpdatedAt)) {
        return new Response(JSON.stringify({ remediation: cached.remediation, provider, fix_version: fixVersion, installed_version: installed, references: refs, cached: true }), { headers });
      }
    }

    // 4) call provider (Groq / OpenAI-compatible)
    const baseUrl =
      provider === "groq" ? "https://api.groq.com/openai/v1/chat/completions"
      : provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const sys = [
      "You are a security remediation assistant writing for a mixed audience (technical and non-technical).",
      "OUTPUT ONLY THE FINAL ANSWER. Do not show any reasoning, thinking, analysis, planning, or restate these instructions. Begin directly with the first section header.",
      "Use ONLY the provided facts. Do NOT decide whether the system is affected (already determined). Never invent version numbers or URLs.",
      "Write in your own words; do not copy the NVD description verbatim.",
      "Use exactly these three short markdown bold sections:",
      "**Why it is vulnerable** - 1-2 clear sentences on the weakness and its attack type (e.g. the CWE), understandable to non-technical readers.",
      "**Impact** - 1 sentence on what an attacker could do if left unpatched.",
      "**Fix** - MAX 3 crisp numbered steps, one line each. If has_official_fix is true: give the upgrade path (install fix_version or apply cert_in_solution), add backup/test-in-staging only if a major version jump. If has_official_fix is false: 1) check vendor official advisory/support for a patch, 2) take a backup and apply interim mitigation (restrict risky permissions/access), 3) test any fix in staging before production. Never invent a version.",
      "If fix_version is empty but vulnerable_up_to_including is set, note the system is vulnerable up to and including that version. Be concise. Target 70-110 words, never exceed 120. No filler, no preamble, no closing remarks."
    ].join(" ")
    const payload = {
      model, max_tokens: 4000, temperature: 0.3,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(facts) },
      ],
    };
    const reqHeaders: Record<string,string> = { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" };
    if (provider === "openrouter") {
      reqHeaders["HTTP-Referer"] = "https://vulnerix.avotrix.in";
      reqHeaders["X-Title"] = "Vulnerix";
    }
    const aiResp = await fetch(baseUrl, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(payload),
    });
    const aiJson = await aiResp.json().catch(() => null);
    if (!aiResp.ok) {
      const msg = aiJson?.error?.message || `provider error ${aiResp.status}`;
      let code = "provider_error";
      if (/quota|credit|insufficient/i.test(msg)) code = "no_credits";
      else if (/invalid|unauthorized|api key/i.test(msg)) code = "invalid_key";
      return new Response(JSON.stringify({ error: code, detail: msg }), { status: 200, headers });
    }
    let text = aiJson?.choices?.[0]?.message?.content?.trim() || "";
    // Strip any leaked chain-of-thought / instruction echo. Keep only from the first
    // real section header onward; drop "thinking process", "analyze user request", etc.
    text = text.replace(/^[\s\S]*?(?=\*\*\s*Why)/i, "").trim() || text;
    // Remove common reasoning preambles if the header wasn't found
    text = text.replace(/^(here'?s? (my |a )?(thinking|thought|reasoning)[^\n]*\n?)/i, "").trim();
    text = text.replace(/^\s*\d+\.\s*(analyze|extract|role|audience|constraints)[\s\S]*?(?=\*\*)/i, "").trim();
    if (!text) return new Response(JSON.stringify({ error: "empty_response" }), { status: 200, headers });

    // 5) cache upsert
    await svc.from("ai_remediation_cache").upsert({
      cve_id: cveId, installed_version: installed, provider, model,
      cfg_updated_at: cfgUpdatedAt, remediation: text,
    }, { onConflict: "cve_id,installed_version,provider,model" });

    return new Response(JSON.stringify({ remediation: text, references: refs, fix_version: fixVersion, vuln_ceiling: vulnCeiling, installed_version: installed, provider, cached: false }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: "exception", detail: String(e?.message || e) }), { status: 200, headers: cors(req) });
  }
});