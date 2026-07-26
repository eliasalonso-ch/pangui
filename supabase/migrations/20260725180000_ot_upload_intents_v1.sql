-- Transactional metadata boundary for OT photos and execution attachments.
-- R2 bytes remain external; an Edge Function verifies the object before it
-- calls finalize_ot_upload_v1 with the service role.

ALTER TABLE public.work_order_commands
  DROP CONSTRAINT IF EXISTS work_order_commands_type_check;
ALTER TABLE public.work_order_commands
  ADD CONSTRAINT work_order_commands_type_check CHECK (command_type IN (
    'create_work_order_v1',
    'create_sub_work_order_v1',
    'edit_work_order_v1',
    'transition_work_order_v1',
    'prepare_ot_upload_v1'
  ));

CREATE TABLE IF NOT EXISTS public.ot_upload_intents (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  orden_id uuid NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN (
    'photo_group_item',
    'work_order_photo',
    'work_order_attachment'
  )),
  object_key text NOT NULL UNIQUE,
  extension text NOT NULL,
  content_type text NOT NULL,
  declared_size bigint NOT NULL CHECK (declared_size > 0 AND declared_size <= 20971520),
  original_name text,
  target jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'prepared' CHECK (status IN (
    'prepared', 'finalized', 'cleanup_pending', 'expired'
  )),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  finalized_at timestamptz,
  public_url text,
  etag text,
  verified_size bigint,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ot_upload_intents_command_fkey
    FOREIGN KEY (workspace_id, id)
    REFERENCES public.work_order_commands(workspace_id, command_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ot_upload_intents_order_created_idx
  ON public.ot_upload_intents (orden_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ot_upload_intents_expiry_idx
  ON public.ot_upload_intents (expires_at)
  WHERE status = 'prepared';

ALTER TABLE public.ot_upload_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ot_upload_intents FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_ot_upload_v1(p_command jsonb)
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
  v_order public.ordenes_trabajo%ROWTYPE;
  v_group public.foto_grupos%ROWTYPE;
  v_kind text;
  v_extension text;
  v_content_type text;
  v_size bigint;
  v_target jsonb;
  v_object_key text;
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
  v_kind := v_payload ->> 'kind';
  v_extension := lower(COALESCE(NULLIF(v_payload ->> 'extension', ''), ''));
  v_size := COALESCE((v_payload ->> 'size')::bigint, 0);
  v_target := COALESCE(v_payload -> 'target', '{}'::jsonb);

  IF v_kind IS NULL OR v_kind NOT IN ('photo_group_item', 'work_order_photo', 'work_order_attachment') THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'Unsupported OT upload kind.');
  END IF;
  IF v_extension NOT IN (
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'txt', 'csv', 'doc', 'docx',
    'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'dwg', 'dxf'
  ) THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'Unsupported file extension.');
  END IF;
  IF v_size <= 0 OR v_size > 20971520 THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'File size must be between 1 byte and 20 MB.');
  END IF;
  IF v_kind IN ('photo_group_item', 'work_order_photo')
     AND v_extension NOT IN ('jpg', 'jpeg', 'png', 'webp', 'gif') THEN
    PERFORM public.work_order_command_error('INVALID_COMMAND', 'Photo uploads require an image extension.');
  END IF;

  SELECT * INTO v_user FROM public.usuarios WHERE id = v_actor_id FOR SHARE;
  IF v_user.id IS NULL OR v_user.workspace_id IS DISTINCT FROM v_workspace_id
     OR NOT COALESCE(v_user.activo, true)
     OR COALESCE(v_user.rol, '') NOT IN ('owner', 'admin', 'member', 'supervisor') THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'The actor cannot upload files in this workspace.');
  END IF;
  SELECT * INTO v_order FROM public.ordenes_trabajo
  WHERE id = NULLIF(v_payload ->> 'ot_id', '')::uuid FOR SHARE;
  IF v_order.id IS NULL OR v_order.deleted_at IS NOT NULL THEN
    PERFORM public.work_order_command_error('OT_NOT_FOUND', 'Work order was not found.');
  END IF;
  IF v_order.workspace_id IS DISTINCT FROM v_workspace_id THEN
    PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Work order belongs to another workspace.');
  END IF;

  IF v_kind = 'photo_group_item' THEN
    SELECT * INTO v_group FROM public.foto_grupos
    WHERE id = NULLIF(v_target ->> 'grupo_id', '')::uuid FOR SHARE;
    IF v_group.id IS NULL OR v_group.orden_id IS DISTINCT FROM v_order.id
       OR v_group.workspace_id IS DISTINCT FROM v_workspace_id THEN
      PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Photo group is not valid for this work order.');
    END IF;
    IF v_group.locked AND v_user.rol NOT IN ('owner', 'admin') THEN
      PERFORM public.work_order_command_error('FORBIDDEN', 'The photo group is locked.');
    END IF;
    IF NULLIF(v_target ->> 'item_id', '') IS NULL THEN
      PERFORM public.work_order_command_error('INVALID_COMMAND', 'photo_group_item requires target.item_id.');
    END IF;
  END IF;

  v_content_type := CASE v_extension
    WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg'
    WHEN 'png' THEN 'image/png' WHEN 'webp' THEN 'image/webp' WHEN 'gif' THEN 'image/gif'
    WHEN 'pdf' THEN 'application/pdf' WHEN 'txt' THEN 'text/plain' WHEN 'csv' THEN 'text/csv'
    WHEN 'doc' THEN 'application/msword'
    WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN 'xls' THEN 'application/vnd.ms-excel'
    WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    WHEN 'ppt' THEN 'application/vnd.ms-powerpoint'
    WHEN 'pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    WHEN 'zip' THEN 'application/zip' WHEN 'dwg' THEN 'application/acad' WHEN 'dxf' THEN 'application/dxf'
  END;
  v_object_key := format(
    'ordenes/%s/%s/%s.%s',
    v_order.id,
    CASE v_kind
      WHEN 'photo_group_item' THEN format('grupos/%s', v_group.id)
      WHEN 'work_order_photo' THEN 'fotos'
      ELSE 'documentos'
    END,
    v_command_id,
    v_extension
  );

  INSERT INTO public.work_order_commands (
    workspace_id, command_id, actor_id, command_type, payload_hash
  ) VALUES (
    v_workspace_id, v_command_id, v_actor_id, 'prepare_ot_upload_v1', v_payload_hash
  ) ON CONFLICT (workspace_id, command_id) DO NOTHING;
  SELECT * INTO v_existing FROM public.work_order_commands
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id FOR UPDATE;
  IF v_existing.command_type <> 'prepare_ot_upload_v1' OR v_existing.payload_hash <> v_payload_hash THEN
    PERFORM public.work_order_command_error('COMMAND_PAYLOAD_MISMATCH', 'The upload intent ID was reused with another payload.');
  END IF;
  IF v_existing.result IS NOT NULL THEN
    RETURN jsonb_set(v_existing.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  INSERT INTO public.ot_upload_intents (
    id, workspace_id, orden_id, actor_id, kind, object_key, extension,
    content_type, declared_size, original_name, target
  ) VALUES (
    v_command_id, v_workspace_id, v_order.id, v_actor_id, v_kind, v_object_key,
    v_extension, v_content_type, v_size,
    NULLIF(left(v_payload ->> 'original_name', 255), ''), v_target
  );

  v_result := jsonb_build_object(
    'contract_version', 1,
    'command_id', v_command_id,
    'replayed', false,
    'data', jsonb_build_object(
      'intent_id', v_command_id,
      'object_key', v_object_key,
      'content_type', v_content_type,
      'size', v_size,
      'expires_at', now() + interval '24 hours'
    )
  );
  UPDATE public.work_order_commands SET result = v_result, completed_at = now()
  WHERE workspace_id = v_workspace_id AND command_id = v_command_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_ot_upload_v1(
  p_intent_id uuid,
  p_actor_id uuid,
  p_public_url text,
  p_object_key text,
  p_etag text,
  p_verified_size bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_intent public.ot_upload_intents%ROWTYPE;
  v_order public.ordenes_trabajo%ROWTYPE;
  v_item_id uuid;
  v_order_display integer;
  v_activity_id uuid;
  v_outbox_ids uuid[] := ARRAY[]::uuid[];
  v_outbox_id uuid;
  v_recipient uuid;
  v_link jsonb;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'Only the object-verification service may finalize uploads.');
  END IF;
  SELECT * INTO v_intent FROM public.ot_upload_intents
  WHERE id = p_intent_id FOR UPDATE;
  IF v_intent.id IS NULL THEN
    PERFORM public.work_order_command_error('UPLOAD_INTENT_NOT_FOUND', 'Upload intent was not found.');
  END IF;
  IF v_intent.status = 'finalized' THEN
    RETURN jsonb_set(v_intent.result, '{replayed}', 'true'::jsonb, true);
  END IF;
  IF v_intent.status <> 'prepared' OR v_intent.expires_at <= now() THEN
    PERFORM public.work_order_command_error('UPLOAD_INTENT_EXPIRED', 'Upload intent is no longer active.');
  END IF;
  IF v_intent.actor_id IS DISTINCT FROM p_actor_id THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'Upload actor does not own this intent.');
  END IF;
  IF p_object_key IS DISTINCT FROM v_intent.object_key
     OR p_verified_size IS DISTINCT FROM v_intent.declared_size
     OR p_verified_size <= 0
     OR p_public_url IS NULL
     OR p_public_url NOT LIKE '%/' || v_intent.object_key THEN
    PERFORM public.work_order_command_error('UPLOAD_VERIFICATION_FAILED', 'Verified R2 object does not match the prepared intent.');
  END IF;

  SELECT * INTO v_order FROM public.ordenes_trabajo
  WHERE id = v_intent.orden_id FOR UPDATE;
  IF v_order.id IS NULL OR v_order.deleted_at IS NOT NULL THEN
    PERFORM public.work_order_command_error('OT_NOT_FOUND', 'Work order is no longer available.');
  END IF;

  IF v_intent.kind = 'photo_group_item' THEN
    v_item_id := (v_intent.target ->> 'item_id')::uuid;
    v_order_display := COALESCE((v_intent.target ->> 'orden_display')::integer, 0);
    IF NOT EXISTS (
      SELECT 1 FROM public.foto_grupos
      WHERE id = (v_intent.target ->> 'grupo_id')::uuid
        AND orden_id = v_intent.orden_id
        AND workspace_id = v_intent.workspace_id
    ) THEN
      PERFORM public.work_order_command_error('WORKSPACE_MISMATCH', 'Photo group is no longer available.');
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.foto_grupo_items
      WHERE id = v_item_id
        AND (
          grupo_id IS DISTINCT FROM (v_intent.target ->> 'grupo_id')::uuid
          OR url IS DISTINCT FROM p_public_url
        )
    ) THEN
      PERFORM public.work_order_command_error(
        'UPLOAD_METADATA_CONFLICT',
        'The photo item ID already belongs to different metadata.'
      );
    END IF;
    INSERT INTO public.foto_grupo_items (id, grupo_id, url, orden_display)
    VALUES (v_item_id, (v_intent.target ->> 'grupo_id')::uuid, p_public_url, v_order_display)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.actividad_ot (orden_id, usuario_id, tipo, comentario)
    SELECT v_intent.orden_id, v_intent.actor_id, 'fotos_grupo_subidas', fg.titulo
    FROM public.foto_grupos fg
    WHERE fg.id = (v_intent.target ->> 'grupo_id')::uuid
    RETURNING id INTO v_activity_id;
  ELSIF v_intent.kind = 'work_order_photo' THEN
    UPDATE public.ordenes_trabajo SET
      fotos_urls = CASE
        WHEN p_public_url = ANY(COALESCE(fotos_urls, ARRAY[]::text[])) THEN fotos_urls
        ELSE array_append(COALESCE(fotos_urls, ARRAY[]::text[]), p_public_url)
      END
    WHERE id = v_intent.orden_id;
    INSERT INTO public.actividad_ot (orden_id, usuario_id, tipo, comentario, foto_url)
    VALUES (v_intent.orden_id, v_intent.actor_id, 'comentario', 'Foto subida', p_public_url)
    RETURNING id INTO v_activity_id;
  ELSE
    v_link := jsonb_build_object(
      'url', p_public_url,
      'nombre', COALESCE(v_intent.original_name, 'Archivo'),
      'label', COALESCE(v_intent.original_name, 'Archivo'),
      'tipo', 'archivo',
      'origen', 'ejecucion',
      'upload_intent_id', v_intent.id
    );
    UPDATE public.ordenes_trabajo SET links =
      CASE
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(links, '[]'::jsonb)) value
          WHERE value ->> 'upload_intent_id' = v_intent.id::text
        ) THEN COALESCE(links, '[]'::jsonb)
        ELSE COALESCE(links, '[]'::jsonb) || jsonb_build_array(v_link)
      END
    WHERE id = v_intent.orden_id;
    INSERT INTO public.actividad_ot (orden_id, usuario_id, tipo, comentario)
    VALUES (
      v_intent.orden_id, v_intent.actor_id, 'comentario',
      'Archivo subido: ' || COALESCE(v_intent.original_name, 'Archivo')
    ) RETURNING id INTO v_activity_id;
  END IF;

  FOREACH v_recipient IN ARRAY COALESCE(v_order.asignados_ids, ARRAY[]::uuid[]) LOOP
    IF v_recipient IS DISTINCT FROM v_intent.actor_id THEN
      INSERT INTO public.work_order_notification_outbox (
        workspace_id, command_id, event_type, aggregate_id, recipient_id, payload
      ) VALUES (
        v_intent.workspace_id, v_intent.id, 'work_order_media_uploaded',
        v_intent.orden_id, v_recipient,
        jsonb_build_object(
          'orden_id', v_intent.orden_id,
          'titulo', v_order.titulo,
          'kind', v_intent.kind,
          'intent_id', v_intent.id
        )
      ) RETURNING id INTO v_outbox_id;
      v_outbox_ids := array_append(v_outbox_ids, v_outbox_id);
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'contract_version', 1,
    'intent_id', v_intent.id,
    'replayed', false,
    'data', jsonb_build_object(
      'orden_id', v_intent.orden_id,
      'kind', v_intent.kind,
      'public_url', p_public_url,
      'activity_id', v_activity_id,
      'notification_outbox_ids', to_jsonb(v_outbox_ids)
    )
  );
  UPDATE public.ot_upload_intents SET
    status = 'finalized', finalized_at = now(), public_url = p_public_url,
    etag = p_etag, verified_size = p_verified_size, result = v_result,
    updated_at = now()
  WHERE id = v_intent.id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_ot_upload_intents_v1(p_limit integer DEFAULT 100)
RETURNS TABLE(intent_id uuid, object_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'Only the reconciliation service may expire upload intents.');
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT id FROM public.ot_upload_intents
    WHERE (status = 'prepared' AND expires_at <= now())
       OR status = 'cleanup_pending'
    ORDER BY expires_at
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
    FOR UPDATE SKIP LOCKED
  ), updated AS (
    UPDATE public.ot_upload_intents i
    SET status = 'cleanup_pending', updated_at = now()
    FROM candidates e
    WHERE i.id = e.id
    RETURNING i.id, i.object_key
  )
  SELECT updated.id, updated.object_key FROM updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ot_upload_cleanup_v1(p_intent_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'Only the reconciliation service may complete upload cleanup.');
  END IF;
  UPDATE public.ot_upload_intents
  SET status = 'expired', updated_at = now()
  WHERE id = ANY(COALESCE(p_intent_ids, ARRAY[]::uuid[]))
    AND status = 'cleanup_pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_ot_upload_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_ot_upload_v1(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_ot_upload_v1(uuid, uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_ot_upload_v1(uuid, uuid, text, text, text, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.expire_ot_upload_intents_v1(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ot_upload_intents_v1(integer) TO service_role;
REVOKE ALL ON FUNCTION public.complete_ot_upload_cleanup_v1(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ot_upload_cleanup_v1(uuid[]) TO service_role;

COMMENT ON TABLE public.ot_upload_intents IS
  'Server-owned handshake between client file delivery, verified R2 bytes and canonical OT metadata.';
