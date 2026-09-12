-- Datos de prueba para estudiar la jerarquía de activos.
--
-- Arma el caso real que se quiere observar: Finger 269 (equipo) con un motor
-- trifásico como componente en serie —si el motor se para, el Finger no puede
-- trabajar— más un segundo componente NO crítico para ver el contraste: ese no
-- debería arrastrar al padre.
--
-- Workspace "Test" (5dd8cc32-a553-4914-90ab-d1b3d8b2d41b).
-- Correr entero; es idempotente salvo por el historial de paradas del final.

BEGIN;

-- ── 1. Jerarquía ─────────────────────────────────────────────────────────────
-- Motor Trifásico #1 pasa a colgar de Finger 269.
UPDATE activos
   SET activo_padre_id = 'f09dbd5e-1ca5-4783-9a83-39bf5c9eb85a'
 WHERE id = 'a92a1c23-12af-4a2e-a9e7-2d834aee4851';

-- Un componente no crítico del mismo equipo. Existe para probar que la UI
-- propone marcar el motor (critico, en serie) y NO este (redundante).
INSERT INTO activos (
  id, workspace_id, nombre, descripcion, activo_padre_id,
  criticidad, estado, numero_serie, activo, created_at
)
SELECT
  '3f1c9a52-0d44-4e7b-9f21-6c8ba7e40001',
  '5dd8cc32-a553-4914-90ab-d1b3d8b2d41b',
  'Ventilador de enfriamiento #2 - Finger 269',
  'Ventilador redundante. El equipo sigue operando con el #1 si este se detiene.',
  'f09dbd5e-1ca5-4783-9a83-39bf5c9eb85a',
  'no_critico', 'operativo', 'VT-269-002', true, now() - interval '40 days'
WHERE NOT EXISTS (SELECT 1 FROM activos WHERE id = '3f1c9a52-0d44-4e7b-9f21-6c8ba7e40001');

-- ── 2. Historial de paradas ──────────────────────────────────────────────────
-- Se escribe directo en `activo_estado_periodos` (no por la RPC) porque son
-- períodos YA CERRADOS del pasado: la función solo sabe abrir el período
-- vigente. Los triggers no se disparan porque no se toca `activos.estado`.
--
-- El relato: hace 20 días el motor se quemó (avería, 6h) y arrastró al Finger
-- las mismas 6h — parada correlacionada, que es justo lo que hay que poder
-- estudiar. Hace 8 días el Finger tuvo mantención planificada de 4h. Hace 3
-- días el ventilador redundante estuvo 5h fuera SIN que el padre se detuviera.
INSERT INTO activo_estado_periodos
  (activo_id, workspace_id, estado, tipo_inactividad, inicio, fin, notas)
VALUES
  -- Avería del motor y su efecto en el equipo padre.
  ('a92a1c23-12af-4a2e-a9e7-2d834aee4851', '5dd8cc32-a553-4914-90ab-d1b3d8b2d41b',
   'fuera_servicio', 'sin_planear', now() - interval '20 days', now() - interval '20 days' + interval '6 hours',
   'Bobinado quemado. Reemplazo de motor.'),
  ('f09dbd5e-1ca5-4783-9a83-39bf5c9eb85a', '5dd8cc32-a553-4914-90ab-d1b3d8b2d41b',
   'fuera_servicio', 'sin_planear', now() - interval '20 days', now() - interval '20 days' + interval '6 hours',
   'Detenido por falla del motor trifásico #1.'),

  -- Mantención programada del equipo.
  ('f09dbd5e-1ca5-4783-9a83-39bf5c9eb85a', '5dd8cc32-a553-4914-90ab-d1b3d8b2d41b',
   'mantencion', 'planeado', now() - interval '8 days', now() - interval '8 days' + interval '4 hours',
   'Mantención preventiva trimestral.'),

  -- Componente redundante fuera de servicio SIN parar al padre.
  ('3f1c9a52-0d44-4e7b-9f21-6c8ba7e40001', '5dd8cc32-a553-4914-90ab-d1b3d8b2d41b',
   'fuera_servicio', 'sin_planear', now() - interval '3 days', now() - interval '3 days' + interval '5 hours',
   'Rodamiento ruidoso. El equipo siguió operando con el ventilador #1.');

COMMIT;

-- ── Verificación ─────────────────────────────────────────────────────────────
-- El árbol que quedó armado.
WITH RECURSIVE arbol AS (
  SELECT id, nombre, estado, criticidad, 1 AS nivel, ARRAY[nombre] AS camino
    FROM activos
   WHERE id = 'f09dbd5e-1ca5-4783-9a83-39bf5c9eb85a'
  UNION ALL
  SELECT h.id, h.nombre, h.estado, h.criticidad, a.nivel + 1, a.camino || h.nombre
    FROM activos h JOIN arbol a ON h.activo_padre_id = a.id
   WHERE h.activo
)
SELECT repeat('    ', nivel - 1) || nombre AS jerarquia, estado, criticidad
  FROM arbol ORDER BY camino;

-- Horas de parada por activo: el motor y el Finger comparten las 6h de la
-- avería; el ventilador tiene las suyas sin contagiar al padre.
SELECT a.nombre,
       p.estado, p.tipo_inactividad,
       round(EXTRACT(epoch FROM (p.fin - p.inicio)) / 3600.0, 1) AS horas,
       p.notas
  FROM activo_estado_periodos p
  JOIN activos a ON a.id = p.activo_id
 WHERE p.workspace_id = '5dd8cc32-a553-4914-90ab-d1b3d8b2d41b'
   AND p.fin IS NOT NULL
 ORDER BY p.inicio DESC;
