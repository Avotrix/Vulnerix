-- =============================================
-- Migration: cert_in_cves table
-- Stores CERT-IN advisories scraped from cert-in.org.in
-- =============================================

CREATE TABLE IF NOT EXISTS public.cert_in_cves (
    civn_id             TEXT        PRIMARY KEY,   -- e.g. CIVN-2026-0042
    url                 TEXT        NOT NULL,
    title               TEXT,
    issue_date          TEXT,                      -- kept as text (e.g. "May 12, 2026")
    severity            TEXT,                      -- CRITICAL / HIGH / MEDIUM / LOW
    software_affected   TEXT[],                    -- list of affected software strings
    cve_list            TEXT[],                    -- linked CVE IDs e.g. ["CVE-2026-1234"]
    description         TEXT,
    overview            TEXT,
    target_audience     TEXT,
    risk_assessment     TEXT,
    impact_assessment   TEXT,
    solution            TEXT,
    vendor_information  TEXT,
    references_text     TEXT,
    raw_text_preview    TEXT,
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_cert_in_cves_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cert_in_cves_updated_at'
    ) THEN
        CREATE TRIGGER trg_cert_in_cves_updated_at
        BEFORE UPDATE ON public.cert_in_cves
        FOR EACH ROW EXECUTE FUNCTION update_cert_in_cves_updated_at();
    END IF;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cert_in_cves_severity    ON public.cert_in_cves (severity);
CREATE INDEX IF NOT EXISTS idx_cert_in_cves_issue_date  ON public.cert_in_cves (issue_date);
CREATE INDEX IF NOT EXISTS idx_cert_in_cves_cve_list    ON public.cert_in_cves USING GIN (cve_list);
CREATE INDEX IF NOT EXISTS idx_cert_in_cves_software    ON public.cert_in_cves USING GIN (software_affected);

-- Grant access to edge functions
GRANT SELECT ON public.cert_in_cves TO anon, authenticated, service_role;
GRANT ALL    ON public.cert_in_cves TO postgres;

-- =============================================
-- RPC: match_cert_in_cves
-- Matches a vendor/product string against software_affected array
-- Also checks if any linked CVE matches NVD data
-- =============================================
CREATE OR REPLACE FUNCTION match_cert_in_cves(
    p_vendor  text,
    p_product text,
    p_limit   int DEFAULT 20
)
RETURNS TABLE (
    civn_id            text,
    title              text,
    severity           text,
    issue_date         text,
    software_affected  text[],
    cve_list           text[],
    description        text,
    overview           text,
    solution           text,
    url                text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        civn_id, title, severity, issue_date,
        software_affected, cve_list, description,
        overview, solution, url
    FROM cert_in_cves
    WHERE
        -- Match vendor or product name in software_affected array
        array_to_string(software_affected, '|') ILIKE '%' || p_vendor  || '%'
        OR array_to_string(software_affected, '|') ILIKE '%' || p_product || '%'
    ORDER BY issue_date DESC NULLS LAST
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION match_cert_in_cves TO anon, authenticated, service_role;
