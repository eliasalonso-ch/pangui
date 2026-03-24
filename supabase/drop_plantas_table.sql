-- ============================================================
-- PANGUI — Drop plantas table and all planta_id columns
-- Run in Supabase SQL Editor AFTER running drop_old_policies.sql
-- and after all workspace_id backfills are confirmed.
-- ============================================================

-- ── Step 1: Drop planta_id columns from all tables ───────────

ALTER TABLE usuarios                  DROP COLUMN IF EXISTS planta_id;
ALTER TABLE ordenes_trabajo           DROP COLUMN IF EXISTS planta_id;
ALTER TABLE activos                   DROP COLUMN IF EXISTS planta_id;
ALTER TABLE partes                    DROP COLUMN IF EXISTS planta_id;
ALTER TABLE proveedores               DROP COLUMN IF EXISTS planta_id;
ALTER TABLE cuadrillas                DROP COLUMN IF EXISTS planta_id;
ALTER TABLE plantillas_procedimiento  DROP COLUMN IF EXISTS planta_id;
ALTER TABLE pasos_plantilla           DROP COLUMN IF EXISTS planta_id;
ALTER TABLE categorias_ot             DROP COLUMN IF EXISTS planta_id;
ALTER TABLE incidentes                DROP COLUMN IF EXISTS planta_id;
ALTER TABLE presupuestos              DROP COLUMN IF EXISTS planta_id;
ALTER TABLE preventivos               DROP COLUMN IF EXISTS planta_id;
ALTER TABLE capacitaciones            DROP COLUMN IF EXISTS planta_id;
ALTER TABLE mediciones_ambientales    DROP COLUMN IF EXISTS planta_id;
ALTER TABLE archivos_orden            DROP COLUMN IF EXISTS planta_id;
ALTER TABLE materiales_usados         DROP COLUMN IF EXISTS planta_id;
ALTER TABLE auditoria_ot              DROP COLUMN IF EXISTS planta_id;
ALTER TABLE cuadrilla_usuarios        DROP COLUMN IF EXISTS planta_id;
ALTER TABLE capacitacion_asistentes   DROP COLUMN IF EXISTS planta_id;
ALTER TABLE activo_materiales         DROP COLUMN IF EXISTS planta_id;

-- ── Step 2: Drop legacy helper functions ─────────────────────

DROP FUNCTION IF EXISTS fn_mi_planta();
DROP FUNCTION IF EXISTS my_planta_id();

-- ── Step 3: Drop legacy indexes ──────────────────────────────

DROP INDEX IF EXISTS idx_ot_planta_estado;

-- ── Step 4: Drop the plantas table ───────────────────────────

DROP TABLE IF EXISTS plantas CASCADE;

-- ── Verify ───────────────────────────────────────────────────

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'plantas';
-- Should return 0 rows
