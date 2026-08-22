-- Read-only monitoring role for Grafana Cloud's hosted Postgres integration.
--
-- Scope: statistics only. This role can read pg_stat_* / pg_settings via the
-- built-in pg_monitor role, and CANNOT read application data -- no grants are
-- issued on public or any application schema.
--
-- The password is NOT stored here. Set it out-of-band after applying:
--   ALTER ROLE grafana_monitor WITH PASSWORD '<secret>';
-- The live value lives in Grafana Cloud's connection config and nowhere in git.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_monitor') THEN
    -- Password intentionally omitted; set separately (see header).
    -- INHERIT (not NOINHERIT): the role must actually USE its pg_monitor
    -- privileges without an explicit SET ROLE, or pg_stat_statements redacts
    -- query text as <insufficient privilege>.
    CREATE ROLE grafana_monitor LOGIN INHERIT CONNECTION LIMIT 5;
  END IF;
END
$$;

-- pg_monitor bundles pg_read_all_stats + pg_read_all_settings +
-- pg_stat_scan_tables. This is the privilege set the exporter needs.
-- WITH INHERIT TRUE is explicit: in PG16+ the grant carries its own inherit
-- flag, independent of the role's rolinherit setting.
GRANT pg_monitor TO grafana_monitor WITH INHERIT TRUE;

-- pg_stat_statements lives in the `extensions` schema on Supabase, so the
-- role needs USAGE there to reach the view for query-level metrics.
GRANT USAGE ON SCHEMA extensions TO grafana_monitor;
GRANT SELECT ON extensions.pg_stat_statements TO grafana_monitor;

COMMENT ON ROLE grafana_monitor IS
  'Read-only stats role for Grafana Cloud Postgres integration. No data access.';
