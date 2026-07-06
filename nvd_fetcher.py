#!/usr/bin/env python3
"""
NVD CVE Fetcher for Vulnerix
Fetches vulnerability data from the National Vulnerability Database (NVD) API v2.
Reads config from .env, creates the nvd_cves table if it doesn't exist,
and upserts fetched CVEs into PostgreSQL.
"""

import os
import json
import time
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    import requests
except ImportError:
    print("[ERROR] 'requests' not installed. Run: pip install requests")
    sys.exit(1)

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("[ERROR] 'psycopg2-binary' not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("[ERROR] 'python-dotenv' not installed. Run: pip install python-dotenv")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

NVD_API_BASE      = "https://services.nvd.nist.gov/rest/json/cves/2.0"
RESULTS_PER_PAGE  = 2000   # NVD max per request
RATE_LIMIT_DELAY  = 0.6    # seconds between requests
MIN_YEAR          = 2019
BATCH_SIZE        = 500    # rows per DB upsert batch

# ── Load env ──────────────────────────────────────────────────────────────────

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

def _require(key: str) -> str:
    val = os.getenv(key, "").strip()
    if not val:
        print(f"[ERROR] {key} is not set in .env")
        sys.exit(1)
    return val

# ── Validate config ───────────────────────────────────────────────────────────

def load_config() -> dict:
    api_key    = _require("NVD_API_KEY")
    start_year_raw = _require("NVD_START_YEAR")

    try:
        start_year = int(start_year_raw)
    except ValueError:
        print(f"[ERROR] NVD_START_YEAR must be a number, got: {start_year_raw}")
        sys.exit(1)

    current_year = datetime.now(timezone.utc).year
    if start_year < MIN_YEAR:
        print(f"[ERROR] NVD_START_YEAR must be {MIN_YEAR} or later, got: {start_year}")
        sys.exit(1)
    if start_year > current_year:
        print(f"[ERROR] NVD_START_YEAR ({start_year}) cannot be in the future")
        sys.exit(1)

    return {
        "api_key":    api_key,
        "start_year": start_year,
        "db": {
            "host":     _require("POSTGRES_HOST"),
            "port":     int(os.getenv("POSTGRES_PORT", "5432")),
            "dbname":   _require("POSTGRES_DB"),
            "user":     _require("POSTGRES_USER"),
            "password": _require("POSTGRES_PASSWORD"),
        }
    }

# ── Database ──────────────────────────────────────────────────────────────────

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS nvd_cves (
    cve_id              TEXT        PRIMARY KEY,
    description         TEXT,
    cvss_score          NUMERIC(4,1),
    severity            TEXT,
    attack_vector       TEXT,
    vulnerability_status TEXT,
    published           TIMESTAMPTZ,
    last_modified       TIMESTAMPTZ,
    cpe_values          TEXT[],
    reference_url       TEXT,
    raw_json            JSONB,
    cpe_matches         JSONB,
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add cpe_matches column if upgrading from an older schema
ALTER TABLE nvd_cves ADD COLUMN IF NOT EXISTS cpe_matches JSONB;

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_nvd_cves_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_nvd_cves_updated_at'
    ) THEN
        CREATE TRIGGER trg_nvd_cves_updated_at
        BEFORE UPDATE ON nvd_cves
        FOR EACH ROW EXECUTE FUNCTION update_nvd_cves_updated_at();
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_nvd_cves_severity      ON nvd_cves (severity);
CREATE INDEX IF NOT EXISTS idx_nvd_cves_published      ON nvd_cves (published);
CREATE INDEX IF NOT EXISTS idx_nvd_cves_cvss_score     ON nvd_cves (cvss_score);
CREATE INDEX IF NOT EXISTS idx_nvd_cves_attack_vector  ON nvd_cves (attack_vector);
"""

UPSERT_SQL = """
INSERT INTO nvd_cves (
    cve_id, description, cvss_score, severity, attack_vector,
    vulnerability_status, published, last_modified, cpe_values,
    reference_url, raw_json, cpe_matches
)
VALUES %s
ON CONFLICT (cve_id) DO UPDATE SET
    description          = EXCLUDED.description,
    cvss_score           = EXCLUDED.cvss_score,
    severity             = EXCLUDED.severity,
    attack_vector        = EXCLUDED.attack_vector,
    vulnerability_status = EXCLUDED.vulnerability_status,
    published            = EXCLUDED.published,
    last_modified        = EXCLUDED.last_modified,
    cpe_values           = EXCLUDED.cpe_values,
    reference_url        = EXCLUDED.reference_url,
    raw_json             = EXCLUDED.raw_json,
    cpe_matches          = EXCLUDED.cpe_matches;
"""

def get_connection(db_cfg: dict):
    try:
        conn = psycopg2.connect(**db_cfg)
        conn.autocommit = False
        return conn
    except psycopg2.OperationalError as e:
        print(f"[ERROR] Cannot connect to PostgreSQL: {e}")
        sys.exit(1)

def ensure_table(conn) -> None:
    """Create nvd_cves table (and indexes) if they don't already exist."""
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
    conn.commit()
    print("[DB] Table 'nvd_cves' ready.")

def upsert_batch(conn, rows: list[tuple]) -> int:
    """Upsert a batch of CVE rows. Returns number of rows processed."""
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, rows, template=None, page_size=BATCH_SIZE)
    conn.commit()
    return len(rows)

# ── NVD Fetch ─────────────────────────────────────────────────────────────────

def fetch_cves_in_window(api_key: str, start_dt: datetime, end_dt: datetime) -> list[dict]:
    """Fetch CVEs within a date window (max 120 days per NVD API limit)."""
    headers = {"apiKey": api_key}
    params  = {
        "pubStartDate":   start_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pubEndDate":     end_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "resultsPerPage": RESULTS_PER_PAGE,
        "startIndex":     0,
    }

    all_cves: list[dict] = []
    total_results = None

    while True:
        try:
            resp = requests.get(NVD_API_BASE, headers=headers, params=params, timeout=30)
        except requests.RequestException as e:
            print(f"\n[WARN] Request failed: {e}")
            break

        if resp.status_code == 403:
            print("\n[ERROR] 403 Forbidden — check NVD_API_KEY")
            sys.exit(1)
        if resp.status_code == 404:
            # NVD returns 404 when no CVEs exist for the given date range
            break
        if resp.status_code != 200:
            print(f"\n[WARN] HTTP {resp.status_code} — params: {params}")
            break

        data = resp.json()
        if total_results is None:
            total_results = data.get("totalResults", 0)

        chunk = data.get("vulnerabilities", [])
        all_cves.extend(chunk)

        fetched = params["startIndex"] + len(chunk)
        if fetched >= total_results or not chunk:
            break

        params["startIndex"] = fetched
        time.sleep(RATE_LIMIT_DELAY)

    return all_cves


def fetch_cves_for_year(api_key: str, year: int) -> list[dict]:
    """Fetch all CVEs for a year by splitting into 90-day windows (safely under 120-day limit)."""
    year_start = datetime(year, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    year_end   = datetime(year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    window_days = 90

    all_cves: list[dict] = []
    window_start = year_start

    print(f"  Fetching {year}...", end="", flush=True)

    while window_start <= year_end:
        window_end = min(window_start + timedelta(days=window_days - 1), year_end)

        chunk = fetch_cves_in_window(api_key, window_start, window_end)
        all_cves.extend(chunk)

        print(f"\r  Fetching {year}... {len(all_cves)} CVEs", end="", flush=True)

        window_start = window_end + timedelta(seconds=1)
        time.sleep(RATE_LIMIT_DELAY)

    print(f"\r  Year {year}: {len(all_cves)} CVEs fetched          ")
    return all_cves

# ── Transform ─────────────────────────────────────────────────────────────────

def _parse_ts(val):
    """Parse NVD ISO timestamp to Python datetime, or None."""
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except ValueError:
        return None

def transform_to_row(raw: dict) -> tuple:
    """Convert raw NVD API entry to a DB row tuple matching UPSERT_SQL columns."""
    cve = raw.get("cve", {})
    cve_id = cve.get("id", "")

    # Description (English preferred)
    descriptions = cve.get("descriptions", [])
    description = next(
        (d["value"] for d in descriptions if d.get("lang") == "en"),
        descriptions[0]["value"] if descriptions else ""
    )

    # CVSS — prefer v3.1 → v3.0 → v2
    metrics = cve.get("metrics", {})
    cvss_score, severity, attack_vector = 0.0, "Low", "NETWORK"
    for key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
        entries = metrics.get(key, [])
        if entries:
            d = entries[0].get("cvssData", {})
            cvss_score    = float(d.get("baseScore", 0.0))
            raw_sev       = d.get("baseSeverity", "LOW")
            attack_vector = d.get("attackVector", "NETWORK")
            severity      = raw_sev.capitalize()
            break

    severity_map = {"Critical": "Critical", "High": "High", "Medium": "Medium", "Low": "Low"}
    severity = severity_map.get(severity, "Low")

    # CPE values + structured match data (with version ranges)
    cpe_values = []
    cpe_matches = []
    for config in cve.get("configurations", []):
        for node in config.get("nodes", []):
            for match in node.get("cpeMatch", []):
                if match.get("vulnerable"):
                    cpe_values.append(match.get("criteria", ""))
                    cpe_matches.append({
                        "criteria": match.get("criteria", ""),
                        "versionStartIncluding": match.get("versionStartIncluding"),
                        "versionStartExcluding": match.get("versionStartExcluding"),
                        "versionEndIncluding": match.get("versionEndIncluding"),
                        "versionEndExcluding": match.get("versionEndExcluding"),
                    })

    # Reference URL
    refs = cve.get("references", [])
    reference_url = refs[0]["url"] if refs else f"https://nvd.nist.gov/vuln/detail/{cve_id}"

    return (
        cve_id,
        description,
        cvss_score,
        severity,
        attack_vector,
        cve.get("vulnStatus", ""),
        _parse_ts(cve.get("published")),
        _parse_ts(cve.get("lastModified")),
        cpe_values,          # psycopg2 maps list → TEXT[]
        reference_url,
        json.dumps(raw),     # full raw payload stored as JSONB
        json.dumps(cpe_matches) if cpe_matches else None,  # structured CPE match data
    )

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Fetch NVD CVEs and store in PostgreSQL")
    parser.add_argument("--dry-run", action="store_true", help="Validate config only, no fetch/insert")
    args = parser.parse_args()

    cfg = load_config()
    api_key    = cfg["api_key"]
    start_year = cfg["start_year"]
    db_cfg     = cfg["db"]
    current_year = datetime.now(timezone.utc).year

    print(f"[NVD Fetcher] API key : {api_key[:8]}...{api_key[-4:]}")
    print(f"[NVD Fetcher] Range   : {start_year} → {current_year}")
    print(f"[NVD Fetcher] DB      : {db_cfg['user']}@{db_cfg['host']}:{db_cfg['port']}/{db_cfg['dbname']}")

    if args.dry_run:
        print("[NVD Fetcher] Dry run — config valid, exiting.")
        return

    # Connect and ensure table exists
    conn = get_connection(db_cfg)
    ensure_table(conn)

    total_inserted = 0

    for year in range(start_year, current_year + 1):
        raw_cves = fetch_cves_for_year(api_key, year)
        if not raw_cves:
            continue

        rows = [transform_to_row(c) for c in raw_cves]

        # Insert in batches
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            upsert_batch(conn, batch)
            total_inserted += len(batch)
            print(f"  Upserted {total_inserted} rows so far...", end="\r")

        time.sleep(RATE_LIMIT_DELAY)

    conn.close()
    print(f"\n[NVD Fetcher] Done. {total_inserted} CVEs upserted into 'nvd_cves'.")


if __name__ == "__main__":
    main()
