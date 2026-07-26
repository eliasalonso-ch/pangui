
-- Add auto_adjuntar column to procedimientos
ALTER TABLE procedimientos
  ADD COLUMN IF NOT EXISTS auto_adjuntar boolean NOT NULL DEFAULT false;

-- When an OT is created, auto-attach all workspace procedures with auto_adjuntar=true
CREATE OR REPLACE FUNCTION auto_adjuntar_procedimientos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ot_procedimientos (orden_id, procedimiento_id)
  SELECT NEW.id, p.id
  FROM procedimientos p
  WHERE p.workspace_id = NEW.workspace_id
    AND p.auto_adjuntar = true
    AND p.activo = true
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_adjuntar_procedimientos ON ordenes_trabajo;
CREATE TRIGGER trg_auto_adjuntar_procedimientos
  AFTER INSERT ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION auto_adjuntar_procedimientos();
;
