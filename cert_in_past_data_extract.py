"""
CERT-IN Historical Data Extractor
One-time script to pull all CERT-IN advisories from 2019 onwards into cert_in_cves table.
Usage: python cert_in_past_data_extract.py
       python cert_in_past_data_extract.py --start-year 2022
"""

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import time
import re
import random
import argparse
import sys
from cert_in_db import get_connection, upsert_items, get_existing_civns

BASE_URL = "https://www.cert-in.org.in/s2cMainServlet"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Connection": "keep-alive",
}
MIN_YEAR = 2019

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def create_session():
    session = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session

def fetch_page(params):
    session = create_session()
    try:
        r = session.get(BASE_URL, params=params, headers=HEADERS, timeout=30, stream=True)
        r.raise_for_status()
        content = b""
        for chunk in r.iter_content(chunk_size=8192):
            content += chunk
        return content.decode("utf-8", errors="ignore")
    except requests.exceptions.ChunkedEncodingError:
        time.sleep(2)
        r = requests.get(BASE_URL, params=params, headers=HEADERS, timeout=45)
        r.raise_for_status()
        return r.text
    finally:
        session.close()

# ── Pagination ────────────────────────────────────────────────────────────────

def get_vuln_list(year: int) -> list[str]:
    all_links = []
    page_no = 1
    while True:
        print(f"  Fetching page {page_no} for {year}...", end="", flush=True)
        try:
            html = fetch_page({"pageid": "VLNLIST02", "year": str(year), "next": str(page_no)})
            soup = BeautifulSoup(html, "html.parser")
            links = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "VLCODE=" in href:
                    full = href if href.startswith("http") else "https://www.cert-in.org.in/" + href.lstrip("/")
                    if full not in all_links:
                        links.append(full)
            if not links:
                print(" no more links.")
                break
            all_links.extend(links)
            print(f" {len(links)} links")
            if not soup.find("a", string=re.compile(r"Next", re.I)):
                break
            page_no += 1
            time.sleep(random.uniform(1, 2))
        except Exception as e:
            print(f" ERROR: {e}")
            if page_no > 1:
                break
            time.sleep(2)
    print(f"  Total {len(all_links)} links for {year}")
    return list(dict.fromkeys(all_links))

# ── Parsers ───────────────────────────────────────────────────────────────────

def clean_text(val):
    val = (val or "").strip()
    return re.sub(r"^[:\s]+", "", val).strip()

def clean_multiline_section(text):
    return [line.strip() for line in text.splitlines() if line.strip()]

def extract_section_text(flat, section, next_sections):
    start = flat.find(section)
    if start == -1:
        return ""
    ends = [flat.find(n, start + len(section)) for n in next_sections]
    ends = [i for i in ends if i != -1]
    end = min(ends) if ends else len(flat)
    return flat[start + len(section):end].strip()

def extract_title(soup, flat):
    text = soup.get_text(" ", strip=True)
    for src in [text, flat]:
        m = re.search(r"CIVN-\d{4}-\d{4,}\s*(?:[-–]\s*)?(.*)", src)
        if m:
            cleaned = re.sub(r"\s+", " ", m.group(1).strip())
            cleaned = re.split(r"Original Issue Date|Severity Rating|Software Affected", cleaned)[0].strip()
            if cleaned:
                return cleaned
    return "Vulnerability"

def extract_civn_name(url, flat):
    m = re.search(r"CIVN-\d{4}-\d{4,}", url) or re.search(r"CIVN-\d{4}-\d{4,}", flat)
    return m.group(0) if m else ""

def parse_vulnerability(url: str) -> dict:
    session = create_session()
    try:
        r = session.get(url, headers=HEADERS, timeout=30, stream=True)
        r.raise_for_status()
        html = b"".join(r.iter_content(8192)).decode("utf-8", errors="ignore")
    except requests.exceptions.ChunkedEncodingError:
        time.sleep(2)
        r = requests.get(url, headers=HEADERS, timeout=45)
        html = r.text
    finally:
        session.close()

    soup = BeautifulSoup(html, "html.parser")
    flat = soup.get_text("\n", strip=True)
    flat = re.split(r"Disclaimer|Contact Information|Postal address", flat)[0]

    sections = {
        "Software Affected": extract_section_text(flat, "Software Affected", ["Overview", "Target Audience", "Risk Assessment"]),
        "Overview":          extract_section_text(flat, "Overview",          ["Target Audience", "Risk Assessment", "Impact Assessment", "Description"]),
        "Target Audience":   extract_section_text(flat, "Target Audience",   ["Risk Assessment", "Impact Assessment", "Description"]),
        "Risk Assessment":   extract_section_text(flat, "Risk Assessment",   ["Impact Assessment", "Description", "Solution"]),
        "Impact Assessment": extract_section_text(flat, "Impact Assessment", ["Description", "Solution"]),
        "Description":       extract_section_text(flat, "Description",       ["Solution", "Vendor Information", "References"]),
        "Solution":          extract_section_text(flat, "Solution",          ["Vendor Information", "References"]),
        "Vendor Information":extract_section_text(flat, "Vendor Information",["References", "CVE Name"]),
        "References":        extract_section_text(flat, "References",        ["CVE Name"]),
    }

    issue_m = re.search(r"Original Issue Date:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})", flat)
    sev_m   = re.search(r"Severity Rating:\s*([A-Z]+)", flat)

    return {
        "civn_name":          extract_civn_name(url, flat),
        "url":                url,
        "title":              extract_title(soup, flat),
        "issue_date":         issue_m.group(1).strip() if issue_m else "",
        "severity":           sev_m.group(1).strip() if sev_m else "",
        "software_affected":  clean_multiline_section(sections["Software Affected"]),
        "cve_list":           sorted(set(re.findall(r"CVE-\d{4}-\d{4,7}", flat))),
        "description":        clean_text(sections["Description"]),
        "overview":           clean_text(sections["Overview"]),
        "target_audience":    clean_text(sections["Target Audience"]),
        "risk_assessment":    clean_text(sections["Risk Assessment"]),
        "impact_assessment":  clean_text(sections["Impact Assessment"]),
        "solution":           clean_text(sections["Solution"]),
        "vendor_information": clean_text(sections["Vendor Information"]),
        "references_text":    clean_text(sections["References"]),
        "raw_text_preview":   flat[:1500],
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="CERT-IN historical data extractor")
    parser.add_argument("--start-year", type=int, default=MIN_YEAR,
                        help=f"Start year (min {MIN_YEAR}, default {MIN_YEAR})")
    parser.add_argument("--end-year", type=int, default=2026,
                        help="End year (default 2026)")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max total advisories to fetch (0 = no limit)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Validate DB connection only, no fetch")
    args = parser.parse_args()

    if args.start_year < MIN_YEAR:
        print(f"[ERROR] start-year must be >= {MIN_YEAR}")
        sys.exit(1)

    conn = get_connection()
    print(f"[DB] Connected. Fetching CERT-IN data {args.start_year} → {args.end_year}")

    if args.dry_run:
        print("[CERT-IN] Dry run — DB connection OK, exiting.")
        conn.close()
        return

    existing = get_existing_civns(conn)
    print(f"[DB] {len(existing)} advisories already in DB, will skip duplicates")

    total_inserted = 0

    for year in range(args.start_year, args.end_year + 1):
        print(f"\n[CERT-IN] Year {year}")
        try:
            links = get_vuln_list(year)
        except Exception as e:
            print(f"  [ERROR] Failed to get list for {year}: {e}")
            continue

        batch = []
        failed = []

        for i, link in enumerate(links, 1):
            # Check global limit
            if args.limit > 0 and total_inserted >= args.limit:
                print(f"  [LIMIT] Reached {args.limit} entries, stopping.")
                break

            # Extract CIVN ID from URL to check if already in DB
            m = re.search(r"CIVN-\d{4}-\d{4,}", link)
            civn_id = m.group(0) if m else None
            if civn_id and civn_id in existing:
                print(f"  [{i}/{len(links)}] SKIP {civn_id} (already in DB)")
                continue

            try:
                print(f"  [{i}/{len(links)}] Fetching {link}")
                item = parse_vulnerability(link)
                batch.append(item)

                # Upsert every 10 items
                if len(batch) >= 10:
                    inserted = upsert_items(conn, batch)
                    total_inserted += inserted
                    print(f"  [DB] Upserted {inserted} rows (total: {total_inserted})")
                    batch = []

                time.sleep(random.uniform(1, 2))
            except Exception as e:
                print(f"  [ERROR] {link}: {e}")
                failed.append(link)
                time.sleep(3)

        # Flush remaining
        if batch:
            inserted = upsert_items(conn, batch)
            total_inserted += inserted
            print(f"  [DB] Upserted {inserted} rows (total: {total_inserted})")

        if failed:
            print(f"  [WARN] {len(failed)} failed URLs for {year}")

        time.sleep(random.uniform(2, 4))

    conn.close()
    print(f"\n[CERT-IN] Done. {total_inserted} advisories upserted into cert_in_cves.")

if __name__ == "__main__":
    main()
