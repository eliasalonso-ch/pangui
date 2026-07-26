
-- Allow all authenticated users to see global default categories (workspace_id IS NULL, es_default = true)
DROP POLICY IF EXISTS categorias_select ON public.categorias_ot;

CREATE POLICY categorias_select ON public.categorias_ot
  FOR SELECT TO authenticated
  USING (
    (workspace_id = public.my_workspace_id())
    OR
    (workspace_id IS NULL AND es_default = true)
  );

-- Remove the rogue workspace-scoped duplicate "Inspeccion" default
DELETE FROM public.categorias_ot
  WHERE id = '82294b5f-f3a8-418c-8102-f713f98ea09f';

NOTIFY pgrst, 'reload schema';
;
