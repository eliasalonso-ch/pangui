-- ============================================================
-- Restore FK from ordenes_trabajo.ubicacion_id → ubicaciones.id
-- ============================================================

ALTER TABLE ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ordenes_trabajo_ubicacion_id_fkey;
ALTER TABLE ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_ubicacion_id_fkey
  FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE SET NULL;

ALTER TABLE activos
  DROP CONSTRAINT IF EXISTS activos_ubicacion_id_fkey;
ALTER TABLE activos
  ADD CONSTRAINT activos_ubicacion_id_fkey
  FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE SET NULL;

ALTER TABLE preventivos
  DROP CONSTRAINT IF EXISTS preventivos_ubicacion_id_fkey;
ALTER TABLE preventivos
  ADD CONSTRAINT preventivos_ubicacion_id_fkey
  FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE SET NULL;

ALTER TABLE partes
  DROP CONSTRAINT IF EXISTS partes_ubicacion_id_fkey;
ALTER TABLE partes
  ADD CONSTRAINT partes_ubicacion_id_fkey
  FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
