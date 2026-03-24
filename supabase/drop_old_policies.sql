-- ============================================================
-- PANGUI — Drop old conflicting RLS policies
-- These old planta_id-based policies bypass workspace isolation
-- because Postgres RLS uses OR logic between policies.
-- Run in Supabase SQL Editor
-- ============================================================

-- ── ordenes_trabajo ──────────────────────────────────────────
DROP POLICY IF EXISTS "ot: actualizar"                          ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot: jefe puede eliminar"                 ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot: tecnico puede eliminar canceladas"   ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot: tecnico puede insertar"              ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot: usuarios actualizan ordenes de su planta" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot: usuarios leen ordenes de su planta"  ON ordenes_trabajo;

-- ── activos ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "activos: misma planta"                   ON activos;

-- ── archivos_orden ───────────────────────────────────────────
DROP POLICY IF EXISTS "archivos: misma planta"                  ON archivos_orden;

-- ── auditoria_ot ─────────────────────────────────────────────
DROP POLICY IF EXISTS "service role inserts auditoria"          ON auditoria_ot;
DROP POLICY IF EXISTS "plant members can read auditoria"        ON auditoria_ot;

-- ── capacitacion_asistentes ──────────────────────────────────
DROP POLICY IF EXISTS "cap_asistentes_insert"                   ON capacitacion_asistentes;
DROP POLICY IF EXISTS "cap_asistentes_access"                   ON capacitacion_asistentes;

-- ── capacitaciones ───────────────────────────────────────────
DROP POLICY IF EXISTS "capacitaciones_access"                   ON capacitaciones;

-- ── categorias_ot ────────────────────────────────────────────
DROP POLICY IF EXISTS "categorias: eliminar"                    ON categorias_ot;
DROP POLICY IF EXISTS "categorias: crear"                       ON categorias_ot;
DROP POLICY IF EXISTS "categorias: ver"                         ON categorias_ot;
DROP POLICY IF EXISTS "categorias: modificar"                   ON categorias_ot;

-- ── cuadrilla_usuarios ───────────────────────────────────────
DROP POLICY IF EXISTS "cuadrilla_usuarios_access"               ON cuadrilla_usuarios;
DROP POLICY IF EXISTS "cuadrilla_usuarios_insert"               ON cuadrilla_usuarios;

-- ── cuadrillas ───────────────────────────────────────────────
DROP POLICY IF EXISTS "cuadrillas_access"                       ON cuadrillas;

-- ── incidentes ───────────────────────────────────────────────
DROP POLICY IF EXISTS "incidentes_access"                       ON incidentes;

-- ── materiales_usados ────────────────────────────────────────
DROP POLICY IF EXISTS "mat: tecnico puede insertar"             ON materiales_usados;
DROP POLICY IF EXISTS "mat: tecnico puede actualizar los suyos" ON materiales_usados;
DROP POLICY IF EXISTS "mat: leer materiales de órdenes visibles" ON materiales_usados;
DROP POLICY IF EXISTS "mat: tecnico puede eliminar los suyos"   ON materiales_usados;

-- ── mediciones_ambientales ───────────────────────────────────
DROP POLICY IF EXISTS "mediciones_access"                       ON mediciones_ambientales;

-- ── partes ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "planta access"                           ON partes;
DROP POLICY IF EXISTS "materiales_insert_jefe"                  ON partes;
DROP POLICY IF EXISTS "materiales_planta"                       ON partes;
DROP POLICY IF EXISTS "materiales_update_jefe"                  ON partes;

-- ── pasos_plantilla ──────────────────────────────────────────
DROP POLICY IF EXISTS "pasos: misma planta"                     ON pasos_plantilla;

-- ── permisos_usuario ─────────────────────────────────────────
DROP POLICY IF EXISTS "permisos: leer propios"                  ON permisos_usuario;
DROP POLICY IF EXISTS "permisos: admin puede gestionar"         ON permisos_usuario;

-- ── plantillas_procedimiento ─────────────────────────────────
DROP POLICY IF EXISTS "plantillas: misma planta"                ON plantillas_procedimiento;

-- ── presupuestos ─────────────────────────────────────────────
DROP POLICY IF EXISTS "presupuestos_access"                     ON presupuestos;

-- ── preventivos ──────────────────────────────────────────────
DROP POLICY IF EXISTS "jefe_own_plant"                          ON preventivos;

-- ── proveedores ──────────────────────────────────────────────
DROP POLICY IF EXISTS "proveedores_planta"                      ON proveedores;
DROP POLICY IF EXISTS "proveedores_access"                      ON proveedores;
DROP POLICY IF EXISTS "planta access"                           ON proveedores;

-- ── activo_materiales ────────────────────────────────────────
DROP POLICY IF EXISTS "activo_materiales_insert"                ON activo_materiales;
DROP POLICY IF EXISTS "activo_materiales_access"                ON activo_materiales;

-- ── usuarios ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "usuarios: leer misma planta"             ON usuarios;

-- ── Backfill workspace_id on all rows that still have NULL ───
UPDATE ordenes_trabajo  SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE activos          SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE partes           SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE ubicaciones      SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE proveedores      SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE cuadrillas       SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE plantillas_procedimiento SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE categorias_ot    SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE incidentes       SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE presupuestos     SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE preventivos      SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE capacitaciones   SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
UPDATE mediciones_ambientales SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;

-- ── Verify: only workspace-based policies remain ─────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'ordenes_trabajo';
