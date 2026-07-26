ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS modo_registro text NOT NULL DEFAULT 'ambos' CHECK (modo_registro IN ('ambos', 'materiales', 'hoja'));;
