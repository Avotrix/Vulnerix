-- Phase 2: track which advisories have already been emailed to which user,
-- so the digest never re-sends the same finding (dedup) and can honor a
-- suppression window (don't resend within N days).
--
-- Dedup identity = email_id + tech stack entry (vendor/product/version) + the
-- specific advisory id (cve_match OR cert_in). We store a normalized
-- advisory_key so a UNIQUE index cleanly prevents duplicates even when cve_match
-- is null (CIVN-only) or cert_in is null (CVE-only).

CREATE TABLE IF NOT EXISTS public.sent_notifications (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id      text NOT NULL,
    vendor        text,
    product_name  text,
    version       text,
    cve_match     text,          -- CVE id if present
    cert_in       text,          -- CIVN id if present
    severity      text,
    advisory_key  text NOT NULL, -- normalized dedup key (see index)
    sent_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per (user, advisory). Prevents the same finding being logged twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sent_notifications
    ON public.sent_notifications (email_id, advisory_key);

CREATE INDEX IF NOT EXISTS idx_sent_notifications_email ON public.sent_notifications (email_id);
CREATE INDEX IF NOT EXISTS idx_sent_notifications_sent  ON public.sent_notifications (sent_at);

-- RLS: users can read their own send-history; admins can read all. Only the
-- service role (edge function) writes.
ALTER TABLE public.sent_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sent notifications" ON public.sent_notifications;
CREATE POLICY "Users can view own sent notifications"
    ON public.sent_notifications FOR SELECT
    USING ((auth.jwt() ->> 'email') = email_id);

DROP POLICY IF EXISTS "Admins can view all sent notifications" ON public.sent_notifications;
CREATE POLICY "Admins can view all sent notifications"
    ON public.sent_notifications FOR SELECT
    USING (public.is_admin());

GRANT SELECT ON public.sent_notifications TO authenticated;
GRANT ALL    ON public.sent_notifications TO service_role, postgres;
