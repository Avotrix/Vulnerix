-- Phase 1: richer notification preferences on user_settings.
-- Old single 'notification_level' (all/critical/none) can't express the UI's
-- master toggle + per-severity checkboxes + digest frequency. Add proper columns.
-- Existing rows keep working; we backfill sensible defaults from notification_level.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS email_enabled    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS severities       text[]  NOT NULL DEFAULT ARRAY['Critical','High']::text[],
  ADD COLUMN IF NOT EXISTS digest_frequency text    NOT NULL DEFAULT 'daily';

-- Backfill from the legacy notification_level so current users aren't surprised:
--   'none'     -> email off
--   'critical' -> only Critical
--   'all'      -> all four severities
UPDATE public.user_settings
   SET email_enabled = false
 WHERE notification_level = 'none';

UPDATE public.user_settings
   SET severities = ARRAY['Critical']::text[]
 WHERE notification_level = 'critical';

UPDATE public.user_settings
   SET severities = ARRAY['Critical','High','Medium','Low']::text[]
 WHERE notification_level = 'all';
