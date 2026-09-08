-- Los tres procesos que convierten un plan de mantencion en trabajo real.
--
-- Hasta aqui un plan solo DECLARABA fechas (plan_ocurrencias); nada las
-- convertia en ordenes. Estas funciones cierran ese hueco, y viven en la base
-- —no en una edge function— para que crear la OT y marcar su ocurrencia ocurran
-- en la misma transaccion: no puede quedar una OT creada cuya ocurrencia siga
-- "programada" (se duplicaria al dia siguiente) ni una ocurrencia marcada sin
-- su OT.
--
-- Las tres son idempotentes: filtran por estado y usan FOR UPDATE SKIP LOCKED,
-- asi que repetir el tick el mismo dia no duplica nada.

-- 1. Avisar: las que entraron en la ventana de anticipacion.
--
-- Es el eslabon que pidio el cliente: saber con un mes de anticipacion que una
-- mantencion viene, para alcanzar a conseguir los insumos. La ocurrencia pasa a
-- 'avisada', que es donde despues colgara la orden de compra.
--
-- Avisar y abrir la OT son cosas distintas y por eso son dos funciones: avisar
-- es "preparate, esto viene" (30 dias antes); abrir es "ya se puede ejecutar"
-- (1 dia antes).
CREATE OR REPLACE FUNCTION public.plan_avisar_proximas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_oc       record;
  v_plan     public.planes_mantencion;
  v_avisadas integer := 0;
  v_dias     integer;
  v_usuario  uuid;
  v_titulo   text;
BEGIN
  FOR v_oc IN
    SELECT o.*
    FROM public.plan_ocurrencias o
    JOIN public.planes_mantencion p ON p.id = o.plan_id
    WHERE o.estado = 'programada'
      AND p.activo
      AND p.dias_aviso_previo > 0
      AND o.fecha_programada <= CURRENT_DATE + make_interval(days => p.dias_aviso_previo)
      AND o.fecha_programada >= CURRENT_DATE
    ORDER BY o.fecha_programada
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    SELECT * INTO v_plan FROM public.planes_mantencion WHERE id = v_oc.plan_id;

    v_dias := v_oc.fecha_programada - CURRENT_DATE;
    v_titulo := COALESCE(NULLIF(BTRIM(v_plan.titulo_ot), ''), v_plan.nombre);

    -- A los asignados del plan; si no hay, a quien lo creo, para que el aviso
    -- no se pierda en el vacio.
    FOREACH v_usuario IN ARRAY (
      CASE WHEN COALESCE(array_length(v_plan.asignados_ids, 1), 0) > 0
           THEN v_plan.asignados_ids
           ELSE ARRAY[v_plan.creado_por] END
    )
    LOOP
      CONTINUE WHEN v_usuario IS NULL;

      INSERT INTO public.notifications (usuario_id, titulo, mensaje, url, tipo)
      VALUES (
        v_usuario,
        'Mantención programada en ' || v_dias || ' días',
        v_titulo || ' vence el ' || to_char(v_oc.fecha_programada, 'DD/MM/YYYY') ||
          '. Prepara los materiales necesarios.',
        '/planes?id=' || v_plan.id,
        'plan_mantencion_aviso'
      );
    END LOOP;

    UPDATE public.plan_ocurrencias
    SET estado = 'avisada', avisada_at = now()
    WHERE id = v_oc.id;

    v_avisadas := v_avisadas + 1;
  END LOOP;

  RETURN v_avisadas;
END;
$function$;

-- 2. Generar: las que llegaron a su fecha de apertura se vuelven OT.
CREATE OR REPLACE FUNCTION public.plan_generar_ordenes(
  p_plan_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_oc      record;
  v_plan    public.planes_mantencion;
  v_orden   uuid;
  v_creadas integer := 0;
  v_titulo  text;
BEGIN
  FOR v_oc IN
    SELECT o.*
    FROM public.plan_ocurrencias o
    JOIN public.planes_mantencion p ON p.id = o.plan_id
    WHERE o.estado = 'programada'
      AND o.orden_id IS NULL
      AND o.fecha_apertura <= CURRENT_DATE
      AND p.activo
      AND (p_plan_id IS NULL OR o.plan_id = p_plan_id)
    ORDER BY o.fecha_programada
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    SELECT * INTO v_plan FROM public.planes_mantencion WHERE id = v_oc.plan_id;

    -- Sin titulo propio la OT toma el del plan: una orden sin nombre no sirve.
    v_titulo := COALESCE(NULLIF(BTRIM(v_plan.titulo_ot), ''), v_plan.nombre);

    INSERT INTO public.ordenes_trabajo (
      workspace_id, creado_por, titulo, descripcion,
      tipo, tipo_trabajo, estado, prioridad,
      activo_id, categoria_id, ubicacion_id, asignados_ids,
      fecha_inicio, fecha_termino, origen
    ) VALUES (
      v_plan.workspace_id,
      v_plan.creado_por,
      v_titulo,
      COALESCE(v_plan.descripcion_ot, ''),
      'solicitud',
      COALESCE(v_plan.tipo_trabajo, 'preventiva'),
      'pendiente',
      -- 'ninguna' es valido en el plan pero la OT usa 'media' por defecto.
      CASE WHEN COALESCE(v_plan.prioridad, 'ninguna') = 'ninguna'
           THEN 'media' ELSE v_plan.prioridad END,
      v_plan.activo_id,
      v_plan.categoria_id,
      v_plan.ubicacion_id,
      COALESCE(v_plan.asignados_ids, '{}'::uuid[]),
      v_oc.fecha_apertura,
      v_oc.fecha_programada,
      'plan_mantencion'
    )
    RETURNING id INTO v_orden;

    UPDATE public.plan_ocurrencias
    SET orden_id = v_orden, estado = 'generada', generada_at = now()
    WHERE id = v_oc.id;

    v_creadas := v_creadas + 1;
  END LOOP;

  RETURN v_creadas;
END;
$function$;

-- 3. El tick diario: las tres tareas en el orden en que dependen una de otra.
--
-- Avisar antes de generar deja constancia del aviso aunque ambas cosas caigan
-- el mismo dia; rellenar al final incluye los planes que acaban de consumir una
-- ocurrencia.
CREATE OR REPLACE FUNCTION public.plan_tick_diario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_avisadas integer;
  v_ots      integer;
  v_nuevas   integer := 0;
  v_plan     record;
BEGIN
  v_avisadas := public.plan_avisar_proximas();
  v_ots      := public.plan_generar_ordenes();

  FOR v_plan IN SELECT id FROM public.planes_mantencion WHERE activo LOOP
    v_nuevas := v_nuevas + public.plan_materializar_ocurrencias(v_plan.id, NULL);
  END LOOP;

  RETURN jsonb_build_object(
    'avisadas', v_avisadas,
    'ordenes_creadas', v_ots,
    'ocurrencias_nuevas', v_nuevas,
    'corrida', now()
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.plan_avisar_proximas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_generar_ordenes(uuid) TO authenticated;

-- El tick es del cron, no una accion de usuario.
REVOKE ALL ON FUNCTION public.plan_tick_diario() FROM public, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_tick_diario() TO service_role;

-- 06:00 UTC = 03:00 en Chile: despues de los otros jobs de madrugada y antes de
-- que empiece la jornada, para que las OTs del dia ya esten creadas.
SELECT cron.schedule(
  'planes-mantencion-tick',
  '0 6 * * *',
  $cron$SELECT public.plan_tick_diario();$cron$
);
