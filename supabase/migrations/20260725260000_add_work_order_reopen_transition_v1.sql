-- Add an explicit, audited transition for reopening a waiting/review/terminal OT.
-- Keep this as a patch migration because transition_work_order_v1 is already live.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.transition_work_order_v1(jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    '''assign'', ''wait'', ''start'', ''pause'', ''resume'', ''request_review'', ''complete'', ''cancel'')',
    '''assign'', ''wait'', ''start'', ''pause'', ''resume'', ''request_review'', ''complete'', ''cancel'', ''reopen'')'
  );
  v_definition := replace(
    v_definition,
    'IF v_before.estado IN (''completado'', ''cancelado'') THEN',
    'IF v_before.estado IN (''completado'', ''cancelado'') AND v_action <> ''reopen'' THEN'
  );
  v_definition := replace(
    v_definition,
    E'CASE v_action\n    WHEN ''assign'' THEN',
    E'CASE v_action\n    WHEN ''reopen'' THEN\n      IF v_before.estado NOT IN (''en_espera'', ''en_revision'', ''completado'', ''cancelado'') THEN\n        PERFORM public.work_order_command_error(''INVALID_STATE_TRANSITION'', ''reopen is not valid from the current state.'');\n      END IF;\n      v_next_state := ''pendiente'';\n      v_activity_type := ''estado_cambiado'';\n      v_activity_comment := COALESCE(NULLIF(btrim(v_payload ->> ''comment''), ''''), ''Asignada'');\n    WHEN ''assign'' THEN'
  );
  v_definition := replace(
    v_definition,
    'fecha_termino = CASE WHEN v_action = ''complete'' THEN v_now ELSE fecha_termino END,',
    'fecha_termino = CASE WHEN v_action = ''complete'' THEN v_now WHEN v_action = ''reopen'' THEN NULL ELSE fecha_termino END,'
  );
  v_definition := replace(
    v_definition,
    'completado_por = CASE WHEN v_action = ''complete'' THEN v_actor_id ELSE completado_por END',
    'completado_por = CASE WHEN v_action = ''complete'' THEN v_actor_id WHEN v_action = ''reopen'' THEN NULL ELSE completado_por END'
  );

  IF position('WHEN ''reopen'' THEN' IN v_definition) = 0
     OR position('WHEN v_action = ''reopen'' THEN NULL' IN v_definition) = 0
     OR position('AND v_action <> ''reopen''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'transition_work_order_v1 reopen patch did not match the installed definition';
  END IF;

  EXECUTE v_definition;
END;
$$;

