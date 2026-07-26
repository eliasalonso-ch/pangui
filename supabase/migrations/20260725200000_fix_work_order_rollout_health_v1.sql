-- Keep rollout health aligned with the canonical notification outbox schema.
CREATE OR REPLACE FUNCTION public.work_order_rollout_health_v1(
  p_since timestamptz DEFAULT now() - interval '1 hour'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    PERFORM public.work_order_command_error('FORBIDDEN', 'Only operational services may read rollout health.');
  END IF;

  SELECT jsonb_build_object(
    'since', p_since,
    'generated_at', now(),
    'commands', COALESCE((
      SELECT jsonb_object_agg(command_type, total)
      FROM (
        SELECT command_type, count(*) AS total
        FROM public.work_order_commands
        WHERE created_at >= p_since
        GROUP BY command_type
      ) counts
    ), '{}'::jsonb),
    'notification_outbox_pending', (
      SELECT count(*) FROM public.work_order_notification_outbox
      WHERE processed_at IS NULL AND created_at >= p_since
    ),
    'upload_intents', COALESCE((
      SELECT jsonb_object_agg(status, total)
      FROM (
        SELECT status, count(*) AS total
        FROM public.ot_upload_intents
        WHERE created_at >= p_since
        GROUP BY status
      ) counts
    ), '{}'::jsonb),
    'stale_prepared_uploads', (
      SELECT count(*) FROM public.ot_upload_intents
      WHERE status = 'prepared' AND expires_at <= now()
    ),
    'oldest_pending_notification_at', (
      SELECT min(created_at) FROM public.work_order_notification_outbox
      WHERE processed_at IS NULL
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.work_order_rollout_health_v1(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_order_rollout_health_v1(timestamptz)
  TO service_role;
