-- ============================================================
-- PANGUI — Workspace Migration
-- Replaces planta_id with workspace_id for generic multi-tenancy
-- Run in Supabase SQL Editor
-- ============================================================


-- ── 1. Create workspaces table ──────────────────────────────
-- Mirrors the existing `plantas` structure but with a
-- generic name suitable for any Chilean business.

CREATE TABLE IF NOT EXISTS workspaces (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  sector     text,
  region     text,
  created_at timestamptz DEFAULT now()
);


-- ── 2. Migrate existing plantas → workspaces ────────────────
-- Copies all existing plant data into workspaces, keeping
-- the same IDs so foreign keys still match.

INSERT INTO workspaces (id, nombre, sector, region, created_at)
SELECT
  id,
  nombre,
  sector,
  region,
  COALESCE(created_at, now())
FROM plantas
ON CONFLICT (id) DO NOTHING;


-- ── 3. Add workspace_id to usuarios ─────────────────────────
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
UPDATE usuarios SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_workspace ON usuarios(workspace_id);


-- ── 4. Add workspace_id to all data tables ──────────────────

-- ordenes_trabajo
ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE ordenes_trabajo SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ot_workspace ON ordenes_trabajo(workspace_id);

-- activos
ALTER TABLE activos ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE activos SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activos_workspace ON activos(workspace_id);

-- partes
ALTER TABLE partes ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE partes SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partes_workspace ON partes(workspace_id);

-- clientes
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE clientes SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_workspace ON clientes(workspace_id);

-- preventivos
ALTER TABLE preventivos ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE preventivos SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_preventivos_workspace ON preventivos(workspace_id);

-- cuadrillas
ALTER TABLE cuadrillas ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE cuadrillas SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cuadrillas_workspace ON cuadrillas(workspace_id);

-- ubicaciones
ALTER TABLE ubicaciones ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE ubicaciones SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ubicaciones_workspace ON ubicaciones(workspace_id);

-- proveedores
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE proveedores SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proveedores_workspace ON proveedores(workspace_id);

-- categorias_ot
ALTER TABLE categorias_ot ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE categorias_ot SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categorias_workspace ON categorias_ot(workspace_id);

-- plantillas_procedimiento
ALTER TABLE plantillas_procedimiento ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE plantillas_procedimiento SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plantillas_workspace ON plantillas_procedimiento(workspace_id);

-- presupuestos
ALTER TABLE presupuestos ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE presupuestos SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_presupuestos_workspace ON presupuestos(workspace_id);

-- incidentes
ALTER TABLE incidentes ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE incidentes SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidentes_workspace ON incidentes(workspace_id);

-- capacitaciones
ALTER TABLE capacitaciones ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE capacitaciones SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_capacitaciones_workspace ON capacitaciones(workspace_id);

-- mediciones_ambientales
ALTER TABLE mediciones_ambientales ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
UPDATE mediciones_ambientales SET workspace_id = planta_id WHERE workspace_id IS NULL AND planta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mediciones_workspace ON mediciones_ambientales(workspace_id);


-- ── 5. Helper function using workspace_id ───────────────────
CREATE OR REPLACE FUNCTION my_workspace_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT workspace_id FROM public.usuarios WHERE id = auth.uid()
$$;


-- ── 6. Drop old planta_id-based RLS policies ────────────────
-- (from the previous rls_migration.sql run)

DO $$ DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'usuarios_select','usuarios_update',
        'ot_select','ot_insert','ot_update','ot_delete',
        'activos_select','activos_insert','activos_update','activos_delete',
        'partes_select','partes_insert','partes_update','partes_delete',
        'clientes_select','clientes_insert','clientes_update','clientes_delete',
        'preventivos_select','preventivos_insert','preventivos_update','preventivos_delete',
        'cuadrillas_select','cuadrillas_insert','cuadrillas_update','cuadrillas_delete',
        'ubicaciones_select','ubicaciones_insert','ubicaciones_update','ubicaciones_delete',
        'proveedores_select','proveedores_insert','proveedores_update','proveedores_delete',
        'categorias_ot_select','categorias_ot_insert','categorias_ot_update',
        'plantillas_select','plantillas_insert','plantillas_update','plantillas_delete',
        'presupuestos_select','presupuestos_insert','presupuestos_update',
        'incidentes_select','incidentes_insert','incidentes_update',
        'capacitaciones_select','capacitaciones_insert','capacitaciones_update',
        'mediciones_select','mediciones_insert','mediciones_update',
        'archivos_orden_select','archivos_orden_insert','archivos_orden_delete',
        'comentarios_select','comentarios_insert',
        'materiales_select','materiales_insert',
        'auditoria_select','auditoria_insert',
        'pasos_select','pasos_insert','pasos_update','pasos_delete',
        'cuadrilla_usr_select','cuadrilla_usr_insert','cuadrilla_usr_delete',
        'cap_asist_select','cap_asist_insert',
        'activo_mat_select','activo_mat_insert','activo_mat_delete',
        'notif_select','notif_insert','notif_update',
        'permisos_select_own',
        'push_select','push_insert','push_delete',
        'feedback_insert','feedback_select',
        'arco_insert','arco_select','arco_update',
        'fabricantes_select','fabricantes_insert',
        'modelos_select','modelos_insert',
        'tipos_parte_select','tipos_parte_insert',
        'plantas_select','plantas_update'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;


-- ── 7. New RLS policies using workspace_id ──────────────────

-- ── usuarios ────────────────────────────────────────────────
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE USING (workspace_id = my_workspace_id());

-- ── ordenes_trabajo ─────────────────────────────────────────
ALTER TABLE ordenes_trabajo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ot_select" ON ordenes_trabajo FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "ot_insert" ON ordenes_trabajo FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "ot_update" ON ordenes_trabajo FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "ot_delete" ON ordenes_trabajo FOR DELETE USING (workspace_id = my_workspace_id());

-- ── activos ─────────────────────────────────────────────────
ALTER TABLE activos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activos_select" ON activos FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "activos_insert" ON activos FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "activos_update" ON activos FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "activos_delete" ON activos FOR DELETE USING (workspace_id = my_workspace_id());

-- ── partes ──────────────────────────────────────────────────
ALTER TABLE partes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partes_select" ON partes FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "partes_insert" ON partes FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "partes_update" ON partes FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "partes_delete" ON partes FOR DELETE USING (workspace_id = my_workspace_id());

-- ── clientes ────────────────────────────────────────────────
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "clientes_insert" ON clientes FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (workspace_id = my_workspace_id());

-- ── preventivos ─────────────────────────────────────────────
ALTER TABLE preventivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preventivos_select" ON preventivos FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "preventivos_insert" ON preventivos FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "preventivos_update" ON preventivos FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "preventivos_delete" ON preventivos FOR DELETE USING (workspace_id = my_workspace_id());

-- ── cuadrillas ──────────────────────────────────────────────
ALTER TABLE cuadrillas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cuadrillas_select" ON cuadrillas FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "cuadrillas_insert" ON cuadrillas FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "cuadrillas_update" ON cuadrillas FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "cuadrillas_delete" ON cuadrillas FOR DELETE USING (workspace_id = my_workspace_id());

-- ── ubicaciones ─────────────────────────────────────────────
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ubicaciones_select" ON ubicaciones FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "ubicaciones_insert" ON ubicaciones FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "ubicaciones_update" ON ubicaciones FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "ubicaciones_delete" ON ubicaciones FOR DELETE USING (workspace_id = my_workspace_id());

-- ── proveedores ─────────────────────────────────────────────
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proveedores_select" ON proveedores FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "proveedores_insert" ON proveedores FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "proveedores_update" ON proveedores FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "proveedores_delete" ON proveedores FOR DELETE USING (workspace_id = my_workspace_id());

-- ── categorias_ot ───────────────────────────────────────────
ALTER TABLE categorias_ot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias_ot_select" ON categorias_ot FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "categorias_ot_insert" ON categorias_ot FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "categorias_ot_update" ON categorias_ot FOR UPDATE USING (workspace_id = my_workspace_id());

-- ── plantillas_procedimiento ────────────────────────────────
ALTER TABLE plantillas_procedimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plantillas_select" ON plantillas_procedimiento FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "plantillas_insert" ON plantillas_procedimiento FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "plantillas_update" ON plantillas_procedimiento FOR UPDATE USING (workspace_id = my_workspace_id());
CREATE POLICY "plantillas_delete" ON plantillas_procedimiento FOR DELETE USING (workspace_id = my_workspace_id());

-- ── presupuestos ────────────────────────────────────────────
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presupuestos_select" ON presupuestos FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "presupuestos_insert" ON presupuestos FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "presupuestos_update" ON presupuestos FOR UPDATE USING (workspace_id = my_workspace_id());

-- ── incidentes ──────────────────────────────────────────────
ALTER TABLE incidentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "incidentes_select" ON incidentes FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "incidentes_insert" ON incidentes FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "incidentes_update" ON incidentes FOR UPDATE USING (workspace_id = my_workspace_id());

-- ── capacitaciones ──────────────────────────────────────────
ALTER TABLE capacitaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capacitaciones_select" ON capacitaciones FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "capacitaciones_insert" ON capacitaciones FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "capacitaciones_update" ON capacitaciones FOR UPDATE USING (workspace_id = my_workspace_id());

-- ── mediciones_ambientales ──────────────────────────────────
ALTER TABLE mediciones_ambientales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mediciones_select" ON mediciones_ambientales FOR SELECT USING (workspace_id = my_workspace_id());
CREATE POLICY "mediciones_insert" ON mediciones_ambientales FOR INSERT WITH CHECK (workspace_id = my_workspace_id());
CREATE POLICY "mediciones_update" ON mediciones_ambientales FOR UPDATE USING (workspace_id = my_workspace_id());

-- ── archivos_orden ──────────────────────────────────────────
ALTER TABLE archivos_orden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "archivos_orden_select" ON archivos_orden FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = archivos_orden.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);
CREATE POLICY "archivos_orden_insert" ON archivos_orden FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = archivos_orden.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);
CREATE POLICY "archivos_orden_delete" ON archivos_orden FOR DELETE USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = archivos_orden.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);

-- ── comentarios_orden ───────────────────────────────────────
ALTER TABLE comentarios_orden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comentarios_select" ON comentarios_orden FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = comentarios_orden.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);
CREATE POLICY "comentarios_insert" ON comentarios_orden FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = comentarios_orden.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);

-- ── materiales_usados ───────────────────────────────────────
ALTER TABLE materiales_usados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "materiales_select" ON materiales_usados FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = materiales_usados.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);
CREATE POLICY "materiales_insert" ON materiales_usados FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = materiales_usados.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);

-- ── auditoria_ot ────────────────────────────────────────────
ALTER TABLE auditoria_ot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auditoria_select" ON auditoria_ot FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = auditoria_ot.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);
CREATE POLICY "auditoria_insert" ON auditoria_ot FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = auditoria_ot.orden_id AND ordenes_trabajo.workspace_id = my_workspace_id())
);

-- ── pasos_plantilla ─────────────────────────────────────────
ALTER TABLE pasos_plantilla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pasos_select" ON pasos_plantilla FOR SELECT USING (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.workspace_id = my_workspace_id())
);
CREATE POLICY "pasos_insert" ON pasos_plantilla FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.workspace_id = my_workspace_id())
);
CREATE POLICY "pasos_update" ON pasos_plantilla FOR UPDATE USING (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.workspace_id = my_workspace_id())
);
CREATE POLICY "pasos_delete" ON pasos_plantilla FOR DELETE USING (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.workspace_id = my_workspace_id())
);

-- ── cuadrilla_usuarios ──────────────────────────────────────
ALTER TABLE cuadrilla_usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cuadrilla_usr_select" ON cuadrilla_usuarios FOR SELECT USING (
  EXISTS (SELECT 1 FROM cuadrillas WHERE cuadrillas.id = cuadrilla_usuarios.cuadrilla_id AND cuadrillas.workspace_id = my_workspace_id())
);
CREATE POLICY "cuadrilla_usr_insert" ON cuadrilla_usuarios FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM cuadrillas WHERE cuadrillas.id = cuadrilla_usuarios.cuadrilla_id AND cuadrillas.workspace_id = my_workspace_id())
);
CREATE POLICY "cuadrilla_usr_delete" ON cuadrilla_usuarios FOR DELETE USING (
  EXISTS (SELECT 1 FROM cuadrillas WHERE cuadrillas.id = cuadrilla_usuarios.cuadrilla_id AND cuadrillas.workspace_id = my_workspace_id())
);

-- ── capacitacion_asistentes ─────────────────────────────────
ALTER TABLE capacitacion_asistentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cap_asist_select" ON capacitacion_asistentes FOR SELECT USING (
  EXISTS (SELECT 1 FROM capacitaciones WHERE capacitaciones.id = capacitacion_asistentes.capacitacion_id AND capacitaciones.workspace_id = my_workspace_id())
);
CREATE POLICY "cap_asist_insert" ON capacitacion_asistentes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM capacitaciones WHERE capacitaciones.id = capacitacion_asistentes.capacitacion_id AND capacitaciones.workspace_id = my_workspace_id())
);

-- ── activo_materiales ───────────────────────────────────────
ALTER TABLE activo_materiales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activo_mat_select" ON activo_materiales FOR SELECT USING (
  EXISTS (SELECT 1 FROM activos WHERE activos.id = activo_materiales.activo_id AND activos.workspace_id = my_workspace_id())
);
CREATE POLICY "activo_mat_insert" ON activo_materiales FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM activos WHERE activos.id = activo_materiales.activo_id AND activos.workspace_id = my_workspace_id())
);
CREATE POLICY "activo_mat_delete" ON activo_materiales FOR DELETE USING (
  EXISTS (SELECT 1 FROM activos WHERE activos.id = activo_materiales.activo_id AND activos.workspace_id = my_workspace_id())
);

-- ── notifications ───────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (usuario_id = auth.uid());

-- ── permisos_usuario ────────────────────────────────────────
ALTER TABLE permisos_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "permisos_select_own" ON permisos_usuario FOR SELECT USING (usuario_id = auth.uid());

-- ── push_subscriptions ──────────────────────────────────────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_select" ON push_subscriptions FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "push_insert" ON push_subscriptions FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "push_delete" ON push_subscriptions FOR DELETE USING (usuario_id = auth.uid());

-- ── feedback ────────────────────────────────────────────────
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback_insert" ON feedback FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "feedback_select" ON feedback FOR SELECT USING (
  EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = feedback.usuario_id AND usuarios.workspace_id = my_workspace_id())
);

-- ── solicitudes_arco (public form, no auth required) ────────
ALTER TABLE solicitudes_arco ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arco_insert" ON solicitudes_arco FOR INSERT WITH CHECK (true);
CREATE POLICY "arco_select" ON solicitudes_arco FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "arco_update" ON solicitudes_arco FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ── fabricantes / modelos / tipos_parte (shared lookups) ────
ALTER TABLE fabricantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fabricantes_select" ON fabricantes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fabricantes_insert" ON fabricantes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE modelos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modelos_select" ON modelos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "modelos_insert" ON modelos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE tipos_parte ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_parte_select" ON tipos_parte FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tipos_parte_insert" ON tipos_parte FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── workspaces (own workspace only) ─────────────────────────
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspaces_select" ON workspaces FOR SELECT USING (id = my_workspace_id());
CREATE POLICY "workspaces_update" ON workspaces FOR UPDATE USING (id = my_workspace_id());


-- ============================================================
-- DONE
-- Existing data: preserved via planta_id → workspace_id copy
-- New data:      must include workspace_id on every INSERT
--                (code update required — see notes below)
--
-- Next step: update app/api/registro/route.js and
-- app/api/invitar/route.js to set workspace_id instead of
-- (or in addition to) planta_id on new users/records.
-- ============================================================
