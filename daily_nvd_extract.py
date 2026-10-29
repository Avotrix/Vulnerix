#!/usr/bin/env python3
"""
Daily NVD CVE extractor for Vulnerix (incremental + self-healing backfill).

This ONE script does two things every run, driven entirely by the DB (no state
file). nvd_fetcher.py is left completely untouched.

  PART 1 — Backfill (published-based):
    Looks at MAX(published) in nvd_cves. If the published coverage has not yet
    reached "now" (i.e. nvd_fetcher.py only got part of the year, or a year
    rolled over), it fetches the remaining published CVEs from that point up to
    now, page by page, upserting each page immediately (streaming save). So even
    if it dies mid-way, whatever was fetched stays in the DB and the next run
    resumes from the new MAX(published).

  PART 2 — Incremental (lastModified-based):
    Fetches CVEs modified since MAX(last_modified) (minus a safety overlap), so
    CVEs that were published earlier but re-scored/re-analyzed later are picked
    up too. Runs every time.

Key guarantees:
  - Zero duplicate rows: nvd_cves PK is cve_id and we upsert ON CONFLICT, so a
    CVE can never create a second row regardless of which part fetched it.
  - No double work within a run: cve_ids upserted in Part 1 are skipped in Part 2.
  - Year rollover is automatic: the upper bound is always "now", and
    NVD_START_YEAR is only a floor used the very first time (empty DB).
  - Reliability: transient failures (timeout, HTTP 429/500/502/503/504) are
    retried with exponential backoff + Retry-After. Partial windows are never
    reported as success; each page is committed as it arrives.
"""

# ?????? Overlap guard (added for multi-frequency fetch) ??????????????????????????????????????????????????????????????????????????????
import os as _os, sys as _sys, atexit as _atexit
_LOCK_PATH = "/tmp/nvd_daily_fetch.lock"
try:
    import fcntl as _fcntl
    _lock_fp = open(_LOCK_PATH, "w")
    try:
        _fcntl.flock(_lock_fp, _fcntl.LOCK_EX | _fcntl.LOCK_NB)
    except BlockingIOError:
        print("[Daily NVD] another run is still in progress ??? exiting to avoid overlap.")
        _sys.exit(0)
    _lock_fp.write(str(_os.getpid()))
    _lock_fp.flush()
    @_atexit.register
    def _release_lock():
        try:
            _fcntl.flock(_lock_fp, _fcntl.LOCK_UN); _lock_fp.close()
        except Exception:
            pass
except ImportError:
    pass  # fcntl not available (non-unix) ??? skip guard
# ???????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????????


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

NVD_API_BASE          = "https://services.nvd.nist.gov/rest/json/cves/2.0"
RESULTS_PER_PAGE      = 2000     # NVD max per request
RATE_LIMIT_DELAY      = 1.0      # seconds between successful page requests
BATCH_SIZE            = 500      # rows per DB upsert batch (within a page)
REQUEST_TIMEOUT       = 60       # seconds per HTTP request
MAX_RETRIES           = 5        # retries per request on transient errors
RETRY_BACKOFF_BASE    = 4        # seconds: 4, 8, 16, 32, ...
MIN_YEAR              = 2019     # NVD floor (matches nvd_fetcher.py)
OVERLAP_MINUTES       = 120      # safety overlap for the lastModified watermark
BACKFILL_GAP_MINUTES  = 180      # if MAX(published) is within this of now, backfill is "done"
WINDOW_DAYS           = 120      # NVD date-window max span per request set

# ── Load env ──────────────────────────────────────────────────────────────────

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

def _require(key: str) -> str:
    val = os.getenv(key, "").strip()
    if not val:
        print(f"[ERROR] {key} is not set in .env")
        sys.exit(1)
    return val

def load_config() -> dict:
    # NVD_START_YEAR is only a floor for the very first run (empty DB).
    start_year_raw = _require("NVD_START_YEAR")
    try:
        start_year = int(start_year_raw)
    except ValueError:
        print(f"[ERROR] NVD_START_YEAR must be a number, got: {start_year_raw}")
        sys.exit(1)
    if start_year < MIN_YEAR:
        print(f"[ERROR] NVD_START_YEAR must be {MIN_YEAR} or later, got: {start_year}")
        sys.exit(1)

    return {
        "api_key": _require("NVD_API_KEY"),
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
ALTER TABLE nvd_cves ADD COLUMN IF NOT EXISTS cpe_matches JSONB;
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
    with conn.cursor() as cur:
        cur.execute(CREATE_TABLE_SQL)
    conn.commit()
    print("[DB] Table 'nvd_cves' ready.")

def get_max_published(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(published) FROM nvd_cves;")
        row = cur.fetchone()
    return row[0] if row and row[0] else None

def get_max_last_modified(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT MAX(last_modified) FROM nvd_cves;")
        row = cur.fetchone()
    return row[0] if row and row[0] else None

def upsert_rows(conn, rows: list) -> int:
    if not rows:
        return 0
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, rows, template=None, page_size=BATCH_SIZE)
    conn.commit()
    return len(rows)

# ── NVD HTTP (with retry/backoff) ───────────────────────────────────────────────

def _get_with_retry(api_key: str, params: dict) -> dict:
    """GET one page from NVD with retry/backoff on transient failures.
    Raises RuntimeError if it ultimately fails (so we never treat a failed
    fetch as success)."""
    headers = {"apiKey": api_key}
    attempt = 0
    while True:
        try:
            resp = requests.get(NVD_API_BASE, headers=headers, params=params, timeout=REQUEST_TIMEOUT)
        except requests.RequestException as e:
            attempt += 1
            if attempt > MAX_RETRIES:
                raise RuntimeError(f"Network error after {MAX_RETRIES} retries: {e}")
            wait = RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
            print(f"\n  [WARN] Request failed ({e}); retry {attempt}/{MAX_RETRIES} in {wait}s")
            time.sleep(wait)
            continue

        if resp.status_code == 403:
            print("\n[ERROR] 403 Forbidden — check NVD_API_KEY")
            sys.exit(1)
        if resp.status_code == 404:
            return {"vulnerabilities": [], "totalResults": 0}
        if resp.status_code in (429, 500, 502, 503, 504):
            attempt += 1
            if attempt > MAX_RETRIES:
                raise RuntimeError(f"HTTP {resp.status_code} after {MAX_RETRIES} retries")
            retry_after = resp.headers.get("Retry-After")
            wait = int(retry_after) if (retry_after and str(retry_after).isdigit()) else RETRY_BACKOFF_BASE * (2 ** (attempt - 1))
            print(f"\n  [WARN] HTTP {resp.status_code}; retry {attempt}/{MAX_RETRIES} in {wait}s")
            time.sleep(wait)
            continue
        if resp.status_code != 200:
            raise RuntimeError(f"Unexpected HTTP {resp.status_code}: {resp.text[:200]}")

        return resp.json()

# ── Transform (same mapping as nvd_fetcher.py) ──────────────────────────────────

def _parse_ts(val):
    if not val:
        return None
    try:
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except ValueError:
        return None

def transform_to_row(raw: dict) -> tuple:
    cve = raw.get("cve", {})
    cve_id = cve.get("id", "")

    descriptions = cve.get("descriptions", [])
    description = next(
        (d["value"] for d in descriptions if d.get("lang") == "en"),
        descriptions[0]["value"] if descriptions else ""
    )

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
        cpe_values,
        reference_url,
        json.dumps(raw),
        json.dumps(cpe_matches) if cpe_matches else None,
    )

# ── Streaming fetch: paginate a window, upserting each page immediately ─────────

def fetch_and_store_window(conn, api_key: str, date_field: str,
                           start_dt: datetime, end_dt: datetime,
                           seen_ids: set) -> int:
    """Fetch one date-window (<=120 days) for either published or lastModified,
    upserting every page as it arrives. Returns count of rows upserted.
    date_field: 'pub' -> pubStartDate/pubEndDate, 'mod' -> lastModStartDate/lastModEndDate.
    seen_ids: cve_ids already processed this run (to skip in a later part)."""
    if date_field == "pub":
        start_key, end_key = "pubStartDate", "pubEndDate"
    else:
        start_key, end_key = "lastModStartDate", "lastModEndDate"

    params = {
        start_key: start_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        end_key:   end_dt.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "resultsPerPage": RESULTS_PER_PAGE,
        "startIndex": 0,
    }
    total_results = None
    upserted = 0

    while True:
        data = _get_with_retry(api_key, params)
        if total_results is None:
            total_results = data.get("totalResults", 0)
        chunk = data.get("vulnerabilities", [])

        # Transform + skip ids already handled this run
        rows = []
        for c in chunk:
            row = transform_to_row(c)
            cid = row[0]
            if cid and cid not in seen_ids:
                rows.append(row)
                seen_ids.add(cid)

        # Streaming save: commit this page right away
        upserted += upsert_rows(conn, rows)

        fetched = params["startIndex"] + len(chunk)
        print(f"\r  [{date_field}] {fetched}/{total_results} fetched, {upserted} upserted...", end="", flush=True)

        if fetched >= total_results or not chunk:
            break
        params["startIndex"] = fetched
        time.sleep(RATE_LIMIT_DELAY)

    print()
    return upserted

def fetch_and_store_range(conn, api_key: str, date_field: str,
                          start_dt: datetime, end_dt: datetime,
                          seen_ids: set) -> int:
    """Split [start_dt, end_dt] into <=120-day windows and stream-store each."""
    total = 0
    ws = start_dt
    while ws < end_dt:
        we = min(ws + timedelta(days=WINDOW_DAYS - 1), end_dt)
        total += fetch_and_store_window(conn, api_key, date_field, ws, we, seen_ids)
        ws = we + timedelta(seconds=1)
        time.sleep(RATE_LIMIT_DELAY)
    return total

# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Daily NVD extractor: self-healing backfill + incremental")
    parser.add_argument("--dry-run", action="store_true", help="Show planned windows only, no fetch/insert")
    args = parser.parse_args()

    cfg = load_config()
    api_key    = cfg["api_key"]
    start_year = cfg["start_year"]
    db_cfg     = cfg["db"]

    now = datetime.now(timezone.utc)

    print(f"[Daily NVD] API key : {api_key[:8]}...{api_key[-4:]}")
    print(f"[Daily NVD] DB      : {db_cfg['user']}@{db_cfg['host']}:{db_cfg['port']}/{db_cfg['dbname']}")

    conn = get_connection(db_cfg)
    ensure_table(conn)

    max_pub = get_max_published(conn)
    max_mod = get_max_last_modified(conn)

    # ── PART 1: backfill (published-based) ────────────────────────────────────
    # Floor = MAX(published) if we have data, else Jan 1 of NVD_START_YEAR.
    # Target upper bound is always "now" (handles year rollover automatically).
    if max_pub is None:
        pub_start = datetime(start_year, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        pub_reason = f"empty DB — from NVD_START_YEAR {start_year}"
    else:
        if max_pub.tzinfo is None:
            max_pub = max_pub.replace(tzinfo=timezone.utc)
        pub_start = max_pub  # inclusive; upsert makes the boundary CVE harmless
        pub_reason = f"resume from MAX(published) {max_pub.isoformat()}"

    backfill_needed = pub_start < (now - timedelta(minutes=BACKFILL_GAP_MINUTES))

    # ── PART 2: incremental (lastModified-based) ──────────────────────────────
    if max_mod is None:
        mod_start = now - timedelta(days=30)
        mod_reason = "empty DB — last 30 days of modifications"
    else:
        if max_mod.tzinfo is None:
            max_mod = max_mod.replace(tzinfo=timezone.utc)
        mod_start = max_mod - timedelta(minutes=OVERLAP_MINUTES)
        mod_reason = f"since MAX(last_modified) {max_mod.isoformat()} (−{OVERLAP_MINUTES}m overlap)"

    print(f"[Daily NVD] PART 1 backfill : needed={backfill_needed}")
    if backfill_needed:
        print(f"             window : {pub_start.isoformat()}  →  {now.isoformat()}  ({pub_reason})")
    else:
        print(f"             backfill up to date ({pub_reason})")
    print(f"[Daily NVD] PART 2 incremental : {mod_start.isoformat()}  →  {now.isoformat()}  ({mod_reason})")

    if args.dry_run:
        print("[Daily NVD] Dry run — no fetch performed.")
        conn.close()
        return

    seen_ids: set = set()
    total = 0

    if backfill_needed:
        print("[Daily NVD] Running PART 1 (published backfill)...")
        total += fetch_and_store_range(conn, api_key, "pub", pub_start, now, seen_ids)

    print("[Daily NVD] Running PART 2 (incremental by lastModified)...")
    total += fetch_and_store_range(conn, api_key, "mod", mod_start, now, seen_ids)

    try:
        _nv = f"{total} new CVEs ingested on " + __import__("datetime").datetime.now().strftime("%d %b %Y %H:%M")
        with conn.cursor() as _c:
            _c.execute("SELECT new_value FROM admin_audit_logs WHERE source=%s AND new_value IS NOT NULL ORDER BY created_at DESC LIMIT 1", ("nvd_daily",))
            _row = _c.fetchone(); _prev = _row[0] if _row else "-"
            _c.execute(
                "INSERT INTO admin_audit_logs (source, status, summary, previous_value, new_value, action_performed, page_affected, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s, now())",
                ("nvd_daily","OK",_nv,_prev,_nv,"nvd_daily","system"),
            )
        conn.commit()
    except Exception as _e:
        print(f"[Daily NVD] log write failed: {_e}")
    conn.close()
    print(f"\n[Daily NVD] Done. {total} CVE(s) inserted/updated this run "
          f"({len(seen_ids)} unique cve_ids processed).")


if __name__ == "__main__":
    main()
