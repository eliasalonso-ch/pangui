-- Deliver canonical OT notification intents exactly once. Existing legacy
-- trigger notifications are adopted instead of duplicated during rollout.
CREATE EXTENSION IF NOT EXISTS pg_cron;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source_outbox_id uuid
  REFERENCES public.work_order_notification_outbox(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_outbox_recipient_uidx
  ON public.notifications (source_outbox_id, usuario_id)
  WHERE source_outbox_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.process_work_order_notification_outbox_v1(
  p_limit integer DEFAULT 100
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_event public.work_order_notification_outbox%ROWTYPE;
  v_recipient uuid;
  v_actor uuid;
  v_title text;
  v_message text;
  v_type text;
  v_url text;
  v_processed integer := 0;
BEGIN
  FOR v_event IN
    SELECT *
    FROM public.work_order_notification_outbox
    WHERE processed_at IS NULL
    ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  LOOP
    SELECT actor_id INTO v_actor
    FROM public.work_order_commands
    WHERE workspace_id = v_event.workspace_id
      AND command_id = v_event.command_id;

    v_url := '/orden/' || v_event.aggregate_id::text;
    v_message := COALESCE(NULLIF(v_event.payload ->> 'titulo', ''), 'Orden de trabajo');
    v_title := CASE v_event.event_type
      WHEN 'work_order_created' THEN 'Nueva orden de trabajo'
      WHEN 'sub_work_order_created' THEN 'Nueva sub-OT'
      WHEN 'work_order_assigned' THEN 'Nueva orden asignada'
      WHEN 'work_order_completed' THEN 'Orden completada'
      WHEN 'work_order_media_uploaded' THEN 'Nuevo archivo en la OT'
      ELSE 'Orden actualizada'
    END;
    v_type := CASE v_event.event_type
      WHEN 'work_order_assigned' THEN 'asignado'
      WHEN 'work_order_completed' THEN 'completado'
      WHEN 'work_order_media_uploaded' THEN 'archivo_ot'
      ELSE 'orden'
    END;

    FOR v_recipient IN
      SELECT DISTINCT candidates.id
      FROM (
        SELECT v_event.recipient_id AS id
        WHERE v_event.recipient_id IS NOT NULL
        UNION ALL
        SELECT u.id
        FROM public.usuarios u
        JOIN public.ordenes_trabajo ot ON ot.id = v_event.aggregate_id
        WHERE v_event.recipient_id IS NULL
          AND v_event.event_type IN ('work_order_created', 'sub_work_order_created')
          AND u.workspace_id = v_event.workspace_id
          AND COALESCE(u.activo, true)
          AND u.rol IN ('owner', 'admin')
          AND u.id IS DISTINCT FROM v_actor
          AND NOT (u.id = ANY(COALESCE(ot.asignados_ids, '{}'::uuid[])))
      ) candidates
      JOIN public.usuarios u ON u.id = candidates.id
      WHERE candidates.id IS NOT NULL
        AND COALESCE(u.activo, true)
        AND u.workspace_id = v_event.workspace_id
    LOOP
      -- Assignment and completion triggers remain active for legacy clients.
      -- Adopt their recent row when present so the rollout cannot double-send.
      UPDATE public.notifications n
      SET source_outbox_id = v_event.id
      WHERE n.id = (
        SELECT existing.id
        FROM public.notifications existing
        WHERE existing.usuario_id = v_recipient
          AND existing.source_outbox_id IS NULL
          AND existing.created_at BETWEEN v_event.created_at - interval '5 seconds'
                                      AND v_event.created_at + interval '5 minutes'
          AND existing.url IN (v_url, '/ordenes?id=' || v_event.aggregate_id::text)
          AND (
            (v_event.event_type = 'work_order_assigned' AND existing.tipo = 'asignado')
            OR (v_event.event_type = 'work_order_completed' AND existing.tipo = 'completado')
          )
        ORDER BY existing.created_at
        LIMIT 1
      );

      IF NOT FOUND THEN
        INSERT INTO public.notifications (
          usuario_id, titulo, mensaje, url, tipo, source_outbox_id
        ) VALUES (
          v_recipient, v_title, v_message, v_url, v_type, v_event.id
        )
        ON CONFLICT (source_outbox_id, usuario_id)
          WHERE source_outbox_id IS NOT NULL DO NOTHING;
      END IF;
    END LOOP;

    UPDATE public.work_order_notification_outbox
    SET processed_at = now(), attempts = attempts + 1, last_error = NULL
    WHERE id = v_event.id;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.process_work_order_notification_outbox_v1(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_work_order_notification_outbox_v1(integer)
  TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'process-work-order-notification-outbox-v1';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
  PERFORM cron.schedule(
    'process-work-order-notification-outbox-v1',
    '* * * * *',
    'SELECT public.process_work_order_notification_outbox_v1(100);'
  );
END;
$$;
