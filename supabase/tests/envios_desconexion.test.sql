-- Desconectar / reconectar (20261015120000_envios_desconexion.sql).
--
-- Igual que envios_contratista.test.sql: termina LANZANDO una excepción a
-- propósito con "RESULTADO" (una línea OK/FALLA por chequeo) y todo se revierte.
-- Para probar la migración antes de aplicarla, pégala entre BEGIN y el resto.

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('b2000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno2@test.local', '', now(), now(), now()),
  ('b2000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contratista2@test.local', '', now(), now(), now()),
  ('b2000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tecnico2@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre, tipo) VALUES
  ('a2000000-0000-0000-0000-000000000001', 'Dueño', 'propietario'),
  ('a2000000-0000-0000-0000-000000000002', 'Contratista', 'subcontratista');
INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo) VALUES
  ('b2000000-0000-0000-0000-000000000001', 'Dueña', 'owner', 'a2000000-0000-0000-0000-000000000001', true),
  ('b2000000-0000-0000-0000-000000000002', 'Supervisor', 'owner', 'a2000000-0000-0000-0000-000000000002', true),
  ('b2000000-0000-0000-0000-000000000003', 'Técnico', 'member', 'a2000000-0000-0000-0000-000000000002', true);
INSERT INTO public.proveedores (id, nombre, workspace_id)
VALUES ('c2000000-0000-0000-0000-000000000001', 'Contratista SpA', 'a2000000-0000-0000-0000-000000000001');
INSERT INTO public.ordenes_trabajo (id, tipo, descripcion, titulo, workspace_id, creado_por) VALUES
  ('e2000000-0000-0000-0000-000000000001', 'solicitud', 'x', 'OT abierta', 'a2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000002', 'solicitud', 'x', 'OT cerrada', 'a2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001'),
  ('e2000000-0000-0000-0000-000000000003', 'solicitud', 'x', 'OT retirada', 'a2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001');

CREATE TEMP TABLE _r (n serial, nombre text, ok boolean);
GRANT ALL ON _r TO authenticated;
GRANT ALL ON SEQUENCE _r_n_seq TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Conectar y enviar las tres OTs.
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);
SELECT public.invitar_contratista('c2000000-0000-0000-0000-000000000001', 'contratista2@test.local');
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000002', true);
SELECT public.aceptar_vinculo_contratista((SELECT id FROM public.mis_invitaciones_contratista()));
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);
SELECT public.enviar_ot_contratista(o, (SELECT id FROM public.vinculos_contratista), null)
FROM unnest(ARRAY['e2000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000002','e2000000-0000-0000-0000-000000000003']::uuid[]) o;

-- El contratista asigna a su técnico; el dueño cierra una y retira otra.
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000002', true);
UPDATE public.ordenes_trabajo SET asignados_ids = ARRAY['b2000000-0000-0000-0000-000000000003'::uuid]
WHERE id = 'e2000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);
UPDATE public.ordenes_trabajo SET estado = 'completado' WHERE id = 'e2000000-0000-0000-0000-000000000002';
SELECT public.retirar_envio_ot('e2000000-0000-0000-0000-000000000003');
INSERT INTO _r (nombre, ok) SELECT 'dueño ve 1 OT abierta en el vínculo',
  (SELECT ots_abiertas FROM public.mis_vinculos()) = 1;

-- El contratista corta.
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000002', true);
SELECT public.revocar_vinculo_contratista((SELECT id FROM public.vinculos_contratista));
INSERT INTO _r (nombre, ok) SELECT 'tras cortar no ve la OT abierta', NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e2000000-0000-0000-0000-000000000001');
INSERT INTO _r (nombre, ok) SELECT 'sigue viendo la OT cerrada', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e2000000-0000-0000-0000-000000000002');
INSERT INTO _r (nombre, ok) SELECT 'quien cortó puede reconectar', (SELECT puedo_reconectar FROM public.mis_vinculos());
INSERT INTO _r (nombre, ok) SELECT 've al cliente por su nombre', (SELECT contraparte FROM public.mis_vinculos()) = 'Dueño';

SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);
INSERT INTO _r (nombre, ok) SELECT 'la OT abierta quedó sin técnicos',
  (SELECT coalesce(cardinality(asignados_ids), 0) FROM public.ordenes_trabajo WHERE id = 'e2000000-0000-0000-0000-000000000001') = 0;
INSERT INTO _r (nombre, ok) SELECT 'el corte queda en la actividad',
  EXISTS (SELECT 1 FROM public.actividad_ot WHERE orden_id = 'e2000000-0000-0000-0000-000000000001' AND comentario LIKE 'Contratista SpA cortó la conexión%');
INSERT INTO _r (nombre, ok) SELECT 'el otro lado no puede reconectar', NOT (SELECT puedo_reconectar FROM public.mis_vinculos());
DO $$ BEGIN
  PERFORM public.reconectar_vinculo_contratista((SELECT id FROM public.vinculos_contratista));
  INSERT INTO _r (nombre, ok) VALUES ('el dueño no deshace un corte ajeno', false);
EXCEPTION WHEN others THEN INSERT INTO _r (nombre, ok) VALUES ('el dueño no deshace un corte ajeno', true);
END $$;

RESET ROLE;
INSERT INTO _r (nombre, ok) SELECT 'el dueño recibió la notificación',
  (SELECT count(*) FROM public.notifications WHERE usuario_id = 'b2000000-0000-0000-0000-000000000001' AND tipo = 'vinculo_contratista') = 1;
SET LOCAL ROLE authenticated;

-- El contratista se arrepiente.
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000002', true);
INSERT INTO _r (nombre, ok) SELECT 'reconectar devuelve 1 OT', public.reconectar_vinculo_contratista((SELECT id FROM public.vinculos_contratista)) = 1;
INSERT INTO _r (nombre, ok) SELECT 'vuelve a ver la OT abierta', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e2000000-0000-0000-0000-000000000001');
INSERT INTO _r (nombre, ok) SELECT 'vuelven sus técnicos',
  (SELECT asignados_ids FROM public.ordenes_trabajo WHERE id = 'e2000000-0000-0000-0000-000000000001') = ARRAY['b2000000-0000-0000-0000-000000000003'::uuid];
INSERT INTO _r (nombre, ok) SELECT 'la OT retirada a propósito no vuelve', NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e2000000-0000-0000-0000-000000000003');

-- Pasados 30 días ya no se puede deshacer.
SELECT public.revocar_vinculo_contratista((SELECT id FROM public.vinculos_contratista));
RESET ROLE;
UPDATE public.vinculos_contratista SET revocado_at = now() - interval '31 days';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000002', true);
INSERT INTO _r (nombre, ok) SELECT 'a los 31 días no ofrece reconectar', NOT (SELECT puedo_reconectar FROM public.mis_vinculos());
DO $$ BEGIN
  PERFORM public.reconectar_vinculo_contratista((SELECT id FROM public.vinculos_contratista));
  INSERT INTO _r (nombre, ok) VALUES ('a los 31 días reconectar falla', false);
EXCEPTION WHEN others THEN INSERT INTO _r (nombre, ok) VALUES ('a los 31 días reconectar falla', true);
END $$;

RESET ROLE;
DO $$ BEGIN
  RAISE EXCEPTION E'RESULTADO\n%', (
    SELECT string_agg(CASE WHEN ok THEN 'OK    ' ELSE 'FALLA ' END || nombre, E'\n' ORDER BY n) FROM _r
  );
END $$;
