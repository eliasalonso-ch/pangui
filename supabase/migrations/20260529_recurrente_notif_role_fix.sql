-- Fix: the "OT recurrente creada" manager notification in
-- generar_siguiente_ot_recurrente() filtered `u.rol = 'jefe'`, a role that no
-- longer exists after the role-system rewrite (roles are owner/admin/member/
-- requester). As a result no manager ever received the notification. Target
-- owners and admins instead. Only the manager-notification WHERE clause changed.

CREATE OR REPLACE FUNCTION public.generar_siguiente_ot_recurrente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_series_id uuid;
  v_next_iter integer;
  v_next_start date;
  v_next_end date;
  v_end_date date;
  v_new_parent_id uuid;
  v_child record;
  v_new_child_id uuid;
BEGIN
  IF NEW.estado <> 'completado'
     OR COALESCE(OLD.estado, '') = 'completado'
     OR NEW.parent_id IS NOT NULL
     OR COALESCE(NEW.recurrencia, 'ninguna') = 'ninguna' THEN
    RETURN NEW;
  END IF;

  v_series_id := COALESCE(NEW.recurrencia_origen_id, NEW.id);
  v_next_iter := COALESCE(NEW.recurrencia_iteracion, 1) + 1;

  v_next_start := public.recurrente_advance_date(
    COALESCE(OLD.fecha_inicio::date, NEW.created_at::date),
    NEW.recurrencia,
    NEW.recurrencia_config
  );

  IF OLD.fecha_termino IS NOT NULL AND OLD.fecha_inicio IS NOT NULL THEN
    v_next_end := v_next_start + (OLD.fecha_termino::date - OLD.fecha_inicio::date);
  ELSIF OLD.fecha_termino IS NOT NULL THEN
    v_next_end := public.recurrente_advance_date(OLD.fecha_termino::date, NEW.recurrencia, NEW.recurrencia_config);
  ELSE
    v_next_end := NULL;
  END IF;

  v_end_date := NULLIF(NEW.recurrencia_config->>'end_date', '')::date;
  IF v_end_date IS NOT NULL AND v_next_start > v_end_date THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ordenes_trabajo
    WHERE recurrencia_origen_id = v_series_id
      AND recurrencia_iteracion = v_next_iter
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, clasificacion, estado, prioridad,
    recurrencia, recurrencia_config, proxima_ejecucion,
    recurrencia_origen_id, recurrencia_iteracion,
    estado_cobro, requiere_materiales, requiere_hoja, requiere_fotos,
    categoria_id, ubicacion_id, lugar_id, sociedad_id, activo_id,
    asignados_ids, fecha_inicio, fecha_termino,
    n_serie, solicitante, hito, presupuesto,
    imagen_url, links, origen
  )
  VALUES (
    NEW.workspace_id, NEW.creado_por,
    public.recurrente_title(NEW.titulo, v_next_iter, v_next_start, v_next_end),
    COALESCE(NEW.descripcion, ''),
    COALESCE(NEW.tipo, 'solicitud'), NEW.tipo_trabajo, NEW.clasificacion,
    'pendiente', NEW.prioridad,
    NEW.recurrencia, NEW.recurrencia_config, v_next_start,
    v_series_id, v_next_iter,
    COALESCE(NEW.estado_cobro, 'no_cobrable'),
    COALESCE(NEW.requiere_materiales, false),
    COALESCE(NEW.requiere_hoja, false),
    COALESCE(NEW.requiere_fotos, false),
    NEW.categoria_id, NEW.ubicacion_id, NEW.lugar_id, NEW.sociedad_id, NEW.activo_id,
    COALESCE(NEW.asignados_ids, '{}'::uuid[]),
    v_next_start, v_next_end,
    NEW.n_serie, NEW.solicitante, NEW.hito, NEW.presupuesto,
    NEW.imagen_url, COALESCE(NEW.links, '[]'::jsonb), 'recurrente'
  )
  RETURNING id INTO v_new_parent_id;

  INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id, adjuntado_por, hereda_a_hijos)
  SELECT v_new_parent_id, procedimiento_id, NEW.creado_por, hereda_a_hijos
  FROM public.ot_procedimientos
  WHERE orden_id = NEW.id
  ON CONFLICT DO NOTHING;

  FOR v_child IN
    SELECT *
    FROM public.ordenes_trabajo
    WHERE parent_id = NEW.id
    ORDER BY created_at ASC
  LOOP
    INSERT INTO public.ordenes_trabajo (
      workspace_id, creado_por, titulo, descripcion,
      tipo, tipo_trabajo, clasificacion, estado, prioridad,
      recurrencia, recurrencia_config, proxima_ejecucion,
      estado_cobro, requiere_materiales, requiere_hoja, requiere_fotos,
      categoria_id, ubicacion_id, lugar_id, sociedad_id, activo_id,
      asignados_ids, fecha_inicio, fecha_termino,
      n_serie, solicitante, hito, presupuesto,
      imagen_url, links, parent_id, origen
    )
    VALUES (
      v_child.workspace_id, v_child.creado_por, v_child.titulo, COALESCE(v_child.descripcion, ''),
      COALESCE(v_child.tipo, 'solicitud'), v_child.tipo_trabajo, v_child.clasificacion,
      'pendiente', v_child.prioridad,
      'ninguna', NULL, NULL,
      COALESCE(v_child.estado_cobro, 'no_cobrable'),
      COALESCE(v_child.requiere_materiales, false),
      COALESCE(v_child.requiere_hoja, false),
      COALESCE(v_child.requiere_fotos, false),
      v_child.categoria_id, v_child.ubicacion_id, v_child.lugar_id, v_child.sociedad_id,
      COALESCE(v_child.activo_id, NEW.activo_id),
      COALESCE(v_child.asignados_ids, NEW.asignados_ids, '{}'::uuid[]),
      v_next_start, v_next_end,
      v_child.n_serie, COALESCE(v_child.solicitante, NEW.solicitante), COALESCE(v_child.hito, NEW.hito), v_child.presupuesto,
      v_child.imagen_url, COALESCE(v_child.links, '[]'::jsonb), v_new_parent_id, 'recurrente'
    )
    RETURNING id INTO v_new_child_id;

    INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id, adjuntado_por, hereda_a_hijos)
    SELECT v_new_child_id, procedimiento_id, NEW.creado_por, hereda_a_hijos
    FROM public.ot_procedimientos
    WHERE orden_id = v_child.id
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, url, tipo)
  SELECT DISTINCT uid, 'OT recurrente creada',
    public.recurrente_title(NEW.titulo, v_next_iter, v_next_start, v_next_end),
    '/ordenes?id=' || v_new_parent_id::text,
    'orden'
  FROM unnest(COALESCE(NEW.asignados_ids, '{}'::uuid[])) AS uid;

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, url, tipo)
  SELECT u.id, 'OT recurrente creada',
    public.recurrente_title(NEW.titulo, v_next_iter, v_next_start, v_next_end),
    '/ordenes?id=' || v_new_parent_id::text,
    'orden'
  FROM public.usuarios u
  WHERE u.workspace_id = NEW.workspace_id
    AND u.rol = ANY (ARRAY['owner'::text, 'admin'::text])
    AND NOT (u.id = ANY(COALESCE(NEW.asignados_ids, '{}'::uuid[])));

  RETURN NEW;
END;
$function$;
