ALTER TABLE hojas_inventario ADD COLUMN IF NOT EXISTS levantamiento_id uuid REFERENCES levantamientos(id) ON DELETE CASCADE;;
