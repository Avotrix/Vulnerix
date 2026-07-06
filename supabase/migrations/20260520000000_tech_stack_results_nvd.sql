-- =============================================
-- Migration: Enrich tech_stack_results for NVD
-- - Wipe Splunk data (fresh start)
-- - Add source tracking + richer CVE fields
-- - Allow engine to delete stale results (upsert pattern)
-- =============================================

-- 1. Wipe existing Splunk-populated data
TRUNCATE TABLE public.tech_stack_results;

-- 2. Add new columns (all nullable so existing INSERT paths don't break)
ALTER TABLE public.tech_stack_results
  ADD COLUMN IF NOT EXISTS source        text NOT NULL DEFAULT 'nvd',
  ADD COLUMN IF NOT EXISTS description   text,
  ADD COLUMN IF NOT EXISTS cvss_score    numeric(4,1),
  ADD COLUMN IF NOT EXISTS last_modified timestamptz,
  ADD COLUMN IF NOT EXISTS reference_url text,
  ADD COLUMN IF NOT EXISTS attack_vector text;

-- 3. Add unique constraint to prevent duplicate matches per user+product+cve+source
--    Allows safe upsert when engine re-runs
ALTER TABLE public.tech_stack_results
  DROP CONSTRAINT IF EXISTS uq_tech_stack_results_match;

ALTER TABLE public.tech_stack_results
  ADD CONSTRAINT uq_tech_stack_results_match
  UNIQUE (email_id, vendor, product_name, version, cve_match, source);

-- 4. Add index on source for future filtering
CREATE INDEX IF NOT EXISTS idx_tech_stack_results_source
  ON public.tech_stack_results (source);

-- 5. Drop the blanket no-delete policy so the engine (service role) can
--    clean up stale results before re-inserting
DROP POLICY IF EXISTS "no_delete_results" ON public.tech_stack_results;

-- Regular users still cannot delete their own results from the UI
-- Only the service role (edge function) can delete — enforced at app level
CREATE POLICY "no_delete_results"
ON public.tech_stack_results
FOR DELETE
USING (false);
