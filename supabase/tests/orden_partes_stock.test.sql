BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(16);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'stock-owner@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES ('20000000-0000-0000-0000-0000000000b1', 'WS stock'),
       ('20000000-0000-0000-0000-0000000000b2', 'WS ajeno');
INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES ('10000000-0000-0000-0000-0000000000b1', 'Owner stock', 'owner', '20000000-0000-0000-0000-0000000000b1', true);
INSERT INTO public.ubicaciones (id, workspace_id, edificio)
VALUES ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'Obra');
INSERT INTO public.partes (id, workspace_id, codigo, nombre, stock_actual)
VALUES ('40000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'CAB', 'Cable', 10),
       ('40000000-0000-0000-0000-0000000000b2', '20000000-0000-0000-0000-0000000000b2', 'AJ', 'Ajeno', 10);
INSERT INTO public.ordenes_trabajo (id, workspace_id, tipo, descripcion, estado)
VALUES ('50000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'solicitud', 'OT stock', 'pendiente');

SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

CREATE TEMP VIEW stock AS
  SELECT stock_actual FROM public.partes WHERE id = '40000000-0000-0000-0000-0000000000b1';

-- ── 1. Bodega: nada se mueve hasta completar ───────────────────────────────
INSERT INTO public.orden_partes (id, orden_id, parte_id, cantidad)
VALUES ('60000000-0000-0000-0000-0000000000b1', '50000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000b1', 3);
UPDATE public.orden_partes SET cantidad = 4 WHERE id = '60000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 10::numeric, 'agregar y editar en OT abierta no toca el stock');

UPDATE public.ordenes_trabajo SET estado = 'completado' WHERE id = '50000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 6::numeric, 'completar descuenta la cantidad');

UPDATE public.orden_partes SET cantidad_utilizada = 2 WHERE id = '60000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 8::numeric, 'cantidad_utilizada menor devuelve lo que sobró');

UPDATE public.ordenes_trabajo SET estado = 'pendiente' WHERE id = '50000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 10::numeric, 'reabrir devuelve todo');

UPDATE public.ordenes_trabajo SET estado = 'completado' WHERE id = '50000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 8::numeric, 'volver a completar descuenta una sola vez');

UPDATE public.orden_partes SET stock_descontado = 0 WHERE id = '60000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 8::numeric, 'el cliente no puede falsear stock_descontado');

DELETE FROM public.orden_partes WHERE id = '60000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 10::numeric, 'quitar la fila devuelve lo descontado');

-- ── 2. Reserva usada en la OT ──────────────────────────────────────────────
SELECT public.reserve_material('40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000b1', NULL, 5);
SELECT extensions.is((SELECT stock_actual FROM stock), 5::numeric, 'reservar saca de bodega');

SELECT public.usar_reserva_en_orden('50000000-0000-0000-0000-0000000000b1',
  (SELECT id FROM public.material_reservations WHERE parte_id = '40000000-0000-0000-0000-0000000000b1'), 2);
SELECT extensions.is((SELECT stock_actual FROM stock), 5::numeric, 'usar la reserva no vuelve a tocar bodega');
SELECT extensions.is((SELECT cantidad FROM public.material_reservations WHERE parte_id = '40000000-0000-0000-0000-0000000000b1'),
  3::numeric, 'la reserva baja');

UPDATE public.orden_partes SET cantidad = 1 WHERE withdrawal_id IS NOT NULL;
SELECT extensions.is((SELECT stock_actual FROM stock), 6::numeric, 'bajar una fila de reserva devuelve a bodega');

SELECT extensions.throws_ok(
  $$UPDATE public.orden_partes SET cantidad = 3 WHERE withdrawal_id IS NOT NULL$$,
  'Para usar más, toma otra vez de la reserva', 'una fila de reserva no puede subir');

SELECT extensions.throws_ok(
  $$INSERT INTO public.orden_partes (orden_id, parte_id, cantidad, withdrawal_id)
    VALUES ('50000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000b1', 1,
            public.consume_material_reservation((SELECT id FROM public.material_reservations
              WHERE parte_id = '40000000-0000-0000-0000-0000000000b1'), 1))$$,
  'Los materiales reservados se agregan con usar_reserva_en_orden', 'no se cuelga un retiro a mano');

DELETE FROM public.orden_partes WHERE withdrawal_id IS NOT NULL;
SELECT extensions.is((SELECT stock_actual FROM stock), 7::numeric, 'quitar la fila de reserva devuelve el resto');

-- ── 3. Guardas ─────────────────────────────────────────────────────────────
SELECT extensions.throws_ok(
  $$INSERT INTO public.orden_partes (orden_id, parte_id, cantidad)
    VALUES ('50000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000b2', 1)$$,
  'Material no disponible', 'no se usa material de otro workspace');

-- OT borrada: lo usado se queda usado.
INSERT INTO public.orden_partes (orden_id, parte_id, cantidad)
VALUES ('50000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000b1', 1);
DELETE FROM public.ordenes_trabajo WHERE id = '50000000-0000-0000-0000-0000000000b1';
SELECT extensions.is((SELECT stock_actual FROM stock), 6::numeric, 'borrar una OT completada no devuelve lo usado');

SELECT * FROM extensions.finish();
ROLLBACK;
