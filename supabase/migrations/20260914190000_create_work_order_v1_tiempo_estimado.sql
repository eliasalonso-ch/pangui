-- create_work_order_v1 no escribía `tiempo_estimado`, así que la duración
-- estimada solo sobrevivía por el camino legacy de createOrden(): en cuanto el
-- rollout del comando v1 quedaba activo, el campo se perdía en silencio.
--
-- Se agrega al INSERT y nada más. El resto de la función —idempotencia por
-- (workspace_id, command_id), validaciones de pertenencia al workspace,
-- numeración con advisory lock, actividad, hoja de materiales y outbox— queda
-- igual.
--
-- La unidad son MINUTOS: así está documentada la columna
-- (COMMENT ON COLUMN ordenes_trabajo.tiempo_estimado = 'Duración estimada en
-- minutos') y así la escribe OTCrearForm, que ya usaba el campo.
--
-- Se conserva el nombre _canonical_20260725 porque el wrapper
-- create_work_order_v1 lo invoca por ese nombre; el sufijo marca el origen de
-- la función, no que sea inmutable.

CREATE OR REPLACE FUNCTION public.create_work_order_v1_canonical_20260725(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- `auth` va en el search_path porque la función llama auth.uid(); sin él,
-- toda creación de OT falla.
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
    FROM jsonb_array_elements_text(COALESCE(v_payload -> 'asignados_ids', '[]'::jsonb)) value
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
      AND (workspace_id = v_workspace_id OR (workspace_id IS NULL AND es_default = true))
  ) THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'categoria_id belongs to another workspace.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(v_payload -> 'categoria_ids', '[]'::jsonb)) value
    LEFT JOIN public.categorias_ot c ON c.id = value::uuid
    WHERE c.id IS NULL OR NOT (c.workspace_id = v_workspace_id OR (c.workspace_id IS NULL AND c.es_default = true))
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
    asignados_ids, fecha_inicio, fecha_termino, imagen_url, links, numero,
    tiempo_estimado
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
    v_next_number,
    -- Minutos. Un 0 se guarda como NULL: "cero minutos estimados" no es una
    -- estimacion, es no haber estimado.
    NULLIF((v_payload ->> 'tiempo_estimado')::integer, 0)
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

  -- One consistent policy: every root OT starts with its material sheet.
  INSERT INTO public.hojas_inventario (workspace_id, nombre, created_by, orden_id)
  VALUES (v_workspace_id, 'Hoja de materiales', v_actor_id, v_order.id)
  RETURNING id INTO v_sheet_id;

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
