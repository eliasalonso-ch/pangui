-- plan_avisar_proximas() marca la ocurrencia como 'avisada' y corre ANTES que
-- plan_generar_ordenes() dentro de plan_tick_diario(). Como esta ultima exigia
-- estado = 'programada', toda ocurrencia que caia en la ventana de aviso
-- (fecha_programada <= hoy + dias_aviso_previo) quedaba consumida por el aviso
-- y su OT no se generaba nunca: no hay transicion que devuelva 'avisada' a
-- 'programada'.
--
-- Avisar e generar son independientes — el aviso es informativo, la OT es el
-- efecto real — asi que la generacion acepta ambos estados. El frontend ya los
-- trata como equivalentes (planes-api.ts filtra .in("estado",
-- ["programada","avisada"]) en las tres consultas de ocurrencias).
--
-- Se mantiene orden_id IS NULL como guarda de idempotencia: una ocurrencia ya
-- generada no se regenera aunque vuelva a pasar por aca.

CREATE OR REPLACE FUNCTION public.plan_generar_ordenes(p_plan_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE o.estado IN ('programada', 'avisada')
      AND o.orden_id IS NULL
      AND o.fecha_apertura <= CURRENT_DATE
      AND p.activo
      AND (p_plan_id IS NULL OR o.plan_id = p_plan_id)
    ORDER BY o.fecha_programada
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    SELECT * INTO v_plan FROM public.planes_mantencion WHERE id = v_oc.plan_id;

    -- Sin titulo propio la OT toma el del plan: repetirlo al crear el plan
    -- seria ruido, y una orden sin nombre no sirve.
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
      -- La OT se abre hoy y vence en la fecha programada del plan.
      v_oc.fecha_apertura,
      v_oc.fecha_programada,
      'plan_mantencion'
    )
    RETURNING id INTO v_orden;

    UPDATE public.plan_ocurrencias
    SET orden_id = v_orden,
        estado = 'generada',
        generada_at = now()
    WHERE id = v_oc.id;

    v_creadas := v_creadas + 1;
  END LOOP;

  RETURN v_creadas;
END;
$$;
