-- =============================================
-- Migration: Add version range data to nvd_cves
-- Stores CPE match details as JSONB for proper version comparison
-- =============================================

-- Add cpe_matches JSONB column to store structured CPE match data including version ranges
-- Note: nvd_cves table is created by nvd_fetcher.py, so we use IF EXISTS guard
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'nvd_cves') THEN
        ALTER TABLE public.nvd_cves ADD COLUMN IF NOT EXISTS cpe_matches jsonb;
    END IF;
END$$;

-- Drop existing function (return type is changing — Postgres requires explicit drop)
DROP FUNCTION IF EXISTS match_nvd_cves(text, text, text, integer);

-- Recreate the match_nvd_cves function to return cpe_matches for version filtering
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
    reference_url  text,
    cpe_matches    jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        cve_id, description, cvss_score, severity,
        attack_vector, last_modified, reference_url, cpe_matches
    FROM nvd_cves
    WHERE
        array_to_string(cpe_values, '|') ILIKE '%' || p_vendor || '%'
        AND array_to_string(cpe_values, '|') ILIKE '%' || p_product || '%'
    ORDER BY last_modified DESC NULLS LAST
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION match_nvd_cves TO anon, authenticated, service_role;
