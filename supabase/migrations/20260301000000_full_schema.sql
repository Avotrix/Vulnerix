-- Enable required extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- ENUMS (Ultra-safe creation with namespace check)
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'app_role'
    AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END$$;

-- =============================================
-- TABLES (With proper Foreign Keys)
-- =============================================

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_affected text NOT NULL,
  action_performed text NOT NULL,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
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
  -- Note: Email-based RLS - if email changes in auth, data becomes inaccessible
  -- Future improvement: Add user_id column for auth.uid() based RLS
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
  -- Note: Email-based RLS - same consideration as tech_stack
);

-- FIXED: Removed DEFAULT gen_random_uuid() - now strictly references auth.users
CREATE TABLE public.user_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email_id text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  org_name text NOT NULL,
  email_id text NOT NULL,
  notification_level text DEFAULT 'all',
  created_at timestamptz DEFAULT now(),
  UNIQUE (org_name, email_id)
);

-- =============================================
-- INDEXES (Added email_id index for performance)
-- =============================================
CREATE INDEX idx_tech_stack_org ON public.tech_stack (org_name, email_id);
CREATE INDEX idx_tech_stack_results_org ON public.tech_stack_results (org_name, email_id);
CREATE INDEX idx_tech_stack_results_severity ON public.tech_stack_results (severity_cve, severity_cert_in);
CREATE INDEX idx_tech_stack_results_email ON public.tech_stack_results (email_id);
CREATE INDEX idx_tech_stack_email ON public.tech_stack (email_id);

-- =============================================
-- FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' THEN
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

-- =============================================
-- ENABLE ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_stack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_stack_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLICIES - admin_audit_logs
-- =============================================
CREATE POLICY "Admins can insert audit logs" 
ON public.admin_audit_logs 
FOR INSERT 
WITH CHECK (is_admin());

CREATE POLICY "Admins can view audit logs" 
ON public.admin_audit_logs 
FOR SELECT 
USING (is_admin());

CREATE POLICY "no_delete_logs" 
ON public.admin_audit_logs 
FOR DELETE 
USING (false);

CREATE POLICY "no_update_logs" 
ON public.admin_audit_logs 
FOR UPDATE 
USING (false);

-- =============================================
-- POLICIES - admin_settings
-- =============================================
CREATE POLICY "Admins can insert settings" 
ON public.admin_settings 
FOR INSERT 
WITH CHECK (is_admin());

CREATE POLICY "Admins can update settings" 
ON public.admin_settings 
FOR UPDATE 
USING (is_admin());

CREATE POLICY "Only admins can delete settings" 
ON public.admin_settings 
FOR DELETE 
USING (is_admin());

CREATE POLICY "Only admins can read settings" 
ON public.admin_settings 
FOR SELECT 
USING (is_admin());

-- =============================================
-- POLICIES - tech_stack (Email-based RLS)
-- =============================================
CREATE POLICY "Users can delete own org tech stack" 
ON public.tech_stack 
FOR DELETE 
USING ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can insert own org tech stack" 
ON public.tech_stack 
FOR INSERT 
WITH CHECK ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can update own org tech stack" 
ON public.tech_stack 
FOR UPDATE 
USING ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can view own org tech stack" 
ON public.tech_stack 
FOR SELECT 
USING ((auth.jwt() ->> 'email') = email_id);

-- =============================================
-- POLICIES - tech_stack_results (Email-based RLS)
-- =============================================
CREATE POLICY "Users can insert own org results" 
ON public.tech_stack_results 
FOR INSERT 
WITH CHECK ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can update own org results" 
ON public.tech_stack_results 
FOR UPDATE 
USING ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can view own org results" 
ON public.tech_stack_results 
FOR SELECT 
USING ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "no_delete_results" 
ON public.tech_stack_results 
FOR DELETE 
USING (false);

-- =============================================
-- POLICIES - user_access (Fixed: UUID-based)
-- =============================================
CREATE POLICY "Users can delete own account" 
ON public.user_access 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own access record" 
ON public.user_access 
FOR INSERT 
WITH CHECK ((auth.uid() = user_id) AND ((auth.jwt() ->> 'email') = user_email_id));

CREATE POLICY "Users can update own access record" 
ON public.user_access 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view own access record" 
ON public.user_access 
FOR SELECT 
USING ((auth.uid() = user_id) OR ((auth.jwt() ->> 'email') = user_email_id));

-- =============================================
-- POLICIES - user_roles
-- =============================================
CREATE POLICY "Admins can delete roles (no self)" 
ON public.user_roles 
FOR DELETE 
USING (is_admin() AND (user_id <> auth.uid()));

CREATE POLICY "Admins can insert roles (no self)" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (is_admin() AND (user_id <> auth.uid()));

CREATE POLICY "Admins can update roles (no self)" 
ON public.user_roles 
FOR UPDATE 
USING (is_admin() AND (user_id <> auth.uid()));

CREATE POLICY "Users can view own roles" 
ON public.user_roles 
FOR SELECT 
USING (auth.uid() = user_id);

-- =============================================
-- POLICIES - user_settings
-- =============================================
CREATE POLICY "Users can insert own settings" 
ON public.user_settings 
FOR INSERT 
WITH CHECK ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can update own settings" 
ON public.user_settings 
FOR UPDATE 
USING ((auth.jwt() ->> 'email') = email_id);

CREATE POLICY "Users can view own org settings" 
ON public.user_settings 
FOR SELECT 
USING ((auth.jwt() ->> 'email') = email_id);

-- =============================================
-- TRIGGERS (Protects both DELETE and UPDATE)
-- =============================================
DROP TRIGGER IF EXISTS prevent_last_admin_removal_trigger ON public.user_roles;

CREATE TRIGGER prevent_last_admin_removal_trigger
BEFORE DELETE OR UPDATE ON public.user_roles
FOR EACH ROW
WHEN (OLD.role = 'admin')
EXECUTE FUNCTION public.prevent_last_admin_removal();
