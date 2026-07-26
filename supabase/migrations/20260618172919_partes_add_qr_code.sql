-- QR label support for inventory: each parte can be linked to one physical QR
-- label. The QR encodes an arbitrary opaque value; the first scan associates it
-- with a parte. Unique per workspace among active partes.
ALTER TABLE partes ADD COLUMN IF NOT EXISTS qr_code text;

-- One QR value can map to at most one (active) parte within a workspace.
CREATE UNIQUE INDEX IF NOT EXISTS partes_qr_code_workspace_uniq
  ON partes (workspace_id, qr_code)
  WHERE qr_code IS NOT NULL AND activo = true;

-- Fast lookup when scanning.
CREATE INDEX IF NOT EXISTS partes_qr_code_lookup
  ON partes (qr_code)
  WHERE qr_code IS NOT NULL;;
