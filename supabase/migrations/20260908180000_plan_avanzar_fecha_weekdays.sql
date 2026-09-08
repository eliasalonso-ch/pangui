-- El avance semanal ignoraba `weekdays`: un plan "cada lunes" caia en el mismo
-- dia de la semana que fecha_inicio. Con fecha_inicio en martes, las nueve
-- ocurrencias generadas cayeron todas en martes.
--
-- Dos arreglos, porque el bug estaba en dos lugares:
--   plan_avanzar_fecha            — el paso de una ocurrencia a la siguiente.
--   plan_materializar_ocurrencias — la PRIMERA, que usaba fecha_inicio cruda.
--
-- El orden de las operaciones importa: hay que ir al proximo dia pedido y
-- despues sumar las semanas extra del intervalo. Al reves (sumar semanas y
-- luego correr al dia) se salta una ocurrencia entera.

CREATE OR REPLACE FUNCTION public.plan_avanzar_fecha(
  p_desde date,
  p_recurrencia text,
  p_config jsonb
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_interval integer := GREATEST(COALESCE((p_config->>'interval')::integer, 1), 1);
  v_weekday  integer;
  v_delta    integer;
BEGIN
  IF p_recurrencia = 'semanal' THEN
    -- weekdays[0]: 0=Dom .. 6=Sab, la convencion de Date.getDay() y EXTRACT(DOW).
    v_weekday := (p_config->'weekdays'->>0)::integer;

    IF v_weekday IS NULL THEN
      RETURN (p_desde + (v_interval || ' weeks')::interval)::date;
    END IF;

    v_delta := (v_weekday - EXTRACT(DOW FROM p_desde)::integer + 7) % 7;

    -- delta 0 = p_desde ya es el dia pedido: la proxima cae un intervalo
    -- completo despues (si no, devolveria la misma fecha y el bucle no avanza).
    IF v_delta = 0 THEN
      RETURN p_desde + (v_interval * 7);
    END IF;
    RETURN p_desde + v_delta + ((v_interval - 1) * 7);
  END IF;

  RETURN CASE p_recurrencia
    WHEN 'diaria'        THEN p_desde + (v_interval || ' days')::interval
    WHEN 'mensual'       THEN p_desde + (v_interval || ' months')::interval
    WHEN 'mensual_fecha' THEN p_desde + (v_interval || ' months')::interval
    WHEN 'mensual_dia'   THEN p_desde + (v_interval || ' months')::interval
    WHEN 'anual'         THEN p_desde + (v_interval || ' years')::interval
    ELSE NULL
  END::date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.plan_materializar_ocurrencias(
  p_plan_id uuid,
  p_horizonte_dias integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan      public.planes_mantencion;
  v_fecha     date;
  v_iter      integer;
  v_limite    date;
  v_creadas   integer := 0;
  v_guarda    integer := 0;
  v_weekday   integer;
BEGIN
  SELECT * INTO v_plan FROM public.planes_mantencion WHERE id = p_plan_id;
  IF v_plan.id IS NULL OR NOT v_plan.activo THEN
    RETURN 0;
  END IF;

  v_limite := CURRENT_DATE + make_interval(
    days => GREATEST(COALESCE(p_horizonte_dias, v_plan.horizonte_dias), 1)
  );
  IF v_plan.fecha_fin IS NOT NULL AND v_plan.fecha_fin < v_limite THEN
    v_limite := v_plan.fecha_fin;
  END IF;

  SELECT fecha_programada, iteracion INTO v_fecha, v_iter
  FROM public.plan_ocurrencias
  WHERE plan_id = p_plan_id
  ORDER BY iteracion DESC
  LIMIT 1;

  IF v_fecha IS NULL THEN
    v_fecha := v_plan.fecha_inicio;
    v_iter  := 1;

    -- La primera ocurrencia tambien se alinea al dia pedido, avanzando desde
    -- fecha_inicio: nunca hacia atras, el plan no empieza antes de su fecha.
    IF v_plan.recurrencia = 'semanal' THEN
      v_weekday := (v_plan.recurrencia_config->'weekdays'->>0)::integer;
      IF v_weekday IS NOT NULL THEN
        v_fecha := v_fecha + ((v_weekday - EXTRACT(DOW FROM v_fecha)::integer + 7) % 7);
      END IF;
    END IF;
  ELSE
    v_fecha := public.plan_avanzar_fecha(v_fecha, v_plan.recurrencia, v_plan.recurrencia_config);
    v_iter  := v_iter + 1;
  END IF;

  WHILE v_fecha IS NOT NULL AND v_fecha <= v_limite AND v_guarda < 2000 LOOP
    INSERT INTO public.plan_ocurrencias (
      plan_id, workspace_id, fecha_programada, fecha_apertura, iteracion
    ) VALUES (
      p_plan_id, v_plan.workspace_id,
      v_fecha,
      v_fecha - make_interval(days => v_plan.dias_apertura_previa),
      v_iter
    )
    ON CONFLICT (plan_id, iteracion) DO NOTHING;

    v_creadas := v_creadas + 1;
    v_iter    := v_iter + 1;
    v_guarda  := v_guarda + 1;
    v_fecha   := public.plan_avanzar_fecha(v_fecha, v_plan.recurrencia, v_plan.recurrencia_config);
  END LOOP;

  RETURN v_creadas;
END;
$function$;
