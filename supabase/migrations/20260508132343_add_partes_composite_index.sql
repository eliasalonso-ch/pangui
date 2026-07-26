CREATE INDEX IF NOT EXISTS idx_partes_workspace_activo_nombre ON public.partes USING btree (workspace_id, activo, nombre);;
