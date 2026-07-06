-- =============================================
-- Migration: contact_messages table
-- Stores contact form submissions from authenticated users
-- =============================================

CREATE TABLE IF NOT EXISTS public.contact_messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    email       text NOT NULL,
    subject     text NOT NULL,
    message     text NOT NULL,
    user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    status      text NOT NULL DEFAULT 'new',
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert contact messages" ON public.contact_messages;
CREATE POLICY "Authenticated users can insert contact messages"
ON public.contact_messages
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users can view own messages" ON public.contact_messages;
CREATE POLICY "Users can view own messages"
ON public.contact_messages
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all contact messages" ON public.contact_messages;
CREATE POLICY "Admins can view all contact messages"
ON public.contact_messages
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update contact messages" ON public.contact_messages;
CREATE POLICY "Admins can update contact messages"
ON public.contact_messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON public.contact_messages (status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON public.contact_messages (created_at DESC);
