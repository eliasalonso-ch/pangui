
CREATE TABLE IF NOT EXISTS hojas_inventario (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nombre       text NOT NULL DEFAULT 'Hoja 1',
  columnas     jsonb NOT NULL DEFAULT '[{"id":"c1","label":"Ítem","tipo":"texto"},{"id":"c2","label":"Cantidad","tipo":"numero"},{"id":"c3","label":"Unidad","tipo":"texto"}]',
  created_by   uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hojas_inventario_filas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hoja_id      uuid NOT NULL REFERENCES hojas_inventario(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  orden        integer NOT NULL DEFAULT 0,
  celdas       jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hojas_inventario_workspace ON hojas_inventario(workspace_id);
CREATE INDEX IF NOT EXISTS idx_hojas_filas_hoja ON hojas_inventario_filas(hoja_id, orden);

CREATE TRIGGER trg_hojas_updated_at
  BEFORE UPDATE ON hojas_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_hojas_filas_updated_at
  BEFORE UPDATE ON hojas_inventario_filas
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

ALTER TABLE hojas_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE hojas_inventario_filas ENABLE ROW LEVEL SECURITY;

CREATE POLICY hojas_select ON hojas_inventario FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY hojas_insert ON hojas_inventario FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY hojas_update ON hojas_inventario FOR UPDATE USING (workspace_id = my_workspace_id()) WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY hojas_delete ON hojas_inventario FOR DELETE USING (workspace_id = my_workspace_id());

CREATE POLICY filas_select ON hojas_inventario_filas FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY filas_insert ON hojas_inventario_filas FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY filas_update ON hojas_inventario_filas FOR UPDATE USING (workspace_id = my_workspace_id()) WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY filas_delete ON hojas_inventario_filas FOR DELETE USING (workspace_id = my_workspace_id());
;
