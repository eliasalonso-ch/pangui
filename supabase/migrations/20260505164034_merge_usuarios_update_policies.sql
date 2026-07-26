
DROP POLICY IF EXISTS "usuarios_update" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_elevated" ON public.usuarios;

-- Single UPDATE policy covering both cases:
-- 1. Own row: user can update themselves but cannot change their own rol or workspace_id
-- 2. Elevated: owner/admin/supervisor can update any user in their workspace
CREATE POLICY "usuarios_update" ON public.usuarios
  FOR UPDATE
  USING (
    -- own row
    id = (SELECT auth.uid())
    OR
    -- elevated: caller is owner/admin/supervisor in the same workspace
    (
      workspace_id = my_workspace_id()
      AND (SELECT u.rol FROM usuarios u WHERE u.id = (SELECT auth.uid()) LIMIT 1)
        = ANY (ARRAY['owner'::text, 'admin'::text, 'supervisor'::text])
    )
  )
  WITH CHECK (
    -- own row: cannot escalate own role or move to a different workspace
    (
      id = (SELECT auth.uid())
      AND rol = (SELECT u.rol FROM usuarios u WHERE u.id = (SELECT auth.uid()) LIMIT 1)
      AND workspace_id = my_workspace_id()
    )
    OR
    -- elevated: target must stay in the same workspace
    (
      workspace_id = my_workspace_id()
      AND (SELECT u.rol FROM usuarios u WHERE u.id = (SELECT auth.uid()) LIMIT 1)
        = ANY (ARRAY['owner'::text, 'admin'::text, 'supervisor'::text])
    )
  );
;
