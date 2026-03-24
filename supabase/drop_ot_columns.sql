-- ============================================================
-- Drop trigger blocking costo columns + drop unused OT columns
-- ============================================================

-- Drop trigger that depends on costo_materiales
DROP TRIGGER IF EXISTS trg_costo_total ON ordenes_trabajo;
DROP FUNCTION IF EXISTS fn_calcular_costo_total() CASCADE;

-- Drop cost columns
ALTER TABLE ordenes_trabajo DROP COLUMN IF EXISTS costo_materiales CASCADE;
ALTER TABLE ordenes_trabajo DROP COLUMN IF EXISTS costo_mano_obra  CASCADE;
ALTER TABLE ordenes_trabajo DROP COLUMN IF EXISTS costo_total      CASCADE;

-- Drop tecnico_id (assignments now use workspace membership)
ALTER TABLE ordenes_trabajo DROP COLUMN IF EXISTS tecnico_id CASCADE;
