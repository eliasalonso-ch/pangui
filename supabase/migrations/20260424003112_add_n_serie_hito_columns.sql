
ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS n_serie TEXT,
  ADD COLUMN IF NOT EXISTS hito    TEXT;

CREATE INDEX IF NOT EXISTS ordenes_n_serie_workspace_idx
  ON ordenes_trabajo (workspace_id, n_serie)
  WHERE n_serie IS NOT NULL AND n_serie <> '';
;
