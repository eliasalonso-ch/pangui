-- Stop emitting per-file "Nuevo archivo en la OT" notifications.
--
-- Why: the notification carries no information the recipient does not already
-- get elsewhere, and it was drowning the ones that do matter.
--
--   * Photos are a precondition of closing an OT, not news. The workspace has
--     fotos_obligatorias_todas = true, 628 of 656 OTs carry requiere_fotos, and
--     0 OTs have ever been completed without the gate. So "a photo arrived" is
--     implied by the 'completado' notification that follows.
--   * Nobody reads them: of 112 'archivo_ot' notifications in the last 30 days,
--     110 were unread (1.8% read rate).
--   * They fired per FILE per ASSIGNEE. One technician uploading 8 photos to an
--     OT with 2 other assignees produced 16 notifications for one visit.
--
-- What is deliberately NOT changed:
--   * The actividad_ot entry ('Foto subida' / 'Archivo subido: ...' /
--     'fotos_grupo_subidas') still records every upload, so the OT timeline
--     stays complete -- that is where someone actually looks for this.
--   * The outbox cron keeps running. work_order_created, work_order_assigned,
--     work_order_transitioned and work_order_completed are still delivered
--     through it; work_order_created is majority-outbox and IS being read.
--     Dropping the cron would strand those intents unprocessed forever.
--   * Existing 'archivo_ot' rows in notifications are left alone as history.
--   * v_outbox_ids stays declared and is still returned (always empty now) so
--     the v1 contract shape of the response is unchanged for callers.
--
-- The body below is the live definition of finalize_ot_upload_v1 with only the
-- `FOREACH v_recipient IN ARRAY v_order.asignados_ids` block removed. It was
-- taken from pg_get_functiondef, not from the original migration, because the
-- live version had since gained R2 object verification, photo_group_item
-- handling and the service_role guard.

CREATE OR REPLACE FUNCTION public.finalize_ot_upload_v1(p_intent_id uuid, p_actor_id uuid, p_public_url text, p_object_key text, p_etag text, p_verified_size bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  -- work_order_media_uploaded intents intentionally no longer emitted.
  -- Photos gate OT closure, so "a photo arrived" duplicates the
  -- completion notification; 110 of 112 such notifications went unread.
  -- actividad_ot above still records every upload for the OT timeline.

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
$function$;
