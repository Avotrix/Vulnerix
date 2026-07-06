-- =============================================
-- Migration: demo_requests table
-- Stores demo request submissions from the landing page
-- =============================================

CREATE TABLE IF NOT EXISTS public.demo_requests (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    email       text NOT NULL,
    organization text NOT NULL,
    phone       text,
    message     text,
    status      text NOT NULL DEFAULT 'pending',
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit a demo request" ON public.demo_requests;
CREATE POLICY "Anyone can submit a demo request"
ON public.demo_requests
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view demo requests" ON public.demo_requests;
CREATE POLICY "Admins can view demo requests"
ON public.demo_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update demo requests" ON public.demo_requests;
CREATE POLICY "Admins can update demo requests"
ON public.demo_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE INDEX IF NOT EXISTS idx_demo_requests_status ON public.demo_requests (status);
CREATE INDEX IF NOT EXISTS idx_demo_requests_created ON public.demo_requests (created_at DESC);
