DELETE FROM public.completion_messages WHERE workspace_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ELECTRICISTA
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'No explotó.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El automático no saltó. Sospechoso.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La pega quedó filete.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Se cerró sin olor a plástico quemado.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El diferencial sobrevivió otra jornada laboral.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Nadie puenteó nada. Chile avanza.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Fase, neutro y tierra quedaron donde iban.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tablero dejó de parecer experimento.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La U sigue energizada.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Cero chispazos. Hoy ganó la ingeniería.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tester dijo "ta bien".', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'No hubo humo. Tremendo indicador.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El neutro no quedó creativo.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Se hizo con cariño y cinta aisladora.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El automático decidió cooperar.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La canalización quedó más derecha que antes.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tablero ya no da vergüenza ajena.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Sobrevivió hasta el apriete final.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El breaker no se suicidó.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Todo quedó sorprendentemente legal.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El maestro anterior está llorando en algún lugar.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'SEC estaría orgullosa. Quizás.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Hoy no ganó el cable pelado.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tablero quedó tan bueno que da miedo.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Nadie dijo "después lo arreglamos".', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El neutro apareció donde tenía que estar. Histórico.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El diferencial no estaba puenteado. Inesperado.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Se cerró sin putear al instalador anterior.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El automático no estaba puesto al revés. Milagro.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La tierra sí tenía continuidad. ¿Qué año es este?', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tester no mintió.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Ni una sola unión con huincha nomás.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tablero pasó de crimen de guerra a instalación eléctrica.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El maestro miró la pega y asintió en silencio.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La fase no mordió a nadie hoy.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'No explotó. Histórico nacional.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tablero sobrevivió y hasta quedó bonito.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La pega quedó tan buena que nadie la quiere tocar.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'La U no quedó a oscuras. Hazaña desbloqueada.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El diferencial encontró el sentido de la vida.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El automático aplaudió en silencio.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Esta pega va a durar más que el presupuesto.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El tablero dejó oficialmente de dar pena.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Ni el neutro quedó confundido.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Se alinearon los planetas y la instalación quedó perfecta.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Los eléctricos del futuro hablarán de esta OT.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'El SEC sintió una perturbación positiva en la fuerza.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, 'Tesla estaría orgulloso. Edison también, aunque no te lo diría.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', NULL, NULL, '{usuario_nombre} cerró una OT eléctrica. El técnico elegido.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000002', NULL, 'Maestro eléctrico en modo beast.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000002', NULL, 'Cerrado con oficio. Sin chistes malos.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000002', NULL, '{usuario_nombre} demostró que el título de maestro no es de adorno.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000001', NULL, 'Sobreviviste otro día de aprendiz eléctrico.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000001', '00000000-0c01-0000-0000-000000000001', NULL, 'Cada OT cerrada es un paso más lejos del cable pelado.', 'rare');

-- ═══════════════════════════════════════════════════════════════════════════════
-- PLOMERO
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'No se inundó nada.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'La fuga fue derrotada.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'El agua fluye donde debe fluir.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'El teflón se aplicó con fe y criterio.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'El sello aguantó. Esta vez.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'La llave de paso volvió a ser útil.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'No hubo llamada al seguro. Tremendo logro.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'Las cañerías te respetan ahora.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'El gasfiter anterior dejó una obra de arte en caos. Tú la arreglaste.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'El piso está seco. Eso no es menor.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, '{workspace_nombre} sigue seca. Misión cumplida.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'Poseidón hubiera cerrado la OT con un 5.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'La fuga era leyenda. Ahora es historia.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000002', NULL, NULL, 'El agua nunca sabrá lo que pasó aquí. Pero Pangui sí.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- CARPINTERO
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'Nada quedó torcido.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'La madera obedeció.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'Sin astillas reportadas.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'El serrucho no mintió.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'La puerta ahora cierra. Histórico.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'El tornillo entró derecho. Primera vez.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'La madera no se quejó demasiado.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, '+10 de precisión en milímetros.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'La escuadra nunca miente. Y no mintió.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'Ni una sola improvisación con sika. Respeto.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'La puerta cierra, abre y no rechina. Triple logro.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000003', NULL, NULL, 'El aserrín quedó en el piso, no en la cara. Profesionalismo puro.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SOLDADOR
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'Soldado. No hay más que decir.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'El metal cedió.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'El cordón quedó parejo.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'La máscara no se olvidó esta vez.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'Sin quemadas en los dedos. Hoy ganamos.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'El arco estuvo en su punto.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'Sin salpicaduras innecesarias. Arte pura.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'El oxicorte no se fue de mano.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'La máscara aguantó, tú también.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'El metal quedó unido para siempre. Como debería ser todo en la vida.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000004', NULL, NULL, 'Ni la escoria quedó de mala manera.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- TÉCNICO HVAC
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El clima volvió a la normalidad.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El frío/calor está donde debe estar.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El filtro se acordará de ti.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'La gente puede dejar de quejarse del calor. Por ahora.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El equipo dejó de hacer ruido raro.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, '+10 BTU de satisfacción.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El refrigerante está donde debe estar. No en el ambiente.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'La unidad exterior dejó de sonar como helicóptero.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'El gas no se fue por otro lado. Buena señal.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, '{workspace_nombre} ahora respira aire a temperatura correcta.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000005', NULL, NULL, 'La jefatura dejó de sudar. Misión cumplida.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- CORRIENTES DÉBILES
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'La señal llegó.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'Ningún cable sin etiquetar. Casi.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'La red sobrevivió la intervención.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'La cámara ya graba lo que debe grabar.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'El panel de alarma dejó de hacer bip.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'La red sigue en pie.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'El patch panel quedó digno.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'Alguien etiquetó un cable. Civilización avanza.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, '¿Ping? Sí, hay ping.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'El técnico elegido restauró la conectividad. La leyenda continúa.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000006', NULL, NULL, 'La fibra no murió. El técnico tampoco.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- PINTOR
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'La pared quedó como nueva.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'Sin goteos reportados.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'El rodillo descansa. Tú también puedes.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'La huincha de enmascarar hizo su trabajo.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'El color quedó parejo. Tremendo.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'Nadie va a notar el parche. Nadie.', 'common'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, '+10 a la estética del lugar.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'Dos manos de pintura. Sin drama.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'La brocha no tocó el piso esta vez.', 'rare'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'Picasso hubiera cerrado la OT diferente, pero igual de feliz.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, '{workspace_nombre} brilla un poco más hoy.', 'legendary'),
(NULL, '00000000-0f01-0000-0000-000000000007', NULL, NULL, 'La pared quedó tan pareja que el jefe va a pedir otra.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- SUPERVISOR (cargo)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Nadie llamó preguntando algo que estaba escrito.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'La cuadrilla leyó la OT. Increíble.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, '{usuario_nombre} puede tomar agua tranquilo.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Otra OT menos para perseguir.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Se cerró sin audio de WhatsApp de 4 minutos.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'La pega avanzó sin gritos.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'No hubo "maestro, venga un ratito".', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'El grupo sí leyó las instrucciones.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Trabajo cerrado sin novela.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Nadie desapareció después del almuerzo.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, '{usuario_nombre} puede respirar tranquilo.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Claudio no tuvo que repetir lo mismo 3 veces.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'La OT fue leída completa. Milagro operacional.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'El equipo entendió a la primera.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Nadie preguntó "qué había que hacer".', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, '{usuario_nombre} sintió paz interior.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Se trabajó exactamente donde era.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'La cuadrilla volvió con todas las herramientas.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'El maestro no improvisó nada raro.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'El terreno obedeció al plan.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'El supervisor no tuvo que ir al terreno.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'La OT se cerró sin persecución humana.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Nadie dejó el tablero peor que antes.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'El equipo hizo exactamente lo que decía la OT.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Se cerró sin llamadas, sin dramas y sin sufrimiento.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'La cuadrilla alcanzó iluminación operacional.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Nadie dijo "yo pensé que era otra sala".', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, 'Esto merece reunión sin retos.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000003', NULL, '{usuario_nombre} desbloqueó paz mental.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- JEFE DE MANTENCIÓN (cargo)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'Un ítem menos en el backlog.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, '{usuario_nombre} duerme mejor esta noche.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'La pega avanza.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'Nadie llamó a reportar falla a las 11 PM.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'El dashboard sube. La presión baja.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'KPI de cierre: subiendo.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'El plan de mantención tuvo sentido hoy.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'La preventiva evitó la correctiva. Eso vale plata.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'Tu equipo no falló. Hoy tampoco.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, '{workspace_nombre} operó sin falla. Eso se construye así.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000004', NULL, 'El Excel de pendientes perdió una fila. Celebra.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- PREVENCIONISTA (cargo)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Cero accidentes. Así se hace.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'EPP puesto, OT cerrada.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'La faena sobrevivió otro día gracias a ti.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Sin incidentes que reportar. Eso es lo ideal.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Nadie se sacó el casco antes de tiempo.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'El ART fue llenado con amor y respeto.', 'common'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Check list al día, conciencia tranquila.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'La Mutual no necesitó enterarse de nada. Éxito total.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Nadie dijo "total no pasa nada" y tenía razón.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Todos volvieron a sus casas con los dedos completos.', 'rare'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'Otro día sin llenarte de papeleo de accidente. Mantén la racha.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, 'La ISP no tuvo nada que objetar. Momento histórico.', 'legendary'),
(NULL, NULL, '00000000-0c01-0000-0000-000000000008', NULL, '{usuario_nombre} protegió a la cuadrilla. Eso no aparece en el parte, pero debería.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- OWNER (rol)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, NULL, NULL, 'owner', 'Otra OT menos en el backlog.', 'common'),
(NULL, NULL, NULL, 'owner', 'Pangui aprueba este cierre.', 'common'),
(NULL, NULL, NULL, 'owner', 'La operación sigue viva.', 'common'),
(NULL, NULL, NULL, 'owner', 'La empresa sobrevivió otro día.', 'common'),
(NULL, NULL, NULL, 'owner', 'Menos caos, más mantenimiento.', 'common'),
(NULL, NULL, NULL, 'owner', 'La pega se movió.', 'common'),
(NULL, NULL, NULL, 'owner', 'Dashboard más feliz detectado.', 'common'),
(NULL, NULL, NULL, 'owner', 'Otra preocupación menos.', 'common'),
(NULL, NULL, NULL, 'owner', 'El backlog perdió una batalla.', 'common'),
(NULL, NULL, NULL, 'owner', 'La operación respiró un poquito.', 'common'),
(NULL, NULL, NULL, 'owner', 'Esto ya parece empresa seria.', 'rare'),
(NULL, NULL, NULL, 'owner', '{usuario_nombre} puede dormir 8 horas.', 'rare'),
(NULL, NULL, NULL, 'owner', 'Menos incendios operacionales hoy.', 'rare'),
(NULL, NULL, NULL, 'owner', '{workspace_nombre} subió +1 nivel.', 'rare'),
(NULL, NULL, NULL, 'owner', 'Nadie perdió una herramienta hoy.', 'rare'),
(NULL, NULL, NULL, 'owner', 'El sistema funcionó sorprendentemente bien.', 'rare'),
(NULL, NULL, NULL, 'owner', 'La OT quedó registrada Y terminada. Inédito.', 'rare'),
(NULL, NULL, NULL, 'owner', 'Menos WhatsApp, más gestión.', 'rare'),
(NULL, NULL, NULL, 'owner', 'La operación no colapsó.', 'rare'),
(NULL, NULL, NULL, 'owner', 'Pangui detectó eficiencia real.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'El caos operacional fue contenido.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'El backlog perdió una guerra importante.', 'legendary'),
(NULL, NULL, NULL, 'owner', '{workspace_nombre} evitó una llamada incómoda.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'El sistema funcionó y nadie entiende cómo.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'Momento CMMS legendario.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'La operación alcanzó estabilidad temporal.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'El dashboard acaba de sanar emocionalmente.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'El Excel sintió miedo.', 'legendary'),
(NULL, NULL, NULL, 'owner', 'Los dioses del mantenimiento aprobaron esta OT.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- ADMIN (rol)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, NULL, NULL, 'admin', 'Administrado con éxito.', 'common'),
(NULL, NULL, NULL, 'admin', 'La plataforma registró el cierre. Todo en orden.', 'common'),
(NULL, NULL, NULL, 'admin', 'Sin pendientes en este folio.', 'common'),
(NULL, NULL, NULL, 'admin', 'Formulario llenado. OT cerrada. Día completo.', 'common'),
(NULL, NULL, NULL, 'admin', 'El sistema funcionó. Alguien tiene que reconocerlo.', 'rare'),
(NULL, NULL, NULL, 'admin', '{workspace_nombre} mantiene el orden. Gracias a ti.', 'rare'),
(NULL, NULL, NULL, 'admin', 'El admin cerró la OT. El universo está en balance.', 'legendary'),
(NULL, NULL, NULL, 'admin', 'La burocracia fue vencida. De nuevo.', 'legendary');

-- ═══════════════════════════════════════════════════════════════════════════════
-- GENERAL / FALLBACK
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.completion_messages (workspace_id, oficio_id, cargo_id, rol_target, message, rarity) VALUES
(NULL, NULL, NULL, NULL, 'Buena pega.', 'common'),
(NULL, NULL, NULL, NULL, 'OT cerrada. Bien hecho.', 'common'),
(NULL, NULL, NULL, NULL, 'Hecho. Siguiente.', 'common'),
(NULL, NULL, NULL, NULL, 'La mantención no se hace sola. Gracias.', 'common'),
(NULL, NULL, NULL, NULL, 'Un problema menos en el edificio.', 'common'),
(NULL, NULL, NULL, NULL, 'Listo, cerrado y registrado.', 'common'),
(NULL, NULL, NULL, NULL, 'Otro cachito menos.', 'common'),
(NULL, NULL, NULL, NULL, 'Se hizo la pega. Pangui lo sabe.', 'common'),
(NULL, NULL, NULL, NULL, 'Cerrado sin novela.', 'rare'),
(NULL, NULL, NULL, NULL, 'Terreno 0 — Pangui 1.', 'rare'),
(NULL, NULL, NULL, NULL, 'La pega quedó finiquitada.', 'rare'),
(NULL, NULL, NULL, NULL, '{usuario_nombre} cerró una OT. El edificio lo sabe.', 'rare'),
(NULL, NULL, NULL, NULL, 'Se hizo con criterio y sin improvisar. Raro y valioso.', 'rare'),
(NULL, NULL, NULL, NULL, 'Nadie tuvo que volver al día siguiente a "terminar".', 'rare'),
(NULL, NULL, NULL, NULL, '{usuario_nombre} ha cerrado una OT. El técnico elegido.', 'legendary'),
(NULL, NULL, NULL, NULL, 'Pangui ha detectado excelencia.', 'legendary'),
(NULL, NULL, NULL, NULL, 'Se alinearon los planetas y la OT quedó perfecta.', 'legendary'),
(NULL, NULL, NULL, NULL, 'Esto merece completos.', 'legendary'),
(NULL, NULL, NULL, NULL, '{workspace_nombre} funciona. Tú eres parte de eso.', 'legendary'),
(NULL, NULL, NULL, NULL, '¿Ya? ¡Qué rápido! O mentiste el tiempo... igual vale.', 'legendary');
;
