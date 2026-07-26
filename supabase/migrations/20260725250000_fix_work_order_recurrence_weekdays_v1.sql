-- Keep recurrence advancement aligned with the web/mobile recurrence controls.
-- Weekly rules must honor the selected weekday instead of blindly adding 7 days.
CREATE OR REPLACE FUNCTION public.recurrente_advance_date(
  p_date date,
  p_recurrencia text,
  p_config jsonb DEFAULT NULL::jsonb
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_interval integer := GREATEST(1, COALESCE((p_config->>'interval')::integer, 1));
  v_weekdays jsonb := CASE
    WHEN jsonb_typeof(p_config->'weekdays') = 'array' THEN p_config->'weekdays'
    ELSE '[]'::jsonb
  END;
  v_month_day integer := COALESCE(
    NULLIF(p_config->>'day_of_month', '')::integer,
    NULLIF(p_config->>'month_day', '')::integer
  );
  v_candidate date;
  v_month_start date;
  v_month_last date;
  v_guard integer := 0;
  v_target_dow integer;
  v_delta integer;
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
      IF jsonb_array_length(v_weekdays) > 0 THEN
        v_target_dow := (v_weekdays->>0)::integer;
        v_delta := (v_target_dow - EXTRACT(dow FROM p_date)::integer + 7) % 7;
        RETURN p_date + CASE
          WHEN v_delta = 0 THEN v_interval * 7
          ELSE v_delta + ((v_interval - 1) * 7)
        END;
      END IF;
      RETURN p_date + (v_interval * 7);

    WHEN 'quincenal' THEN
      RETURN p_date + 15;

    WHEN 'mensual', 'mensual_fecha', 'mensual_dia' THEN
      v_month_start := date_trunc('month', p_date + make_interval(months => v_interval))::date;
      v_month_last := (v_month_start + interval '1 month - 1 day')::date;
      RETURN v_month_start + (
        LEAST(
          COALESCE(v_month_day, EXTRACT(day FROM p_date)::integer),
          EXTRACT(day FROM v_month_last)::integer
        ) - 1
      );

    WHEN 'anual' THEN
      RETURN (p_date + make_interval(years => v_interval))::date;

    WHEN 'personalizada' THEN
      CASE COALESCE(p_config->>'unit', 'day')
        WHEN 'day' THEN
          RETURN p_date + v_interval;
        WHEN 'week' THEN
          IF jsonb_array_length(v_weekdays) > 0 THEN
            v_target_dow := (v_weekdays->>0)::integer;
            v_delta := (v_target_dow - EXTRACT(dow FROM p_date)::integer + 7) % 7;
            RETURN p_date + CASE
              WHEN v_delta = 0 THEN v_interval * 7
              ELSE v_delta + ((v_interval - 1) * 7)
            END;
          END IF;
          RETURN p_date + (v_interval * 7);
        WHEN 'month' THEN
          v_month_start := date_trunc('month', p_date + make_interval(months => v_interval))::date;
          v_month_last := (v_month_start + interval '1 month - 1 day')::date;
          RETURN v_month_start + (
            LEAST(
              COALESCE(v_month_day, EXTRACT(day FROM p_date)::integer),
              EXTRACT(day FROM v_month_last)::integer
            ) - 1
          );
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

NOTIFY pgrst, 'reload schema';

