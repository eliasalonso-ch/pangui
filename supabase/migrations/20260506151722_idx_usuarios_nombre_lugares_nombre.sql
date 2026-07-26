
CREATE INDEX IF NOT EXISTS idx_usuarios_nombre ON public.usuarios USING btree (nombre);
CREATE INDEX IF NOT EXISTS idx_lugares_nombre ON public.lugares USING btree (nombre);
;
