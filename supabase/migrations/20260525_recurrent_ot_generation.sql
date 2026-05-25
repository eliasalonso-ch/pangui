-- Generate the next clean OT instance when a recurring parent OT is completed.
-- The recurring rule lives on the parent OT only. Sub-OTs are cloned as work
-- structure and are not independently recurring, which prevents duplicate runs.

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS recurrencia_config jsonb,
  ADD COLUMN IF NOT EXISTS recurrencia_origen_id uuid REFERENCES public.ordenes_trabajo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrencia_iteracion integer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ot_recurrencia_serie_iter
  ON public.ordenes_trabajo (recurrencia_origen_id, recurrencia_iteracion)
  WHERE recurrencia_origen_id IS NOT NULL AND recurrencia_iteracion IS NOT NULL;

CREATE OR REPLACE FUNCTION public.recurrente_advance_date(p_date date, p_recurrencia text, p_config jsonb DEFAULT NULL)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_interval integer := GREATEST(1, COALESCE((p_config->>'interval')::integer, 1));
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_recurrencia
    WHEN 'diaria' THEN
      RETURN p_date + 1;
    WHEN 'semanal' THEN
      RETURN p_date + 7;
    WHEN 'quincenal' THEN
      RETURN p_date + 15;
    WHEN 'mensual' THEN
      RETURN (p_date + interval '1 month')::date;
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

CREATE OR REPLACE FUNCTION public.recurrente_format_date_es(p_date date)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_months text[] := ARRAY[
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
BEGIN
  IF p_date IS NULL THEN
    RETURN '';
  END IF;

  RETURN EXTRACT(day FROM p_date)::int || ' de ' ||
    v_months[EXTRACT(month FROM p_date)::int] || ' ' ||
    EXTRACT(year FROM p_date)::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.recurrente_base_title(p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(COALESCE($1, 'Orden recurrente'), '\s*#\d+\s*/\s*Del .+$', '', 'i'));
$$;

CREATE OR REPLACE FUNCTION public.recurrente_title(
  p_title text,
  p_iteracion integer,
  p_inicio date,
  p_termino date
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base text := public.recurrente_base_title(p_title);
BEGIN
  IF p_inicio IS NULL THEN
    RETURN v_base || ' #' || p_iteracion;
  END IF;

  IF p_termino IS NULL OR p_termino = p_inicio THEN
    RETURN v_base || ' #' || p_iteracion || ' / ' || public.recurrente_format_date_es(p_inicio);
  END IF;

  RETURN v_base || ' #' || p_iteracion || ' / Del ' ||
    public.recurrente_format_date_es(p_inicio) || ' al ' ||
    public.recurrente_format_date_es(p_termino);
END;
$$;

CREATE OR REPLACE FUNCTION public.generar_siguiente_ot_recurrente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    AND u.rol = 'jefe'
    AND NOT (u.id = ANY(COALESCE(NEW.asignados_ids, '{}'::uuid[])));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generar_siguiente_ot_recurrente ON public.ordenes_trabajo;
CREATE TRIGGER trg_generar_siguiente_ot_recurrente
AFTER UPDATE OF estado ON public.ordenes_trabajo
FOR EACH ROW
EXECUTE FUNCTION public.generar_siguiente_ot_recurrente();

UPDATE public.ordenes_trabajo
SET recurrencia = 'ninguna',
    recurrencia_config = NULL,
    proxima_ejecucion = NULL
WHERE parent_id IS NOT NULL
  AND COALESCE(recurrencia, 'ninguna') <> 'ninguna';

UPDATE public.ordenes_trabajo
SET recurrencia_iteracion = 1
WHERE parent_id IS NULL
  AND COALESCE(recurrencia, 'ninguna') <> 'ninguna'
  AND recurrencia_iteracion IS NULL;

UPDATE public.ordenes_trabajo
SET proxima_ejecucion = public.recurrente_advance_date(
    COALESCE(fecha_inicio::date, created_at::date),
    recurrencia,
    recurrencia_config
  )
WHERE parent_id IS NULL
  AND COALESCE(recurrencia, 'ninguna') <> 'ninguna'
  AND proxima_ejecucion IS NULL
  AND estado <> 'completado';
