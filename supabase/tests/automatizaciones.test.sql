BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(10);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'auto-owner@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES ('20000000-0000-0000-0000-0000000000a1', 'WS automatizaciones'),
       ('20000000-0000-0000-0000-0000000000a2', 'WS sin plan');

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES ('10000000-0000-0000-0000-0000000000a1', 'Owner auto', 'owner',
        '20000000-0000-0000-0000-0000000000a1', true);

-- El motor exige plan Empresa vigente.
INSERT INTO public.subscriptions (workspace_id, plan_key, status)
VALUES ('20000000-0000-0000-0000-0000000000a1', 'enterprise', 'active'),
       ('20000000-0000-0000-0000-0000000000a2', 'pro', 'active');

INSERT INTO public.activos (id, nombre, workspace_id)
VALUES ('30000000-0000-0000-0000-0000000000a1', 'Motor 1', '20000000-0000-0000-0000-0000000000a1'),
       ('30000000-0000-0000-0000-0000000000a2', 'Motor 2', '20000000-0000-0000-0000-0000000000a2');

INSERT INTO public.medidores (id, workspace_id, nombre, tipo, unidad, activo_id, creado_por)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
        'Corriente', 'manual', 'A', '30000000-0000-0000-0000-0000000000a1',
        '10000000-0000-0000-0000-0000000000a1'),
       ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2',
        'Corriente sin plan', 'manual', 'A', '30000000-0000-0000-0000-0000000000a2', NULL);

INSERT INTO public.automatizaciones (id, workspace_id, nombre, creado_por)
VALUES ('50000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1',
        'Corriente alta', '10000000-0000-0000-0000-0000000000a1');

INSERT INTO public.automatizacion_triggers (id, automatizacion_id, medidor_id, operador, valor)
VALUES ('60000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1',
        '40000000-0000-0000-0000-0000000000a1', 'mayor_igual', 10);

-- retrigger 0 para poder probar los frenos de a uno.
INSERT INTO public.automatizacion_acciones (id, automatizacion_id, tipo, config, retrigger_minutos)
VALUES ('70000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1',
        'crear_ot', '{"titulo":"Revisar motor","prioridad":"alta"}'::jsonb, 0);

-- ── 1. Una lectura que cumple abre una OT ───────────────────────────────────
INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 12);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  1, 'una lectura que cumple abre exactamente una OT');

SELECT extensions.is(
  (SELECT titulo FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1' LIMIT 1),
  'Revisar motor', 'la OT toma el título de la config');

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.automatizacion_ejecuciones
    WHERE resultado = 'ejecutada'),
  1, 'se registra una ejecución');

-- ── 2. Una lectura que no cumple no hace nada ───────────────────────────────
INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 3);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  1, 'una lectura bajo el umbral no abre OT');

-- ── 3. solo_si_anterior_cerrada omite mientras la OT siga abierta ───────────
UPDATE public.automatizacion_acciones
   SET solo_si_anterior_cerrada = true
 WHERE id = '70000000-0000-0000-0000-0000000000a1';

INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 15);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  1, 'no abre una segunda OT mientras la anterior sigue abierta');

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.automatizacion_ejecuciones
    WHERE resultado = 'omitida' AND detalle = 'La orden de trabajo anterior sigue abierta.'),
  1, 'la omisión queda registrada con su motivo');

-- Cerrada la anterior, la siguiente lectura sí abre otra.
UPDATE public.ordenes_trabajo SET estado = 'completado'
 WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1';

INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 16);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  2, 'con la anterior cerrada vuelve a abrir');

-- ── 4. Una automatización pausada no dispara ────────────────────────────────
UPDATE public.automatizacion_acciones SET solo_si_anterior_cerrada = false
 WHERE id = '70000000-0000-0000-0000-0000000000a1';
UPDATE public.ordenes_trabajo SET estado = 'completado'
 WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1';
UPDATE public.automatizaciones SET activa = false
 WHERE id = '50000000-0000-0000-0000-0000000000a1';

INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 20);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo
    WHERE automatizacion_id = '50000000-0000-0000-0000-0000000000a1'),
  2, 'una automatización pausada no dispara');

-- ── 5. El motor viejo ya no existe ──────────────────────────────────────────
-- Las alertas de medidor (fn_medidor_lectura_critica, 20260914193001) conviven
-- con el motor: avisan al cruzar un umbral, mientras el motor abre la OT que el
-- usuario configuró. Se afirma que las DOS siguen vivas — una versión anterior
-- de esta prueba exigía que la vieja estuviera borrada, que es justamente el
-- error que apagó las alertas al aplicar el motor.
SELECT extensions.is(
  (SELECT count(*)::integer FROM pg_trigger
    WHERE tgrelid = 'public.medidor_lecturas'::regclass
      AND tgname IN ('trg_medidor_lectura_critica','trg_automatizacion_lectura')),
  2, 'alertas y automatizaciones conviven, cada una en su trigger');

-- ── 6. Un workspace sin plan Empresa no dispara ─────────────────────────────
INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor)
VALUES ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', 99);

SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo o
    JOIN public.automatizaciones a ON a.id = o.automatizacion_id
   WHERE a.workspace_id = '20000000-0000-0000-0000-0000000000a2'),
  0, 'un workspace fuera de Empresa no dispara');

SELECT * FROM extensions.finish();
ROLLBACK;
