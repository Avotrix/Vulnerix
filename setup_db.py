#!/usr/bin/env python3
"""
Vulnerix Database Setup
Runs all migrations in order against the configured PostgreSQL instance.
Usage: python setup_db.py
       python setup_db.py --dry-run
"""

import os
import sys
from pathlib import Path

try:
    import psycopg2
except ImportError:
    print("[ERROR] psycopg2-binary not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("[ERROR] python-dotenv not installed. Run: pip install python-dotenv")
    sys.exit(1)

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

MIGRATIONS_DIR = Path(__file__).parent / "supabase" / "migrations"

# Run in this exact order
MIGRATIONS = [
    "20260301000000_full_schema.sql",
    "20260520000000_tech_stack_results_nvd.sql",
    "20260521000000_cert_in_cves.sql",
    "20260522000000_match_nvd_cves_rpc.sql",
    "20260523000000_unique_tech_stack.sql",
    "20260524000000_cascade_delete_results.sql",
    "20260525000000_demo_requests.sql",
    "20260526000000_check_user_exists.sql",
    "20260527000000_contact_messages.sql",
    "20260528000000_nvd_version_ranges.sql",
]

# Additional SQL run after migrations (grants, ownership fixes)
POST_SETUP_SQL = """
-- Transfer ownership to postgres user so scripts can write
ALTER TABLE IF EXISTS public.nvd_cves      OWNER TO postgres;
ALTER TABLE IF EXISTS public.cert_in_cves  OWNER TO postgres;

-- Grant read access to Supabase roles (edge functions)
GRANT SELECT ON public.nvd_cves     TO anon, authenticated, service_role;
GRANT SELECT ON public.cert_in_cves TO anon, authenticated, service_role;
GRANT ALL    ON public.cert_in_cves TO postgres;
GRANT ALL    ON public.nvd_cves     TO postgres;
GRANT ALL    ON public.tech_stack_results TO service_role;

-- Grant execute on matcher functions
GRANT EXECUTE ON FUNCTION match_nvd_cves    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION match_cert_in_cves TO anon, authenticated, service_role;
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
        conn.autocommit = True
        return conn
    except psycopg2.OperationalError as e:
        print(f"[ERROR] Cannot connect to PostgreSQL: {e}")
        sys.exit(1)


def run_migration(conn, filepath: Path) -> bool:
    sql = filepath.read_text(encoding="utf-8")
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print(f"  [OK] {filepath.name}")
        return True
    except psycopg2.Error as e:
        err_msg = (e.pgerror or str(e)).strip()
        # Treat "already exists" as success — migrations are idempotent on re-run
        if "already exists" in err_msg.lower():
            print(f"  [SKIP] {filepath.name}: already applied")
            return True
        print(f"  [ERROR] {filepath.name}: {err_msg}")
        return False


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Run Vulnerix DB migrations")
    parser.add_argument("--dry-run", action="store_true", help="Test DB connection only")
    args = parser.parse_args()

    conn = get_connection()
    print(f"[DB] Connected to {os.getenv('POSTGRES_HOST')}:{os.getenv('POSTGRES_PORT')}/{os.getenv('POSTGRES_DB')}")

    if args.dry_run:
        print("[Setup] Dry run — connection OK.")
        conn.close()
        return

    print("\nRunning migrations...")
    all_ok = True
    for name in MIGRATIONS:
        path = MIGRATIONS_DIR / name
        if not path.exists():
            print(f"  [SKIP] {name} — file not found")
            continue
        if not run_migration(conn, path):
            all_ok = False

    print("\nRunning post-setup grants...")
    try:
        with conn.cursor() as cur:
            cur.execute(POST_SETUP_SQL)
        print("  [OK] Grants applied")
    except psycopg2.Error as e:
        print(f"  [WARN] Grants partially failed (may be OK if roles don't exist yet): {e}")

    conn.close()

    if all_ok:
        print("\n[Setup] Database ready.")
    else:
        print("\n[Setup] Some migrations failed — check errors above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
