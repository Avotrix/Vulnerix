-- AI provider config: stores per-user encrypted API key for AI Remediation.
-- Key is NEVER returned to the browser; only provider/model/last-4 are exposed.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ai_provider_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  email_id      text NOT NULL,
  provider      text NOT NULL DEFAULT 'groq',
  model         text NOT NULL DEFAULT 'qwen/qwen3.8-27b',
  api_key_enc   bytea,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email_id)
);

ALTER TABLE public.ai_provider_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_cfg_self ON public.ai_provider_config;
CREATE POLICY ai_cfg_self ON public.ai_provider_config
  FOR SELECT USING (auth.uid() = user_id);

-- Server secret used to symmetric-encrypt the key. Set via: SELECT set_config(...)
-- We read it from a GUC-like settings table to avoid hardcoding.
CREATE TABLE IF NOT EXISTS public.app_secrets (k text PRIMARY KEY, v text);
INSERT INTO public.app_secrets (k, v)
  VALUES ('ai_enc_key', encode(gen_random_bytes(32), 'hex'))
  ON CONFLICT (k) DO NOTHING;

-- Save (encrypt) the key. Browser calls this RPC; never writes api_key_enc directly.
CREATE OR REPLACE FUNCTION public.save_ai_key(p_provider text, p_model text, p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT v INTO v_secret FROM public.app_secrets WHERE k = 'ai_enc_key';
  INSERT INTO public.ai_provider_config (user_id, email_id, provider, model, api_key_enc, updated_at)
  VALUES (v_uid, v_email, COALESCE(p_provider,'groq'), COALESCE(p_model,'qwen/qwen3.8-27b'),
          pgp_sym_encrypt(p_key, v_secret), now())
  ON CONFLICT (email_id) DO UPDATE
    SET provider = EXCLUDED.provider, model = EXCLUDED.model,
        api_key_enc = EXCLUDED.api_key_enc, updated_at = now();
END;
$$;

-- Return ONLY safe metadata: provider, model, last-4 of key, whether set.
CREATE OR REPLACE FUNCTION public.get_ai_key_meta()
RETURNS TABLE(provider text, model text, last4 text, is_set boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_uid uuid := auth.uid();
  v_plain text;
  r public.ai_provider_config%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  SELECT * INTO r FROM public.ai_provider_config WHERE user_id = v_uid;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'groq'::text, 'qwen/qwen3.8-27b'::text, NULL::text, false;
    RETURN;
  END IF;
  SELECT v INTO v_secret FROM public.app_secrets WHERE k = 'ai_enc_key';
  BEGIN
    v_plain := pgp_sym_decrypt(r.api_key_enc, v_secret);
  EXCEPTION WHEN OTHERS THEN v_plain := NULL; END;
  RETURN QUERY SELECT r.provider, r.model,
    CASE WHEN v_plain IS NOT NULL AND length(v_plain) >= 4
         THEN right(v_plain, 4) ELSE NULL END,
    (r.api_key_enc IS NOT NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_ai_key(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_key_meta() TO authenticated;