-- Global default OT categories are intentionally visible to every workspace.
-- The command boundary must accept them while continuing to reject categories
-- owned by a different workspace.
DO $$
DECLARE
  v_definition text;
  v_create_function regprocedure;
BEGIN
  v_create_function := COALESCE(
    to_regprocedure('public.create_work_order_v1_canonical_20260725(jsonb)'),
    to_regprocedure('public.create_work_order_v1(jsonb)')
  );
  v_definition := pg_get_functiondef(
    v_create_function
  );

  v_definition := replace(
    v_definition,
    E'WHERE id = (v_payload ->> ''categoria_id'')::uuid\n      AND workspace_id = v_workspace_id',
    E'WHERE id = (v_payload ->> ''categoria_id'')::uuid\n      AND (workspace_id = v_workspace_id OR (workspace_id IS NULL AND es_default = true))'
  );
  v_definition := replace(
    v_definition,
    'WHERE c.id IS NULL OR c.workspace_id IS DISTINCT FROM v_workspace_id',
    'WHERE c.id IS NULL OR NOT (c.workspace_id = v_workspace_id OR (c.workspace_id IS NULL AND c.es_default = true))'
  );
  EXECUTE v_definition;

  v_definition := pg_get_functiondef(
    'public.assert_work_order_references_v1(uuid,jsonb)'::regprocedure
  );
  v_definition := replace(
    v_definition,
    'WHERE id = (p_changes ->> ''categoria_id'')::uuid AND workspace_id = p_workspace_id',
    'WHERE id = (p_changes ->> ''categoria_id'')::uuid AND (workspace_id = p_workspace_id OR (workspace_id IS NULL AND es_default = true))'
  );
  v_definition := replace(
    v_definition,
    'WHERE c.id IS NULL OR c.workspace_id IS DISTINCT FROM p_workspace_id',
    'WHERE c.id IS NULL OR NOT (c.workspace_id = p_workspace_id OR (c.workspace_id IS NULL AND c.es_default = true))'
  );
  EXECUTE v_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
