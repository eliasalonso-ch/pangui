DROP POLICY IF EXISTS "foto_grupo_items_insert_workspace_member" ON public.foto_grupo_items;

CREATE POLICY "foto_grupo_items_insert_workspace_member" ON public.foto_grupo_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.foto_grupos g
      JOIN public.usuarios u ON u.workspace_id = g.workspace_id
      WHERE g.id = foto_grupo_items.grupo_id
        AND u.id = auth.uid()
        AND u.activo = true
    )
  );;
