-- =============================================
-- Migration: match_nvd_cves RPC function
-- Matches tech stack vendor/product against nvd_cves table
-- using CPE values array and optional version matching
--
-- Note: nvd_cves table is fully populated by nvd_fetcher.py.
-- This migration creates a minimal stub if the table doesn't exist yet,
-- so the RPC function can be created. nvd_fetcher.py will add missing
-- columns/indexes when it runs.
-- =============================================

CREATE TABLE IF NOT EXISTS public.nvd_cves (
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
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION match_nvd_cves(
    p_vendor  text,
    p_product text,
    p_version text DEFAULT NULL,
    p_limit   int  DEFAULT 50
)
RETURNS TABLE (
    cve_id         text,
    description    text,
    cvss_score     numeric(4,1),
    severity       text,
    attack_vector  text,
    last_modified  timestamptz,
    reference_url  text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        cve_id, description, cvss_score, severity,
        attack_vector, last_modified, reference_url
    FROM nvd_cves
    WHERE
        array_to_string(cpe_values, '|') ILIKE '%' || p_vendor || '%'
        AND array_to_string(cpe_values, '|') ILIKE '%' || p_product || '%'
        AND (
            p_version IS NULL
            OR p_version IN ('*', '-', '')
            OR array_to_string(cpe_values, '|') ILIKE '%:' || p_version || '%'
            OR array_to_string(cpe_values, '|') ILIKE '%:*%'
            OR array_to_string(cpe_values, '|') ILIKE '%:-%'
        )
    ORDER BY last_modified DESC NULLS LAST
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION match_nvd_cves TO anon, authenticated, service_role;
