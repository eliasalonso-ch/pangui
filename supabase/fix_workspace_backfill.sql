-- ============================================================
-- PANGUI — Workspace Backfill Fix
-- Run in Supabase SQL Editor
-- Fixes users/rows where workspace_id is NULL but planta_id is set
-- ============================================================

-- ── 1. Diagnostic: see who is missing workspace_id ──────────
SELECT id, nombre, rol, planta_id, workspace_id
FROM usuarios
ORDER BY created_at;

-- ── 1b. Fix: copy any plantas that are missing from workspaces ─
INSERT INTO workspaces (id, nombre, sector, region, created_at)
SELECT p.id, p.nombre, p.sector, p.region, p.created_at
FROM plantas p
WHERE NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = p.id);

-- ── 2. Fix: sync workspace_id ↔ planta_id for all usuarios
-- Case A: has planta_id but missing workspace_id
UPDATE usuarios
SET workspace_id = planta_id
WHERE workspace_id IS NULL
  AND planta_id IS NOT NULL;

-- Case B: has workspace_id but missing planta_id (invited after workspace migration)
UPDATE usuarios
SET planta_id = workspace_id
WHERE planta_id IS NULL
  AND workspace_id IS NOT NULL;

-- ── 3. Fix: backfill workspace_id on all tables ──────────────
UPDATE ordenes_trabajo  SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE activos          SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE partes           SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE ubicaciones      SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE clientes         SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE proveedores      SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE cuadrillas       SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE plantillas_procedimiento SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE categorias_ot    SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE incidentes       SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE presupuestos     SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;

-- ── 4. Verify: check current RLS policies on ordenes_trabajo ─
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'ordenes_trabajo';

-- ── 5. Verify: confirm my_workspace_id function exists ───────
SELECT proname, prosecdef
FROM pg_proc
WHERE proname = 'my_workspace_id';
