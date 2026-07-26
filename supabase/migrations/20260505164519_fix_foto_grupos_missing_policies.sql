
-- INSERT: any workspace member can create foto_grupos for their workspace
CREATE POLICY "foto_grupos_insert" ON public.foto_grupos
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());

-- SELECT: any workspace member can read foto_grupos
CREATE POLICY "foto_grupos_select" ON public.foto_grupos
  FOR SELECT USING (workspace_id = my_workspace_id());

-- DELETE: admin/owner only (same restriction as UPDATE)
CREATE POLICY "foto_grupos_delete" ON public.foto_grupos
  FOR DELETE USING (
    workspace_id = my_workspace_id()
    AND (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = (SELECT auth.uid()) LIMIT 1)
      = ANY (ARRAY['owner'::text, 'admin'::text])
  );
;
