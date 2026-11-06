BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(7);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-member@test.local', '', now(), now(), now()),
       ('10000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-req@test.local', '', now(), now(), now()),
       ('10000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-otro@test.local', '', now(), now(), now()),
       ('10000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imp-admin@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES ('20000000-0000-0000-0000-0000000000d1', 'WS impresiones'),
       ('20000000-0000-0000-0000-0000000000d9', 'Otro WS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES ('10000000-0000-0000-0000-0000000000d1', 'Member',    'member',    '20000000-0000-0000-0000-0000000000d1', true),
       ('10000000-0000-0000-0000-0000000000d2', 'Requester', 'requester', '20000000-0000-0000-0000-0000000000d1', true),
       ('10000000-0000-0000-0000-0000000000d3', 'Otro',      'owner',     '20000000-0000-0000-0000-0000000000d9', true),
       ('10000000-0000-0000-0000-0000000000d4', 'Admin',     'admin',     '20000000-0000-0000-0000-0000000000d1', true);

INSERT INTO public.ordenes_trabajo (id, workspace_id, titulo)
VALUES ('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', 'OT MeConecta');
INSERT INTO public.ot_impresiones (orden_id, workspace_id, pdf_url)
VALUES ('30000000-0000-0000-0000-0000000000d1', '20000000-0000-0000-0000-0000000000d1', 'https://cdn.example/s.pdf');

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

-- requester: no ve la fila ni puede marcar
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000d2', true);
SELECT is((SELECT count(*)::int FROM public.ot_impresiones), 0, 'requester no ve impresiones');
SELECT is(public.marcar_ot_impresa('30000000-0000-0000-0000-0000000000d1'), false, 'requester no marca');

-- otro workspace: no marca
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000d3', true);
SELECT is(public.marcar_ot_impresa('30000000-0000-0000-0000-0000000000d1'), false, 'otro workspace no marca');

-- member: ve, no puede escribir directo, marca por la RPC
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000d1', true);
SELECT is((SELECT count(*)::int FROM public.ot_impresiones), 1, 'member ve la impresión');
UPDATE public.ot_impresiones SET pdf_url = 'https://malo' WHERE orden_id = '30000000-0000-0000-0000-0000000000d1';
SELECT is(public.marcar_ot_impresa('30000000-0000-0000-0000-0000000000d1'), true, 'member marca impresa');

-- admin reimprime: quien y cuando quedan los de la primera vez
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000d4', true);
SELECT public.marcar_ot_impresa('30000000-0000-0000-0000-0000000000d1');

RESET ROLE;
SELECT is((SELECT impresa_por FROM public.ot_impresiones WHERE orden_id = '30000000-0000-0000-0000-0000000000d1'),
          '10000000-0000-0000-0000-0000000000d1'::uuid, 'la primera impresión manda');
SELECT is((SELECT pdf_url FROM public.ot_impresiones WHERE orden_id = '30000000-0000-0000-0000-0000000000d1'),
          'https://cdn.example/s.pdf', 'el update directo no cambió nada (sin policy de escritura)');

SELECT * FROM extensions.finish();
ROLLBACK;
