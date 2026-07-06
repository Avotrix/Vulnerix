"""
CERT-IN Daily Incremental Extractor
Checks for new CERT-IN advisories since the last run and upserts them to cert_in_cves.
Run this daily via cron or task scheduler.
Usage: python daily_cert_extract.py
"""

import sys
import os
import re
import json
import time
import random
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from cert_in_db import get_connection, upsert_items, get_max_civn_number

BASE_URL = "https://www.cert-in.org.in/s2cMainServlet"
HEADERS  = {"User-Agent": "Mozilla/5.0", "Accept": "*/*"}
YEAR     = "2026"          # current year — update annually
LOOKAHEAD = 50             # how many sequential CIVNs to check ahead

# ── HTTP helpers ──────────────────────────────────────────────────────────────

def create_session():
    s = requests.Session()
    retry = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    adapter = HTTPAdapter(max_retries=retry)
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    return s

def fetch_page(url, params=None):
    session = create_session()
    try:
        r = session.get(url, params=params, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r.text
    finally:
        session.close()

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
    for src in [soup.get_text(" ", strip=True), flat]:
        m = re.search(r"CIVN-\d{4}-\d{4,}\s*(?:[-–]\s*)?(.*)", src)
        if m:
            cleaned = re.sub(r"\s+", " ", m.group(1).strip())
            cleaned = re.split(r"Original Issue Date|Severity Rating|Software Affected", cleaned)[0].strip()
            if cleaned:
                return cleaned
    return "Vulnerability"

def parse_vulnerability(url: str) -> dict:
    session = create_session()
    try:
        r = session.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
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

    civn_m  = re.search(r"CIVN-\d{4}-\d{4,}", url)
    issue_m = re.search(r"Original Issue Date:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})", flat)
    sev_m   = re.search(r"Severity Rating:\s*([A-Z]+)", flat)

    return {
        "civn_name":          civn_m.group(0) if civn_m else "",
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
    conn = get_connection()

    # Find the highest CIVN number already in DB for this year
    last_num = get_max_civn_number(conn, YEAR)
    print(f"[CERT-IN Daily] Last CIVN in DB: CIVN-{YEAR}-{str(last_num).zfill(4) if last_num else 'none'}")
    print(f"[CERT-IN Daily] Checking next {LOOKAHEAD} CIVNs from {last_num + 1}...")

    to_check = [f"CIVN-{YEAR}-{str(last_num + i).zfill(4)}" for i in range(1, LOOKAHEAD + 1)]

    new_items = []

    for civn in to_check:
        url = f"https://www.cert-in.org.in/s2cMainServlet?pageid=PUBVLNOTES01&VLCODE={civn}"
        print(f"  Checking {civn}...", end="", flush=True)

        try:
            html = fetch_page(url)
        except Exception as e:
            print(f" ERROR: {e}")
            continue

        if civn not in html:
            print(" not found. Stopping.")
            break

        print(" found! Parsing...")
        try:
            item = parse_vulnerability(url)
            new_items.append(item)
        except Exception as e:
            print(f"  [ERROR] Parsing {civn}: {e}")

        time.sleep(random.uniform(1, 2))

    if not new_items:
        print("[CERT-IN Daily] No new advisories found.")
        conn.close()
        return

    inserted = upsert_items(conn, new_items)
    conn.close()
    print(f"[CERT-IN Daily] Done. {inserted} new advisories upserted into cert_in_cves.")

if __name__ == "__main__":
    main()
