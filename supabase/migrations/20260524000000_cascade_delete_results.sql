-- =============================================
-- Migration: Auto-delete tech_stack_results when tech_stack entry is removed
-- Uses a trigger since there's no FK relationship (matched by vendor+product+version+email)
-- =============================================

CREATE OR REPLACE FUNCTION public.delete_tech_stack_results_on_remove()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.tech_stack_results
    WHERE email_id = OLD.email_id
      AND vendor = OLD.vendor
      AND product_name = OLD.product_name
      AND (
        (version IS NULL AND OLD.version IS NULL)
        OR version = OLD.version
      );
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_tech_stack_results ON public.tech_stack;

CREATE TRIGGER trg_delete_tech_stack_results
AFTER DELETE ON public.tech_stack
FOR EACH ROW
EXECUTE FUNCTION public.delete_tech_stack_results_on_remove();
