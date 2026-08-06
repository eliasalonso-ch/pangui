-- Revoke write privileges from `anon` across the public schema.
--
-- Supabase projects start with GRANT ALL ON ALL TABLES TO anon, authenticated.
-- Today nothing leaks: RLS is enabled on all 83 public tables and no table has
-- a permissive write policy for anon, so PostgREST denies the writes.
--
-- The grants are still worth removing, because they turn a future policy
-- mistake into a live vulnerability rather than a caught one. `app_config` is
-- the concrete example: it carries `app_config_select USING (true)` so the
-- mobile force-update gate can read it before auth restoration (see
-- hooks/use-force-update.ts). It is safe only because no write policy exists
-- alongside it. A single `FOR ALL` policy added later — on that table or any
-- other — would silently expose writes to anyone holding the publishable key.
--
-- Defense in depth: after this, a bad policy alone is not enough. The grant
-- has to be re-added too.
--
-- Deliberately NOT touched:
--   - SELECT for anon. Revoking it would break the pre-auth update gate, and
--     the anon-readable surface is governed by RLS policies, which is the
--     right layer for that decision.
--   - `authenticated`. Those writes are real application traffic gated by RLS;
--     revoking them would break the app.
--   - `solicitudes_arco`. It carries `arco_insert_public` (INSERT, anon,
--     WITH CHECK true) on purpose: the public ARCO data-rights form at /arco is
--     submitted by people who are not logged in. Revoking anon INSERT there
--     would break a legal-compliance endpoint.
--   - DEFAULT PRIVILEGES. Handled below so new tables inherit the same stance.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relname <> 'solicitudes_arco'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon',
      r.relname
    );
  END LOOP;
END $$;

-- The ARCO form only ever inserts, so it keeps INSERT and loses the rest.
REVOKE UPDATE, DELETE, TRUNCATE ON public.solicitudes_arco FROM anon;

-- Same stance for tables created from here on, so this does not silently decay
-- the next time a migration adds a table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;
