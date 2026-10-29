-- Tighten CERT-In matching so a CIVN only matches when BOTH the vendor AND the
-- product appear in software_affected (previously it was OR, so any CIVN merely
-- mentioning the vendor e.g. "Microsoft ..." matched every Microsoft product).
--
-- Also normalize separators: user products are stored with underscores
-- (e.g. windows_server_2016) while CERT-In free text uses spaces
-- (e.g. "Microsoft Windows Server 2016"). We compare with underscores and
-- spaces treated the same, so genuine matches aren't missed.

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
    WITH params AS (
        SELECT
            -- normalize: lowercase, collapse _ - and spaces to a single space
            regexp_replace(lower(p_vendor),  '[_\-\s]+', ' ', 'g') AS v,
            regexp_replace(lower(p_product), '[_\-\s]+', ' ', 'g') AS p
    )
    SELECT
        c.civn_id, c.title, c.severity, c.issue_date,
        c.software_affected, c.cve_list, c.description,
        c.overview, c.solution, c.url
    FROM cert_in_cves c, params
    WHERE
        -- normalized haystack from the software_affected array
        regexp_replace(lower(array_to_string(c.software_affected, ' | ')), '[_\-\s]+', ' ', 'g')
            LIKE '%' || params.v || '%'
        AND regexp_replace(lower(array_to_string(c.software_affected, ' | ')), '[_\-\s]+', ' ', 'g')
            LIKE '%' || params.p || '%'
    ORDER BY c.issue_date DESC NULLS LAST
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION match_cert_in_cves TO anon, authenticated, service_role;
