-- Corrective sub-OTs generated from procedure failures should inherit the
-- assignees from their parent OT, just like manually-created sub-OTs.

CREATE OR REPLACE FUNCTION public.crear_correctiva_desde_paso(p_respuesta_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_resp           public.paso_respuestas%ROWTYPE;
  v_paso           public.procedimiento_pasos%ROWTYPE;
  v_parent_ot      public.ordenes_trabajo%ROWTYPE;
  v_workspace_id   uuid;
  v_new_ot_id      uuid;
  v_plantilla      jsonb;
  v_titulo         text;
  v_descripcion    text;
  v_prioridad      text;
  v_tipo_trabajo   text;
BEGIN
  SELECT * INTO v_resp FROM public.paso_respuestas WHERE id = p_respuesta_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_resp.correctiva_ot_id IS NOT NULL THEN
    RETURN v_resp.correctiva_ot_id;
  END IF;

  SELECT * INTO v_paso FROM public.procedimiento_pasos WHERE id = v_resp.paso_id;
  IF NOT FOUND OR NOT v_paso.genera_correctiva THEN
    RETURN NULL;
  END IF;

  SELECT ot.* INTO v_parent_ot
  FROM public.procedimiento_ejecuciones pe
  JOIN public.ordenes_trabajo ot ON ot.id = pe.orden_id
  WHERE pe.id = v_resp.ejecucion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent OT not found for ejecucion %', v_resp.ejecucion_id;
  END IF;

  v_workspace_id := v_parent_ot.workspace_id;
  v_plantilla := COALESCE(v_paso.correctiva_plantilla, '{}'::jsonb);
  v_titulo := COALESCE(
    NULLIF(v_plantilla->>'titulo', ''),
    'Acción correctiva: ' || COALESCE(v_paso.titulo, 'paso sin título')
  );
  v_descripcion := COALESCE(
    v_plantilla->>'descripcion',
    'Generado automáticamente por una respuesta de falla en el procedimiento.'
  );
  v_prioridad := COALESCE(v_plantilla->>'prioridad', v_parent_ot.prioridad, 'media');
  v_tipo_trabajo := COALESCE(v_plantilla->>'tipo_trabajo', 'reactiva');

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, estado, prioridad,
    parent_id, asignados_ids, origen, origen_paso_id, origen_ejecucion_id
  ) VALUES (
    v_workspace_id,
    v_resp.respondido_por,
    v_titulo,
    v_descripcion,
    'solicitud',
    v_tipo_trabajo,
    'pendiente',
    v_prioridad,
    v_parent_ot.id,
    COALESCE(v_parent_ot.asignados_ids, '{}'::uuid[]),
    'correctiva_procedimiento',
    v_paso.id,
    v_resp.ejecucion_id
  )
  RETURNING id INTO v_new_ot_id;

  UPDATE public.paso_respuestas
    SET correctiva_ot_id = v_new_ot_id
    WHERE id = p_respuesta_id;

  RETURN v_new_ot_id;
END
$$;

REVOKE ALL ON FUNCTION public.crear_correctiva_desde_paso(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.crear_correctiva_desde_paso(uuid) TO authenticated;

UPDATE public.ordenes_trabajo child
SET asignados_ids = parent.asignados_ids
FROM public.ordenes_trabajo parent
WHERE child.parent_id = parent.id
  AND (child.asignados_ids IS NULL OR cardinality(child.asignados_ids) = 0)
  AND parent.asignados_ids IS NOT NULL
  AND cardinality(parent.asignados_ids) > 0;
