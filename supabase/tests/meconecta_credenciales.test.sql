BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(9);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('10000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mc-admin@test.local', '', now(), now(), now()),
       ('10000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mc-member@test.local', '', now(), now(), now()),
       ('10000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mc-otro@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES ('f1b64714-6de2-4d49-b6e4-5959553e94d7', 'Electrilam test'),
       ('20000000-0000-0000-0000-0000000000c9', 'Otro WS')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES ('10000000-0000-0000-0000-0000000000c1', 'Admin',  'admin',  'f1b64714-6de2-4d49-b6e4-5959553e94d7', true),
       ('10000000-0000-0000-0000-0000000000c2', 'Member', 'member', 'f1b64714-6de2-4d49-b6e4-5959553e94d7', true),
       ('10000000-0000-0000-0000-0000000000c3', 'Otro',   'owner',  '20000000-0000-0000-0000-0000000000c9', true);

SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

-- member: rechazado
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c2', true);
SELECT throws_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave', true) $$, '42501', NULL, 'member no puede guardar');

-- owner de otro workspace: rechazado
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c3', true);
SELECT throws_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave', true) $$, '42501', NULL, 'otro workspace no puede guardar');

-- admin Electrilam
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c1', true);
SELECT throws_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave', false) $$, '22023', NULL, 'sin autorización se rechaza');
SELECT lives_ok($$ SELECT public.set_meconecta_credentials('u@x.cl', 'clave1', true) $$, 'admin guarda');
SELECT is((SELECT status FROM public.integration_connections WHERE provider = 'meconecta'), 'pendiente', 'queda pendiente y el admin la ve');
SELECT throws_ok($$ SELECT * FROM public.get_meconecta_credentials() $$, '42501', NULL, 'authenticated no puede leer la clave');

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT is((SELECT password FROM public.get_meconecta_credentials()), 'clave1', 'service_role lee la clave descifrada');

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-0000000000c1', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.disconnect_meconecta() $$, 'admin desconecta');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM vault.secrets WHERE name = 'meconecta_f1b64714-6de2-4d49-b6e4-5959553e94d7'), 0, 'el secreto se borra de Vault');

SELECT * FROM extensions.finish();
ROLLBACK;
