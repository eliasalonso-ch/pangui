-- Normalize JSON null array fields before the canonical command validates them.
ALTER FUNCTION public.create_work_order_v1(jsonb)
  RENAME TO create_work_order_v1_canonical_20260725;

CREATE OR REPLACE FUNCTION public.create_work_order_v1(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_payload jsonb := COALESCE(p_command -> 'payload', '{}'::jsonb);
BEGIN
  IF jsonb_typeof(v_payload -> 'asignados_ids') IS DISTINCT FROM 'array' THEN
    v_payload := v_payload - 'asignados_ids';
  END IF;
  IF jsonb_typeof(v_payload -> 'categoria_ids') IS DISTINCT FROM 'array' THEN
    v_payload := v_payload - 'categoria_ids';
  END IF;
  RETURN public.create_work_order_v1_canonical_20260725(
    jsonb_set(p_command, '{payload}', v_payload, true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_work_order_v1_canonical_20260725(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_work_order_v1_canonical_20260725(jsonb)
  TO public;
REVOKE ALL ON FUNCTION public.create_work_order_v1(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_work_order_v1(jsonb) TO authenticated;
