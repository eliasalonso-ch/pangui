
DROP POLICY IF EXISTS "foto_grupo_items_insert_workspace_member" ON public.foto_grupo_items;

CREATE POLICY "foto_grupo_items_insert_workspace_member" ON public.foto_grupo_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.foto_grupos g
      WHERE g.id = foto_grupo_items.grupo_id
        AND g.workspace_id = my_workspace_id()
    )
  );
;
