
-- The usuarios_update WITH CHECK was causing 42P17 infinite recursion.
-- Inline "SELECT rol FROM usuarios WHERE id = auth.uid()" inside a policy on usuarios
-- re-enters RLS on usuarios → triggers WITH CHECK again → infinite loop.
-- Fix: replace all inline rol subqueries with fn_mi_rol() which is SECURITY DEFINER
-- and therefore reads usuarios without going through RLS.

DROP POLICY IF EXISTS "usuarios_update" ON public.usuarios;

CREATE POLICY "usuarios_update" ON public.usuarios
  FOR UPDATE
  USING (
    (id = (SELECT auth.uid()))
    OR (
      workspace_id = my_workspace_id()
      AND fn_mi_rol() = ANY (ARRAY['owner','admin','supervisor'])
    )
  )
  WITH CHECK (
    -- Own-row update: can't change your own role or workspace
    (
      id = (SELECT auth.uid())
      AND rol = fn_mi_rol()
      AND workspace_id = my_workspace_id()
    )
    OR
    -- Elevated update: admin/supervisor/owner can update anyone in the workspace
    (
      workspace_id = my_workspace_id()
      AND fn_mi_rol() = ANY (ARRAY['owner','admin','supervisor'])
    )
  );
;
