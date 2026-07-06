-- =============================================
-- Migration: check_user_exists RPC
-- Allows anonymous callers to check if an email is registered
-- Returns boolean only (no user data leaked)
-- =============================================

CREATE OR REPLACE FUNCTION public.check_user_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM auth.users
        WHERE email = lower(p_email)
    );
$$;

GRANT EXECUTE ON FUNCTION public.check_user_exists TO anon, authenticated;
