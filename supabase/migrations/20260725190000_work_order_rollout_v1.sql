-- Server-owned, per-workspace rollout controls for the canonical OT commands.
-- Defaults are deliberately legacy/off so deploying this migration changes no
-- client behavior. Only service_role may mutate rollout state.

CREATE TABLE IF NOT EXISTS public.work_order_rollout_v1 (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  create_enabled boolean NOT NULL DEFAULT false,
  edit_enabled boolean NOT NULL DEFAULT false,
  transition_enabled boolean NOT NULL DEFAULT false,
  upload_enabled boolean NOT NULL DEFAULT false,
  rollout_percentage smallint NOT NULL DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
  kill_switch boolean NOT NULL DEFAULT false,
  note text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_order_rollout_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.work_order_rollout_v1 FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.work_order_rollout_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.get_work_order_rollout_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_workspace_id uuid;
  v_config public.work_order_rollout_v1%ROWTYPE;
  v_in_cohort boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RETURN jsonb_build_object(
      'contract_version', 1, 'workspace_id', NULL,
      'create_enabled', false, 'edit_enabled', false,
      'transition_enabled', false, 'upload_enabled', false,
      'kill_switch', true, 'rollout_percentage', 0
    );
  END IF;
  SELECT workspace_id INTO v_workspace_id
  FROM public.usuarios WHERE id = v_actor_id AND COALESCE(activo, true);
  SELECT * INTO v_config FROM public.work_order_rollout_v1
  WHERE workspace_id = v_workspace_id;
  IF v_config.workspace_id IS NOT NULL AND NOT v_config.kill_switch THEN
    v_in_cohort := mod(abs(hashtext(v_actor_id::text)), 100) < v_config.rollout_percentage;
  END IF;
  RETURN jsonb_build_object(
    'contract_version', 1,
    'workspace_id', v_workspace_id,
    'create_enabled', COALESCE(v_config.create_enabled, false) AND v_in_cohort,
    'edit_enabled', COALESCE(v_config.edit_enabled, false) AND v_in_cohort,
    'transition_enabled', COALESCE(v_config.transition_enabled, false) AND v_in_cohort,
    'upload_enabled', COALESCE(v_config.upload_enabled, false) AND v_in_cohort,
    'kill_switch', COALESCE(v_config.kill_switch, false),
    'rollout_percentage', COALESCE(v_config.rollout_percentage, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_work_order_rollout_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_work_order_rollout_v1() TO authenticated;

CREATE OR REPLACE FUNCTION public.work_order_rollout_health_v1(p_since timestamptz DEFAULT now() - interval '1 hour')
RETURNS jsonb
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
      WHERE delivered_at IS NULL AND created_at >= p_since
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
      WHERE delivered_at IS NULL
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.work_order_rollout_health_v1(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.work_order_rollout_health_v1(timestamptz) TO service_role;

COMMENT ON TABLE public.work_order_rollout_v1 IS
  'Kill switch and deterministic per-user canary controls for canonical OT command adoption.';
