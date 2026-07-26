
-- Fix 1: Replace the RLS policy that re-evaluates auth functions per row.
-- Wrapping auth.uid() in (select ...) causes it to be evaluated once per
-- query instead of once per row, which is significantly faster at scale.
DROP POLICY IF EXISTS "foto_grupo_items_insert_workspace_member" ON public.foto_grupo_items;

CREATE POLICY "foto_grupo_items_insert_workspace_member"
ON public.foto_grupo_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE usuarios.id = (SELECT auth.uid())
      AND usuarios.workspace_id = (
        SELECT fg.workspace_id FROM public.foto_grupos fg
        WHERE fg.id = foto_grupo_items.grupo_id
      )
  )
);

-- Fix 2: Drop the duplicate permissive INSERT policy on the same table.
-- Both policies were being evaluated for every INSERT; keeping only the
-- one above (now fixed) is sufficient.
DROP POLICY IF EXISTS "workspace members can manage foto_grupo_items" ON public.foto_grupo_items;
;
