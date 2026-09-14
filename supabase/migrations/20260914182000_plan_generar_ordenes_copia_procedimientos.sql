-- planes_mantencion.procedimiento_ids no llegaba a la OT generada. El trigger
-- trg_auto_adjuntar_procedimientos solo adjunta los procedimientos marcados
-- auto_adjuntar/bloquea_inicio a nivel workspace, asi que un procedimiento
-- elegido explicitamente en el plan se perdia: el plan lo declara y la OT nace
-- sin el.
--
-- Se insertan despues del INSERT de la OT (el trigger es AFTER INSERT y ya
-- corrio) con ON CONFLICT DO NOTHING, que es lo que hace convivir ambas vias:
-- si un procedimiento entra por workspace y ademas esta en el plan, queda una
-- sola fila — hay UNIQUE (orden_id, procedimiento_id).
--
-- adjuntado_por queda en el creador del plan, que es el mismo que figura como
-- creado_por de la OT: es quien decidio que ese procedimiento va.
--
-- Se filtra contra procedimientos del mismo workspace y activos: un id que
-- quedo en el plan tras borrar o desactivar el procedimiento no debe reventar
-- la generacion de la OT (la FK lo rechazaria y se caeria el tick entero).

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
  v_links   jsonb;
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

    -- Adjuntos del plan -> links de la OT. Se descarta cualquier entrada sin
    -- url: un adjunto sin destino no se puede abrir y solo ensucia la lista.
    SELECT COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'url',    a->>'url',
                 'tipo',   'archivo',
                 'nombre', COALESCE(NULLIF(BTRIM(a->>'nombre'), ''), 'Adjunto del plan'),
                 'origen', 'creacion'
               )
             ),
             '[]'::jsonb
           )
      INTO v_links
      FROM jsonb_array_elements(COALESCE(v_plan.adjuntos, '[]'::jsonb)) AS a
     WHERE NULLIF(BTRIM(a->>'url'), '') IS NOT NULL;

    INSERT INTO public.ordenes_trabajo (
      workspace_id, creado_por, titulo, descripcion,
      tipo, tipo_trabajo, estado, prioridad,
      activo_id, categoria_id, ubicacion_id, asignados_ids,
      fecha_inicio, fecha_termino, origen, links
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
      'plan_mantencion',
      COALESCE(v_links, '[]'::jsonb)
    )
    RETURNING id INTO v_orden;

    -- Procedimientos declarados en el plan.
    INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id, adjuntado_por)
    SELECT v_orden, pr.id, v_plan.creado_por
    FROM unnest(COALESCE(v_plan.procedimiento_ids, '{}'::uuid[])) AS pid
    JOIN public.procedimientos pr
      ON pr.id = pid
     AND pr.workspace_id = v_plan.workspace_id
     AND pr.activo
    ON CONFLICT DO NOTHING;

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
