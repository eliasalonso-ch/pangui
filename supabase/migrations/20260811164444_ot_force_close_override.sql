-- Admin force-close override for work orders with unmet requisitos.
--
-- Problem: closing an OT is gated in three independent server-side places —
-- the transition_work_order_v1 'complete' branch (procedimientos bloqueantes,
-- materiales, hoja, fotos) and the enforce_ot_photo_completion trigger, which
-- also guards the legacy direct-UPDATE path. None of them look at the actor's
-- role, so an owner/admin who legitimately needs to close an OT whose requisitos
-- can no longer be satisfied has no way through, and the UI surfaces a raw
-- server error rather than an explanation.
--
-- This migration adds a narrow, audited override: an owner/admin may complete an
-- OT while supplying a written justification. The override is recorded on the row
-- itself (not only in the activity log) so force-closed OTs stay queryable and
-- reportable forever. Non-elevated roles are unaffected — every gate still applies
-- to them exactly as before.

-- ── 1. Audit columns ─────────────────────────────────────────────────────────

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS cierre_forzado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cierre_forzado_motivo text,
  ADD COLUMN IF NOT EXISTS cierre_forzado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cierre_forzado_at timestamptz;

COMMENT ON COLUMN public.ordenes_trabajo.cierre_forzado IS
  'True when an owner/admin closed this OT with unmet requisitos via the audited override.';
COMMENT ON COLUMN public.ordenes_trabajo.cierre_forzado_motivo IS
  'Mandatory justification the elevated actor typed when forcing the close.';
COMMENT ON COLUMN public.ordenes_trabajo.cierre_forzado_por IS
  'The owner/admin who authorized the forced close.';

-- Partial index: force-closed OTs are the rare, auditable minority, so only they
-- need to be indexed for the compliance/reporting queries that look for them.
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_cierre_forzado
  ON public.ordenes_trabajo (workspace_id, cierre_forzado_at DESC)
  WHERE cierre_forzado;

-- ── 2. Photo trigger: honor a verified elevated override ─────────────────────
--
-- This trigger is the last line of defense on photo evidence and also covers the
-- legacy UPDATE path, so the bypass is deliberately narrow: the row must be
-- flagged in this same statement AND carry a justification AND name an actor who
-- is currently an active owner/admin of the OT's workspace. A plain
-- "UPDATE ... SET estado='completado'" still cannot get past it.

CREATE OR REPLACE FUNCTION public.enforce_ot_photo_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_photos_required boolean := false;
  v_has_server_photo boolean := false;
  v_override_allowed boolean := false;
BEGIN
  IF NEW.estado = 'completado'
     AND OLD.estado IS DISTINCT FROM 'completado' THEN
    SELECT COALESCE(NEW.requiere_fotos, false)
           OR COALESCE(w.fotos_obligatorias_todas, false)
      INTO v_photos_required
    FROM public.workspaces w
    WHERE w.id = NEW.workspace_id;

    v_photos_required := COALESCE(v_photos_required, COALESCE(NEW.requiere_fotos, false));
    IF v_photos_required THEN
      v_has_server_photo := COALESCE(cardinality(NEW.fotos_urls), 0) > 0
        OR EXISTS (
          SELECT 1
          FROM public.foto_grupos fg
          JOIN public.foto_grupo_items fgi ON fgi.grupo_id = fg.id
          WHERE fg.orden_id = NEW.id
            AND fg.tipo = 'evidencia'
        );

      IF NOT v_has_server_photo THEN
        v_override_allowed := COALESCE(NEW.cierre_forzado, false)
          AND NULLIF(btrim(COALESCE(NEW.cierre_forzado_motivo, '')), '') IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.usuarios u
            WHERE u.id = NEW.cierre_forzado_por
              AND u.workspace_id = NEW.workspace_id
              AND COALESCE(u.activo, true)
              AND COALESCE(u.rol, '') IN ('owner', 'admin')
          );

        IF NOT v_override_allowed THEN
          RAISE EXCEPTION 'Esta OT requiere al menos una foto subida antes de completarse'
            USING ERRCODE = 'P0001';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_ot_photo_completion() FROM PUBLIC, anon, authenticated;

-- ── 3. transition_work_order_v1: audited override on 'complete' ──────────────

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
  v_force_close boolean := false;
  v_force_reason text;
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

  -- Force-close request. Validated before the idempotency record is claimed so a
  -- rejected override never burns a command_id.
  v_force_close := COALESCE((v_payload ->> 'force_close')::boolean, false);
  v_force_reason := NULLIF(btrim(COALESCE(v_payload ->> 'force_close_reason', '')), '');
  IF v_force_close THEN
    IF v_action <> 'complete' THEN
      PERFORM public.work_order_command_error('INVALID_COMMAND', 'force_close is only valid with the complete action.');
    END IF;
    IF COALESCE(v_user.rol, '') NOT IN ('owner', 'admin') THEN
      PERFORM public.work_order_command_error('FORCE_CLOSE_FORBIDDEN', 'Only an owner or admin can close a work order with unmet requirements.');
    END IF;
    IF v_force_reason IS NULL THEN
      PERFORM public.work_order_command_error('FORCE_CLOSE_REASON_REQUIRED', 'A written justification is required to force the close.');
    END IF;
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
      -- Every requisito below is skipped for a validated elevated override. The
      -- state-transition check above is NOT part of the override: forcing a close
      -- must still respect the state machine.
      IF NOT v_force_close THEN
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
      END IF;
      v_next_state := 'completado';
      v_activity_type := 'completado';
      v_activity_comment := CASE
        WHEN v_force_close THEN 'Cierre forzado: ' || v_force_reason
        ELSE COALESCE(NULLIF(btrim(v_payload ->> 'comment'), ''), 'Completó la OT')
      END;
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
    completado_por = CASE WHEN v_action = 'complete' THEN v_actor_id WHEN v_action = 'reopen' THEN NULL ELSE completado_por END,
    -- Reopening clears the override so a later ordinary close is not mislabeled.
    cierre_forzado = CASE
      WHEN v_action = 'complete' AND v_force_close THEN true
      WHEN v_action = 'reopen' THEN false
      ELSE cierre_forzado END,
    cierre_forzado_motivo = CASE
      WHEN v_action = 'complete' AND v_force_close THEN v_force_reason
      WHEN v_action = 'reopen' THEN NULL
      ELSE cierre_forzado_motivo END,
    cierre_forzado_por = CASE
      WHEN v_action = 'complete' AND v_force_close THEN v_actor_id
      WHEN v_action = 'reopen' THEN NULL
      ELSE cierre_forzado_por END,
    cierre_forzado_at = CASE
      WHEN v_action = 'complete' AND v_force_close THEN v_now
      WHEN v_action = 'reopen' THEN NULL
      ELSE cierre_forzado_at END
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
        jsonb_build_object(
          'orden_id', v_after.id, 'titulo', v_after.titulo, 'action', v_action, 'estado', v_after.estado,
          'cierre_forzado', COALESCE(v_after.cierre_forzado, false)
        )
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

REVOKE ALL ON FUNCTION public.transition_work_order_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_work_order_v1(jsonb) TO authenticated;

COMMENT ON FUNCTION public.transition_work_order_v1(jsonb) IS
  'Contract v1: validates and atomically applies a canonical work-order transition. Owner/admin may set force_close with a force_close_reason to complete an OT whose requisitos are unmet; the override is recorded on the row.';

NOTIFY pgrst, 'reload schema';
