-- Spreadsheets are explicit user-created resources. Work-order creation must
-- never create an unnamed/default sheet behind the user's back.
DO $$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef('public.create_work_order_v1(jsonb)'::regprocedure)
    INTO v_definition;

  IF v_definition LIKE '%VALUES (v_workspace_id, ''Hoja de materiales'', v_actor_id, v_order.id)%' THEN
    v_patched := regexp_replace(
      v_definition,
      E'\\n[[:space:]]*INSERT INTO public\\.hojas_inventario \\(workspace_id, nombre, created_by, orden_id\\)\\n[[:space:]]*VALUES \\(v_workspace_id, ''Hoja de materiales'', v_actor_id, v_order\\.id\\)\\n[[:space:]]*RETURNING id INTO v_sheet_id;',
      '',
      'n'
    );
    IF v_patched = v_definition OR v_patched LIKE '%VALUES (v_workspace_id, ''Hoja de materiales'', v_actor_id, v_order.id)%' THEN
      RAISE EXCEPTION 'Could not remove automatic root work-order sheet creation';
    END IF;
    EXECUTE v_patched;
  END IF;
END;
$$;

DO $$
DECLARE
  v_definition text;
  v_patched text;
BEGIN
  SELECT pg_get_functiondef('public.create_sub_work_order_v1(jsonb)'::regprocedure)
    INTO v_definition;

  IF v_definition LIKE '%VALUES (v_workspace_id, ''Hoja de materiales'', v_actor_id, v_child.id)%' THEN
    v_patched := regexp_replace(
      v_definition,
      E'\\n[[:space:]]*IF v_parent\\.requiere_hoja THEN\\n[[:space:]]*INSERT INTO public\\.hojas_inventario \\(workspace_id, nombre, created_by, orden_id\\)\\n[[:space:]]*VALUES \\(v_workspace_id, ''Hoja de materiales'', v_actor_id, v_child\\.id\\)\\n[[:space:]]*RETURNING id INTO v_sheet_id;\\n[[:space:]]*END IF;',
      '',
      'n'
    );
    IF v_patched = v_definition OR v_patched LIKE '%VALUES (v_workspace_id, ''Hoja de materiales'', v_actor_id, v_child.id)%' THEN
      RAISE EXCEPTION 'Could not remove automatic sub-work-order sheet creation';
    END IF;
    EXECUTE v_patched;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.create_work_order_v1(jsonb) IS
  'Canonical idempotent root work-order creation. Sheets are created explicitly by users.';
COMMENT ON FUNCTION public.create_sub_work_order_v1(jsonb) IS
  'Canonical idempotent sub-work-order creation. Sheets are created explicitly by users.';
