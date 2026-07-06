-- =========================
-- CLEAN RESET (SAFE for local)
-- =========================

DROP TABLE IF EXISTS public.tech_stack_results CASCADE;
DROP TABLE IF EXISTS public.tech_stack CASCADE;
DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;
DROP TABLE IF EXISTS public.admin_settings CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.user_access CASCADE;
DROP TABLE IF EXISTS public.user_settings CASCADE;

DROP TYPE IF EXISTS public.app_role CASCADE;

-- =========================
-- ENUMS
-- =========================

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- =========================
-- TABLES
-- =========================

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  page_affected text NOT NULL,
  action_performed text NOT NULL,
  previous_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

CREATE TABLE public.tech_stack (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL,
  product_name text NOT NULL,
  version text,
  org_name text NOT NULL,
  email_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  email_list text
);

CREATE TABLE public.tech_stack_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text NOT NULL,
  product_name text NOT NULL,
  version text,
  org_name text NOT NULL,
  email_id text NOT NULL,
  cve_match text,
  severity_cve text,
  cert_in text,
  severity_cert_in text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_access (
  user_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email_id text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  org_name text NOT NULL,
  email_id text NOT NULL,
  notification_level text DEFAULT 'all',
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_name, email_id)
);

-- =========================
-- INDEXES
-- =========================

CREATE INDEX idx_tech_stack_org 
ON public.tech_stack (org_name, email_id);

CREATE INDEX idx_tech_stack_results_org 
ON public.tech_stack_results (org_name, email_id);

CREATE INDEX idx_tech_stack_results_severity 
ON public.tech_stack_results (severity_cve, severity_cert_in);

-- =========================
-- FUNCTIONS
-- =========================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

-- =========================
-- RLS
-- =========================

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_stack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_stack_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- =========================
-- POLICIES
-- =========================

CREATE POLICY "Only admins can read settings"
ON public.admin_settings
FOR SELECT
USING (is_admin());

CREATE POLICY "Users can view own tech stack"
ON public.tech_stack
FOR SELECT
USING ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can insert own tech stack"
ON public.tech_stack
FOR INSERT
WITH CHECK ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can update own tech stack"
ON public.tech_stack
FOR UPDATE
USING ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can delete own tech stack"
ON public.tech_stack
FOR DELETE
USING ((auth.jwt() ->> 'email') = email_id);