-- ── 1. OFICIOS GLOBALES ───────────────────────────────────────────────────────

INSERT INTO public.oficios (id, workspace_id, nombre, slug, icono, color, activo)
VALUES
  ('00000000-0f01-0000-0000-000000000001', NULL, 'Electricista',           'electricista',        'flash-outline',         '#F59E0B', true),
  ('00000000-0f01-0000-0000-000000000002', NULL, 'Plomero',                'plomero',             'water-outline',         '#3B82F6', true),
  ('00000000-0f01-0000-0000-000000000003', NULL, 'Carpintero',             'carpintero',          'construct-outline',     '#92400E', true),
  ('00000000-0f01-0000-0000-000000000004', NULL, 'Soldador',               'soldador',            'flame-outline',         '#EF4444', true),
  ('00000000-0f01-0000-0000-000000000005', NULL, 'Técnico HVAC',           'tecnico-hvac',        'thermometer-outline',   '#06B6D4', true),
  ('00000000-0f01-0000-0000-000000000006', NULL, 'Técnico Corrientes Débiles', 'corrientes-debiles','wifi-outline',         '#8B5CF6', true),
  ('00000000-0f01-0000-0000-000000000007', NULL, 'Pintor',                 'pintor',              'brush-outline',         '#EC4899', true),
  ('00000000-0f01-0000-0000-000000000008', NULL, 'General',                'general',             'hammer-outline',        '#6B7280', true),
  ('00000000-0f01-0000-0000-000000000009', NULL, 'Otro',                   'otro',                'ellipsis-horizontal-outline', '#9CA3AF', true)
ON CONFLICT (workspace_id, slug) DO NOTHING;


-- ── 2. CARGOS GLOBALES ────────────────────────────────────────────────────────

INSERT INTO public.cargos (id, workspace_id, nombre, slug, nivel, activo)
VALUES
  ('00000000-0c01-0000-0000-000000000001', NULL, 'Ayudante',          'ayudante',          1, true),
  ('00000000-0c01-0000-0000-000000000002', NULL, 'Maestro',           'maestro',           2, true),
  ('00000000-0c01-0000-0000-000000000003', NULL, 'Supervisor',        'supervisor',        3, true),
  ('00000000-0c01-0000-0000-000000000004', NULL, 'Jefe de Mantención','jefe-mantencion',   3, true),
  ('00000000-0c01-0000-0000-000000000005', NULL, 'Administrador',     'administrador',     4, true),
  ('00000000-0c01-0000-0000-000000000006', NULL, 'Dueño',             'dueno',             5, true),
  ('00000000-0c01-0000-0000-000000000007', NULL, 'Otro',              'otro',              1, true),
  ('00000000-0c01-0000-0000-000000000008', NULL, 'Prevencionista',    'prevencionista',    3, true)
ON CONFLICT (workspace_id, slug) DO NOTHING;


-- ── 3. COMPLETION MESSAGES ────────────────────────────────────────────────────

-- Electricista
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'No explotó.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tablero sobrevivió.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El diferencial también.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, '+10 de experiencia eléctrica.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La corriente llegó a donde tenía que llegar.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Ni una chispa de más.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La U sigue en pie.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Tesla estaría orgulloso. Edison también, aunque no te lo diría.', 'legendary'),
  (NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000002', NULL, 'Maestro eléctrico en modo beast.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000002', NULL, 'Cerrado con oficio. Sin chistes malos.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000001', NULL, 'Sobreviviste otro día de apprentice eléctrico.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000001', NULL, 'Cada OT cerrada es un paso más lejos del cable pelado.', 'rare');

-- Plomero
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'No se inundó nada.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'La fuga fue derrotada.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'El agua fluye donde debe fluir.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, '+10 de resistencia hidráulica.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'Las cañerías te respetan ahora.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'Poseidón hubiera cerrado la OT con un 5.', 'legendary');

-- Carpintero
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'Nada quedó torcido.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'La madera obedeció.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'Sin astillas reportadas.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, '+10 de precisión en milímetros.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'La escuadra nunca miente.', 'legendary');

-- Soldador
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'Soldado. No hay más que decir.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'El metal cedió.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'El arco estuvo en su punto.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'La máscara aguantó, tú también.', 'legendary');

-- Técnico HVAC
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El clima volvió a la normalidad.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El frío/calor está donde debe estar.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, '+10 BTU de satisfacción.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El gas no se fue por otro lado. Buena señal.', 'legendary');

-- Corrientes Débiles
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'La señal llegó.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'Ningún cable sin etiquetar. Casi.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'La red sigue en pie.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, '¿Ping? Sí, hay ping.', 'legendary');

-- Pintor
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'La pared quedó como nueva.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'Sin goteos reportados.', 'common'),
  (NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, '+10 a la estética del lugar.', 'rare'),
  (NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'Picasso hubiera cerrado la OT diferente, pero igual de feliz.', 'legendary');

-- Supervisor
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Patricio puede respirar tranquilo.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Claudio no recibió una llamada esta vez.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'El equipo cerró. Tú supervisaste. Eso cuenta.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'La cadena de mando funcionó. Por esta vez.', 'rare'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Sin urgentes en el WhatsApp. Eso es raro. Disfrútalo.', 'legendary');

-- Jefe de Mantención
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'Un ítem menos en el backlog.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'El jefe de mantención duerme mejor esta noche.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'KPI de cierre: subiendo.', 'rare'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'Tu equipo no falló. Hoy tampoco.', 'legendary');

-- Prevencionista
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Cero accidentes. Así se hace.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'EPP puesto, OT cerrada.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'La faena sobrevivió otro día gracias a ti.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Sin incidentes que reportar. Eso es lo ideal.', 'common'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Check list al día, conciencia tranquila.', 'rare'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'La Mutual no necesitó enterarse de nada. Éxito total.', 'rare'),
  (NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Otro día sin llenarte de papeleo de accidente. Mantén la racha.', 'legendary');

-- Owner / Admin rol
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, NULL, NULL, 'owner', 'Pangui aprueba este cierre.', 'common'),
  (NULL, NULL, NULL, 'owner', 'Una OT menos en el backlog.', 'common'),
  (NULL, NULL, NULL, 'owner', 'Tu empresa avanza. Lentamente, pero avanza.', 'rare'),
  (NULL, NULL, NULL, 'owner', 'El ROI de la mantención preventiva lo agradece.', 'legendary'),
  (NULL, NULL, NULL, 'admin', 'Administrado con éxito.', 'common'),
  (NULL, NULL, NULL, 'admin', 'La plataforma registró el cierre. Todo en orden.', 'common'),
  (NULL, NULL, NULL, 'admin', 'Sin pendientes en este folio.', 'rare');

-- General / fallback
INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity)
VALUES
  (NULL, NULL, NULL, NULL, 'Trabajo completado.', 'common'),
  (NULL, NULL, NULL, NULL, 'OT cerrada. Bien hecho.', 'common'),
  (NULL, NULL, NULL, NULL, 'Hecho. Siguiente.', 'common'),
  (NULL, NULL, NULL, NULL, 'La mantención no se hace sola. Gracias.', 'common'),
  (NULL, NULL, NULL, NULL, 'Un problema menos en el edificio.', 'common'),
  (NULL, NULL, NULL, NULL, 'Cerrado con clase.', 'rare'),
  (NULL, NULL, NULL, NULL, 'Pangui registra, tú ejecutas. Buena dupla.', 'rare'),
  (NULL, NULL, NULL, NULL, '¿Ya? ¡Qué rápido! O mentiste el tiempo... igual vale.', 'legendary');
;
