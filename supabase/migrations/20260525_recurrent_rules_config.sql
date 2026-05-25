-- Expand recurring OT rules to support the richer UI:
-- interval, weekdays, day-of-month and annual recurrence.

DO $$
DECLARE
  v_constraint record;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.ordenes_trabajo'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%recurrencia%'
  LOOP
    EXECUTE format('ALTER TABLE public.ordenes_trabajo DROP CONSTRAINT IF EXISTS %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_recurrencia_check
  CHECK (recurrencia IN ('ninguna', 'diaria', 'semanal', 'quincenal', 'mensual', 'anual', 'personalizada'));

CREATE OR REPLACE FUNCTION public.recurrente_advance_date(p_date date, p_recurrencia text, p_config jsonb DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_interval integer := GREATEST(1, COALESCE((p_config->>'interval')::integer, 1));
  v_weekdays jsonb := COALESCE(p_config->'weekdays', '[]'::jsonb);
  v_month_day integer := NULLIF(p_config->>'month_day', '')::integer;
  v_candidate date;
  v_month_start date;
  v_month_last date;
  v_guard integer := 0;
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_recurrencia
    WHEN 'diaria' THEN
      IF jsonb_array_length(v_weekdays) > 0 THEN
        v_candidate := p_date + 1;
        WHILE v_guard < 370 LOOP
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_weekdays) d(day)
            WHERE d.day::int = EXTRACT(dow FROM v_candidate)::int
          ) THEN
            RETURN v_candidate;
          END IF;
          v_candidate := v_candidate + 1;
          v_guard := v_guard + 1;
        END LOOP;
      END IF;
      RETURN p_date + v_interval;

    WHEN 'semanal' THEN
      v_candidate := p_date + (v_interval * 7);
      IF jsonb_array_length(v_weekdays) > 0 THEN
        WHILE v_guard < 14 LOOP
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_weekdays) d(day)
            WHERE d.day::int = EXTRACT(dow FROM v_candidate)::int
          ) THEN
            RETURN v_candidate;
          END IF;
          v_candidate := v_candidate + 1;
          v_guard := v_guard + 1;
        END LOOP;
      END IF;
      RETURN v_candidate;

    WHEN 'quincenal' THEN
      RETURN p_date + 15;

    WHEN 'mensual' THEN
      v_month_start := date_trunc('month', p_date + make_interval(months => v_interval))::date;
      v_month_last := (v_month_start + interval '1 month - 1 day')::date;
      RETURN v_month_start + (LEAST(COALESCE(v_month_day, EXTRACT(day FROM p_date)::int), EXTRACT(day FROM v_month_last)::int) - 1);

    WHEN 'anual' THEN
      RETURN (p_date + make_interval(years => v_interval))::date;

    WHEN 'personalizada' THEN
      CASE COALESCE(p_config->>'unit', 'day')
        WHEN 'day' THEN
          RETURN p_date + v_interval;
        WHEN 'week' THEN
          RETURN p_date + (v_interval * 7);
        WHEN 'month' THEN
          RETURN (p_date + make_interval(months => v_interval))::date;
        WHEN 'year' THEN
          RETURN (p_date + make_interval(years => v_interval))::date;
        ELSE
          RETURN p_date + v_interval;
      END CASE;

    ELSE
      RETURN NULL;
  END CASE;
END;
$$;
