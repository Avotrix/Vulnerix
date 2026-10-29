-- Vulnerix session changes
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
\restrict Jm2qh0J6d8sqFmFtVFUvhHcNeIT500NcbRhtuAlqfAN6IWOc5Jn9i1v6f1hl0n8
CREATE TABLE public.ai_provider_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_id text NOT NULL,
    provider text DEFAULT 'groq'::text NOT NULL,
    model text DEFAULT 'qwen/qwen3.8-27b'::text NOT NULL,
    api_key_enc bytea,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.ai_provider_config OWNER TO postgres;
CREATE TABLE public.ai_remediation_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cve_id text NOT NULL,
    installed_version text DEFAULT ''::text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    cfg_updated_at timestamp with time zone,
    remediation text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.ai_remediation_cache OWNER TO postgres;
CREATE TABLE public.app_secrets (
    k text NOT NULL,
    v text
);
ALTER TABLE public.app_secrets OWNER TO postgres;
CREATE TABLE public.match_watermark (
    id integer DEFAULT 1 NOT NULL,
    last_matched timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.match_watermark OWNER TO postgres;
ALTER TABLE ONLY public.ai_provider_config
    ADD CONSTRAINT ai_provider_config_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_remediation_cache
    ADD CONSTRAINT ai_remediation_cache_cve_id_installed_version_provider_mode_key UNIQUE (cve_id, installed_version, provider, model);
ALTER TABLE ONLY public.ai_remediation_cache
    ADD CONSTRAINT ai_remediation_cache_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.app_secrets
    ADD CONSTRAINT app_secrets_pkey PRIMARY KEY (k);
ALTER TABLE ONLY public.match_watermark
    ADD CONSTRAINT match_watermark_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX ai_provider_config_email_provider_ux ON public.ai_provider_config USING btree (email_id, provider);
CREATE POLICY ai_cfg_self ON public.ai_provider_config FOR SELECT USING ((auth.uid() = user_id));
ALTER TABLE public.ai_provider_config ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.ai_provider_config TO anon;
GRANT ALL ON TABLE public.ai_provider_config TO authenticated;
GRANT ALL ON TABLE public.ai_provider_config TO service_role;
GRANT ALL ON TABLE public.ai_remediation_cache TO anon;
GRANT ALL ON TABLE public.ai_remediation_cache TO authenticated;
GRANT ALL ON TABLE public.ai_remediation_cache TO service_role;
GRANT ALL ON TABLE public.app_secrets TO anon;
GRANT ALL ON TABLE public.app_secrets TO authenticated;
GRANT ALL ON TABLE public.app_secrets TO service_role;
GRANT ALL ON TABLE public.match_watermark TO anon;
GRANT ALL ON TABLE public.match_watermark TO authenticated;
GRANT ALL ON TABLE public.match_watermark TO service_role;
\unrestrict Jm2qh0J6d8sqFmFtVFUvhHcNeIT500NcbRhtuAlqfAN6IWOc5Jn9i1v6f1hl0n8
CREATE OR REPLACE FUNCTION public.save_ai_key(p_provider text, p_model text, p_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_secret text; v_uid uuid := auth.uid(); v_email text := auth.jwt() ->> 'email';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT v INTO v_secret FROM public.app_secrets WHERE k='ai_enc_key';
  INSERT INTO public.ai_provider_config (user_id, email_id, provider, model, api_key_enc, updated_at)
  VALUES (v_uid, v_email, COALESCE(p_provider,'groq'), COALESCE(p_model,'qwen/qwen3.8-27b'),
          extensions.pgp_sym_encrypt(p_key, v_secret), now())
  ON CONFLICT (email_id, provider) DO UPDATE
    SET model=EXCLUDED.model, api_key_enc=EXCLUDED.api_key_enc, updated_at=now();
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_ai_key_meta(p_provider text)
 RETURNS TABLE(provider text, model text, last4 text, is_set boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_secret text; v_uid uuid := auth.uid(); v_plain text; r public.ai_provider_config%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.ai_provider_config WHERE user_id=v_uid AND provider=p_provider;
  IF NOT FOUND THEN RETURN QUERY SELECT p_provider, NULL::text, NULL::text, false; RETURN; END IF;
  SELECT v INTO v_secret FROM public.app_secrets WHERE k='ai_enc_key';
  BEGIN v_plain := extensions.pgp_sym_decrypt(r.api_key_enc, v_secret); EXCEPTION WHEN OTHERS THEN v_plain := NULL; END;
  RETURN QUERY SELECT r.provider, r.model,
    CASE WHEN v_plain IS NOT NULL AND length(v_plain)>=4 THEN right(v_plain,4) ELSE NULL END,
    (r.api_key_enc IS NOT NULL);
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_ai_key_full(p_email text, p_provider text)
 RETURNS TABLE(provider text, model text, api_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_secret text; r public.ai_provider_config%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.ai_provider_config WHERE ai_provider_config.email_id=p_email AND ai_provider_config.provider=p_provider;
  IF NOT FOUND THEN
    SELECT * INTO r FROM public.ai_provider_config WHERE ai_provider_config.email_id=p_email ORDER BY updated_at DESC LIMIT 1;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT v INTO v_secret FROM public.app_secrets WHERE k='ai_enc_key';
  provider := r.provider; model := r.model; api_key := extensions.pgp_sym_decrypt(r.api_key_enc, v_secret);
  RETURN NEXT;
END; $function$
;

CREATE OR REPLACE FUNCTION public.delete_ai_key(p_provider text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.ai_provider_config WHERE user_id=v_uid AND provider=p_provider;
END; $function$
;

CREATE OR REPLACE FUNCTION public.list_ai_providers()
 RETURNS TABLE(provider text, model text, last4 text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_secret text; v_uid uuid := auth.uid(); rec record; v_plain text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT v INTO v_secret FROM public.app_secrets WHERE k='ai_enc_key';
  FOR rec IN SELECT * FROM public.ai_provider_config WHERE user_id=v_uid LOOP
    BEGIN v_plain := extensions.pgp_sym_decrypt(rec.api_key_enc, v_secret); EXCEPTION WHEN OTHERS THEN v_plain := NULL; END;
    provider := rec.provider; model := rec.model;
    last4 := CASE WHEN v_plain IS NOT NULL AND length(v_plain)>=4 THEN right(v_plain,4) ELSE NULL END;
    RETURN NEXT;
  END LOOP;
END; $function$
;

CREATE OR REPLACE FUNCTION public.log_system_event(p_source text, p_status text, p_email text, p_summary text, p_detail text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.admin_audit_logs (source, status, email_id, summary, detail, action_performed, page_affected, created_at)
  VALUES (p_source, p_status, p_email, p_summary, p_detail, COALESCE(p_source,'system'), 'system', now());
  DELETE FROM public.admin_audit_logs WHERE created_at < now() - interval '30 days' AND source IS NOT NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION public.match_nvd_cves(p_vendor text, p_product text, p_version text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(cve_id text, description text, cvss_score numeric, severity text, attack_vector text, last_modified timestamp with time zone, reference_url text, cpe_matches jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
    SELECT cve_id, description, cvss_score, severity, attack_vector, last_modified, reference_url, cpe_matches
    FROM nvd_cves
    WHERE public.cpe_text(cpe_values) ILIKE '%' || p_vendor || '%'
      AND public.cpe_text(cpe_values) ILIKE '%' || p_product || '%'
      AND (p_since IS NULL OR last_modified >= p_since)
    ORDER BY last_modified DESC NULLS LAST
    LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.match_cert_in_cves(p_vendor text, p_product text, p_limit integer DEFAULT 20)
 RETURNS TABLE(civn_id text, title text, severity text, issue_date text, software_affected text[], cve_list text[], description text, overview text, solution text, url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;


CREATE OR REPLACE FUNCTION public.cpe_text(val text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT array_to_string(val, '|') $function$
;

