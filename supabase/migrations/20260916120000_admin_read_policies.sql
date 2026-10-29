-- Allow admins (is_admin()) to READ all rows in the core tenant tables,
-- so the Admin Panel can show data across all users. These are additional
-- PERMISSIVE SELECT policies; the existing "own row" policies stay intact.
-- Read-only: no INSERT/UPDATE/DELETE granted here, no data modified.

-- user_settings
DROP POLICY IF EXISTS "Admins can view all settings" ON public.user_settings;
CREATE POLICY "Admins can view all settings"
  ON public.user_settings FOR SELECT
  USING (public.is_admin());

-- tech_stack
DROP POLICY IF EXISTS "Admins can view all tech stack" ON public.tech_stack;
CREATE POLICY "Admins can view all tech stack"
  ON public.tech_stack FOR SELECT
  USING (public.is_admin());

-- tech_stack_results
DROP POLICY IF EXISTS "Admins can view all results" ON public.tech_stack_results;
CREATE POLICY "Admins can view all results"
  ON public.tech_stack_results FOR SELECT
  USING (public.is_admin());

-- user_roles (so admin panel can list who is admin/user)
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.is_admin());
