
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_workspace_id ON public.ordenes_trabajo USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_partes_stock_minimo ON public.partes USING btree (stock_minimo);
CREATE INDEX IF NOT EXISTS idx_partes_activo ON public.partes USING btree (activo);
CREATE INDEX IF NOT EXISTS idx_hojas_inventario_filas_hoja_id ON public.hojas_inventario_filas USING btree (hoja_id);
CREATE INDEX IF NOT EXISTS idx_procedimientos_nombre ON public.procedimientos USING btree (nombre);
;
