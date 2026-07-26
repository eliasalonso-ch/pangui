BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(33);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-one@test.local', '', now(), now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-two@test.local', '', now(), now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager-one@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'Workspace one'),
  ('20000000-0000-0000-0000-000000000002', 'Workspace two');

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Owner one', 'owner', '20000000-0000-0000-0000-000000000001', true),
  ('10000000-0000-0000-0000-000000000002', 'Owner two', 'owner', '20000000-0000-0000-0000-000000000002', true),
  ('10000000-0000-0000-0000-000000000003', 'Manager one', 'admin', '20000000-0000-0000-0000-000000000001', true);

INSERT INTO public.categorias_ot (id, nombre, icono, color, workspace_id, es_default)
VALUES
  ('40000000-0000-0000-0000-000000000001', 'Global default', 'flash-outline', '#007AFF', NULL, true),
  ('40000000-0000-0000-0000-000000000002', 'Workspace two only', 'flash-outline', '#007AFF', '20000000-0000-0000-0000-000000000002', false);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT extensions.lives_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000001","workspace_id":"20000000-0000-0000-0000-000000000001","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"OT idempotente"}}'::jsonb)$$,
  'creates a root OT through the canonical command'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo WHERE titulo = 'OT idempotente'),
  1,
  'creation writes exactly one OT'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.actividad_ot a JOIN public.ordenes_trabajo o ON o.id = a.orden_id WHERE o.titulo = 'OT idempotente' AND a.tipo = 'creado'),
  1,
  'creation writes one activity event'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.work_order_notification_outbox WHERE command_id = '30000000-0000-0000-0000-000000000001'),
  1,
  'creation writes one root notification intent'
);
SET LOCAL ROLE authenticated;
SELECT extensions.is(
  public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000001","workspace_id":"20000000-0000-0000-0000-000000000001","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"OT idempotente"}}'::jsonb) ->> 'replayed',
  'true',
  'replaying a command returns the stored result'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo WHERE titulo = 'OT idempotente'),
  1,
  'replay does not duplicate the OT'
);
SELECT extensions.throws_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000001","workspace_id":"20000000-0000-0000-0000-000000000001","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"Payload diferente"}}'::jsonb)$$,
  'P0001', 'COMMAND_PAYLOAD_MISMATCH',
  'a command ID cannot be reused with another payload'
);
SELECT extensions.throws_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000002","workspace_id":"20000000-0000-0000-0000-000000000002","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"Cruce de tenant"}}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'an actor cannot create in another workspace'
);
SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','30000000-0000-0000-0000-000000000003','workspace_id','20000000-0000-0000-0000-000000000001','actor_id','10000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT idempotente'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT idempotente'),'action','start')))$$,
  'starts an OT through the canonical transition'
);
SELECT extensions.is(
  (SELECT estado FROM public.ordenes_trabajo WHERE titulo = 'OT idempotente'),
  'en_curso',
  'start owns the resulting state'
);
SELECT extensions.throws_ok(
  $$SELECT public.edit_work_order_v1(jsonb_build_object('contract_version',1,'command_id','30000000-0000-0000-0000-000000000007','workspace_id','20000000-0000-0000-0000-000000000001','actor_id','10000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT idempotente'),'expected_updated_at','2020-01-01T00:00:00Z','changes',jsonb_build_object('prioridad','alta'))))$$,
  'P0001', 'CONFLICT',
  'stale edits are rejected with the shared optimistic-concurrency error'
);
SELECT extensions.lives_ok(
  $$SELECT public.edit_work_order_v1(jsonb_build_object('contract_version',1,'command_id','30000000-0000-0000-0000-000000000008','workspace_id','20000000-0000-0000-0000-000000000001','actor_id','10000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT idempotente'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT idempotente'),'changes',jsonb_build_object('prioridad','alta'))))$$,
  'a current edit succeeds'
);
SELECT extensions.is(
  (SELECT prioridad FROM public.ordenes_trabajo WHERE titulo = 'OT idempotente'),
  'alta',
  'edit owns the persisted field value'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.actividad_ot a JOIN public.ordenes_trabajo o ON o.id = a.orden_id WHERE o.titulo = 'OT idempotente' AND a.tipo = 'prioridad_cambiada'),
  1,
  'priority edit emits exactly one specialized activity event'
);

RESET ROLE;
UPDATE public.workspaces SET fotos_obligatorias_todas = true
WHERE id = '20000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT extensions.lives_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000004","workspace_id":"20000000-0000-0000-0000-000000000001","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"OT exige foto"}}'::jsonb)$$,
  'creates an OT carrying the workspace photo requirement'
);
SELECT extensions.throws_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','30000000-0000-0000-0000-000000000005','workspace_id','20000000-0000-0000-0000-000000000001','actor_id','10000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT exige foto'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT exige foto'),'action','complete')))$$,
  'P0001', 'PHOTOS_REQUIRED',
  'completion is blocked without required server photos'
);
SELECT extensions.lives_ok(
  $$SELECT public.prepare_ot_upload_v1(jsonb_build_object('contract_version',1,'command_id','30000000-0000-0000-0000-000000000006','workspace_id','20000000-0000-0000-0000-000000000001','actor_id','10000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT exige foto'),'kind','work_order_photo','extension','jpg','size',1024)))$$,
  'prepares a deterministic upload intent'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ot_upload_intents WHERE id = '30000000-0000-0000-0000-000000000006'),
  1,
  'upload preparation persists one private intent'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT extensions.lives_ok(
  $$SELECT public.finalize_ot_upload_v1('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','https://cdn.getpangui.com/' || (SELECT object_key FROM public.ot_upload_intents WHERE id='30000000-0000-0000-0000-000000000006'),(SELECT object_key FROM public.ot_upload_intents WHERE id='30000000-0000-0000-0000-000000000006'),'local-etag',1024)$$,
  'verified service finalizes upload metadata atomically'
);
SELECT extensions.is(
  public.finalize_ot_upload_v1('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001','https://cdn.getpangui.com/' || (SELECT object_key FROM public.ot_upload_intents WHERE id='30000000-0000-0000-0000-000000000006'),(SELECT object_key FROM public.ot_upload_intents WHERE id='30000000-0000-0000-0000-000000000006'),'local-etag',1024) ->> 'replayed',
  'true',
  'upload finalization is idempotent'
);
RESET ROLE;
SELECT extensions.is(
  (SELECT status FROM public.ot_upload_intents WHERE id = '30000000-0000-0000-0000-000000000006'),
  'finalized',
  'finalize marks the intent complete'
);
SELECT extensions.is(
  (SELECT cardinality(fotos_urls) FROM public.ordenes_trabajo WHERE titulo = 'OT exige foto'),
  1,
  'finalize attaches exactly one server photo'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','30000000-0000-0000-0000-000000000009','workspace_id','20000000-0000-0000-0000-000000000001','actor_id','10000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT exige foto'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT exige foto'),'action','complete')))$$,
  'completion succeeds after verified photo finalization'
);
SELECT extensions.is(
  (SELECT estado FROM public.ordenes_trabajo WHERE titulo = 'OT exige foto'),
  'completado',
  'completion persists the canonical terminal state'
);
SELECT extensions.is(
  (public.get_work_order_rollout_v1() ->> 'create_enabled'),
  'false',
  'canonical commands remain disabled by default'
);

SELECT extensions.lives_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000013","workspace_id":"20000000-0000-0000-0000-000000000001","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"OT nullable arrays","asignados_ids":null,"categoria_ids":null}}'::jsonb)$$,
  'creation accepts nullable array fields from web and mobile clients'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.ordenes_trabajo WHERE titulo = 'OT nullable arrays'),
  1,
  'nullable array normalization still creates exactly one OT'
);

SELECT extensions.lives_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000014","workspace_id":"20000000-0000-0000-0000-000000000001","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"OT global category","categoria_id":"40000000-0000-0000-0000-000000000001","categoria_ids":["40000000-0000-0000-0000-000000000001"]}}'::jsonb)$$,
  'creation accepts a visible global default category'
);
SELECT extensions.is(
  (SELECT categoria_id::text FROM public.ordenes_trabajo WHERE titulo = 'OT global category'),
  '40000000-0000-0000-0000-000000000001',
  'creation persists the global default category'
);
SELECT extensions.throws_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"30000000-0000-0000-0000-000000000015","workspace_id":"20000000-0000-0000-0000-000000000001","actor_id":"10000000-0000-0000-0000-000000000001","payload":{"titulo":"OT foreign category","categoria_id":"40000000-0000-0000-0000-000000000002"}}'::jsonb)$$,
  'P0001', 'WORKSPACE_MISMATCH',
  'creation still rejects a category owned by another workspace'
);

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT public.process_work_order_notification_outbox_v1(100);
SELECT extensions.ok(
  (SELECT processed_at IS NOT NULL FROM public.work_order_notification_outbox WHERE command_id = '30000000-0000-0000-0000-000000000001'),
  'notification processor acknowledges the creation event'
);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.notifications n JOIN public.work_order_notification_outbox o ON o.id = n.source_outbox_id WHERE o.command_id = '30000000-0000-0000-0000-000000000001'),
  1,
  'creation notification is delivered once to the other active manager'
);
SELECT public.process_work_order_notification_outbox_v1(100);
SELECT extensions.is(
  (SELECT count(*)::integer FROM public.notifications n JOIN public.work_order_notification_outbox o ON o.id = n.source_outbox_id WHERE o.command_id = '30000000-0000-0000-0000-000000000001'),
  1,
  'reprocessing cannot duplicate an acknowledged notification'
);

SELECT * FROM extensions.finish();
ROLLBACK;
