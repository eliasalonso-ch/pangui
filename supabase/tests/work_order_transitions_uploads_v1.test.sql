BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT extensions.plan(32);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('11000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@test.local', '', now(), now(), now()),
  ('11000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tech@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre)
VALUES ('21000000-0000-0000-0000-000000000001', 'Transition workspace');

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'Owner', 'owner', '21000000-0000-0000-0000-000000000001', true),
  ('11000000-0000-0000-0000-000000000002', 'Technician', 'member', '21000000-0000-0000-0000-000000000001', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT extensions.lives_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"31000000-0000-0000-0000-000000000001","workspace_id":"21000000-0000-0000-0000-000000000001","actor_id":"11000000-0000-0000-0000-000000000001","payload":{"titulo":"OT transition matrix"}}'::jsonb)$$,
  'creates the transition test OT'
);
SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000002','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','assign','asignados_ids',jsonb_build_array('11000000-0000-0000-0000-000000000002'))))$$,
  'assigns a technician'
);
SELECT extensions.is((SELECT asignados_ids[1]::text FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), '11000000-0000-0000-0000-000000000002', 'assignment is persisted');
RESET ROLE;
SELECT extensions.is((SELECT count(*)::integer FROM public.work_order_notification_outbox WHERE command_id='31000000-0000-0000-0000-000000000002'), 1, 'assignment emits one recipient notification intent');
SET LOCAL ROLE authenticated;

SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000003','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','start')))$$,
  'starts the assigned OT'
);
SELECT extensions.is((SELECT estado FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'en_curso', 'start sets en_curso');
SELECT extensions.ok((SELECT en_ejecucion FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'start enables timer execution');

SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000004','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','pause','comment','Pausa controlada')))$$,
  'pauses a running OT'
);
SELECT extensions.is((SELECT estado FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'en_espera', 'pause sets en_espera');
SELECT extensions.ok(NOT (SELECT en_ejecucion FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'pause stops timer execution');

SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000005','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','resume')))$$,
  'resumes a paused OT'
);
SELECT extensions.is((SELECT estado FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'en_curso', 'resume sets en_curso');
SELECT extensions.ok((SELECT en_ejecucion FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'resume restarts timer execution');

SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000006','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','request_review')))$$,
  'requests review'
);
SELECT extensions.is((SELECT estado FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'en_revision', 'request_review sets en_revision');
SELECT extensions.ok(NOT (SELECT en_ejecucion FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'review stops timer execution');

SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000007','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','wait')))$$,
  'returns a review OT to waiting'
);
SELECT extensions.is((SELECT estado FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'en_espera', 'wait sets en_espera');

SELECT extensions.lives_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000008','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','cancel','comment','Cancelación de prueba')))$$,
  'cancels a waiting OT'
);
SELECT extensions.is((SELECT estado FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'), 'cancelado', 'cancel sets terminal state');
SELECT extensions.throws_ok(
  $$SELECT public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000009','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','start')))$$,
  'P0001', 'INVALID_STATE_TRANSITION', 'terminal OTs reject further transitions'
);
SELECT extensions.is(
  public.transition_work_order_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000008','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'expected_updated_at',(SELECT updated_at FROM public.ordenes_trabajo WHERE titulo='OT transition matrix'),'action','cancel','comment','Cancelación de prueba'))) ->> 'replayed',
  'true', 'transition replay returns its stored result'
);

SELECT extensions.lives_ok(
  $$SELECT public.create_work_order_v1('{"contract_version":1,"command_id":"31000000-0000-0000-0000-000000000010","workspace_id":"21000000-0000-0000-0000-000000000001","actor_id":"11000000-0000-0000-0000-000000000001","payload":{"titulo":"OT attachment lifecycle"}}'::jsonb)$$,
  'creates the upload lifecycle OT'
);
SELECT extensions.lives_ok(
  $$SELECT public.prepare_ot_upload_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000011','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT attachment lifecycle'),'kind','work_order_attachment','extension','pdf','size',2048,'original_name','informe.pdf')))$$,
  'prepares a PDF attachment'
);
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT extensions.lives_ok(
  $$SELECT public.finalize_ot_upload_v1('31000000-0000-0000-0000-000000000011','11000000-0000-0000-0000-000000000001','https://cdn.getpangui.com/' || (SELECT object_key FROM public.ot_upload_intents WHERE id='31000000-0000-0000-0000-000000000011'),(SELECT object_key FROM public.ot_upload_intents WHERE id='31000000-0000-0000-0000-000000000011'),'attachment-etag',2048)$$,
  'finalizes PDF attachment metadata'
);
RESET ROLE;
SELECT extensions.is((SELECT links -> 0 ->> 'nombre' FROM public.ordenes_trabajo WHERE titulo='OT attachment lifecycle'), 'informe.pdf', 'attachment keeps its original name');
SELECT extensions.is((SELECT links -> 0 ->> 'origen' FROM public.ordenes_trabajo WHERE titulo='OT attachment lifecycle'), 'ejecucion', 'attachment records execution origin');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT extensions.lives_ok(
  $$SELECT public.prepare_ot_upload_v1(jsonb_build_object('contract_version',1,'command_id','31000000-0000-0000-0000-000000000012','workspace_id','21000000-0000-0000-0000-000000000001','actor_id','11000000-0000-0000-0000-000000000001','payload',jsonb_build_object('ot_id',(SELECT id FROM public.ordenes_trabajo WHERE titulo='OT attachment lifecycle'),'kind','work_order_attachment','extension','txt','size',100,'original_name','temporal.txt')))$$,
  'prepares an attachment that will expire'
);
RESET ROLE;
UPDATE public.ot_upload_intents SET expires_at = now() - interval '1 minute' WHERE id='31000000-0000-0000-0000-000000000012';
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT extensions.lives_ok($$SELECT * FROM public.expire_ot_upload_intents_v1(100)$$, 'reconciliation claims expired intents');
RESET ROLE;
SELECT extensions.is((SELECT status FROM public.ot_upload_intents WHERE id='31000000-0000-0000-0000-000000000012'), 'cleanup_pending', 'expired intent waits for object cleanup');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SELECT extensions.is(public.complete_ot_upload_cleanup_v1(ARRAY['31000000-0000-0000-0000-000000000012'::uuid]), 1, 'cleanup completion updates exactly one intent');
RESET ROLE;
SELECT extensions.is((SELECT status FROM public.ot_upload_intents WHERE id='31000000-0000-0000-0000-000000000012'), 'expired', 'cleanup reaches terminal expired status');

SELECT * FROM extensions.finish();
ROLLBACK;
