-- Hoja de cobro + catálogo de códigos para autocompletar.
--
-- Contexto: Electrilam cobra desde una app local (HTML offline) que tiene el
-- catálogo con los PRECIOS. Acá sólo vive el código/descripción para que quien
-- llena la hoja de la OT pueda elegir el material sin saberse 1.500 códigos de
-- memoria. Los precios NUNCA se suben: son información comercial y se quedan
-- en el equipo de Electrilam.

-- 1) Nuevo tipo de hoja: "cobro" (código + cantidad + observación)
ALTER TABLE hojas_inventario DROP CONSTRAINT IF EXISTS hojas_inventario_tipo_check;
ALTER TABLE hojas_inventario ADD CONSTRAINT hojas_inventario_tipo_check
  CHECK (tipo IN ('general', 'materiales_usados', 'materiales_solicitados', 'cobro'));

-- 2) Catálogo de códigos, por workspace. Sin precios, a propósito.
CREATE TABLE IF NOT EXISTS catalogo_materiales (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  codigo         text NOT NULL,
  descripcion    text NOT NULL DEFAULT '',
  unidad         text NOT NULL DEFAULT '',
  clasificacion  text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- el código es la llave de negocio: única dentro del workspace, y es lo que
  -- permite que la app de cobros resuelva precio y descripción sin ambigüedad
  UNIQUE (workspace_id, codigo)
);

-- Búsqueda por código o descripción mientras se escribe
CREATE INDEX IF NOT EXISTS idx_catalogo_materiales_ws ON catalogo_materiales (workspace_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_materiales_codigo
  ON catalogo_materiales (workspace_id, lower(codigo) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_catalogo_materiales_desc
  ON catalogo_materiales (workspace_id, lower(descripcion) text_pattern_ops);

DROP TRIGGER IF EXISTS trg_catalogo_materiales_updated_at ON catalogo_materiales;
CREATE TRIGGER trg_catalogo_materiales_updated_at
  BEFORE UPDATE ON catalogo_materiales
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- 3) RLS: mismo criterio que hojas_inventario — scoping por workspace
ALTER TABLE catalogo_materiales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogo_materiales_select ON catalogo_materiales;
CREATE POLICY catalogo_materiales_select ON catalogo_materiales
  FOR SELECT USING (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS catalogo_materiales_insert ON catalogo_materiales;
CREATE POLICY catalogo_materiales_insert ON catalogo_materiales
  FOR INSERT WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS catalogo_materiales_update ON catalogo_materiales;
CREATE POLICY catalogo_materiales_update ON catalogo_materiales
  FOR UPDATE USING (workspace_id = my_workspace_id())
  WITH CHECK (workspace_id = my_workspace_id());

DROP POLICY IF EXISTS catalogo_materiales_delete ON catalogo_materiales;
CREATE POLICY catalogo_materiales_delete ON catalogo_materiales
  FOR DELETE USING (workspace_id = my_workspace_id());
