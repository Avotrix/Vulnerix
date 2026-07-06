"""
Shared DB utilities for CERT-IN scripts.
Handles connection and upsert into cert_in_cves table.
"""

import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("[ERROR] psycopg2-binary not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("[ERROR] python-dotenv not installed. Run: pip install python-dotenv")
    sys.exit(1)

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

UPSERT_SQL = """
INSERT INTO cert_in_cves (
    civn_id, url, title, issue_date, severity,
    software_affected, cve_list, description, overview,
    target_audience, risk_assessment, impact_assessment,
    solution, vendor_information, references_text, raw_text_preview
)
VALUES %s
ON CONFLICT (civn_id) DO UPDATE SET
    url                = EXCLUDED.url,
    title              = EXCLUDED.title,
    issue_date         = EXCLUDED.issue_date,
    severity           = EXCLUDED.severity,
    software_affected  = EXCLUDED.software_affected,
    cve_list           = EXCLUDED.cve_list,
    description        = EXCLUDED.description,
    overview           = EXCLUDED.overview,
    target_audience    = EXCLUDED.target_audience,
    risk_assessment    = EXCLUDED.risk_assessment,
    impact_assessment  = EXCLUDED.impact_assessment,
    solution           = EXCLUDED.solution,
    vendor_information = EXCLUDED.vendor_information,
    references_text    = EXCLUDED.references_text,
    raw_text_preview   = EXCLUDED.raw_text_preview;
"""

def get_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv("POSTGRES_HOST", "localhost"),
            port=int(os.getenv("POSTGRES_PORT", "5433")),
            dbname=os.getenv("POSTGRES_DB", "postgres"),
            user=os.getenv("POSTGRES_USER", "postgres"),
            password=os.getenv("POSTGRES_PASSWORD", ""),
        )
        conn.autocommit = False
        return conn
    except psycopg2.OperationalError as e:
        print(f"[ERROR] Cannot connect to PostgreSQL: {e}")
        sys.exit(1)

def item_to_row(item: dict) -> tuple:
    """Convert a parsed CERT-IN advisory dict to a DB row tuple."""
    civn_id = item.get("civn_name") or _civn_from_url(item.get("url", ""))
    if not civn_id:
        return None  # skip items without a CIVN ID

    return (
        civn_id,
        item.get("url", ""),
        item.get("title", ""),
        item.get("issue_date", ""),
        (item.get("severity") or "").upper(),
        item.get("software_affected") or [],
        item.get("cve_list") or [],
        item.get("description", ""),
        item.get("overview", ""),
        item.get("target_audience", ""),
        item.get("risk_assessment", ""),
        item.get("impact_assessment", ""),
        item.get("solution", ""),
        item.get("vendor_information", ""),
        item.get("references_text", ""),
        item.get("raw_text_preview", "")[:1500],
    )

def upsert_items(conn, items: list[dict], batch_size: int = 100) -> int:
    """Upsert a list of parsed advisory dicts. Returns count of rows processed."""
    rows = [item_to_row(i) for i in items]
    rows = [r for r in rows if r is not None]  # drop items without civn_id

    if not rows:
        return 0

    total = 0
    with conn.cursor() as cur:
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            execute_values(cur, UPSERT_SQL, batch)
            total += len(batch)
    conn.commit()
    return total

def get_existing_civns(conn) -> set:
    """Return set of all civn_ids already in the DB."""
    with conn.cursor() as cur:
        cur.execute("SELECT civn_id FROM cert_in_cves;")
        return {row[0] for row in cur.fetchall()}

def get_max_civn_number(conn, year: str) -> int:
    """Return the highest CIVN number for a given year already in DB."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT civn_id FROM cert_in_cves WHERE civn_id LIKE %s ORDER BY civn_id DESC LIMIT 1;",
            (f"CIVN-{year}-%",)
        )
        row = cur.fetchone()
        if row:
            import re
            m = re.search(r"CIVN-\d{4}-(\d+)", row[0])
            return int(m.group(1)) if m else 0
    return 0

def _civn_from_url(url: str) -> str:
    import re
    m = re.search(r"CIVN-\d{4}-\d{4,}", url)
    return m.group(0) if m else ""
