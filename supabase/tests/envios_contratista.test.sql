-- Envío de OTs dueño → contratista (20261014230000_envios_contratista.sql).
--
-- Corre dentro de una transacción y TERMINA LANZANDO UNA EXCEPCIÓN a propósito:
-- el mensaje "RESULTADO" trae una línea OK/FALLA por chequeo y la excepción
-- revierte todo, así que se puede correr contra cualquier base sin dejar rastro.
-- Si una sentencia que debía funcionar falla, la corrida se corta con ese error.

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('b1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno@test.local', '', now(), now(), now()),
  ('b1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contratista@test.local', '', now(), now(), now()),
  ('b1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tecnico@test.local', '', now(), now(), now()),
  ('b1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ajeno@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre, tipo) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Dueño', 'propietario'),
  ('a1000000-0000-0000-0000-000000000002', 'Contratista', 'subcontratista'),
  ('a1000000-0000-0000-0000-000000000003', 'Ajeno', 'subcontratista');

INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'Dueña', 'owner', 'a1000000-0000-0000-0000-000000000001', true),
  ('b1000000-0000-0000-0000-000000000002', 'Supervisor', 'owner', 'a1000000-0000-0000-0000-000000000002', true),
  ('b1000000-0000-0000-0000-000000000003', 'Técnico', 'member', 'a1000000-0000-0000-0000-000000000002', true),
  ('b1000000-0000-0000-0000-000000000004', 'Ajeno', 'owner', 'a1000000-0000-0000-0000-000000000003', true);

INSERT INTO public.proveedores (id, nombre, workspace_id)
VALUES ('c1000000-0000-0000-0000-000000000001', 'Contratista SpA', 'a1000000-0000-0000-0000-000000000001');
INSERT INTO public.activos (id, nombre, workspace_id) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Generador', 'a1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002', 'Otro activo', 'a1000000-0000-0000-0000-000000000001');
INSERT INTO public.ordenes_trabajo (id, tipo, descripcion, titulo, workspace_id, activo_id, creado_por) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'solicitud', 'x', 'OT enviada', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001'),
  ('e1000000-0000-0000-0000-000000000002', 'solicitud', 'x', 'OT privada', 'a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001');
INSERT INTO public.procedimientos (id, workspace_id, nombre)
VALUES ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Checklist generador');
INSERT INTO public.procedimiento_pasos (id, procedimiento_id, orden, tipo, titulo)
VALUES ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 1, 'si_no_na', '¿Arranca?');
INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id)
VALUES ('e1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001');

CREATE TEMP TABLE _r (n serial, nombre text, ok boolean);
GRANT ALL ON _r TO authenticated;
GRANT ALL ON SEQUENCE _r_n_seq TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Dueño invita al contratista por correo.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
INSERT INTO _r (nombre, ok) SELECT 'dueño invita', public.invitar_contratista('c1000000-0000-0000-0000-000000000001', ' Contratista@Test.local ') IS NOT NULL;
DO $$ BEGIN
  PERFORM public.enviar_ot_contratista('e1000000-0000-0000-0000-000000000001', (SELECT id FROM public.vinculos_contratista LIMIT 1), null);
  INSERT INTO _r (nombre, ok) VALUES ('no se envía a un vínculo sin aceptar', false);
EXCEPTION WHEN others THEN INSERT INTO _r (nombre, ok) VALUES ('no se envía a un vínculo sin aceptar', true);
END $$;

-- Un tercero no ve ni acepta la invitación.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', true);
INSERT INTO _r (nombre, ok) SELECT 'ajeno no ve la invitación', (SELECT count(*) FROM public.mis_invitaciones_contratista()) = 0;
DO $$ BEGIN
  PERFORM public.aceptar_vinculo_contratista((SELECT v.id FROM public.vinculos_contratista v LIMIT 1));
  INSERT INTO _r (nombre, ok) VALUES ('ajeno no puede aceptar', false);
EXCEPTION WHEN others THEN INSERT INTO _r (nombre, ok) VALUES ('ajeno no puede aceptar', true);
END $$;

-- El técnico (member) tampoco acepta, aunque sea del contratista.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
INSERT INTO _r (nombre, ok) SELECT 'invitado ve su invitación', (SELECT cliente FROM public.mis_invitaciones_contratista()) = 'Dueño';
INSERT INTO _r (nombre, ok) SELECT 'contratista no ve la OT antes del envío', NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e1000000-0000-0000-0000-000000000001');
SELECT public.aceptar_vinculo_contratista((SELECT id FROM public.mis_invitaciones_contratista()));

-- Dueño envía la OT.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
SELECT public.enviar_ot_contratista(
  'e1000000-0000-0000-0000-000000000001',
  (SELECT id FROM public.vinculos_contratista WHERE estado = 'activo'),
  'Revisar generador'
);
INSERT INTO _r (nombre, ok) SELECT 'dueño ve el envío', (SELECT nombre_destino FROM public.ot_envios WHERE orden_id = 'e1000000-0000-0000-0000-000000000001') = 'Contratista SpA';

-- Contratista: ve solo lo enviado.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
INSERT INTO _r (nombre, ok) SELECT 'contratista ve la OT enviada', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e1000000-0000-0000-0000-000000000001');
INSERT INTO _r (nombre, ok) SELECT 'contratista no ve la OT privada', NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e1000000-0000-0000-0000-000000000002');
INSERT INTO _r (nombre, ok) SELECT 'contratista ve el activo de la OT', EXISTS (SELECT 1 FROM public.activos WHERE id = 'd1000000-0000-0000-0000-000000000001');
INSERT INTO _r (nombre, ok) SELECT 'contratista no ve otros activos', NOT EXISTS (SELECT 1 FROM public.activos WHERE id = 'd1000000-0000-0000-0000-000000000002');
INSERT INTO _r (nombre, ok) SELECT 'contratista ve el procedimiento y sus pasos',
  EXISTS (SELECT 1 FROM public.procedimientos WHERE id = 'f1000000-0000-0000-0000-000000000001')
  AND EXISTS (SELECT 1 FROM public.procedimiento_pasos WHERE id = 'f2000000-0000-0000-0000-000000000001');
INSERT INTO _r (nombre, ok) SELECT 'contratista ve el nombre del cliente', (SELECT nombre_origen FROM public.ot_envios WHERE orden_id = 'e1000000-0000-0000-0000-000000000001') = 'Dueño';
UPDATE public.ordenes_trabajo SET asignados_ids = ARRAY['b1000000-0000-0000-0000-000000000003'::uuid] WHERE id = 'e1000000-0000-0000-0000-000000000001';

-- Técnico ejecuta.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000003', true);
UPDATE public.ordenes_trabajo SET estado = 'en_curso', en_ejecucion = true, iniciado_at = now() WHERE id = 'e1000000-0000-0000-0000-000000000001';
INSERT INTO public.actividad_ot (orden_id, usuario_id, tipo, comentario, workspace_id)
VALUES ('e1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'comentario', 'Llegué al generador', 'a1000000-0000-0000-0000-000000000002');
INSERT INTO public.procedimiento_ejecuciones (id, procedimiento_id, orden_id, workspace_id, estado, iniciado_por)
VALUES ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'en_curso', 'b1000000-0000-0000-0000-000000000003');
INSERT INTO public.paso_respuestas (ejecucion_id, paso_id, valor_texto, workspace_id, respondido_por)
VALUES ('f3000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001', 'si', 'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000003');
DO $$ BEGIN
  UPDATE public.ordenes_trabajo SET estado = 'completado' WHERE id = 'e1000000-0000-0000-0000-000000000001';
  INSERT INTO _r (nombre, ok) VALUES ('contratista no puede cerrar', false);
EXCEPTION WHEN others THEN INSERT INTO _r (nombre, ok) VALUES ('contratista no puede cerrar', true);
END $$;
DO $$ BEGIN
  UPDATE public.ordenes_trabajo SET workspace_id = 'a1000000-0000-0000-0000-000000000002' WHERE id = 'e1000000-0000-0000-0000-000000000001';
  INSERT INTO _r (nombre, ok) VALUES ('contratista no puede llevarse la OT', false);
EXCEPTION WHEN others THEN INSERT INTO _r (nombre, ok) VALUES ('contratista no puede llevarse la OT', true);
END $$;
UPDATE public.ordenes_trabajo SET estado = 'en_revision', en_ejecucion = false WHERE id = 'e1000000-0000-0000-0000-000000000001';
INSERT INTO _r (nombre, ok) SELECT 'contratista envía a revisión', (SELECT estado FROM public.ordenes_trabajo WHERE id = 'e1000000-0000-0000-0000-000000000001') = 'en_revision';

-- Dueño ve todo en vivo y aprueba.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000001', true);
INSERT INTO _r (nombre, ok) SELECT 'dueño ve el comentario del técnico', EXISTS (SELECT 1 FROM public.actividad_ot WHERE orden_id = 'e1000000-0000-0000-0000-000000000001' AND comentario = 'Llegué al generador');
INSERT INTO _r (nombre, ok) SELECT 'dueño ve la ejecución del procedimiento', EXISTS (SELECT 1 FROM public.procedimiento_ejecuciones WHERE id = 'f3000000-0000-0000-0000-000000000001');
INSERT INTO _r (nombre, ok) SELECT 'dueño ve la respuesta del paso', EXISTS (SELECT 1 FROM public.paso_respuestas WHERE ejecucion_id = 'f3000000-0000-0000-0000-000000000001');
UPDATE public.ordenes_trabajo SET estado = 'completado' WHERE id = 'e1000000-0000-0000-0000-000000000001';
INSERT INTO _r (nombre, ok) SELECT 'dueño aprueba', (SELECT estado FROM public.ordenes_trabajo WHERE id = 'e1000000-0000-0000-0000-000000000001') = 'completado';

-- Un tercero no ve nada.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000004', true);
INSERT INTO _r (nombre, ok) SELECT 'ajeno no ve OT, actividad ni envío',
  NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e1000000-0000-0000-0000-000000000001')
  AND NOT EXISTS (SELECT 1 FROM public.actividad_ot WHERE orden_id = 'e1000000-0000-0000-0000-000000000001')
  AND NOT EXISTS (SELECT 1 FROM public.ot_envios);

-- El contratista corta: conserva la OT cerrada para cobrarla, pero no la edita.
SELECT set_config('request.jwt.claim.sub', 'b1000000-0000-0000-0000-000000000002', true);
SELECT public.revocar_vinculo_contratista((SELECT id FROM public.vinculos_contratista));
INSERT INTO _r (nombre, ok) SELECT 'tras revocar sigue viendo la OT cerrada', EXISTS (SELECT 1 FROM public.ordenes_trabajo WHERE id = 'e1000000-0000-0000-0000-000000000001');
DO $$ BEGIN
  UPDATE public.ordenes_trabajo SET titulo = 'cambiada' WHERE id = 'e1000000-0000-0000-0000-000000000001';
  INSERT INTO _r (nombre, ok) VALUES ('no edita una OT cerrada', false);
EXCEPTION WHEN others THEN INSERT INTO _r (nombre, ok) VALUES ('no edita una OT cerrada', true);
END $$;

RESET ROLE;

-- Plan de mantención con proveedor conectado: su OT se envía sola.
UPDATE public.vinculos_contratista SET estado = 'activo', revocado_at = null;
INSERT INTO public.planes_mantencion (id, workspace_id, nombre, activo_id, proveedor_id, recurrencia, fecha_inicio)
VALUES ('f4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Plan generador', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'mensual', current_date);
INSERT INTO public.ordenes_trabajo (id, tipo, descripcion, titulo, workspace_id)
VALUES ('e1000000-0000-0000-0000-000000000003', 'solicitud', 'x', 'OT del plan', 'a1000000-0000-0000-0000-000000000001');
INSERT INTO public.plan_ocurrencias (plan_id, workspace_id, fecha_programada, fecha_apertura, iteracion, orden_id)
VALUES ('f4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', current_date, current_date, 1, 'e1000000-0000-0000-0000-000000000003');
INSERT INTO _r (nombre, ok) SELECT 'la OT del plan se envía sola', EXISTS (SELECT 1 FROM public.ot_envios WHERE orden_id = 'e1000000-0000-0000-0000-000000000003' AND activo);

DO $$ BEGIN
  RAISE EXCEPTION E'RESULTADO\n%', (
    SELECT string_agg(CASE WHEN ok THEN 'OK    ' ELSE 'FALLA ' END || nombre, E'\n' ORDER BY n) FROM _r
  );
END $$;
