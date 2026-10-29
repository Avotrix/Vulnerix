-- Phase 2: Add cron schedule fields to user_settings for digest frequency control
-- Supports: "immediate" (no delay), "daily_at_HH:MM_AM/PM", "weekly_DAY_HH:MM_AM/PM"
-- Example: "daily_at_09:30_AM", "weekly_monday_02:30_PM"

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cron_schedule_type text NOT NULL DEFAULT 'immediate',
  ADD COLUMN IF NOT EXISTS cron_time text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cron_day text DEFAULT NULL;

-- cron_schedule_type: 'immediate' | 'daily' | 'weekly'
-- cron_time: 'HH:MM_AM' or 'HH:MM_PM' (e.g., '09:30_AM')
-- cron_day: for weekly only, day name lowercase (e.g., 'monday', 'tuesday', etc.)

COMMENT ON COLUMN public.user_settings.cron_schedule_type IS 'Frequency: immediate, daily, or weekly';
COMMENT ON COLUMN public.user_settings.cron_time IS 'Time in 12-hour format: HH:MM_AM or HH:MM_PM';
COMMENT ON COLUMN public.user_settings.cron_day IS 'Day of week for weekly schedules: monday, tuesday, ..., sunday';
