
-- HIGH-FREQUENCY APP TABLES
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_creado_por    ON ordenes_trabajo(creado_por);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_lugar_id       ON ordenes_trabajo(lugar_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_parent_id      ON ordenes_trabajo(parent_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_sociedad_id    ON ordenes_trabajo(sociedad_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_ubicacion_id   ON ordenes_trabajo(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_ordenes_trabajo_plantilla_id   ON ordenes_trabajo(plantilla_id);

CREATE INDEX IF NOT EXISTS idx_actividad_ot_usuario_id        ON actividad_ot(usuario_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_ot_orden_id          ON auditoria_ot(orden_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_ot_usuario_id        ON auditoria_ot(usuario_id);

CREATE INDEX IF NOT EXISTS idx_archivos_orden_orden_id        ON archivos_orden(orden_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_orden_usuario_id   ON comentarios_orden(usuario_id);
CREATE INDEX IF NOT EXISTS idx_materiales_usados_material_id  ON materiales_usados(material_id);
CREATE INDEX IF NOT EXISTS idx_orden_partes_parte_id          ON orden_partes(parte_id);

-- FOTO SYSTEM
CREATE INDEX IF NOT EXISTS idx_foto_grupos_orden_id           ON foto_grupos(orden_id);
CREATE INDEX IF NOT EXISTS idx_foto_grupos_workspace_id       ON foto_grupos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_foto_grupos_created_by         ON foto_grupos(created_by);
CREATE INDEX IF NOT EXISTS idx_foto_grupo_items_grupo_id      ON foto_grupo_items(grupo_id);

-- HOJAS
CREATE INDEX IF NOT EXISTS idx_hojas_inventario_orden_id         ON hojas_inventario(orden_id);
CREATE INDEX IF NOT EXISTS idx_hojas_inventario_levantamiento_id ON hojas_inventario(levantamiento_id);
CREATE INDEX IF NOT EXISTS idx_hojas_inventario_created_by       ON hojas_inventario(created_by);
CREATE INDEX IF NOT EXISTS idx_hojas_inventario_filas_ws         ON hojas_inventario_filas(workspace_id);

-- LEVANTAMIENTOS
CREATE INDEX IF NOT EXISTS idx_levantamientos_orden_id           ON levantamientos(orden_id);
CREATE INDEX IF NOT EXISTS idx_levantamientos_ubicacion_id       ON levantamientos(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_levantamientos_sociedad_id        ON levantamientos(sociedad_id);
CREATE INDEX IF NOT EXISTS idx_levantamientos_asignado_a         ON levantamientos(asignado_a);
CREATE INDEX IF NOT EXISTS idx_levantamientos_creado_por         ON levantamientos(creado_por);
CREATE INDEX IF NOT EXISTS idx_levantamiento_actividad_usuario_id ON levantamiento_actividad(usuario_id);
CREATE INDEX IF NOT EXISTS idx_levantamiento_foto_grupos_ws      ON levantamiento_foto_grupos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_levantamiento_foto_grupos_by      ON levantamiento_foto_grupos(created_by);
CREATE INDEX IF NOT EXISTS idx_levantamiento_materiales_parte    ON levantamiento_materiales(parte_id);

-- SOLICITUDES
CREATE INDEX IF NOT EXISTS idx_solicitudes_orden_id     ON solicitudes(orden_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_lugar_id     ON solicitudes(lugar_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_ubicacion_id ON solicitudes(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_sociedad_id  ON solicitudes(sociedad_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_hito_id      ON solicitudes(hito_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_revisado_por ON solicitudes(revisado_por);

-- PROCEDIMIENTOS
CREATE INDEX IF NOT EXISTS idx_procedimientos_created_by        ON procedimientos(created_by);
CREATE INDEX IF NOT EXISTS idx_proc_ejec_completado_por         ON procedimiento_ejecuciones(completado_por);
CREATE INDEX IF NOT EXISTS idx_proc_ejec_iniciado_por           ON procedimiento_ejecuciones(iniciado_por);
CREATE INDEX IF NOT EXISTS idx_paso_respuestas_paso_id          ON paso_respuestas(paso_id);
CREATE INDEX IF NOT EXISTS idx_paso_respuestas_respondido_por   ON paso_respuestas(respondido_por);
CREATE INDEX IF NOT EXISTS idx_paso_respuestas_firmado_por      ON paso_respuestas(firmado_por_id);
CREATE INDEX IF NOT EXISTS idx_ot_procedimientos_proc_id        ON ot_procedimientos(procedimiento_id);
CREATE INDEX IF NOT EXISTS idx_ot_procedimientos_adjuntado      ON ot_procedimientos(adjuntado_por);
CREATE INDEX IF NOT EXISTS idx_pasos_plantilla_plantilla_id     ON pasos_plantilla(plantilla_id);
CREATE INDEX IF NOT EXISTS idx_plantillas_categoria_id          ON plantillas_procedimiento(categoria_id);

-- MISC
CREATE INDEX IF NOT EXISTS idx_feedback_usuario_id          ON feedback(usuario_id);
CREATE INDEX IF NOT EXISTS idx_partes_activo_id             ON partes(activo_id);
CREATE INDEX IF NOT EXISTS idx_partes_proveedor_id          ON partes(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_partes_ubicacion_id          ON partes(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_activos_modelo_id            ON activos(modelo_id);
CREATE INDEX IF NOT EXISTS idx_activos_proveedor_id         ON activos(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_activos_responsable_id       ON activos(responsable_id);
CREATE INDEX IF NOT EXISTS idx_activos_ubicacion_id         ON activos(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_activos_activo_padre_id      ON activos(activo_padre_id);
CREATE INDEX IF NOT EXISTS idx_preventivos_activo_id        ON preventivos(activo_id);
CREATE INDEX IF NOT EXISTS idx_preventivos_categoria_id     ON preventivos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_preventivos_tecnico_id       ON preventivos(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_preventivos_ubicacion_id     ON preventivos(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_preventivos_pauta_id         ON preventivos(pauta_id);
CREATE INDEX IF NOT EXISTS idx_activo_materiales_material_id ON activo_materiales(material_id);
CREATE INDEX IF NOT EXISTS idx_cuadrilla_usuarios_usuario_id ON cuadrilla_usuarios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_hitos_workspace_id           ON hitos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_alerta_enviada_workspace_id  ON alerta_enviada(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ubicaciones_sociedad_id      ON ubicaciones(sociedad_id);
CREATE INDEX IF NOT EXISTS idx_lugares_ubicacion_id         ON lugares(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_incidentes_trabajador_id     ON incidentes(trabajador_id);
CREATE INDEX IF NOT EXISTS idx_mediciones_responsable_id    ON mediciones_ambientales(responsable_id);
CREATE INDEX IF NOT EXISTS idx_cap_asistentes_usuario_id    ON capacitacion_asistentes(usuario_id);
;
