-- Allow a comment's author to edit and delete their own activity comment.
ALTER TABLE public.actividad_ot
  ADD COLUMN IF NOT EXISTS editado_at timestamptz;

DROP POLICY IF EXISTS actividad_update_own ON public.actividad_ot;
DROP POLICY IF EXISTS actividad_delete_own ON public.actividad_ot;

CREATE POLICY actividad_update_own ON public.actividad_ot
  FOR UPDATE TO authenticated
  USING (
    tipo = 'comentario'
    AND usuario_id = auth.uid()
    AND orden_id IN (
      SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
    )
  )
  WITH CHECK (
    tipo = 'comentario'
    AND usuario_id = auth.uid()
    AND orden_id IN (
      SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
    )
  );

CREATE POLICY actividad_delete_own ON public.actividad_ot
  FOR DELETE TO authenticated
  USING (
    tipo = 'comentario'
    AND usuario_id = auth.uid()
    AND orden_id IN (
      SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
    )
  );;
