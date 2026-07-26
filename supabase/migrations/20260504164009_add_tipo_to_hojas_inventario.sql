ALTER TABLE hojas_inventario ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'general' CHECK (tipo IN ('general', 'materiales_usados', 'materiales_solicitados'));;
