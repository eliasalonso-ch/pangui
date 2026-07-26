
-- 1. Add DELETE policy on procedimientos: admin/owner only
CREATE POLICY proc_delete ON procedimientos
  FOR DELETE
  USING (
    workspace_id = my_workspace_id()
    AND fn_mi_rol() IN ('admin', 'owner')
  );

-- 2. Restrict UPDATE on procedimientos:
--    - admin/owner can update any proc in their workspace
--    - regular users can only update their own (created_by = auth.uid())
DROP POLICY IF EXISTS proc_update ON procedimientos;
CREATE POLICY proc_update ON procedimientos
  FOR UPDATE
  USING (
    workspace_id = my_workspace_id()
    AND (
      fn_mi_rol() IN ('admin', 'owner')
      OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id = my_workspace_id()
    AND (
      fn_mi_rol() IN ('admin', 'owner')
      OR created_by = auth.uid()
    )
  );

-- 3. Restrict DELETE on procedimiento_pasos:
--    - admin/owner can delete any paso in their workspace
--    - regular users can only delete pasos of procs they own
DROP POLICY IF EXISTS pasos_delete ON procedimiento_pasos;
CREATE POLICY pasos_delete ON procedimiento_pasos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM procedimientos p
      WHERE p.id = procedimiento_pasos.procedimiento_id
        AND p.workspace_id = my_workspace_id()
        AND (
          fn_mi_rol() IN ('admin', 'owner')
          OR p.created_by = auth.uid()
        )
    )
  );

-- 4. Make sure created_by is always set to auth.uid() on insert
--    via a trigger so it can't be spoofed
CREATE OR REPLACE FUNCTION fn_set_procedimiento_created_by()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proc_created_by ON procedimientos;
CREATE TRIGGER trg_proc_created_by
  BEFORE INSERT ON procedimientos
  FOR EACH ROW EXECUTE FUNCTION fn_set_procedimiento_created_by();
;
