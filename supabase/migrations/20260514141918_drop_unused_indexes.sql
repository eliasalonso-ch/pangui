
-- ordenes_trabajo (9 unused)
DROP INDEX IF EXISTS public.idx_ot_asignados;
DROP INDEX IF EXISTS public.idx_ordenes_trabajo_updated_at;
DROP INDEX IF EXISTS public.idx_ot_fecha_termino;
DROP INDEX IF EXISTS public.idx_ot_activo_id;
DROP INDEX IF EXISTS public.idx_ot_workspace_clasificacion;
DROP INDEX IF EXISTS public.idx_ordenes_trabajo_creado_por;
DROP INDEX IF EXISTS public.idx_ordenes_trabajo_lugar_id;
DROP INDEX IF EXISTS public.idx_ordenes_trabajo_ubicacion_id;
DROP INDEX IF EXISTS public.idx_ordenes_trabajo_plantilla_id;

-- levantamientos (6 unused)
DROP INDEX IF EXISTS public.levantamientos_estado_idx;
DROP INDEX IF EXISTS public.idx_levantamientos_orden_id;
DROP INDEX IF EXISTS public.idx_levantamientos_ubicacion_id;
DROP INDEX IF EXISTS public.idx_levantamientos_sociedad_id;
DROP INDEX IF EXISTS public.idx_levantamientos_asignado_a;
DROP INDEX IF EXISTS public.idx_levantamientos_creado_por;

-- activos (6 unused)
DROP INDEX IF EXISTS public.idx_activos_modelo_id;
DROP INDEX IF EXISTS public.idx_activos_proveedor_id;
DROP INDEX IF EXISTS public.idx_activos_responsable_id;
DROP INDEX IF EXISTS public.idx_activos_ubicacion_id;
DROP INDEX IF EXISTS public.idx_activos_activo_padre_id;
DROP INDEX IF EXISTS public.idx_activos_workspace;
DROP INDEX IF EXISTS public.activos_fabricante_idx;

-- preventivos (5 unused)
DROP INDEX IF EXISTS public.idx_preventivos_activo_id;
DROP INDEX IF EXISTS public.idx_preventivos_categoria_id;
DROP INDEX IF EXISTS public.idx_preventivos_tecnico_id;
DROP INDEX IF EXISTS public.idx_preventivos_ubicacion_id;
DROP INDEX IF EXISTS public.idx_preventivos_pauta_id;
DROP INDEX IF EXISTS public.idx_preventivos_workspace;

-- solicitudes (5 unused)
DROP INDEX IF EXISTS public.idx_solicitudes_orden_id;
DROP INDEX IF EXISTS public.idx_solicitudes_lugar_id;
DROP INDEX IF EXISTS public.idx_solicitudes_ubicacion_id;
DROP INDEX IF EXISTS public.idx_solicitudes_sociedad_id;
DROP INDEX IF EXISTS public.idx_solicitudes_hito_id;
DROP INDEX IF EXISTS public.idx_solicitudes_revisado_por;

-- partes (4 unused)
DROP INDEX IF EXISTS public.idx_partes_activo_id;
DROP INDEX IF EXISTS public.idx_partes_proveedor_id;
DROP INDEX IF EXISTS public.idx_partes_ubicacion_id;
DROP INDEX IF EXISTS public.idx_partes_stock_minimo;
DROP INDEX IF EXISTS public.materiales_tipo_parte_idx;

-- usuarios
DROP INDEX IF EXISTS public.idx_usuarios_nombre;

-- actividad_ot / auditoria_ot
DROP INDEX IF EXISTS public.idx_actividad_ot_usuario_id;
DROP INDEX IF EXISTS public.idx_auditoria_ot_usuario_id;

-- archivos / comentarios
DROP INDEX IF EXISTS public.idx_archivos_orden_orden_id;
DROP INDEX IF EXISTS public.idx_comentarios_orden_usuario_id;

-- materiales_usados
DROP INDEX IF EXISTS public.idx_materiales_usados_material_id;

-- foto_grupos / foto_grupo_items
DROP INDEX IF EXISTS public.idx_foto_grupos_created_by;

-- hojas_inventario
DROP INDEX IF EXISTS public.idx_hojas_inventario_levantamiento_id;
DROP INDEX IF EXISTS public.idx_hojas_inventario_created_by;

-- levantamiento_actividad / foto_grupos / materiales
DROP INDEX IF EXISTS public.idx_levantamiento_actividad_usuario_id;
DROP INDEX IF EXISTS public.idx_levantamiento_foto_grupos_ws;
DROP INDEX IF EXISTS public.idx_levantamiento_foto_grupos_by;
DROP INDEX IF EXISTS public.idx_levantamiento_materiales_parte;

-- procedimientos
DROP INDEX IF EXISTS public.idx_procedimientos_created_by;
DROP INDEX IF EXISTS public.idx_procedimientos_nombre;

-- procedimiento_ejecuciones / paso_respuestas
DROP INDEX IF EXISTS public.idx_proc_ejec_completado_por;
DROP INDEX IF EXISTS public.idx_proc_ejec_iniciado_por;
DROP INDEX IF EXISTS public.idx_paso_respuestas_respondido_por;
DROP INDEX IF EXISTS public.idx_paso_respuestas_firmado_por;

-- ot_procedimientos
DROP INDEX IF EXISTS public.idx_ot_procedimientos_proc_id;
DROP INDEX IF EXISTS public.idx_ot_procedimientos_adjuntado;

-- plantillas
DROP INDEX IF EXISTS public.idx_pasos_plantilla_plantilla_id;
DROP INDEX IF EXISTS public.idx_plantillas_categoria_id;

-- misc
DROP INDEX IF EXISTS public.idx_feedback_usuario_id;
DROP INDEX IF EXISTS public.idx_ot_alert_state_active;
DROP INDEX IF EXISTS public.idx_activo_materiales_material_id;
DROP INDEX IF EXISTS public.idx_cuadrilla_usuarios_usuario_id;
DROP INDEX IF EXISTS public.idx_hitos_workspace_id;
DROP INDEX IF EXISTS public.idx_alerta_enviada_workspace_id;
DROP INDEX IF EXISTS public.idx_ubicaciones_sociedad_id;
DROP INDEX IF EXISTS public.idx_lugares_ubicacion_id;
DROP INDEX IF EXISTS public.idx_incidentes_trabajador_id;
DROP INDEX IF EXISTS public.idx_mediciones_responsable_id;
DROP INDEX IF EXISTS public.idx_cap_asistentes_usuario_id;
DROP INDEX IF EXISTS public.idx_alert_log_workspace;
DROP INDEX IF EXISTS public.idx_ubicaciones_edificio;
DROP INDEX IF EXISTS public.idx_sociedades_workspace_id;
DROP INDEX IF EXISTS public.idx_categorias_ot_nombre;
DROP INDEX IF EXISTS public.idx_proveedores_workspace;
DROP INDEX IF EXISTS public.idx_solicitudes_hito_id;
;
