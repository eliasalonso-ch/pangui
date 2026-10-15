-- El proveedor ejecuta pero no edita (20261015140000_envios_guardia_edicion.sql).
-- Termina LANZANDO una excepción a propósito con "RESULTADO"; todo se revierte.

BEGIN;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('b4000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dueno4@test.local', '', now(), now(), now()),
  ('b4000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'prov4@test.local', '', now(), now(), now()),
  ('b4000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tecnico4@test.local', '', now(), now(), now());
SET LOCAL session_replication_role = origin;

INSERT INTO public.workspaces (id, nombre, tipo) VALUES
  ('a4000000-0000-0000-0000-000000000001', 'Dueño', 'propietario'),
  ('a4000000-0000-0000-0000-000000000002', 'Proveedor', 'subcontratista');
INSERT INTO public.usuarios (id, nombre, rol, workspace_id, activo) VALUES
  ('b4000000-0000-0000-0000-000000000001', 'Dueña', 'owner', 'a4000000-0000-0000-0000-000000000001', true),
  ('b4000000-0000-0000-0000-000000000002', 'Jefe', 'owner', 'a4000000-0000-0000-0000-000000000002', true),
  ('b4000000-0000-0000-0000-000000000003', 'Técnico', 'member', 'a4000000-0000-0000-0000-000000000002', true);
INSERT INTO public.proveedores (id, nombre, workspace_id)
VALUES ('c4000000-0000-0000-0000-000000000001', 'Proveedor SpA', 'a4000000-0000-0000-0000-000000000001');
INSERT INTO public.ordenes_trabajo (id, tipo, descripcion, titulo, workspace_id, creado_por, links)
VALUES ('e4000000-0000-0000-0000-000000000001', 'solicitud', 'x', 'OT del dueño', 'a4000000-0000-0000-0000-000000000001',
        'b4000000-0000-0000-0000-000000000001', '[{"url":"https://x/plano.pdf","nombre":"Plano","tipo":"archivo"}]');

CREATE TEMP TABLE _r (n serial, nombre text, ok boolean);
GRANT ALL ON _r TO authenticated;
GRANT ALL ON SEQUENCE _r_n_seq TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-0000-0000-000000000001', true);
SELECT public.invitar_contratista('c4000000-0000-0000-0000-000000000001', 'prov4@test.local');
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-0000-0000-000000000002', true);
SELECT public.aceptar_vinculo_contratista((SELECT id FROM public.mis_invitaciones_contratista()));
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-0000-0000-000000000001', true);
SELECT public.enviar_ot_contratista('e4000000-0000-0000-0000-000000000001', (SELECT id FROM public.vinculos_contratista), null);

-- El proveedor no edita.
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-0000-0000-000000000002', true);
CREATE TEMP TABLE _intentos (nombre text, sql text);
GRANT ALL ON _intentos TO authenticated;
INSERT INTO _intentos VALUES
  ('no cambia el título',        $q$UPDATE public.ordenes_trabajo SET titulo = 'otro' WHERE id = 'e4000000-0000-0000-0000-000000000001'$q$),
  ('no cambia la prioridad',     $q$UPDATE public.ordenes_trabajo SET prioridad = 'urgente' WHERE id = 'e4000000-0000-0000-0000-000000000001'$q$),
  ('no cambia el vencimiento',   $q$UPDATE public.ordenes_trabajo SET fecha_termino = now() WHERE id = 'e4000000-0000-0000-0000-000000000001'$q$),
  ('no apaga los requisitos',    $q$UPDATE public.ordenes_trabajo SET requiere_fotos = true WHERE id = 'e4000000-0000-0000-0000-000000000001'$q$),
  ('no asigna gente del dueño',  $q$UPDATE public.ordenes_trabajo SET asignados_ids = ARRAY['b4000000-0000-0000-0000-000000000001'::uuid] WHERE id = 'e4000000-0000-0000-0000-000000000001'$q$),
  ('no borra el plano del dueño', $q$UPDATE public.ordenes_trabajo SET links = '[]'::jsonb WHERE id = 'e4000000-0000-0000-0000-000000000001'$q$);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM _intentos LOOP
    BEGIN
      EXECUTE r.sql;
      INSERT INTO _r (nombre, ok) VALUES (r.nombre, false);
    EXCEPTION WHEN others THEN
      INSERT INTO _r (nombre, ok) VALUES (r.nombre, true);
    END;
  END LOOP;
END $$;

-- Pero sí ejecuta.
UPDATE public.ordenes_trabajo SET estado = 'en_curso', en_ejecucion = true, iniciado_at = now()
WHERE id = 'e4000000-0000-0000-0000-000000000001';
UPDATE public.ordenes_trabajo SET asignados_ids = ARRAY['b4000000-0000-0000-0000-000000000003'::uuid]
WHERE id = 'e4000000-0000-0000-0000-000000000001';
UPDATE public.ordenes_trabajo SET fotos_urls = ARRAY['https://x/foto.jpg'],
  links = links || '[{"url":"https://x/informe.pdf","nombre":"Informe","tipo":"archivo"}]'::jsonb,
  cliente_firma_url = 'https://x/firma.png', cliente_firma_nombre = 'Juan'
WHERE id = 'e4000000-0000-0000-0000-000000000001';
INSERT INTO _r (nombre, ok) SELECT 'inicia, asigna a su técnico, sube foto, agrega informe y firma',
  (SELECT estado = 'en_curso' AND asignados_ids = ARRAY['b4000000-0000-0000-0000-000000000003'::uuid]
          AND jsonb_array_length(links) = 2 AND cliente_firma_nombre = 'Juan'
     FROM public.ordenes_trabajo WHERE id = 'e4000000-0000-0000-0000-000000000001');
UPDATE public.ordenes_trabajo SET estado = 'en_revision', en_ejecucion = false WHERE id = 'e4000000-0000-0000-0000-000000000001';
INSERT INTO _r (nombre, ok) SELECT 'envía a revisión',
  (SELECT estado FROM public.ordenes_trabajo WHERE id = 'e4000000-0000-0000-0000-000000000001') = 'en_revision';

-- El dueño sigue editando todo.
SELECT set_config('request.jwt.claim.sub', 'b4000000-0000-0000-0000-000000000001', true);
UPDATE public.ordenes_trabajo SET titulo = 'Título corregido', prioridad = 'alta' WHERE id = 'e4000000-0000-0000-0000-000000000001';
INSERT INTO _r (nombre, ok) SELECT 'el dueño edita su OT',
  (SELECT titulo FROM public.ordenes_trabajo WHERE id = 'e4000000-0000-0000-0000-000000000001') = 'Título corregido';

RESET ROLE;
DO $$ BEGIN
  RAISE EXCEPTION E'RESULTADO\n%', (
    SELECT string_agg(CASE WHEN ok THEN 'OK    ' ELSE 'FALLA ' END || nombre, E'\n' ORDER BY n) FROM _r
  );
END $$;
