
-- Speed up Realtime row filtering on ordenes_trabajo (workspace_id filter is the most common)
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_workspace_id ON ordenes_trabajo(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_updated_at ON ordenes_trabajo(updated_at DESC);

-- Speed up actividad_ot realtime filter
CREATE INDEX IF NOT EXISTS idx_actividad_ot_orden_id ON actividad_ot(orden_id);

-- Speed up notifications polling/realtime
CREATE INDEX IF NOT EXISTS idx_notifications_usuario_id_read ON notifications(usuario_id, leida, created_at DESC);

-- Speed up procedimientos queries (used heavily in procedure state fetch)
CREATE INDEX IF NOT EXISTS idx_ot_procedimientos_orden_id ON ot_procedimientos(orden_id);
CREATE INDEX IF NOT EXISTS idx_procedimiento_ejecuciones_orden_id ON procedimiento_ejecuciones(orden_id);
CREATE INDEX IF NOT EXISTS idx_paso_respuestas_ejecucion_id ON paso_respuestas(ejecucion_id);
;
