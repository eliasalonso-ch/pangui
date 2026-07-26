-- ─── Scheduled Excel/CSV exports ─────────────────────────────────────────────
-- Tables + RLS + trigger + hourly cron job. See sql/034_export_schedules.sql
-- in the repo for the documented version.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE export_schedule_frequency AS ENUM ('weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE export_schedule_filter AS ENUM (
    'todas', 'pendientes', 'sin_asignar', 'en_curso',
    'urgentes', 'completadas', 'levantamientos'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Schedules table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS export_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nombre              text NOT NULL,
  frequency           export_schedule_frequency NOT NULL,
  day_of_week         smallint,
  day_of_month        smallint,
  month_of_year       smallint,
  hour_local          smallint NOT NULL DEFAULT 6,
  timezone            text NOT NULL DEFAULT 'America/Santiago',
  filter_preset       export_schedule_filter NOT NULL DEFAULT 'todas',
  columns_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipients          text[] NOT NULL DEFAULT '{}',
  active              boolean NOT NULL DEFAULT true,
  next_run_at         timestamptz NOT NULL,
  last_run_at         timestamptz,
  last_ok             boolean,
  last_error          text,
  created_by          uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,
  CONSTRAINT export_schedules_recipients_nonempty CHECK (cardinality(recipients) > 0),
  CONSTRAINT export_schedules_dow_range  CHECK (day_of_week  IS NULL OR day_of_week  BETWEEN 0 AND 6),
  CONSTRAINT export_schedules_dom_range  CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  CONSTRAINT export_schedules_moy_range  CHECK (month_of_year IS NULL OR month_of_year BETWEEN 1 AND 12),
  CONSTRAINT export_schedules_hour_range CHECK (hour_local BETWEEN 0 AND 23)
);

CREATE INDEX IF NOT EXISTS idx_export_schedules_workspace ON export_schedules (workspace_id);
CREATE INDEX IF NOT EXISTS idx_export_schedules_due       ON export_schedules (next_run_at) WHERE active = true;

-- ── Runs (audit history) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS export_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id         uuid NOT NULL REFERENCES export_schedules(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  started_at          timestamptz NOT NULL DEFAULT now(),
  finished_at         timestamptz,
  ok                  boolean,
  num_emails_sent     integer NOT NULL DEFAULT 0,
  num_files_attached  integer NOT NULL DEFAULT 0,
  total_bytes         bigint  NOT NULL DEFAULT 0,
  recipients_count    integer NOT NULL DEFAULT 0,
  ordenes_count       integer NOT NULL DEFAULT 0,
  error_message       text,
  error_detail        jsonb
);

CREATE INDEX IF NOT EXISTS idx_export_runs_schedule  ON export_runs (schedule_id,  started_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_runs_workspace ON export_runs (workspace_id, started_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE export_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_runs       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schedules_select ON export_schedules;
DROP POLICY IF EXISTS schedules_insert ON export_schedules;
DROP POLICY IF EXISTS schedules_update ON export_schedules;
DROP POLICY IF EXISTS schedules_delete ON export_schedules;
DROP POLICY IF EXISTS runs_select      ON export_runs;

CREATE POLICY schedules_select ON export_schedules
  FOR SELECT USING (workspace_id = my_workspace_id());

CREATE POLICY schedules_insert ON export_schedules
  FOR INSERT WITH CHECK (
    workspace_id = my_workspace_id()
    AND (SELECT u.rol FROM usuarios u WHERE u.id = (SELECT auth.uid()) LIMIT 1) IN ('owner', 'admin')
  );

CREATE POLICY schedules_update ON export_schedules
  FOR UPDATE USING (
    workspace_id = my_workspace_id()
    AND (SELECT u.rol FROM usuarios u WHERE u.id = (SELECT auth.uid()) LIMIT 1) IN ('owner', 'admin')
  );

CREATE POLICY schedules_delete ON export_schedules
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT u.rol FROM usuarios u WHERE u.id = (SELECT auth.uid()) LIMIT 1) IN ('owner', 'admin')
  );

CREATE POLICY runs_select ON export_runs
  FOR SELECT USING (workspace_id = my_workspace_id());

-- ── Helper: compute next_run_at ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION export_schedules_next_run_at(
  p_frequency     export_schedule_frequency,
  p_day_of_week   smallint,
  p_day_of_month  smallint,
  p_month_of_year smallint,
  p_hour_local    smallint,
  p_timezone      text,
  p_from          timestamptz DEFAULT now()
) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
DECLARE
  local_now   timestamp;
  candidate   timestamp;
  target_dom  smallint;
  last_dom    smallint;
BEGIN
  local_now := (p_from AT TIME ZONE p_timezone);

  IF p_frequency = 'weekly' THEN
    candidate := date_trunc('day', local_now)
               + ((p_day_of_week - EXTRACT(DOW FROM local_now)::int + 7) % 7) * INTERVAL '1 day'
               + p_hour_local * INTERVAL '1 hour';
    IF candidate <= local_now THEN
      candidate := candidate + INTERVAL '7 days';
    END IF;

  ELSIF p_frequency = 'monthly' THEN
    last_dom := EXTRACT(DAY FROM (date_trunc('month', local_now) + INTERVAL '1 month - 1 day'));
    target_dom := LEAST(p_day_of_month, last_dom);
    candidate := date_trunc('month', local_now)
               + (target_dom - 1) * INTERVAL '1 day'
               + p_hour_local * INTERVAL '1 hour';
    IF candidate <= local_now THEN
      candidate := date_trunc('month', local_now) + INTERVAL '1 month';
      last_dom := EXTRACT(DAY FROM (candidate + INTERVAL '1 month - 1 day'));
      target_dom := LEAST(p_day_of_month, last_dom);
      candidate := candidate + (target_dom - 1) * INTERVAL '1 day' + p_hour_local * INTERVAL '1 hour';
    END IF;

  ELSE
    last_dom := EXTRACT(DAY FROM
      (make_date(EXTRACT(YEAR FROM local_now)::int, p_month_of_year, 1)::timestamp + INTERVAL '1 month - 1 day'));
    target_dom := LEAST(p_day_of_month, last_dom);
    candidate := make_date(EXTRACT(YEAR FROM local_now)::int, p_month_of_year, target_dom)::timestamp
               + p_hour_local * INTERVAL '1 hour';
    IF candidate <= local_now THEN
      candidate := make_date(EXTRACT(YEAR FROM local_now)::int + 1, p_month_of_year, target_dom)::timestamp
                 + p_hour_local * INTERVAL '1 hour';
    END IF;
  END IF;

  RETURN candidate AT TIME ZONE p_timezone;
END $$;

CREATE OR REPLACE FUNCTION export_schedules_set_next_run_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.next_run_at := export_schedules_next_run_at(
    NEW.frequency, NEW.day_of_week, NEW.day_of_month,
    NEW.month_of_year, NEW.hour_local, NEW.timezone, now()
  );
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_export_schedules_set_next_run ON export_schedules;
CREATE TRIGGER trg_export_schedules_set_next_run
  BEFORE INSERT OR UPDATE OF frequency, day_of_week, day_of_month, month_of_year, hour_local, timezone
  ON export_schedules
  FOR EACH ROW EXECUTE FUNCTION export_schedules_set_next_run_at();

-- ── Cron: hourly tick (idempotent — unschedule first if exists) ──────────────

DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'export-schedules-tick';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'export-schedules-tick',
  '0 * * * *',
  $cron$
    SELECT net.http_post(
      url     := current_setting('app.export_cron_url', true),
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', current_setting('app.export_cron_auth', true)
      ),
      body    := '{}'::jsonb
    ) AS request_id
    WHERE current_setting('app.export_cron_url', true) IS NOT NULL;
  $cron$
);;
