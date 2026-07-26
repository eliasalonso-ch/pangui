-- ubicaciones: ORDER BY edificio ASC (index_advisor flagged)
CREATE INDEX IF NOT EXISTS idx_ubicaciones_edificio
  ON public.ubicaciones USING btree (edificio);

-- sociedades: workspace_id filter (index_advisor flagged)
CREATE INDEX IF NOT EXISTS idx_sociedades_workspace_id
  ON public.sociedades USING btree (workspace_id);

-- categorias_ot: ORDER BY nombre ASC (index_advisor flagged)
CREATE INDEX IF NOT EXISTS idx_categorias_ot_nombre
  ON public.categorias_ot USING btree (nombre);

-- lugares: composite for workspace_id + activo filter + nombre sort
CREATE INDEX IF NOT EXISTS idx_lugares_workspace_activo_nombre
  ON public.lugares USING btree (workspace_id, activo, nombre);;
