-- fecha_termino is the planned due date. Actual completion belongs in
-- completado_en; completing/reopening an OT must never overwrite its due date.
DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.transition_work_order_v1(jsonb)'::regprocedure)
  INTO v_definition;

  v_definition := replace(
    v_definition,
    'fecha_termino = CASE WHEN v_action = ''complete'' THEN v_now WHEN v_action = ''reopen'' THEN NULL ELSE fecha_termino END,',
    'completado_en = CASE WHEN v_action = ''complete'' THEN v_now WHEN v_action = ''reopen'' THEN NULL ELSE completado_en END,'
  );

  IF position('completado_en = CASE WHEN v_action = ''complete'' THEN v_now WHEN v_action = ''reopen'' THEN NULL ELSE completado_en END' IN v_definition) = 0
     OR position('fecha_termino = CASE WHEN v_action = ''complete''' IN v_definition) > 0 THEN
    RAISE EXCEPTION 'transition_work_order_v1 due-date preservation patch did not match the installed definition';
  END IF;

  EXECUTE v_definition;
END;
$$;

