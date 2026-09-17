-- Los adjuntos del plan (planes_mantencion.adjuntos) no llegaban a la OT
-- generada: plan_generar_ordenes() no copiaba la columna, asi que un PDF
-- cargado en el plan nunca aparecia en "Adjuntos subidos" del detalle de la OT.
--
-- El formato no es el mismo en ambos lados y por eso se traduce en vez de
-- copiarse tal cual:
--   plan.adjuntos[]  = { url, tipo (MIME: "application/pdf"), nombre }
--   ot.links[]       = { url, tipo ("archivo" | "link"), nombre, origen }
-- Copiar `tipo` directo dejaria el MIME en el campo que LinksDisplay usa para
-- separar archivos de URLs (components/LinksInput.tsx), y el PDF se pintaria
-- como link.
--
-- `origen: 'creacion'` es correcto: el adjunto viene con la OT desde que nace,
-- no lo sube un tecnico en terreno (eso es 'ejecucion').
--
-- La copia ocurre al generar la OT, no al materializar la ocurrencia, asi que
-- se hace una vez por OT real y no una por cada fecha del horizonte.

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
