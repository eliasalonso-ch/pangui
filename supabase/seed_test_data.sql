-- ============================================================
-- PANGUI — Seed test data for Admin & JEJEJEJ
-- Admin   workspace: 65557769-1328-466a-810a-f55577d4c71a  (user: 80c34732)
-- JEJEJEJ workspace: e68a3cb8-39be-4458-9c34-3c40296416df  (user: 3d97c74d)
-- Run cleanup_test_data.sql to remove everything added here.
-- ============================================================

-- ── WORKSPACE: Admin (65557769) ───────────────────────────────

-- Ubicaciones
INSERT INTO ubicaciones (id, workspace_id, edificio, piso, detalle, activa) VALUES
  ('a1000001-0000-0000-0000-000000000001', '65557769-1328-466a-810a-f55577d4c71a', 'Edificio Principal', 'Piso 1', 'Sala de máquinas', true),
  ('a1000001-0000-0000-0000-000000000002', '65557769-1328-466a-810a-f55577d4c71a', 'Edificio Principal', 'Piso 2', 'Oficinas', true),
  ('a1000001-0000-0000-0000-000000000003', '65557769-1328-466a-810a-f55577d4c71a', 'Bodega', null, null, true);

-- Categorías OT
INSERT INTO categorias_ot (id, workspace_id, nombre, icono, color) VALUES
  ('a1000002-0000-0000-0000-000000000001', '65557769-1328-466a-810a-f55577d4c71a', 'Eléctrico', '⚡', '#f59e0b'),
  ('a1000002-0000-0000-0000-000000000002', '65557769-1328-466a-810a-f55577d4c71a', 'Mecánico', '🔧', '#3b82f6'),
  ('a1000002-0000-0000-0000-000000000003', '65557769-1328-466a-810a-f55577d4c71a', 'Infraestructura', '🏗️', '#8b5cf6');

-- Activos
INSERT INTO activos (id, workspace_id, nombre, codigo, ubicacion_id, activo) VALUES
  ('a1000003-0000-0000-0000-000000000001', '65557769-1328-466a-810a-f55577d4c71a', 'Compresor #1', 'COMP-001', 'a1000001-0000-0000-0000-000000000001', true),
  ('a1000003-0000-0000-0000-000000000002', '65557769-1328-466a-810a-f55577d4c71a', 'Bomba Hidráulica', 'BOM-001', 'a1000001-0000-0000-0000-000000000001', true),
  ('a1000003-0000-0000-0000-000000000003', '65557769-1328-466a-810a-f55577d4c71a', 'Tablero Eléctrico', 'TABL-001', 'a1000001-0000-0000-0000-000000000002', true);

-- Órdenes de trabajo
INSERT INTO ordenes_trabajo (id, workspace_id, titulo, descripcion, tipo, tipo_trabajo, estado, prioridad, ubicacion_id, activo_id, categoria_id, creado_por) VALUES
  ('a1000004-0000-0000-0000-000000000001', '65557769-1328-466a-810a-f55577d4c71a', 'Revisión compresor mensual', 'Revisión preventiva mensual del compresor #1', 'solicitud', 'preventiva', 'completado', 'alta', 'a1000001-0000-0000-0000-000000000001', 'a1000003-0000-0000-0000-000000000001', 'a1000002-0000-0000-0000-000000000002', '80c34732-0d22-45e0-91e0-16ab617abd03'),
  ('a1000004-0000-0000-0000-000000000002', '65557769-1328-466a-810a-f55577d4c71a', 'Falla en bomba hidráulica', 'Ruido anormal en la bomba, requiere inspección urgente', 'emergencia', 'reactiva', 'en_curso', 'alta', 'a1000001-0000-0000-0000-000000000001', 'a1000003-0000-0000-0000-000000000002', 'a1000002-0000-0000-0000-000000000002', '80c34732-0d22-45e0-91e0-16ab617abd03'),
  ('a1000004-0000-0000-0000-000000000003', '65557769-1328-466a-810a-f55577d4c71a', 'Cambio de luminarias piso 2', 'Reemplazar tubos fluorescentes por LED', 'solicitud', 'preventiva', 'pendiente', 'media', 'a1000001-0000-0000-0000-000000000002', null, 'a1000002-0000-0000-0000-000000000001', '80c34732-0d22-45e0-91e0-16ab617abd03'),
  ('a1000004-0000-0000-0000-000000000004', '65557769-1328-466a-810a-f55577d4c71a', 'Inspección tablero eléctrico', 'Verificar conexiones y disyuntores', 'solicitud', 'preventiva', 'pendiente', 'baja', 'a1000001-0000-0000-0000-000000000002', 'a1000003-0000-0000-0000-000000000003', 'a1000002-0000-0000-0000-000000000001', '80c34732-0d22-45e0-91e0-16ab617abd03'),
  ('a1000004-0000-0000-0000-000000000005', '65557769-1328-466a-810a-f55577d4c71a', 'Reparación puerta bodega', 'Bisagra rota, no cierra correctamente', 'solicitud', 'reactiva', 'cancelado', 'baja', 'a1000001-0000-0000-0000-000000000003', null, 'a1000002-0000-0000-0000-000000000003', '80c34732-0d22-45e0-91e0-16ab617abd03');

-- Preventivos
INSERT INTO preventivos (id, workspace_id, titulo, descripcion, frecuencia_dias, activo_id, ubicacion_id, proxima_fecha, activo) VALUES
  ('a1000005-0000-0000-0000-000000000001', '65557769-1328-466a-810a-f55577d4c71a', 'Mantención mensual compresor', 'Revisión de filtros, aceite y presión', 30, 'a1000003-0000-0000-0000-000000000001', 'a1000001-0000-0000-0000-000000000001', '2026-04-01', true),
  ('a1000005-0000-0000-0000-000000000002', '65557769-1328-466a-810a-f55577d4c71a', 'Inspección semanal bomba', 'Control de temperatura y caudal', 7, 'a1000003-0000-0000-0000-000000000002', 'a1000001-0000-0000-0000-000000000001', '2026-03-28', true);

-- Partes (inventario)
INSERT INTO partes (id, workspace_id, nombre, codigo, stock_actual, stock_minimo, unidad, activo) VALUES
  ('a1000006-0000-0000-0000-000000000001', '65557769-1328-466a-810a-f55577d4c71a', 'Filtro de aceite compresor', 'FIL-001', 5, 2, 'un', true),
  ('a1000006-0000-0000-0000-000000000002', '65557769-1328-466a-810a-f55577d4c71a', 'Correa de transmisión', 'COR-001', 3, 1, 'un', true),
  ('a1000006-0000-0000-0000-000000000003', '65557769-1328-466a-810a-f55577d4c71a', 'Aceite hidráulico ISO 46', 'ACE-001', 0, 4, 'lt', true);


-- ── WORKSPACE: JEJEJEJ (e68a3cb8) ────────────────────────────

-- Ubicaciones
INSERT INTO ubicaciones (id, workspace_id, edificio, piso, detalle, activa) VALUES
  ('b1000001-0000-0000-0000-000000000001', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Planta Norte', 'Piso 1', 'Zona de producción', true),
  ('b1000001-0000-0000-0000-000000000002', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Planta Norte', 'Piso 2', 'Sala de control', true);

-- Categorías OT
INSERT INTO categorias_ot (id, workspace_id, nombre, icono, color) VALUES
  ('b1000002-0000-0000-0000-000000000001', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Eléctrico', '⚡', '#f59e0b'),
  ('b1000002-0000-0000-0000-000000000002', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Mecánico', '🔧', '#3b82f6');

-- Activos
INSERT INTO activos (id, workspace_id, nombre, codigo, ubicacion_id, activo) VALUES
  ('b1000003-0000-0000-0000-000000000001', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Motor Principal', 'MOT-001', 'b1000001-0000-0000-0000-000000000001', true),
  ('b1000003-0000-0000-0000-000000000002', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Generador', 'GEN-001', 'b1000001-0000-0000-0000-000000000001', true);

-- Órdenes de trabajo
INSERT INTO ordenes_trabajo (id, workspace_id, titulo, descripcion, tipo, tipo_trabajo, estado, prioridad, ubicacion_id, activo_id, categoria_id, creado_por) VALUES
  ('b1000004-0000-0000-0000-000000000001', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Revisión motor principal', 'Control de temperatura y vibración', 'solicitud', 'preventiva', 'completado', 'alta', 'b1000001-0000-0000-0000-000000000001', 'b1000003-0000-0000-0000-000000000001', 'b1000002-0000-0000-0000-000000000002', '3d97c74d-cc6d-45ff-a759-e3bb6d79c348'),
  ('b1000004-0000-0000-0000-000000000002', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Falla generador', 'No arranca correctamente', 'emergencia', 'reactiva', 'pendiente', 'alta', 'b1000001-0000-0000-0000-000000000001', 'b1000003-0000-0000-0000-000000000002', 'b1000002-0000-0000-0000-000000000001', '3d97c74d-cc6d-45ff-a759-e3bb6d79c348'),
  ('b1000004-0000-0000-0000-000000000003', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Limpieza sala de control', 'Limpieza general de equipos y paneles', 'solicitud', 'preventiva', 'en_curso', 'media', 'b1000001-0000-0000-0000-000000000002', null, 'b1000002-0000-0000-0000-000000000002', '3d97c74d-cc6d-45ff-a759-e3bb6d79c348');

-- Partes
INSERT INTO partes (id, workspace_id, nombre, codigo, stock_actual, stock_minimo, unidad, activo) VALUES
  ('b1000006-0000-0000-0000-000000000001', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Rodamiento 6205', 'ROD-001', 8, 3, 'un', true),
  ('b1000006-0000-0000-0000-000000000002', 'e68a3cb8-39be-4458-9c34-3c40296416df', 'Fusible 16A', 'FUS-001', 1, 5, 'un', true);
