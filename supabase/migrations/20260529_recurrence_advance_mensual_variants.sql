-- Fix: recurring OTs created on mobile with `mensual_fecha` / `mensual_dia`
-- never regenerated. The generation trigger calls recurrente_advance_date(),
-- whose CASE only handled 'mensual' (web's vocabulary) and fell through to
-- ELSE → NULL for the mobile monthly variants, so no next instance was created.
--
-- The web and mobile clients use different recurrence vocabularies:
--   web    : diaria | semanal | quincenal | mensual | anual
--   mobile : diaria | semanal | mensual_fecha | mensual_dia | anual | personalizada
-- Rather than churn both clients, the DB advancer handles the union. Both
-- monthly variants advance like 'mensual' (advance one interval-month, keep the
-- target day-of-month clamped to the month's last day). True "nth weekday"
-- semantics for mensual_dia are approximated by the same date math, which still
-- guarantees regeneration on the right month.

CREATE OR REPLACE FUNCTION public.recurrente_advance_date(p_date date, p_recurrencia text, p_config jsonb DEFAULT NULL::jsonb)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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

    -- 'mensual' (web) plus the mobile monthly variants all advance monthly.
    WHEN 'mensual', 'mensual_fecha', 'mensual_dia' THEN
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
$function$;
