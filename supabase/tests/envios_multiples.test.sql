-- Una OT enviada a varios proveedores (20261015130000_envios_multiples.sql).
-- Termina LANZANDO una excepción a propósito con "RESULTADO"; todo se revierte.

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('b3000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno3@test.local', '', now(), now(), now()),
  ('b3000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prova3@test.local', '', now(), now(), now()),
  ('b3000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tecnicoa3@test.local', '', now(), now(), now()),
  ('b3000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'provb3@test.local', '', now(), now(), now()),
  ('b3000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tecnicob3@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre, tipo) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'Dueño', 'propietario'),
  ('a3000000-0000-0000-0000-000000000002', 'Eléctrica A', 'subcontratista'),
  ('a3000000-0000-0000-0000-000000000003', 'Civil B', 'subcontratista');
INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo) VALUES
  ('b3000000-0000-0000-0000-000000000001', 'Dueña', 'owner', 'a3000000-0000-0000-0000-000000000001', true),
  ('b3000000-0000-0000-0000-000000000002', 'Jefe A', 'owner', 'a3000000-0000-0000-0000-000000000002', true),
  ('b3000000-0000-0000-0000-000000000003', 'Técnico A', 'member', 'a3000000-0000-0000-0000-000000000002', true),
  ('b3000000-0000-0000-0000-000000000004', 'Jefe B', 'owner', 'a3000000-0000-0000-0000-000000000003', true),
  ('b3000000-0000-0000-0000-000000000005', 'Técnico B', 'member', 'a3000000-0000-0000-0000-000000000003', true);
INSERT INTO public.proveedores (id, nombre, workspace_id) VALUES
  ('c3000000-0000-0000-0000-000000000001', 'Eléctrica A', 'a3000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000002', 'Civil B', 'a3000000-0000-0000-0000-000000000001');
INSERT INTO public.ordenes_trabajo (id, tipo, descripcion, titulo, workspace_id, creado_por)
VALUES ('e3000000-0000-0000-0000-000000000001', 'solicitud', 'x', 'OT compartida', 'a3000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001');

CREATE TEMP TABLE _r (n serial, nombre text, ok boolean);
GRANT ALL ON _r TO authenticated;
GRANT ALL ON SEQUENCE _r_n_seq TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Conectar a los dos proveedores.
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000001', true);
SELECT public.invitar_contratista('c3000000-0000-0000-0000-000000000001', 'prova3@test.local');
SELECT public.invitar_contratista('c3000000-0000-0000-0000-000000000002', 'provb3@test.local');
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000002', true);
SELECT public.aceptar_vinculo_contratista((SELECT id FROM public.mis_invitaciones_contratista()));
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000004', true);
SELECT public.aceptar_vinculo_contratista((SELECT id FROM public.mis_invitaciones_contratista()));

-- La misma OT a los dos.
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000001', true);
SELECT public.enviar_ot_contratista('e3000000-0000-0000-0000-000000000001', v.id, null)
FROM public.vinculos_contratista v WHERE v.estado = 'activo';
INSERT INTO _r (nombre, ok) SELECT 'la OT queda enviada a 2 proveedores',
  (SELECT count(*) FROM public.ot_envios WHERE orden_id = 'e3000000-0000-0000-0000-000000000001' AND activo) = 2;

-- Cada proveedor asigna a su técnico.
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000002', true);
INSERT INTO _r (nombre, ok) SELECT 'A ve la OT', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001');
INSERT INTO _r (nombre, ok) SELECT 'A solo ve su propio envío', (SELECT count(*) FROM public.ot_envios) = 1;
UPDATE public.ordenes_trabajo SET asignados_ids = asignados_ids || 'b3000000-0000-0000-0000-000000000003'::uuid
WHERE id = 'e3000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000004', true);
INSERT INTO _r (nombre, ok) SELECT 'B ve la OT', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001');
UPDATE public.ordenes_trabajo SET asignados_ids = asignados_ids || 'b3000000-0000-0000-0000-000000000005'::uuid
WHERE id = 'e3000000-0000-0000-0000-000000000001';

-- El dueño retira a B: A y su técnico siguen.
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000001', true);
SELECT public.retirar_envio_ot('e3000000-0000-0000-0000-000000000001',
  (SELECT id FROM public.vinculos_contratista WHERE proveedor_id = 'c3000000-0000-0000-0000-000000000002'));
INSERT INTO _r (nombre, ok) SELECT 'retirar a B deja solo al técnico de A',
  (SELECT asignados_ids FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001') = ARRAY['b3000000-0000-0000-0000-000000000003'::uuid];
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000004', true);
INSERT INTO _r (nombre, ok) SELECT 'B ya no ve la OT', NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000002', true);
INSERT INTO _r (nombre, ok) SELECT 'A la sigue viendo', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001');

-- Se reenvía a B, que vuelve a asignar; luego A corta y reconecta.
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000001', true);
SELECT public.enviar_ot_contratista('e3000000-0000-0000-0000-000000000001',
  (SELECT id FROM public.vinculos_contratista WHERE proveedor_id = 'c3000000-0000-0000-0000-000000000002'), null);
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000004', true);
UPDATE public.ordenes_trabajo SET asignados_ids = asignados_ids || 'b3000000-0000-0000-0000-000000000005'::uuid
WHERE id = 'e3000000-0000-0000-0000-000000000001';

SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000002', true);
SELECT public.revocar_vinculo_contratista((SELECT id FROM public.vinculos_contratista));
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000001', true);
INSERT INTO _r (nombre, ok) SELECT 'el corte de A no saca al técnico de B',
  (SELECT asignados_ids FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001') = ARRAY['b3000000-0000-0000-0000-000000000005'::uuid];
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000004', true);
INSERT INTO _r (nombre, ok) SELECT 'B sigue viendo la OT tras el corte de A', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001');

SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000002', true);
INSERT INTO _r (nombre, ok) SELECT 'A reconecta y recupera la OT', public.reconectar_vinculo_contratista((SELECT id FROM public.vinculos_contratista)) = 1;
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000001', true);
INSERT INTO _r (nombre, ok) SELECT 'vuelve el técnico de A junto al de B',
  (SELECT asignados_ids @> ARRAY['b3000000-0000-0000-0000-000000000003'::uuid, 'b3000000-0000-0000-0000-000000000005'::uuid]
          AND cardinality(asignados_ids) = 2
     FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001');

-- Cualquiera envía a revisión; el dueño aprueba y se cierra para todos.
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000005', true);
UPDATE public.ordenes_trabajo SET estado = 'en_revision' WHERE id = 'e3000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub', 'b3000000-0000-0000-0000-000000000001', true);
UPDATE public.ordenes_trabajo SET estado = 'completado' WHERE id = 'e3000000-0000-0000-0000-000000000001';
INSERT INTO _r (nombre, ok) SELECT 'el dueño aprueba la OT compartida',
  (SELECT estado FROM public.ordenes_trabajo WHERE id = 'e3000000-0000-0000-0000-000000000001') = 'completado';

RESET ROLE;
DO $$ BEGIN
  RAISE EXCEPTION E'RESULTADO\n%', (
    SELECT string_agg(CASE WHEN ok THEN 'OK    ' ELSE 'FALLA ' END || nombre, E'\n' ORDER BY n) FROM _r
  );
END $$;
