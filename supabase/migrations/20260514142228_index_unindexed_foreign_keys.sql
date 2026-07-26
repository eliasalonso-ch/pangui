
-- ordenes_trabajo
CREATE INDEX IF NOT EXISTS idx_fk_ot_activo_id       ON public.ordenes_trabajo (activo_id);
CREATE INDEX IF NOT EXISTS idx_fk_ot_creado_por       ON public.ordenes_trabajo (creado_por);
CREATE INDEX IF NOT EXISTS idx_fk_ot_lugar_id         ON public.ordenes_trabajo (lugar_id);
CREATE INDEX IF NOT EXISTS idx_fk_ot_plantilla_id     ON public.ordenes_trabajo (plantilla_id);
CREATE INDEX IF NOT EXISTS idx_fk_ot_ubicacion_id     ON public.ordenes_trabajo (ubicacion_id);

-- actividad_ot / auditoria_ot
CREATE INDEX IF NOT EXISTS idx_fk_actividad_usuario_id  ON public.actividad_ot (usuario_id);
CREATE INDEX IF NOT EXISTS idx_fk_auditoria_usuario_id  ON public.auditoria_ot (usuario_id);

-- activos
CREATE INDEX IF NOT EXISTS idx_fk_activos_activo_padre_id ON public.activos (activo_padre_id);
CREATE INDEX IF NOT EXISTS idx_fk_activos_fabricante_id   ON public.activos (fabricante_id);
CREATE INDEX IF NOT EXISTS idx_fk_activos_modelo_id       ON public.activos (modelo_id);
CREATE INDEX IF NOT EXISTS idx_fk_activos_proveedor_id    ON public.activos (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_fk_activos_responsable_id  ON public.activos (responsable_id);
CREATE INDEX IF NOT EXISTS idx_fk_activos_ubicacion_id    ON public.activos (ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_fk_activos_workspace_id    ON public.activos (workspace_id);

-- activo_materiales
CREATE INDEX IF NOT EXISTS idx_fk_activo_materiales_material_id ON public.activo_materiales (material_id);

-- alerta_enviada
CREATE INDEX IF NOT EXISTS idx_fk_alerta_enviada_workspace_id ON public.alerta_enviada (workspace_id);

-- archivos_orden
CREATE INDEX IF NOT EXISTS idx_fk_archivos_orden_orden_id ON public.archivos_orden (orden_id);

-- capacitacion_asistentes
CREATE INDEX IF NOT EXISTS idx_fk_cap_asistentes_usuario_id ON public.capacitacion_asistentes (usuario_id);

-- comentarios_orden
CREATE INDEX IF NOT EXISTS idx_fk_comentarios_usuario_id ON public.comentarios_orden (usuario_id);

-- cuadrilla_usuarios
CREATE INDEX IF NOT EXISTS idx_fk_cuadrilla_usuario_id ON public.cuadrilla_usuarios (usuario_id);

-- feedback
CREATE INDEX IF NOT EXISTS idx_fk_feedback_usuario_id ON public.feedback (usuario_id);

-- foto_grupos
CREATE INDEX IF NOT EXISTS idx_fk_foto_grupos_created_by ON public.foto_grupos (created_by);

-- hitos
CREATE INDEX IF NOT EXISTS idx_fk_hitos_workspace_id ON public.hitos (workspace_id);

-- hojas_inventario
CREATE INDEX IF NOT EXISTS idx_fk_hojas_created_by       ON public.hojas_inventario (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_hojas_levantamiento_id ON public.hojas_inventario (levantamiento_id);

-- incidentes
CREATE INDEX IF NOT EXISTS idx_fk_incidentes_trabajador_id ON public.incidentes (trabajador_id);

-- levantamientos
CREATE INDEX IF NOT EXISTS idx_fk_lev_asignado_a   ON public.levantamientos (asignado_a);
CREATE INDEX IF NOT EXISTS idx_fk_lev_creado_por   ON public.levantamientos (creado_por);
CREATE INDEX IF NOT EXISTS idx_fk_lev_orden_id     ON public.levantamientos (orden_id);
CREATE INDEX IF NOT EXISTS idx_fk_lev_sociedad_id  ON public.levantamientos (sociedad_id);
CREATE INDEX IF NOT EXISTS idx_fk_lev_ubicacion_id ON public.levantamientos (ubicacion_id);

-- levantamiento_actividad
CREATE INDEX IF NOT EXISTS idx_fk_lev_actividad_usuario_id ON public.levantamiento_actividad (usuario_id);

-- levantamiento_foto_grupos
CREATE INDEX IF NOT EXISTS idx_fk_lev_foto_grupos_created_by   ON public.levantamiento_foto_grupos (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_lev_foto_grupos_workspace_id ON public.levantamiento_foto_grupos (workspace_id);

-- levantamiento_materiales
CREATE INDEX IF NOT EXISTS idx_fk_lev_materiales_parte_id ON public.levantamiento_materiales (parte_id);

-- lugares
CREATE INDEX IF NOT EXISTS idx_fk_lugares_ubicacion_id ON public.lugares (ubicacion_id);

-- materiales_usados
CREATE INDEX IF NOT EXISTS idx_fk_materiales_usados_material_id ON public.materiales_usados (material_id);

-- mediciones_ambientales
CREATE INDEX IF NOT EXISTS idx_fk_mediciones_responsable_id ON public.mediciones_ambientales (responsable_id);

-- ot_procedimientos
CREATE INDEX IF NOT EXISTS idx_fk_otp_adjuntado_por    ON public.ot_procedimientos (adjuntado_por);
CREATE INDEX IF NOT EXISTS idx_fk_otp_procedimiento_id ON public.ot_procedimientos (procedimiento_id);

-- partes
CREATE INDEX IF NOT EXISTS idx_fk_partes_activo_id    ON public.partes (activo_id);
CREATE INDEX IF NOT EXISTS idx_fk_partes_proveedor_id ON public.partes (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_fk_partes_tipo_id      ON public.partes (tipo_parte_id);
CREATE INDEX IF NOT EXISTS idx_fk_partes_ubicacion_id ON public.partes (ubicacion_id);

-- paso_respuestas
CREATE INDEX IF NOT EXISTS idx_fk_resp_firmado_por_id ON public.paso_respuestas (firmado_por_id);
CREATE INDEX IF NOT EXISTS idx_fk_resp_respondido_por ON public.paso_respuestas (respondido_por);

-- pasos_plantilla
CREATE INDEX IF NOT EXISTS idx_fk_pasos_plantilla_id ON public.pasos_plantilla (plantilla_id);

-- plantillas_procedimiento
CREATE INDEX IF NOT EXISTS idx_fk_plantillas_categoria_id ON public.plantillas_procedimiento (categoria_id);

-- preventivos
CREATE INDEX IF NOT EXISTS idx_fk_prev_activo_id    ON public.preventivos (activo_id);
CREATE INDEX IF NOT EXISTS idx_fk_prev_categoria_id ON public.preventivos (categoria_id);
CREATE INDEX IF NOT EXISTS idx_fk_prev_pauta_id     ON public.preventivos (pauta_id);
CREATE INDEX IF NOT EXISTS idx_fk_prev_tecnico_id   ON public.preventivos (tecnico_id);
CREATE INDEX IF NOT EXISTS idx_fk_prev_ubicacion_id ON public.preventivos (ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_fk_prev_workspace_id ON public.preventivos (workspace_id);

-- procedimiento_ejecuciones
CREATE INDEX IF NOT EXISTS idx_fk_ejec_completado_por ON public.procedimiento_ejecuciones (completado_por);
CREATE INDEX IF NOT EXISTS idx_fk_ejec_iniciado_por   ON public.procedimiento_ejecuciones (iniciado_por);

-- procedimientos
CREATE INDEX IF NOT EXISTS idx_fk_proc_created_by ON public.procedimientos (created_by);

-- proveedores
CREATE INDEX IF NOT EXISTS idx_fk_proveedores_workspace_id ON public.proveedores (workspace_id);

-- solicitudes
CREATE INDEX IF NOT EXISTS idx_fk_sol_hito_id      ON public.solicitudes (hito_id);
CREATE INDEX IF NOT EXISTS idx_fk_sol_lugar_id     ON public.solicitudes (lugar_id);
CREATE INDEX IF NOT EXISTS idx_fk_sol_orden_id     ON public.solicitudes (orden_id);
CREATE INDEX IF NOT EXISTS idx_fk_sol_revisado_por ON public.solicitudes (revisado_por);
CREATE INDEX IF NOT EXISTS idx_fk_sol_sociedad_id  ON public.solicitudes (sociedad_id);
CREATE INDEX IF NOT EXISTS idx_fk_sol_ubicacion_id ON public.solicitudes (ubicacion_id);

-- ubicaciones
CREATE INDEX IF NOT EXISTS idx_fk_ubicaciones_sociedad_id ON public.ubicaciones (sociedad_id);
;
