-- Quién completó la OT. Antes solo guardábamos completado_en (fecha); el "quién"
-- vivía en actividad_ot. Esta columna lo deja barato de leer en la propia OT.
ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS completado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL;

-- Backfill: para OTs ya completadas, tomar el usuario de la última actividad
-- 'completado' registrada para esa OT.
UPDATE ordenes_trabajo ot
SET completado_por = a.usuario_id
FROM (
  SELECT DISTINCT ON (orden_id) orden_id, usuario_id
  FROM actividad_ot
  WHERE tipo = 'completado' AND usuario_id IS NOT NULL
  ORDER BY orden_id, created_at DESC
) a
WHERE a.orden_id = ot.id
  AND ot.completado_por IS NULL
  AND ot.estado = 'completado';;
