-- =============================================
-- Migration: Prevent duplicate tech stack entries
-- Same user cannot add the same vendor+product+version twice
-- =============================================

-- Add unique constraint on (email_id, vendor, product_name, version)
ALTER TABLE public.tech_stack
  DROP CONSTRAINT IF EXISTS uq_tech_stack_entry;

ALTER TABLE public.tech_stack
  ADD CONSTRAINT uq_tech_stack_entry
  UNIQUE (email_id, vendor, product_name, version);
