-- ============================================================
-- PANGUI — Row Level Security (Multi-Tenant Isolation)
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ── Helper function ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_planta_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT planta_id FROM public.usuarios WHERE id = auth.uid()
$$;


-- ============================================================
-- A) TABLES WITH planta_id
-- ============================================================

-- ── usuarios ────────────────────────────────────────────────
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "usuarios_select" ON usuarios;
DROP POLICY IF EXISTS "usuarios_update" ON usuarios;
CREATE POLICY "usuarios_select" ON usuarios FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "usuarios_update" ON usuarios FOR UPDATE USING (planta_id = my_planta_id());

-- ── ordenes_trabajo ─────────────────────────────────────────
ALTER TABLE ordenes_trabajo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ot_select" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_insert" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_update" ON ordenes_trabajo;
DROP POLICY IF EXISTS "ot_delete" ON ordenes_trabajo;
CREATE POLICY "ot_select" ON ordenes_trabajo FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "ot_insert" ON ordenes_trabajo FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "ot_update" ON ordenes_trabajo FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "ot_delete" ON ordenes_trabajo FOR DELETE USING (planta_id = my_planta_id());

-- ── activos ─────────────────────────────────────────────────
ALTER TABLE activos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activos_select" ON activos;
DROP POLICY IF EXISTS "activos_insert" ON activos;
DROP POLICY IF EXISTS "activos_update" ON activos;
DROP POLICY IF EXISTS "activos_delete" ON activos;
CREATE POLICY "activos_select" ON activos FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "activos_insert" ON activos FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "activos_update" ON activos FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "activos_delete" ON activos FOR DELETE USING (planta_id = my_planta_id());

-- ── partes ──────────────────────────────────────────────────
ALTER TABLE partes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partes_select" ON partes;
DROP POLICY IF EXISTS "partes_insert" ON partes;
DROP POLICY IF EXISTS "partes_update" ON partes;
DROP POLICY IF EXISTS "partes_delete" ON partes;
CREATE POLICY "partes_select" ON partes FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "partes_insert" ON partes FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "partes_update" ON partes FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "partes_delete" ON partes FOR DELETE USING (planta_id = my_planta_id());

-- ── clientes ────────────────────────────────────────────────
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clientes_select" ON clientes;
DROP POLICY IF EXISTS "clientes_insert" ON clientes;
DROP POLICY IF EXISTS "clientes_update" ON clientes;
DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "clientes_insert" ON clientes FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (planta_id = my_planta_id());

-- ── preventivos ─────────────────────────────────────────────
ALTER TABLE preventivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "preventivos_select" ON preventivos;
DROP POLICY IF EXISTS "preventivos_insert" ON preventivos;
DROP POLICY IF EXISTS "preventivos_update" ON preventivos;
DROP POLICY IF EXISTS "preventivos_delete" ON preventivos;
CREATE POLICY "preventivos_select" ON preventivos FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "preventivos_insert" ON preventivos FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "preventivos_update" ON preventivos FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "preventivos_delete" ON preventivos FOR DELETE USING (planta_id = my_planta_id());

-- ── cuadrillas ──────────────────────────────────────────────
ALTER TABLE cuadrillas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cuadrillas_select" ON cuadrillas;
DROP POLICY IF EXISTS "cuadrillas_insert" ON cuadrillas;
DROP POLICY IF EXISTS "cuadrillas_update" ON cuadrillas;
DROP POLICY IF EXISTS "cuadrillas_delete" ON cuadrillas;
CREATE POLICY "cuadrillas_select" ON cuadrillas FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "cuadrillas_insert" ON cuadrillas FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "cuadrillas_update" ON cuadrillas FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "cuadrillas_delete" ON cuadrillas FOR DELETE USING (planta_id = my_planta_id());

-- ── ubicaciones ─────────────────────────────────────────────
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ubicaciones_select" ON ubicaciones;
DROP POLICY IF EXISTS "ubicaciones_insert" ON ubicaciones;
DROP POLICY IF EXISTS "ubicaciones_update" ON ubicaciones;
DROP POLICY IF EXISTS "ubicaciones_delete" ON ubicaciones;
CREATE POLICY "ubicaciones_select" ON ubicaciones FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "ubicaciones_insert" ON ubicaciones FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "ubicaciones_update" ON ubicaciones FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "ubicaciones_delete" ON ubicaciones FOR DELETE USING (planta_id = my_planta_id());

-- ── proveedores ─────────────────────────────────────────────
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proveedores_select" ON proveedores;
DROP POLICY IF EXISTS "proveedores_insert" ON proveedores;
DROP POLICY IF EXISTS "proveedores_update" ON proveedores;
DROP POLICY IF EXISTS "proveedores_delete" ON proveedores;
CREATE POLICY "proveedores_select" ON proveedores FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "proveedores_insert" ON proveedores FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "proveedores_update" ON proveedores FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "proveedores_delete" ON proveedores FOR DELETE USING (planta_id = my_planta_id());

-- ── categorias_ot ───────────────────────────────────────────
ALTER TABLE categorias_ot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categorias_ot_select" ON categorias_ot;
DROP POLICY IF EXISTS "categorias_ot_insert" ON categorias_ot;
DROP POLICY IF EXISTS "categorias_ot_update" ON categorias_ot;
CREATE POLICY "categorias_ot_select" ON categorias_ot FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "categorias_ot_insert" ON categorias_ot FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "categorias_ot_update" ON categorias_ot FOR UPDATE USING (planta_id = my_planta_id());

-- ── plantillas_procedimiento ────────────────────────────────
ALTER TABLE plantillas_procedimiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plantillas_select" ON plantillas_procedimiento;
DROP POLICY IF EXISTS "plantillas_insert" ON plantillas_procedimiento;
DROP POLICY IF EXISTS "plantillas_update" ON plantillas_procedimiento;
DROP POLICY IF EXISTS "plantillas_delete" ON plantillas_procedimiento;
CREATE POLICY "plantillas_select" ON plantillas_procedimiento FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "plantillas_insert" ON plantillas_procedimiento FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "plantillas_update" ON plantillas_procedimiento FOR UPDATE USING (planta_id = my_planta_id());
CREATE POLICY "plantillas_delete" ON plantillas_procedimiento FOR DELETE USING (planta_id = my_planta_id());

-- ── presupuestos ────────────────────────────────────────────
ALTER TABLE presupuestos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presupuestos_select" ON presupuestos;
DROP POLICY IF EXISTS "presupuestos_insert" ON presupuestos;
DROP POLICY IF EXISTS "presupuestos_update" ON presupuestos;
CREATE POLICY "presupuestos_select" ON presupuestos FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "presupuestos_insert" ON presupuestos FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "presupuestos_update" ON presupuestos FOR UPDATE USING (planta_id = my_planta_id());

-- ── incidentes ──────────────────────────────────────────────
ALTER TABLE incidentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "incidentes_select" ON incidentes;
DROP POLICY IF EXISTS "incidentes_insert" ON incidentes;
DROP POLICY IF EXISTS "incidentes_update" ON incidentes;
CREATE POLICY "incidentes_select" ON incidentes FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "incidentes_insert" ON incidentes FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "incidentes_update" ON incidentes FOR UPDATE USING (planta_id = my_planta_id());

-- ── capacitaciones ──────────────────────────────────────────
ALTER TABLE capacitaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "capacitaciones_select" ON capacitaciones;
DROP POLICY IF EXISTS "capacitaciones_insert" ON capacitaciones;
DROP POLICY IF EXISTS "capacitaciones_update" ON capacitaciones;
CREATE POLICY "capacitaciones_select" ON capacitaciones FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "capacitaciones_insert" ON capacitaciones FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "capacitaciones_update" ON capacitaciones FOR UPDATE USING (planta_id = my_planta_id());

-- ── mediciones_ambientales ──────────────────────────────────
ALTER TABLE mediciones_ambientales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mediciones_select" ON mediciones_ambientales;
DROP POLICY IF EXISTS "mediciones_insert" ON mediciones_ambientales;
DROP POLICY IF EXISTS "mediciones_update" ON mediciones_ambientales;
CREATE POLICY "mediciones_select" ON mediciones_ambientales FOR SELECT USING (planta_id = my_planta_id());
CREATE POLICY "mediciones_insert" ON mediciones_ambientales FOR INSERT WITH CHECK (planta_id = my_planta_id());
CREATE POLICY "mediciones_update" ON mediciones_ambientales FOR UPDATE USING (planta_id = my_planta_id());


-- ============================================================
-- B) CHILD TABLES — isolation via FK join
-- ============================================================

-- ── archivos_orden ──────────────────────────────────────────
ALTER TABLE archivos_orden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "archivos_orden_select" ON archivos_orden;
DROP POLICY IF EXISTS "archivos_orden_insert" ON archivos_orden;
DROP POLICY IF EXISTS "archivos_orden_delete" ON archivos_orden;
CREATE POLICY "archivos_orden_select" ON archivos_orden FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = archivos_orden.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);
CREATE POLICY "archivos_orden_insert" ON archivos_orden FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = archivos_orden.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);
CREATE POLICY "archivos_orden_delete" ON archivos_orden FOR DELETE USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = archivos_orden.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);

-- ── comentarios_orden ───────────────────────────────────────
ALTER TABLE comentarios_orden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "comentarios_select" ON comentarios_orden;
DROP POLICY IF EXISTS "comentarios_insert" ON comentarios_orden;
CREATE POLICY "comentarios_select" ON comentarios_orden FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = comentarios_orden.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);
CREATE POLICY "comentarios_insert" ON comentarios_orden FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = comentarios_orden.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);

-- ── materiales_usados ───────────────────────────────────────
ALTER TABLE materiales_usados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "materiales_select" ON materiales_usados;
DROP POLICY IF EXISTS "materiales_insert" ON materiales_usados;
CREATE POLICY "materiales_select" ON materiales_usados FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = materiales_usados.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);
CREATE POLICY "materiales_insert" ON materiales_usados FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = materiales_usados.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);

-- ── auditoria_ot ────────────────────────────────────────────
ALTER TABLE auditoria_ot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auditoria_select" ON auditoria_ot;
DROP POLICY IF EXISTS "auditoria_insert" ON auditoria_ot;
CREATE POLICY "auditoria_select" ON auditoria_ot FOR SELECT USING (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = auditoria_ot.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);
CREATE POLICY "auditoria_insert" ON auditoria_ot FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM ordenes_trabajo WHERE ordenes_trabajo.id = auditoria_ot.orden_id AND ordenes_trabajo.planta_id = my_planta_id())
);

-- ── pasos_plantilla ─────────────────────────────────────────
ALTER TABLE pasos_plantilla ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pasos_select" ON pasos_plantilla;
DROP POLICY IF EXISTS "pasos_insert" ON pasos_plantilla;
DROP POLICY IF EXISTS "pasos_update" ON pasos_plantilla;
DROP POLICY IF EXISTS "pasos_delete" ON pasos_plantilla;
CREATE POLICY "pasos_select" ON pasos_plantilla FOR SELECT USING (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.planta_id = my_planta_id())
);
CREATE POLICY "pasos_insert" ON pasos_plantilla FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.planta_id = my_planta_id())
);
CREATE POLICY "pasos_update" ON pasos_plantilla FOR UPDATE USING (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.planta_id = my_planta_id())
);
CREATE POLICY "pasos_delete" ON pasos_plantilla FOR DELETE USING (
  EXISTS (SELECT 1 FROM plantillas_procedimiento WHERE plantillas_procedimiento.id = pasos_plantilla.plantilla_id AND plantillas_procedimiento.planta_id = my_planta_id())
);

-- ── cuadrilla_usuarios ──────────────────────────────────────
ALTER TABLE cuadrilla_usuarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cuadrilla_usr_select" ON cuadrilla_usuarios;
DROP POLICY IF EXISTS "cuadrilla_usr_insert" ON cuadrilla_usuarios;
DROP POLICY IF EXISTS "cuadrilla_usr_delete" ON cuadrilla_usuarios;
CREATE POLICY "cuadrilla_usr_select" ON cuadrilla_usuarios FOR SELECT USING (
  EXISTS (SELECT 1 FROM cuadrillas WHERE cuadrillas.id = cuadrilla_usuarios.cuadrilla_id AND cuadrillas.planta_id = my_planta_id())
);
CREATE POLICY "cuadrilla_usr_insert" ON cuadrilla_usuarios FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM cuadrillas WHERE cuadrillas.id = cuadrilla_usuarios.cuadrilla_id AND cuadrillas.planta_id = my_planta_id())
);
CREATE POLICY "cuadrilla_usr_delete" ON cuadrilla_usuarios FOR DELETE USING (
  EXISTS (SELECT 1 FROM cuadrillas WHERE cuadrillas.id = cuadrilla_usuarios.cuadrilla_id AND cuadrillas.planta_id = my_planta_id())
);

-- ── capacitacion_asistentes ─────────────────────────────────
ALTER TABLE capacitacion_asistentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cap_asist_select" ON capacitacion_asistentes;
DROP POLICY IF EXISTS "cap_asist_insert" ON capacitacion_asistentes;
CREATE POLICY "cap_asist_select" ON capacitacion_asistentes FOR SELECT USING (
  EXISTS (SELECT 1 FROM capacitaciones WHERE capacitaciones.id = capacitacion_asistentes.capacitacion_id AND capacitaciones.planta_id = my_planta_id())
);
CREATE POLICY "cap_asist_insert" ON capacitacion_asistentes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM capacitaciones WHERE capacitaciones.id = capacitacion_asistentes.capacitacion_id AND capacitaciones.planta_id = my_planta_id())
);

-- ── activo_materiales ───────────────────────────────────────
ALTER TABLE activo_materiales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "activo_mat_select" ON activo_materiales;
DROP POLICY IF EXISTS "activo_mat_insert" ON activo_materiales;
DROP POLICY IF EXISTS "activo_mat_delete" ON activo_materiales;
CREATE POLICY "activo_mat_select" ON activo_materiales FOR SELECT USING (
  EXISTS (SELECT 1 FROM activos WHERE activos.id = activo_materiales.activo_id AND activos.planta_id = my_planta_id())
);
CREATE POLICY "activo_mat_insert" ON activo_materiales FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM activos WHERE activos.id = activo_materiales.activo_id AND activos.planta_id = my_planta_id())
);
CREATE POLICY "activo_mat_delete" ON activo_materiales FOR DELETE USING (
  EXISTS (SELECT 1 FROM activos WHERE activos.id = activo_materiales.activo_id AND activos.planta_id = my_planta_id())
);


-- ============================================================
-- C) USER-SCOPED TABLES
-- ============================================================

-- ── notifications ───────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_select" ON notifications;
DROP POLICY IF EXISTS "notif_insert" ON notifications;
DROP POLICY IF EXISTS "notif_update" ON notifications;
CREATE POLICY "notif_select" ON notifications FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "notif_insert" ON notifications FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "notif_update" ON notifications FOR UPDATE USING (usuario_id = auth.uid());

-- ── permisos_usuario ────────────────────────────────────────
ALTER TABLE permisos_usuario ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "permisos_select_own" ON permisos_usuario;
CREATE POLICY "permisos_select_own" ON permisos_usuario FOR SELECT USING (usuario_id = auth.uid());

-- ── push_subscriptions ──────────────────────────────────────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_select" ON push_subscriptions;
DROP POLICY IF EXISTS "push_insert" ON push_subscriptions;
DROP POLICY IF EXISTS "push_delete" ON push_subscriptions;
CREATE POLICY "push_select" ON push_subscriptions FOR SELECT USING (usuario_id = auth.uid());
CREATE POLICY "push_insert" ON push_subscriptions FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "push_delete" ON push_subscriptions FOR DELETE USING (usuario_id = auth.uid());

-- ── feedback ────────────────────────────────────────────────
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedback_insert" ON feedback;
DROP POLICY IF EXISTS "feedback_select" ON feedback;
CREATE POLICY "feedback_insert" ON feedback FOR INSERT WITH CHECK (usuario_id = auth.uid());
CREATE POLICY "feedback_select" ON feedback FOR SELECT USING (
  EXISTS (SELECT 1 FROM usuarios WHERE usuarios.id = feedback.usuario_id AND usuarios.planta_id = my_planta_id())
);

-- ── solicitudes_arco ────────────────────────────────────────
-- This is a PUBLIC form (anyone can submit an ARCO request
-- without being logged in). No user/plant FK exists.
-- INSERT: open to everyone (public form, no auth required).
-- SELECT/UPDATE: only authenticated users (admin check is
--   enforced at the app level in arco-solicitudes/page.js).
ALTER TABLE solicitudes_arco ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "arco_select" ON solicitudes_arco;
DROP POLICY IF EXISTS "arco_insert" ON solicitudes_arco;
DROP POLICY IF EXISTS "arco_update" ON solicitudes_arco;
CREATE POLICY "arco_insert" ON solicitudes_arco FOR INSERT WITH CHECK (true);
CREATE POLICY "arco_select" ON solicitudes_arco FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "arco_update" ON solicitudes_arco FOR UPDATE USING (auth.uid() IS NOT NULL);


-- ============================================================
-- D) LOOKUP / SHARED TABLES
-- ============================================================

-- ── fabricantes ─────────────────────────────────────────────
ALTER TABLE fabricantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fabricantes_select" ON fabricantes;
DROP POLICY IF EXISTS "fabricantes_insert" ON fabricantes;
CREATE POLICY "fabricantes_select" ON fabricantes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "fabricantes_insert" ON fabricantes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── modelos ─────────────────────────────────────────────────
ALTER TABLE modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "modelos_select" ON modelos;
DROP POLICY IF EXISTS "modelos_insert" ON modelos;
CREATE POLICY "modelos_select" ON modelos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "modelos_insert" ON modelos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── tipos_parte ─────────────────────────────────────────────
ALTER TABLE tipos_parte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tipos_parte_select" ON tipos_parte;
DROP POLICY IF EXISTS "tipos_parte_insert" ON tipos_parte;
CREATE POLICY "tipos_parte_select" ON tipos_parte FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "tipos_parte_insert" ON tipos_parte FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ── plantas ─────────────────────────────────────────────────
ALTER TABLE plantas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plantas_select" ON plantas;
DROP POLICY IF EXISTS "plantas_update" ON plantas;
CREATE POLICY "plantas_select" ON plantas FOR SELECT USING (id = my_planta_id());
CREATE POLICY "plantas_update" ON plantas FOR UPDATE USING (id = my_planta_id());
