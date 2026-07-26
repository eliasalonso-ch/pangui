-- =============================================================================
-- Fix: procedimiento_ejecucion_puntajes view should be SECURITY INVOKER so
-- it enforces the *querying user's* RLS, not the view creator's. Caught by
-- the Supabase database linter (0010_security_definer_view).
--
-- Postgres 15+ supports `security_invoker = true` on CREATE/ALTER VIEW.
-- =============================================================================

ALTER VIEW public.procedimiento_ejecucion_puntajes SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
