-- Canonical, transactional and idempotent creation commands for work orders.
--
-- IMPORTANT: this migration belongs to the web repository, which is the
-- canonical Supabase source. Do not deploy it until migration history has been
-- reconciled as described in docs/work-orders/TEST-BASELINE.md.

CREATE TABLE IF NOT EXISTS public.work_order_commands (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  command_type text NOT NULL,
  payload_hash text NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (workspace_id, command_id),
  CONSTRAINT work_order_commands_type_check
    CHECK (command_type IN (
      'create_work_order_v1',
      'create_sub_work_order_v1',
      'edit_work_order_v1',
      'transition_work_order_v1'
    ))
);

CREATE INDEX IF NOT EXISTS work_order_commands_actor_created_idx
  ON public.work_order_commands (actor_id, created_at DESC);

ALTER TABLE public.work_order_commands ENABLE ROW LEVEL SECURITY;

-- Commands are only visible through SECURITY DEFINER functions. This avoids
-- exposing idempotency payloads and prevents clients from forging results.
REVOKE ALL ON TABLE public.work_order_commands FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.work_order_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  command_id uuid NOT NULL,
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT work_order_notification_outbox_command_fkey
    FOREIGN KEY (workspace_id, command_id)
    REFERENCES public.work_order_commands(workspace_id, command_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS work_order_notification_outbox_once_idx
  ON public.work_order_notification_outbox
    (workspace_id, command_id, event_type, aggregate_id, COALESCE(recipient_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS work_order_notification_outbox_pending_idx
  ON public.work_order_notification_outbox (created_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.work_order_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.work_order_notification_outbox FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.work_order_command_error(
  p_code text,
  p_message text
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = p_code,
    DETAIL = p_message;
END;
$$;

REVOKE ALL ON FUNCTION public.work_order_command_error(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_work_order_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_command_id uuid;
  v_workspace_id uuid;
  v_envelope_actor_id uuid;
  v_payload jsonb;
  v_payload_hash text;
  v_existing public.work_order_commands%ROWTYPE;
  v_user public.usuarios%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_order public.ordenes_trabajo%ROWTYPE;
  v_next_number integer;
  v_recurrencia text;
  v_recurrencia_config jsonb;
  v_proxima_ejecucion date;
  v_assignee uuid;
  v_sheet_id uuid;
  v_activity_ids uuid[] := ARRAY[]::uuid[];
  v_outbox_ids uuid[] := ARRAY[]::uuid[];
  v_activity_id uuid;
  v_outbox_id uuid;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    PERFORM public.work_order_command_error('UNAUTHENTICATED', 'A valid session is required.');
  END IF;

  IF COALESCE((p_command ->> 'contract_version')::integer, 0) <> 1 THEN
    PERFORM public.work_order_command_error('CONTRACT_VERSION_UNSUPPORTED', 'Expected contract_version 1.');
  END IF;

  BEGIN
    v_command_id := (p_command ->> 'command_id')::uuid;
    v_workspace_id := (p_command ->> 'workspace_id')::uuid;
    v_envelope_actor_id := (p_command ->> 'actor_id')::uuid;
  EXCEPTION WHEN invalid_text_representation OR null_value_not_allowed THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'command_id, workspace_id and actor_id must be UUIDs.');
  END;

  IF v_envelope_actor_id IS DISTINCT FROM v_actor_id THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'actor_id must match the authenticated user.');
  END IF;

  v_payload := COALESCE(p_command -> 'payload', '{}'::jsonb);
  v_payload_hash := md5(v_payload::text);

  SELECT * INTO v_user
  FROM public.usuarios
  WHERE id = v_actor_id
  FOR SHARE;

  IF v_user.id IS NULL OR v_user.workspace_id IS DISTINCT FROM v_workspace_id OR NOT COALESCE(v_user.activo, true) THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'The actor is not an active member of this workspace.');
  END IF;

  SELECT * INTO v_workspace
  FROM public.workspaces
  WHERE id = v_workspace_id
  FOR SHARE;

  IF v_workspace.id IS NULL THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Workspace was not found.');
  END IF;

  IF COALESCE(v_workspace.crear_ot_solo_admins, false)
     AND COALESCE(v_user.rol, '') NOT IN ('owner', 'admin') THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'Only owners and administrators may create work orders.');
  END IF;

  INSERT INTO public.work_order_commands (
    workspace_id, command_id, actor_id, command_type, payload_hash
  ) VALUES (
    v_workspace_id, v_command_id, v_actor_id, 'create_work_order_v1', v_payload_hash
  )
  ON CONFLICT (workspace_id, command_id) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.work_order_commands
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id
  FOR UPDATE;

  IF v_existing.command_type <> 'create_work_order_v1'
     OR v_existing.payload_hash <> v_payload_hash THEN
    PERFORM public.work_order_command_error('COMMAND_PAYLOAD_MISMATCH', 'The command ID was already used with another operation or payload.');
  END IF;

  IF v_existing.result IS NOT NULL THEN
    RETURN jsonb_set(v_existing.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  IF NULLIF(btrim(v_payload ->> 'titulo'), '') IS NULL THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'titulo is required.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(v_payload -> 'asignados_ids') = 'array'
        THEN v_payload -> 'asignados_ids'
        ELSE '[]'::jsonb
      END
    ) value
    LEFT JOIN public.usuarios u ON u.id = value::uuid
    WHERE u.id IS NULL
       OR u.workspace_id IS DISTINCT FROM v_workspace_id
       OR NOT COALESCE(u.activo, true)
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Every assignee must be an active member of this workspace.');
  END IF;

  IF NULLIF(v_payload ->> 'ubicacion_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ubicaciones
    WHERE id = (v_payload ->> 'ubicacion_id')::uuid
      AND workspace_id = v_workspace_id
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'ubicacion_id belongs to another workspace.');
  END IF;

  IF NULLIF(v_payload ->> 'lugar_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lugares
    WHERE id = (v_payload ->> 'lugar_id')::uuid
      AND workspace_id = v_workspace_id
      AND (
        NULLIF(v_payload ->> 'ubicacion_id', '') IS NULL
        OR ubicacion_id = (v_payload ->> 'ubicacion_id')::uuid
      )
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'lugar_id is not valid for this workspace and location.');
  END IF;

  IF NULLIF(v_payload ->> 'sociedad_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sociedades
    WHERE id = (v_payload ->> 'sociedad_id')::uuid
      AND workspace_id = v_workspace_id
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'sociedad_id belongs to another workspace.');
  END IF;

  IF NULLIF(v_payload ->> 'activo_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.activos
    WHERE id = (v_payload ->> 'activo_id')::uuid
      AND workspace_id = v_workspace_id
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'activo_id belongs to another workspace.');
  END IF;

  IF NULLIF(v_payload ->> 'categoria_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categorias_ot
    WHERE id = (v_payload ->> 'categoria_id')::uuid
      AND (
        workspace_id = v_workspace_id
        OR (workspace_id IS NULL AND es_default = true)
      )
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'categoria_id belongs to another workspace.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(v_payload -> 'categoria_ids') = 'array'
        THEN v_payload -> 'categoria_ids'
        ELSE '[]'::jsonb
      END
    ) value
    LEFT JOIN public.categorias_ot c ON c.id = value::uuid
    WHERE c.id IS NULL OR NOT (
      c.workspace_id = v_workspace_id
      OR (c.workspace_id IS NULL AND c.es_default = true)
    )
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Every category must belong to this workspace.');
  END IF;

  v_recurrencia := COALESCE(NULLIF(v_payload ->> 'recurrencia', ''), 'ninguna');
  v_recurrencia_config := CASE
    WHEN v_recurrencia = 'ninguna' THEN NULL
    ELSE v_payload -> 'recurrencia_config'
  END;

  IF v_recurrencia <> 'ninguna' AND NULLIF(v_payload ->> 'fecha_inicio', '') IS NOT NULL THEN
    v_proxima_ejecucion := public.recurrente_advance_date(
      (v_payload ->> 'fecha_inicio')::timestamptz::date,
      v_recurrencia,
      v_recurrencia_config
    );
  END IF;

  -- Serialize number allocation per workspace. The existing trigger skips its
  -- MAX+1 calculation because this command supplies numero explicitly.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_next_number
  FROM public.ordenes_trabajo
  WHERE workspace_id = v_workspace_id;

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion, n_serie,
    solicitante, solicitante_telefono, solicitante_email, hito, presupuesto,
    tipo, tipo_trabajo, clasificacion, estado, prioridad,
    recurrencia, recurrencia_config, proxima_ejecucion, recurrencia_iteracion,
    estado_cobro, requiere_materiales, requiere_hoja, requiere_fotos,
    categoria_id, categoria_ids, ubicacion_id, lugar_id, sociedad_id, activo_id,
    asignados_ids, fecha_inicio, fecha_termino, imagen_url, links, numero
  ) VALUES (
    v_workspace_id,
    v_actor_id,
    btrim(v_payload ->> 'titulo'),
    COALESCE(v_payload ->> 'descripcion', ''),
    NULLIF(btrim(v_payload ->> 'n_serie'), ''),
    NULLIF(btrim(v_payload ->> 'solicitante'), ''),
    NULLIF(btrim(v_payload ->> 'solicitante_telefono'), ''),
    NULLIF(btrim(v_payload ->> 'solicitante_email'), ''),
    NULLIF(btrim(v_payload ->> 'hito'), ''),
    NULLIF(btrim(v_payload ->> 'presupuesto'), ''),
    'solicitud',
    COALESCE(NULLIF(v_payload ->> 'tipo_trabajo', ''), 'reactiva'),
    COALESCE(NULLIF(v_payload ->> 'clasificacion', ''), CASE WHEN v_payload ->> 'tipo_trabajo' = 'levantamiento' THEN 'levantamiento' ELSE 'ejecucion' END),
    'pendiente',
    COALESCE(NULLIF(v_payload ->> 'prioridad', ''), 'ninguna'),
    v_recurrencia,
    v_recurrencia_config,
    v_proxima_ejecucion,
    CASE WHEN v_recurrencia = 'ninguna' THEN NULL ELSE 1 END,
    'no_cobrable',
    COALESCE(v_workspace.requiere_materiales_global, false),
    COALESCE(v_workspace.requiere_hoja_global, false),
    COALESCE(v_workspace.fotos_obligatorias_todas, false) OR COALESCE(v_workspace.requiere_fotos_global, false),
    NULLIF(v_payload ->> 'categoria_id', '')::uuid,
    CASE WHEN jsonb_typeof(v_payload -> 'categoria_ids') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_payload -> 'categoria_ids')::uuid)
      ELSE NULL END,
    NULLIF(v_payload ->> 'ubicacion_id', '')::uuid,
    NULLIF(v_payload ->> 'lugar_id', '')::uuid,
    NULLIF(v_payload ->> 'sociedad_id', '')::uuid,
    NULLIF(v_payload ->> 'activo_id', '')::uuid,
    CASE WHEN jsonb_typeof(v_payload -> 'asignados_ids') = 'array'
      THEN ARRAY(SELECT DISTINCT jsonb_array_elements_text(v_payload -> 'asignados_ids')::uuid)
      ELSE NULL END,
    NULLIF(v_payload ->> 'fecha_inicio', '')::timestamptz,
    NULLIF(v_payload ->> 'fecha_termino', '')::timestamptz,
    NULLIF(v_payload ->> 'imagen_url', ''),
    COALESCE(v_payload -> 'links', '[]'::jsonb),
    v_next_number
  ) RETURNING * INTO v_order;

  INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
  VALUES (v_order.id, 'creado', v_order.titulo, v_actor_id)
  RETURNING id INTO v_activity_id;
  v_activity_ids := array_append(v_activity_ids, v_activity_id);

  IF COALESCE(array_length(v_order.asignados_ids, 1), 0) > 0 THEN
    INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
    VALUES (v_order.id, 'asignado', array_to_string(v_order.asignados_ids, ','), v_actor_id)
    RETURNING id INTO v_activity_id;
    v_activity_ids := array_append(v_activity_ids, v_activity_id);
  END IF;

  INSERT INTO public.work_order_notification_outbox (
    workspace_id, command_id, event_type, aggregate_id, payload
  ) VALUES (
    v_workspace_id, v_command_id, 'work_order_created', v_order.id,
    jsonb_build_object('orden_id', v_order.id, 'titulo', v_order.titulo, 'prioridad', v_order.prioridad)
  ) RETURNING id INTO v_outbox_id;
  v_outbox_ids := array_append(v_outbox_ids, v_outbox_id);

  FOREACH v_assignee IN ARRAY COALESCE(v_order.asignados_ids, ARRAY[]::uuid[]) LOOP
    INSERT INTO public.work_order_notification_outbox (
      workspace_id, command_id, event_type, aggregate_id, recipient_id, payload
    ) VALUES (
      v_workspace_id, v_command_id, 'work_order_assigned', v_order.id, v_assignee,
      jsonb_build_object('orden_id', v_order.id, 'titulo', v_order.titulo)
    ) RETURNING id INTO v_outbox_id;
    v_outbox_ids := array_append(v_outbox_ids, v_outbox_id);
  END LOOP;

  v_result := jsonb_build_object(
    'contract_version', 1,
    'command_id', v_command_id,
    'replayed', false,
    'data', jsonb_build_object(
      'work_order', to_jsonb(v_order),
      'activity_ids', to_jsonb(v_activity_ids),
      'sheet_id', v_sheet_id,
      'notification_outbox_ids', to_jsonb(v_outbox_ids)
    )
  );

  UPDATE public.work_order_commands
  SET result = v_result, completed_at = now()
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_sub_work_order_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_command_id uuid;
  v_workspace_id uuid;
  v_envelope_actor_id uuid;
  v_payload jsonb;
  v_payload_hash text;
  v_existing public.work_order_commands%ROWTYPE;
  v_user public.usuarios%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_parent public.ordenes_trabajo%ROWTYPE;
  v_child public.ordenes_trabajo%ROWTYPE;
  v_policy text;
  v_include_all boolean;
  v_next_number integer;
  v_sheet_id uuid;
  v_activity_id uuid;
  v_outbox_id uuid;
  v_procedure_ids uuid[] := ARRAY[]::uuid[];
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    PERFORM public.work_order_command_error('UNAUTHENTICATED', 'A valid session is required.');
  END IF;

  IF COALESCE((p_command ->> 'contract_version')::integer, 0) <> 1 THEN
    PERFORM public.work_order_command_error('CONTRACT_VERSION_UNSUPPORTED', 'Expected contract_version 1.');
  END IF;

  BEGIN
    v_command_id := (p_command ->> 'command_id')::uuid;
    v_workspace_id := (p_command ->> 'workspace_id')::uuid;
    v_envelope_actor_id := (p_command ->> 'actor_id')::uuid;
  EXCEPTION WHEN invalid_text_representation OR null_value_not_allowed THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'command_id, workspace_id and actor_id must be UUIDs.');
  END;

  IF v_envelope_actor_id IS DISTINCT FROM v_actor_id THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'actor_id must match the authenticated user.');
  END IF;

  v_payload := COALESCE(p_command -> 'payload', '{}'::jsonb);
  v_payload_hash := md5(v_payload::text);
  v_policy := COALESCE(NULLIF(v_payload ->> 'inheritance_policy', ''), 'operational');
  v_include_all := COALESCE((v_payload ->> 'include_all_procedures')::boolean, false);

  IF v_policy NOT IN ('operational', 'minimal') THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'inheritance_policy must be operational or minimal.');
  END IF;

  SELECT * INTO v_user
  FROM public.usuarios
  WHERE id = v_actor_id
  FOR SHARE;

  IF v_user.id IS NULL OR v_user.workspace_id IS DISTINCT FROM v_workspace_id OR NOT COALESCE(v_user.activo, true) THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'The actor is not an active member of this workspace.');
  END IF;

  SELECT * INTO v_workspace
  FROM public.workspaces
  WHERE id = v_workspace_id
  FOR SHARE;

  IF v_workspace.id IS NULL THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Workspace was not found.');
  END IF;
  IF COALESCE(v_workspace.crear_ot_solo_admins, false)
     AND COALESCE(v_user.rol, '') NOT IN ('owner', 'admin') THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'Only owners and administrators may create work orders.');
  END IF;

  SELECT * INTO v_parent
  FROM public.ordenes_trabajo
  WHERE id = NULLIF(v_payload ->> 'parent_id', '')::uuid
  FOR UPDATE;

  IF v_parent.id IS NULL THEN
    PERFORM public.work_order_command_error('OT_NOT_FOUND', 'Parent work order was not found.');
  END IF;
  IF v_parent.workspace_id IS DISTINCT FROM v_workspace_id THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Parent work order belongs to another workspace.');
  END IF;
  IF v_parent.deleted_at IS NOT NULL THEN
    PERFORM public.work_order_command_error('OT_NOT_FOUND', 'Parent work order is deleted.');
  END IF;
  IF NULLIF(btrim(v_payload ->> 'titulo'), '') IS NULL THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'titulo is required.');
  END IF;

  INSERT INTO public.work_order_commands (
    workspace_id, command_id, actor_id, command_type, payload_hash
  ) VALUES (
    v_workspace_id, v_command_id, v_actor_id, 'create_sub_work_order_v1', v_payload_hash
  )
  ON CONFLICT (workspace_id, command_id) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.work_order_commands
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id
  FOR UPDATE;

  IF v_existing.command_type <> 'create_sub_work_order_v1'
     OR v_existing.payload_hash <> v_payload_hash THEN
    PERFORM public.work_order_command_error('COMMAND_PAYLOAD_MISMATCH', 'The command ID was already used with another operation or payload.');
  END IF;
  IF v_existing.result IS NOT NULL THEN
    RETURN jsonb_set(v_existing.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 0));
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_next_number
  FROM public.ordenes_trabajo
  WHERE workspace_id = v_workspace_id;

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion, tipo, tipo_trabajo,
    clasificacion, estado, prioridad, recurrencia, recurrencia_config,
    proxima_ejecucion, estado_cobro, parent_id, asignados_ids,
    categoria_id, categoria_ids, ubicacion_id, activo_id, lugar_id, sociedad_id,
    fecha_inicio, fecha_termino, n_serie, solicitante, solicitante_telefono,
    solicitante_email, hito, presupuesto, requiere_materiales, requiere_hoja,
    requiere_fotos, imagen_url, links, numero
  ) VALUES (
    v_workspace_id,
    v_actor_id,
    btrim(v_payload ->> 'titulo'),
    CASE WHEN v_policy = 'operational' THEN COALESCE(v_parent.descripcion, '') ELSE '' END,
    'solicitud',
    COALESCE(v_parent.tipo_trabajo, 'reactiva'),
    v_parent.clasificacion,
    'pendiente',
    v_parent.prioridad,
    'ninguna', NULL, NULL, 'no_cobrable', v_parent.id,
    v_parent.asignados_ids,
    CASE WHEN v_policy = 'operational' THEN v_parent.categoria_id ELSE NULL END,
    CASE WHEN v_policy = 'operational' THEN v_parent.categoria_ids ELSE NULL END,
    v_parent.ubicacion_id,
    CASE WHEN v_policy = 'operational' THEN v_parent.activo_id ELSE NULL END,
    v_parent.lugar_id,
    v_parent.sociedad_id,
    v_parent.fecha_inicio,
    v_parent.fecha_termino,
    CASE WHEN v_policy = 'operational' THEN v_parent.n_serie ELSE NULL END,
    CASE WHEN v_policy = 'operational' THEN v_parent.solicitante ELSE NULL END,
    CASE WHEN v_policy = 'operational' THEN v_parent.solicitante_telefono ELSE NULL END,
    CASE WHEN v_policy = 'operational' THEN v_parent.solicitante_email ELSE NULL END,
    CASE WHEN v_policy = 'operational' THEN v_parent.hito ELSE NULL END,
    CASE WHEN v_policy = 'operational' THEN v_parent.presupuesto ELSE NULL END,
    v_parent.requiere_materiales,
    v_parent.requiere_hoja,
    v_parent.requiere_fotos,
    CASE WHEN v_policy = 'operational' THEN v_parent.imagen_url ELSE NULL END,
    CASE WHEN v_policy = 'operational' THEN v_parent.links ELSE '[]'::jsonb END,
    v_next_number
  ) RETURNING * INTO v_child;

  WITH inherited AS (
    INSERT INTO public.ot_procedimientos (
      orden_id, procedimiento_id, adjuntado_por, hereda_a_hijos
    )
    SELECT
      v_child.id,
      op.procedimiento_id,
      v_actor_id,
      op.hereda_a_hijos
    FROM public.ot_procedimientos op
    WHERE op.orden_id = v_parent.id
      AND (v_include_all OR op.hereda_a_hijos)
      AND NOT EXISTS (
        SELECT 1 FROM public.ot_procedimientos existing
        WHERE existing.orden_id = v_child.id
          AND existing.procedimiento_id = op.procedimiento_id
      )
    RETURNING procedimiento_id
  )
  SELECT COALESCE(array_agg(procedimiento_id), ARRAY[]::uuid[])
  INTO v_procedure_ids
  FROM inherited;

  INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
  VALUES (v_child.id, 'creado', v_child.titulo, v_actor_id)
  RETURNING id INTO v_activity_id;

  INSERT INTO public.work_order_notification_outbox (
    workspace_id, command_id, event_type, aggregate_id, payload
  ) VALUES (
    v_workspace_id, v_command_id, 'sub_work_order_created', v_child.id,
    jsonb_build_object('orden_id', v_child.id, 'parent_id', v_parent.id, 'titulo', v_child.titulo)
  ) RETURNING id INTO v_outbox_id;

  v_result := jsonb_build_object(
    'contract_version', 1,
    'command_id', v_command_id,
    'replayed', false,
    'data', jsonb_build_object(
      'work_order', to_jsonb(v_child),
      'activity_ids', jsonb_build_array(v_activity_id),
      'sheet_id', v_sheet_id,
      'procedure_ids', to_jsonb(v_procedure_ids),
      'notification_outbox_ids', jsonb_build_array(v_outbox_id)
    )
  );

  UPDATE public.work_order_commands
  SET result = v_result, completed_at = now()
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_work_order_references_v1(
  p_workspace_id uuid,
  p_changes jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_changes ? 'asignados_ids' AND p_changes -> 'asignados_ids' IS NOT NULL THEN
    IF jsonb_typeof(p_changes -> 'asignados_ids') <> 'array' THEN
      PERFORM public.work_order_command_error('INVALID_COMMAND', 'asignados_ids must be an array.');
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_changes -> 'asignados_ids') value
      LEFT JOIN public.usuarios u ON u.id = value::uuid
      WHERE u.id IS NULL
         OR u.workspace_id IS DISTINCT FROM p_workspace_id
         OR NOT COALESCE(u.activo, true)
    ) THEN
      PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Every assignee must be an active member of this workspace.');
    END IF;
  END IF;

  IF NULLIF(p_changes ->> 'ubicacion_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ubicaciones
    WHERE id = (p_changes ->> 'ubicacion_id')::uuid AND workspace_id = p_workspace_id
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'ubicacion_id belongs to another workspace.');
  END IF;
  IF NULLIF(p_changes ->> 'lugar_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lugares
    WHERE id = (p_changes ->> 'lugar_id')::uuid
      AND workspace_id = p_workspace_id
      AND (
        NULLIF(p_changes ->> 'ubicacion_id', '') IS NULL
        OR ubicacion_id = (p_changes ->> 'ubicacion_id')::uuid
      )
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'lugar_id is not valid for this workspace and location.');
  END IF;
  IF NULLIF(p_changes ->> 'sociedad_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sociedades
    WHERE id = (p_changes ->> 'sociedad_id')::uuid AND workspace_id = p_workspace_id
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'sociedad_id belongs to another workspace.');
  END IF;
  IF NULLIF(p_changes ->> 'activo_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.activos
    WHERE id = (p_changes ->> 'activo_id')::uuid AND workspace_id = p_workspace_id
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'activo_id belongs to another workspace.');
  END IF;
  IF NULLIF(p_changes ->> 'categoria_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categorias_ot
    WHERE id = (p_changes ->> 'categoria_id')::uuid
      AND (
        workspace_id = p_workspace_id
        OR (workspace_id IS NULL AND es_default = true)
      )
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'categoria_id belongs to another workspace.');
  END IF;
  IF p_changes ? 'categoria_ids' AND p_changes -> 'categoria_ids' IS NOT NULL THEN
    IF jsonb_typeof(p_changes -> 'categoria_ids') <> 'array' THEN
      PERFORM public.work_order_command_error('INVALID_COMMAND', 'categoria_ids must be an array.');
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_changes -> 'categoria_ids') value
      LEFT JOIN public.categorias_ot c ON c.id = value::uuid
      WHERE c.id IS NULL OR NOT (
        c.workspace_id = p_workspace_id
        OR (c.workspace_id IS NULL AND c.es_default = true)
      )
    ) THEN
      PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Every category must belong to this workspace.');
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_work_order_references_v1(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.edit_work_order_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_command_id uuid;
  v_workspace_id uuid;
  v_envelope_actor_id uuid;
  v_payload jsonb;
  v_changes jsonb;
  v_payload_hash text;
  v_existing public.work_order_commands%ROWTYPE;
  v_user public.usuarios%ROWTYPE;
  v_before public.ordenes_trabajo%ROWTYPE;
  v_after public.ordenes_trabajo%ROWTYPE;
  v_expected_updated_at timestamptz;
  v_recurrencia text;
  v_recurrencia_config jsonb;
  v_proxima_ejecucion date;
  v_added_assignees uuid[] := ARRAY[]::uuid[];
  v_activity_ids uuid[] := ARRAY[]::uuid[];
  v_outbox_ids uuid[] := ARRAY[]::uuid[];
  v_id uuid;
  v_recipient uuid;
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    PERFORM public.work_order_command_error('UNAUTHENTICATED', 'A valid session is required.');
  END IF;
  IF COALESCE((p_command ->> 'contract_version')::integer, 0) <> 1 THEN
    PERFORM public.work_order_command_error('CONTRACT_VERSION_UNSUPPORTED', 'Expected contract_version 1.');
  END IF;

  BEGIN
    v_command_id := (p_command ->> 'command_id')::uuid;
    v_workspace_id := (p_command ->> 'workspace_id')::uuid;
    v_envelope_actor_id := (p_command ->> 'actor_id')::uuid;
  EXCEPTION WHEN invalid_text_representation OR null_value_not_allowed THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'command_id, workspace_id and actor_id must be UUIDs.');
  END;
  IF v_envelope_actor_id IS DISTINCT FROM v_actor_id THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'actor_id must match the authenticated user.');
  END IF;

  v_payload := COALESCE(p_command -> 'payload', '{}'::jsonb);
  v_changes := COALESCE(v_payload -> 'changes', '{}'::jsonb);
  v_payload_hash := md5(v_payload::text);
  BEGIN
    v_expected_updated_at := (v_payload ->> 'expected_updated_at')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'expected_updated_at must be a timestamp.');
  END;
  IF v_expected_updated_at IS NULL OR NULLIF(v_payload ->> 'ot_id', '') IS NULL THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'ot_id and expected_updated_at are required.');
  END IF;
  IF jsonb_typeof(v_changes) <> 'object' OR v_changes = '{}'::jsonb THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'changes must be a non-empty object.');
  END IF;

  SELECT * INTO v_user FROM public.usuarios WHERE id = v_actor_id FOR SHARE;
  IF v_user.id IS NULL OR v_user.workspace_id IS DISTINCT FROM v_workspace_id
     OR NOT COALESCE(v_user.activo, true)
     OR COALESCE(v_user.rol, '') NOT IN ('owner', 'admin', 'member', 'supervisor') THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'The actor cannot edit work orders in this workspace.');
  END IF;

  INSERT INTO public.work_order_commands (
    workspace_id, command_id, actor_id, command_type, payload_hash
  ) VALUES (
    v_workspace_id, v_command_id, v_actor_id, 'edit_work_order_v1', v_payload_hash
  ) ON CONFLICT (workspace_id, command_id) DO NOTHING;

  SELECT * INTO v_existing FROM public.work_order_commands
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id FOR UPDATE;
  IF v_existing.command_type <> 'edit_work_order_v1' OR v_existing.payload_hash <> v_payload_hash THEN
    PERFORM public.work_order_command_error('COMMAND_PAYLOAD_MISMATCH', 'The command ID was already used with another operation or payload.');
  END IF;
  IF v_existing.result IS NOT NULL THEN
    RETURN jsonb_set(v_existing.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  SELECT * INTO v_before FROM public.ordenes_trabajo
  WHERE id = (v_payload ->> 'ot_id')::uuid FOR UPDATE;
  IF v_before.id IS NULL OR v_before.deleted_at IS NOT NULL THEN
    PERFORM public.work_order_command_error('OT_NOT_FOUND', 'Work order was not found.');
  END IF;
  IF v_before.workspace_id IS DISTINCT FROM v_workspace_id THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Work order belongs to another workspace.');
  END IF;
  IF v_before.updated_at IS DISTINCT FROM v_expected_updated_at THEN
    PERFORM public.work_order_command_error('CONFLICT', 'The work order changed after it was opened.');
  END IF;
  IF v_before.estado IN ('completado', 'cancelado') THEN
    PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'Terminal work orders cannot be edited.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(v_changes) key
    WHERE key NOT IN (
      'titulo', 'descripcion', 'n_serie', 'solicitante', 'solicitante_telefono',
      'solicitante_email', 'hito', 'presupuesto', 'prioridad', 'tipo_trabajo',
      'clasificacion', 'categoria_id', 'categoria_ids', 'recurrencia',
      'recurrencia_config', 'fecha_inicio', 'fecha_termino', 'ubicacion_id',
      'lugar_id', 'sociedad_id', 'activo_id', 'asignados_ids', 'imagen_url',
      'links', 'requiere_materiales', 'requiere_hoja', 'requiere_fotos'
    )
  ) THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'changes contains a field that is not editable.');
  END IF;
  IF v_changes ? 'titulo' AND NULLIF(btrim(v_changes ->> 'titulo'), '') IS NULL THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'titulo cannot be empty.');
  END IF;
  PERFORM public.assert_work_order_references_v1(v_workspace_id, v_changes);

  v_recurrencia := CASE WHEN v_changes ? 'recurrencia'
    THEN COALESCE(NULLIF(v_changes ->> 'recurrencia', ''), 'ninguna')
    ELSE COALESCE(v_before.recurrencia, 'ninguna') END;
  v_recurrencia_config := CASE
    WHEN v_recurrencia = 'ninguna' THEN NULL
    WHEN v_changes ? 'recurrencia_config' THEN v_changes -> 'recurrencia_config'
    ELSE v_before.recurrencia_config END;
  v_proxima_ejecucion := v_before.proxima_ejecucion::date;
  IF v_changes ? 'fecha_inicio' AND NULLIF(v_changes ->> 'fecha_inicio', '') IS NULL THEN
    v_proxima_ejecucion := NULL;
  ELSIF (v_changes ? 'recurrencia' OR v_changes ? 'recurrencia_config' OR v_changes ? 'fecha_inicio')
     AND v_recurrencia <> 'ninguna'
     AND COALESCE(NULLIF(v_changes ->> 'fecha_inicio', ''), v_before.fecha_inicio::text) IS NOT NULL THEN
    v_proxima_ejecucion := public.recurrente_advance_date(
      COALESCE(NULLIF(v_changes ->> 'fecha_inicio', '')::timestamptz, v_before.fecha_inicio)::date,
      v_recurrencia,
      v_recurrencia_config
    );
  END IF;

  UPDATE public.ordenes_trabajo SET
    titulo = CASE WHEN v_changes ? 'titulo' THEN btrim(v_changes ->> 'titulo') ELSE titulo END,
    descripcion = CASE WHEN v_changes ? 'descripcion' THEN COALESCE(v_changes ->> 'descripcion', '') ELSE descripcion END,
    n_serie = CASE WHEN v_changes ? 'n_serie' THEN NULLIF(btrim(v_changes ->> 'n_serie'), '') ELSE n_serie END,
    solicitante = CASE WHEN v_changes ? 'solicitante' THEN NULLIF(btrim(v_changes ->> 'solicitante'), '') ELSE solicitante END,
    solicitante_telefono = CASE WHEN v_changes ? 'solicitante_telefono' THEN NULLIF(btrim(v_changes ->> 'solicitante_telefono'), '') ELSE solicitante_telefono END,
    solicitante_email = CASE WHEN v_changes ? 'solicitante_email' THEN NULLIF(btrim(v_changes ->> 'solicitante_email'), '') ELSE solicitante_email END,
    hito = CASE WHEN v_changes ? 'hito' THEN NULLIF(btrim(v_changes ->> 'hito'), '') ELSE hito END,
    presupuesto = CASE WHEN v_changes ? 'presupuesto' THEN NULLIF(btrim(v_changes ->> 'presupuesto'), '') ELSE presupuesto END,
    prioridad = CASE WHEN v_changes ? 'prioridad' THEN v_changes ->> 'prioridad' ELSE prioridad END,
    tipo_trabajo = CASE WHEN v_changes ? 'tipo_trabajo' THEN NULLIF(v_changes ->> 'tipo_trabajo', '') ELSE tipo_trabajo END,
    clasificacion = CASE WHEN v_changes ? 'clasificacion' THEN NULLIF(v_changes ->> 'clasificacion', '') ELSE clasificacion END,
    categoria_id = CASE WHEN v_changes ? 'categoria_id' THEN NULLIF(v_changes ->> 'categoria_id', '')::uuid ELSE categoria_id END,
    categoria_ids = CASE WHEN v_changes ? 'categoria_ids' THEN
      CASE WHEN v_changes -> 'categoria_ids' IS NULL THEN NULL ELSE ARRAY(SELECT DISTINCT jsonb_array_elements_text(v_changes -> 'categoria_ids')::uuid) END
      ELSE categoria_ids END,
    recurrencia = v_recurrencia,
    recurrencia_config = v_recurrencia_config,
    proxima_ejecucion = v_proxima_ejecucion,
    recurrencia_iteracion = CASE WHEN v_recurrencia = 'ninguna' THEN NULL ELSE COALESCE(recurrencia_iteracion, 1) END,
    fecha_inicio = CASE WHEN v_changes ? 'fecha_inicio' THEN NULLIF(v_changes ->> 'fecha_inicio', '')::timestamptz ELSE fecha_inicio END,
    fecha_termino = CASE WHEN v_changes ? 'fecha_termino' THEN NULLIF(v_changes ->> 'fecha_termino', '')::timestamptz ELSE fecha_termino END,
    ubicacion_id = CASE WHEN v_changes ? 'ubicacion_id' THEN NULLIF(v_changes ->> 'ubicacion_id', '')::uuid ELSE ubicacion_id END,
    lugar_id = CASE WHEN v_changes ? 'lugar_id' THEN NULLIF(v_changes ->> 'lugar_id', '')::uuid ELSE lugar_id END,
    sociedad_id = CASE WHEN v_changes ? 'sociedad_id' THEN NULLIF(v_changes ->> 'sociedad_id', '')::uuid ELSE sociedad_id END,
    activo_id = CASE WHEN v_changes ? 'activo_id' THEN NULLIF(v_changes ->> 'activo_id', '')::uuid ELSE activo_id END,
    asignados_ids = CASE WHEN v_changes ? 'asignados_ids' THEN
      CASE WHEN v_changes -> 'asignados_ids' IS NULL THEN NULL ELSE ARRAY(SELECT DISTINCT jsonb_array_elements_text(v_changes -> 'asignados_ids')::uuid) END
      ELSE asignados_ids END,
    imagen_url = CASE WHEN v_changes ? 'imagen_url' THEN NULLIF(v_changes ->> 'imagen_url', '') ELSE imagen_url END,
    links = CASE WHEN v_changes ? 'links' THEN COALESCE(v_changes -> 'links', '[]'::jsonb) ELSE links END,
    requiere_materiales = CASE WHEN v_changes ? 'requiere_materiales' THEN (v_changes ->> 'requiere_materiales')::boolean ELSE requiere_materiales END,
    requiere_hoja = CASE WHEN v_changes ? 'requiere_hoja' THEN (v_changes ->> 'requiere_hoja')::boolean ELSE requiere_hoja END,
    requiere_fotos = CASE WHEN v_changes ? 'requiere_fotos' THEN (v_changes ->> 'requiere_fotos')::boolean ELSE requiere_fotos END
  WHERE id = v_before.id
  RETURNING * INTO v_after;

  IF v_after.prioridad IS DISTINCT FROM v_before.prioridad THEN
    INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
    VALUES (v_after.id, 'prioridad_cambiada', v_after.prioridad, v_actor_id) RETURNING id INTO v_id;
    v_activity_ids := array_append(v_activity_ids, v_id);
  END IF;
  IF v_after.ubicacion_id IS DISTINCT FROM v_before.ubicacion_id OR v_after.lugar_id IS DISTINCT FROM v_before.lugar_id THEN
    INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
    VALUES (v_after.id, 'ubicacion_cambiada', 'Cambió la ubicación', v_actor_id) RETURNING id INTO v_id;
    v_activity_ids := array_append(v_activity_ids, v_id);
  END IF;
  SELECT COALESCE(array_agg(value), ARRAY[]::uuid[]) INTO v_added_assignees
  FROM unnest(COALESCE(v_after.asignados_ids, ARRAY[]::uuid[])) value
  WHERE NOT value = ANY(COALESCE(v_before.asignados_ids, ARRAY[]::uuid[]));
  IF cardinality(v_added_assignees) > 0 THEN
    INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
    VALUES (v_after.id, 'asignado', array_to_string(v_added_assignees, ','), v_actor_id) RETURNING id INTO v_id;
    v_activity_ids := array_append(v_activity_ids, v_id);
  END IF;
  IF v_after.titulo IS DISTINCT FROM v_before.titulo
     OR v_after.descripcion IS DISTINCT FROM v_before.descripcion
     OR v_after.n_serie IS DISTINCT FROM v_before.n_serie
     OR v_after.solicitante IS DISTINCT FROM v_before.solicitante
     OR v_after.solicitante_telefono IS DISTINCT FROM v_before.solicitante_telefono
     OR v_after.solicitante_email IS DISTINCT FROM v_before.solicitante_email
     OR v_after.hito IS DISTINCT FROM v_before.hito
     OR v_after.presupuesto IS DISTINCT FROM v_before.presupuesto
     OR v_after.tipo_trabajo IS DISTINCT FROM v_before.tipo_trabajo
     OR v_after.clasificacion IS DISTINCT FROM v_before.clasificacion
     OR v_after.categoria_id IS DISTINCT FROM v_before.categoria_id
     OR v_after.categoria_ids IS DISTINCT FROM v_before.categoria_ids
     OR v_after.recurrencia IS DISTINCT FROM v_before.recurrencia
     OR v_after.recurrencia_config IS DISTINCT FROM v_before.recurrencia_config
     OR v_after.fecha_inicio IS DISTINCT FROM v_before.fecha_inicio
     OR v_after.fecha_termino IS DISTINCT FROM v_before.fecha_termino
     OR v_after.sociedad_id IS DISTINCT FROM v_before.sociedad_id
     OR v_after.activo_id IS DISTINCT FROM v_before.activo_id
     OR v_after.imagen_url IS DISTINCT FROM v_before.imagen_url
     OR v_after.links IS DISTINCT FROM v_before.links
     OR v_after.requiere_materiales IS DISTINCT FROM v_before.requiere_materiales
     OR v_after.requiere_hoja IS DISTINCT FROM v_before.requiere_hoja
     OR v_after.requiere_fotos IS DISTINCT FROM v_before.requiere_fotos THEN
    INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
    VALUES (v_after.id, 'editado', 'Editó la OT', v_actor_id) RETURNING id INTO v_id;
    v_activity_ids := array_append(v_activity_ids, v_id);
  END IF;

  FOREACH v_recipient IN ARRAY v_added_assignees LOOP
    INSERT INTO public.work_order_notification_outbox (
      workspace_id, command_id, event_type, aggregate_id, recipient_id, payload
    ) VALUES (
      v_workspace_id, v_command_id, 'work_order_assigned', v_after.id, v_recipient,
      jsonb_build_object('orden_id', v_after.id, 'titulo', v_after.titulo)
    ) RETURNING id INTO v_id;
    v_outbox_ids := array_append(v_outbox_ids, v_id);
  END LOOP;

  v_result := jsonb_build_object(
    'contract_version', 1, 'command_id', v_command_id, 'replayed', false,
    'data', jsonb_build_object(
      'work_order', to_jsonb(v_after),
      'activity_ids', to_jsonb(v_activity_ids),
      'notification_outbox_ids', to_jsonb(v_outbox_ids)
    )
  );
  UPDATE public.work_order_commands SET result = v_result, completed_at = now()
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_work_order_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_command_id uuid;
  v_workspace_id uuid;
  v_envelope_actor_id uuid;
  v_payload jsonb;
  v_payload_hash text;
  v_existing public.work_order_commands%ROWTYPE;
  v_user public.usuarios%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_before public.ordenes_trabajo%ROWTYPE;
  v_after public.ordenes_trabajo%ROWTYPE;
  v_action text;
  v_expected_updated_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_elapsed bigint;
  v_next_state text;
  v_activity_type text;
  v_activity_comment text;
  v_activity_id uuid;
  v_outbox_ids uuid[] := ARRAY[]::uuid[];
  v_outbox_id uuid;
  v_recipient uuid;
  v_assignees uuid[];
  v_recipients uuid[];
  v_result jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    PERFORM public.work_order_command_error('UNAUTHENTICATED', 'A valid session is required.');
  END IF;
  IF COALESCE((p_command ->> 'contract_version')::integer, 0) <> 1 THEN
    PERFORM public.work_order_command_error('CONTRACT_VERSION_UNSUPPORTED', 'Expected contract_version 1.');
  END IF;
  BEGIN
    v_command_id := (p_command ->> 'command_id')::uuid;
    v_workspace_id := (p_command ->> 'workspace_id')::uuid;
    v_envelope_actor_id := (p_command ->> 'actor_id')::uuid;
  EXCEPTION WHEN invalid_text_representation OR null_value_not_allowed THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'command_id, workspace_id and actor_id must be UUIDs.');
  END;
  IF v_envelope_actor_id IS DISTINCT FROM v_actor_id THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'actor_id must match the authenticated user.');
  END IF;

  v_payload := COALESCE(p_command -> 'payload', '{}'::jsonb);
  v_payload_hash := md5(v_payload::text);
  v_action := v_payload ->> 'action';
  BEGIN
    v_expected_updated_at := (v_payload ->> 'expected_updated_at')::timestamptz;
  EXCEPTION WHEN invalid_datetime_format THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'expected_updated_at must be a timestamp.');
  END;
  IF NULLIF(v_payload ->> 'ot_id', '') IS NULL OR v_expected_updated_at IS NULL
     OR v_action IS NULL
     OR v_action NOT IN ('assign', 'wait', 'start', 'pause', 'resume', 'request_review', 'complete', 'cancel', 'reopen') THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'ot_id, expected_updated_at and a supported action are required.');
  END IF;

  SELECT * INTO v_user FROM public.usuarios WHERE id = v_actor_id FOR SHARE;
  IF v_user.id IS NULL OR v_user.workspace_id IS DISTINCT FROM v_workspace_id
     OR NOT COALESCE(v_user.activo, true)
     OR COALESCE(v_user.rol, '') NOT IN ('owner', 'admin', 'member', 'supervisor') THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'The actor cannot transition work orders in this workspace.');
  END IF;
  SELECT * INTO v_workspace FROM public.workspaces WHERE id = v_workspace_id FOR SHARE;
  IF v_workspace.id IS NULL THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Workspace was not found.');
  END IF;

  INSERT INTO public.work_order_commands (
    workspace_id, command_id, actor_id, command_type, payload_hash
  ) VALUES (
    v_workspace_id, v_command_id, v_actor_id, 'transition_work_order_v1', v_payload_hash
  ) ON CONFLICT (workspace_id, command_id) DO NOTHING;
  SELECT * INTO v_existing FROM public.work_order_commands
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id FOR UPDATE;
  IF v_existing.command_type <> 'transition_work_order_v1' OR v_existing.payload_hash <> v_payload_hash THEN
    PERFORM public.work_order_command_error('COMMAND_PAYLOAD_MISMATCH', 'The command ID was already used with another operation or payload.');
  END IF;
  IF v_existing.result IS NOT NULL THEN
    RETURN jsonb_set(v_existing.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  SELECT * INTO v_before FROM public.ordenes_trabajo
  WHERE id = (v_payload ->> 'ot_id')::uuid FOR UPDATE;
  IF v_before.id IS NULL OR v_before.deleted_at IS NOT NULL THEN
    PERFORM public.work_order_command_error('OT_NOT_FOUND', 'Work order was not found.');
  END IF;
  IF v_before.workspace_id IS DISTINCT FROM v_workspace_id THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Work order belongs to another workspace.');
  END IF;
  IF v_before.updated_at IS DISTINCT FROM v_expected_updated_at THEN
    PERFORM public.work_order_command_error('CONFLICT', 'The work order changed after it was opened.');
  END IF;
  IF v_before.estado IN ('completado', 'cancelado') AND v_action <> 'reopen' THEN
    PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'The work order is already terminal.');
  END IF;

  v_elapsed := GREATEST(COALESCE(v_before.tiempo_total_segundos, 0), 0);
  IF v_before.en_ejecucion AND v_before.iniciado_at IS NOT NULL THEN
    v_elapsed := v_elapsed + GREATEST(FLOOR(EXTRACT(EPOCH FROM (v_now - v_before.iniciado_at)))::bigint, 0);
  END IF;

  CASE v_action
    WHEN 'reopen' THEN
      IF v_before.estado NOT IN ('en_espera', 'en_revision', 'completado', 'cancelado') THEN
        PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'reopen is not valid from the current state.');
      END IF;
      v_next_state := 'pendiente';
      v_activity_type := 'estado_cambiado';
      v_activity_comment := COALESCE(NULLIF(btrim(v_payload ->> 'comment'), ''), 'Asignada');
    WHEN 'assign' THEN
      PERFORM public.assert_work_order_references_v1(
        v_workspace_id,
        jsonb_build_object('asignados_ids', COALESCE(v_payload -> 'asignados_ids', '[]'::jsonb))
      );
      v_assignees := ARRAY(
        SELECT DISTINCT jsonb_array_elements_text(COALESCE(v_payload -> 'asignados_ids', '[]'::jsonb))::uuid
      );
      v_next_state := v_before.estado;
      v_activity_type := 'asignado';
      v_activity_comment := COALESCE(NULLIF(array_to_string(v_assignees, ','), ''), 'Sin asignados');
    WHEN 'wait' THEN
      IF v_before.estado NOT IN ('pendiente', 'en_curso', 'en_revision') THEN
        PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'wait is not valid from the current state.');
      END IF;
      v_next_state := 'en_espera';
      v_activity_type := CASE WHEN v_before.en_ejecucion THEN 'pausado' ELSE 'estado_cambiado' END;
      v_activity_comment := COALESCE(NULLIF(btrim(v_payload ->> 'comment'), ''), 'En espera');
    WHEN 'start' THEN
      IF v_before.estado NOT IN ('pendiente', 'en_espera') THEN
        PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'start is not valid from the current state.');
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.ot_procedimientos op
        JOIN public.procedimientos p ON p.id = op.procedimiento_id
        LEFT JOIN public.procedimiento_ejecuciones pe
          ON pe.orden_id = v_before.id AND pe.procedimiento_id = op.procedimiento_id
        WHERE op.orden_id = v_before.id
          AND p.bloquea_inicio
          AND COALESCE(pe.estado, '') <> 'completado'
      ) THEN
        PERFORM public.work_order_command_error('PROCEDURES_INCOMPLETE', 'A procedure required before starting is incomplete.');
      END IF;
      v_next_state := 'en_curso';
      v_activity_type := CASE WHEN v_before.iniciado_at IS NULL THEN 'iniciado' ELSE 'reanudado' END;
      v_activity_comment := CASE WHEN v_before.iniciado_at IS NULL THEN 'Inició la OT' ELSE 'Reanudó la OT' END;
    WHEN 'pause' THEN
      IF v_before.estado <> 'en_curso' OR NOT v_before.en_ejecucion THEN
        PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'pause requires a running work order.');
      END IF;
      v_next_state := 'en_espera';
      v_activity_type := 'pausado';
      v_activity_comment := COALESCE(NULLIF(btrim(v_payload ->> 'comment'), ''), 'Pausó la OT');
    WHEN 'resume' THEN
      IF v_before.estado <> 'en_espera' OR v_before.en_ejecucion THEN
        PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'resume requires a paused work order.');
      END IF;
      v_next_state := 'en_curso';
      v_activity_type := 'reanudado';
      v_activity_comment := 'Reanudó la OT';
    WHEN 'request_review' THEN
      IF v_before.estado NOT IN ('en_curso', 'en_espera') THEN
        PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'request_review is not valid from the current state.');
      END IF;
      v_next_state := 'en_revision';
      v_activity_type := 'estado_cambiado';
      v_activity_comment := 'En revisión';
    WHEN 'complete' THEN
      IF v_before.estado NOT IN ('pendiente', 'en_espera', 'en_curso', 'en_revision') THEN
        PERFORM public.work_order_command_error('INVALID_STATE_TRANSITION', 'complete is not valid from the current state.');
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.ot_procedimientos op
        JOIN public.procedimientos p ON p.id = op.procedimiento_id
        LEFT JOIN public.procedimiento_ejecuciones pe
          ON pe.orden_id = v_before.id AND pe.procedimiento_id = op.procedimiento_id
        WHERE op.orden_id = v_before.id
          AND (p.bloquea_cierre_ot OR p.bloquea_inicio)
          AND COALESCE(pe.estado, '') <> 'completado'
      ) THEN
        PERFORM public.work_order_command_error('PROCEDURES_INCOMPLETE', 'A blocking procedure is incomplete.');
      END IF;
      IF v_before.requiere_materiales
         AND COALESCE(v_workspace.modo_registro, 'ambos') <> 'hoja'
         AND NOT EXISTS (SELECT 1 FROM public.orden_partes WHERE orden_id = v_before.id) THEN
        PERFORM public.work_order_command_error('MATERIALS_REQUIRED', 'The work order requires at least one material.');
      END IF;
      IF v_before.requiere_hoja
         AND COALESCE(v_workspace.modo_registro, 'ambos') <> 'materiales'
         AND NOT EXISTS (
           SELECT 1 FROM public.hojas_inventario h
           JOIN public.hojas_inventario_filas f ON f.hoja_id = h.id
           WHERE h.orden_id = v_before.id
         ) THEN
        PERFORM public.work_order_command_error('SHEET_REQUIRED', 'The work order requires a sheet with at least one row.');
      END IF;
      IF (v_before.requiere_fotos OR COALESCE(v_workspace.fotos_obligatorias_todas, false))
         AND COALESCE(cardinality(v_before.fotos_urls), 0) = 0
         AND NOT EXISTS (
           SELECT 1 FROM public.foto_grupos fg
           JOIN public.foto_grupo_items fgi ON fgi.grupo_id = fg.id
           WHERE fg.orden_id = v_before.id AND fg.tipo = 'evidencia'
         ) THEN
        PERFORM public.work_order_command_error('PHOTOS_REQUIRED', 'The work order requires server-backed photo evidence.');
      END IF;
      v_next_state := 'completado';
      v_activity_type := 'completado';
      v_activity_comment := COALESCE(NULLIF(btrim(v_payload ->> 'comment'), ''), 'Completó la OT');
    WHEN 'cancel' THEN
      v_next_state := 'cancelado';
      v_activity_type := 'estado_cambiado';
      v_activity_comment := COALESCE(NULLIF(btrim(v_payload ->> 'comment'), ''), 'Cancelada');
  END CASE;

  UPDATE public.ordenes_trabajo SET
    asignados_ids = CASE WHEN v_action = 'assign' THEN v_assignees ELSE asignados_ids END,
    estado = v_next_state,
    en_ejecucion = CASE WHEN v_action = 'assign' THEN en_ejecucion ELSE v_action IN ('start', 'resume') END,
    iniciado_at = CASE WHEN v_action IN ('start', 'resume') THEN v_now ELSE iniciado_at END,
    pausado_at = CASE
      WHEN v_action = 'assign' THEN pausado_at
      WHEN v_action = 'pause' OR (v_action = 'wait' AND v_before.en_ejecucion) THEN v_now
      ELSE NULL END,
    tiempo_total_segundos = CASE
      WHEN v_action IN ('wait', 'pause', 'request_review', 'complete', 'cancel') THEN v_elapsed
      ELSE tiempo_total_segundos END,
    completado_en = CASE WHEN v_action = 'complete' THEN v_now WHEN v_action = 'reopen' THEN NULL ELSE completado_en END,
    completado_por = CASE WHEN v_action = 'complete' THEN v_actor_id WHEN v_action = 'reopen' THEN NULL ELSE completado_por END
  WHERE id = v_before.id
  RETURNING * INTO v_after;

  INSERT INTO public.actividad_ot (orden_id, tipo, comentario, usuario_id)
  VALUES (v_after.id, v_activity_type, v_activity_comment, v_actor_id)
  RETURNING id INTO v_activity_id;

  IF v_action = 'assign' THEN
    SELECT COALESCE(array_agg(value), ARRAY[]::uuid[]) INTO v_recipients
    FROM unnest(COALESCE(v_after.asignados_ids, ARRAY[]::uuid[])) value
    WHERE NOT value = ANY(COALESCE(v_before.asignados_ids, ARRAY[]::uuid[]));
  ELSE
    v_recipients := COALESCE(v_after.asignados_ids, ARRAY[]::uuid[]);
  END IF;

  FOREACH v_recipient IN ARRAY v_recipients LOOP
    IF v_recipient IS DISTINCT FROM v_actor_id THEN
      INSERT INTO public.work_order_notification_outbox (
        workspace_id, command_id, event_type, aggregate_id, recipient_id, payload
      ) VALUES (
        v_workspace_id, v_command_id,
        CASE WHEN v_action = 'complete' THEN 'work_order_completed' ELSE 'work_order_transitioned' END,
        v_after.id, v_recipient,
        jsonb_build_object('orden_id', v_after.id, 'titulo', v_after.titulo, 'action', v_action, 'estado', v_after.estado)
      ) RETURNING id INTO v_outbox_id;
      v_outbox_ids := array_append(v_outbox_ids, v_outbox_id);
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'contract_version', 1, 'command_id', v_command_id, 'replayed', false,
    'data', jsonb_build_object(
      'work_order', to_jsonb(v_after),
      'activity_ids', jsonb_build_array(v_activity_id),
      'notification_outbox_ids', to_jsonb(v_outbox_ids)
    )
  );
  UPDATE public.work_order_commands SET result = v_result, completed_at = now()
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_work_order_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_sub_work_order_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.edit_work_order_v1(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transition_work_order_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_order_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_sub_work_order_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.edit_work_order_v1(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_work_order_v1(jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_work_order_v1(jsonb) IS
  'Contract v1: atomically and idempotently creates a root work order.';
COMMENT ON FUNCTION public.create_sub_work_order_v1(jsonb) IS
  'Contract v1: atomically and idempotently creates a child work order.';
COMMENT ON FUNCTION public.edit_work_order_v1(jsonb) IS
  'Contract v1: edits a work order with optimistic concurrency and canonical audit.';
COMMENT ON FUNCTION public.transition_work_order_v1(jsonb) IS
  'Contract v1: validates and atomically applies a canonical work-order transition.';
