
-- OT list: filter workspace_id + parent_id IS NULL, sort created_at DESC
CREATE INDEX IF NOT EXISTS idx_ot_workspace_parent_created
  ON public.ordenes_trabajo (workspace_id, parent_id, created_at DESC);

-- notifications: usuario_id filter + created_at DESC sort (leida-free path)
CREATE INDEX IF NOT EXISTS idx_notifications_usuario_created
  ON public.notifications (usuario_id, created_at DESC);

-- actividad_ot dashboard lateral join: ordenes_trabajo filtered by workspace_id + asignados_ids contains + id
CREATE INDEX IF NOT EXISTS idx_ot_workspace_asignados_id
  ON public.ordenes_trabajo (workspace_id, id)
  WHERE asignados_ids IS NOT NULL;
;
