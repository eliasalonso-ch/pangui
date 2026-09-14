-- Las unidades pasan de símbolo a nombre: "A" → "Amperios".
--
-- POR QUÉ:
-- `unidad` no es un dato interno: se muestra tal cual, pegado al número, en toda
-- la app —la tarjeta del medidor ("Última Lectura: 9 A"), los umbrales ("Alarma
-- sobre 80 °C"), el eje del gráfico, la descripción de la OT que abre el
-- trigger, y el campo que ve el técnico en el procedimiento. El que lee esa
-- ficha no es el que configuró el medidor, y "9 A" lo obliga a adivinar si son
-- amperios, años o algo de esa planta. El nombre completo no se presta.
--
-- POR QUÉ UNA MIGRACIÓN Y NO SOLO CAMBIAR EL CATÁLOGO:
-- Cambiar las sugerencias deja a los medidores ya creados diciendo "A" para
-- siempre, así que la misma app mostraría "9 A" en uno y "9 Amperios" en el de
-- al lado. Son pocas filas y se pueden enumerar: se revisaron todos los valores
-- distintos que existen hoy (3 en `medidores`, 33 en `procedimiento_pasos`).
--
-- QUÉ NO SE TOCA, A PROPÓSITO:
-- Solo se reescriben los valores que estaban en el catálogo viejo, uno por uno y
-- con comparación exacta. Las unidades escritas a mano que no salieron de esa
-- lista —"Mohm", "lux", "Un", "minutos", "segundos"— se dejan intactas: no hay
-- forma de saber con certeza qué quiso decir quien las tecleó, y adivinar acá
-- rompe el dato de un cliente. Esas se corrigen editando el medidor.
--
-- `unidad` sigue siendo texto libre: esto normaliza lo que ya hay, no cierra la
-- columna a una lista.

-- Símbolo viejo → nombre, en línea como CTE en cada UPDATE: una tabla temporal
-- no sobrevive al corte por sentencia del runner de migraciones.
WITH k(de, a) AS (VALUES
  -- Vibración
  ('mm/s',  'Milímetros por segundo'),
  ('µm',    'Micrómetros'),
  -- Eléctrico
  ('A',     'Amperios'),
  ('V',     'Voltios'),
  ('kW',    'Kilovatios'),
  ('kWh',   'Kilovatios hora'),
  ('Hz',    'Hercios'),
  ('cos φ', 'Factor de potencia'),
  -- Temperatura
  ('°C',    'Celsius'),
  ('°F',    'Fahrenheit'),
  ('K',     'Kelvin'),
  -- Presión
  ('bar',   'Bar'),
  ('psi',   'PSI'),
  ('kPa',   'Kilopascales'),
  ('mca',   'Metros de columna de agua'),
  -- Caudal
  ('L/min', 'Litros por minuto'),
  ('m³/h',  'Metros cúbicos por hora'),
  ('L/s',   'Litros por segundo'),
  -- Rotación
  ('rpm',   'Revoluciones por minuto'),
  ('rad/s', 'Radianes por segundo'),
  -- Uso
  ('horas', 'Horas'),
  ('h',     'Horas'),
  ('hr',    'Horas'),
  ('ciclos','Ciclos'),
  ('km',    'Kilómetros'),
  ('unidades', 'Unidades'),
  -- Nivel
  ('%',     'Porcentaje'),
  ('m',     'Metros'),
  ('cm',    'Centímetros'),
  ('L',     'Litros'),
  ('m³',    'Metros cúbicos'),
  -- Presentes en los datos reales con otra caja. Se listan aparte porque el
  -- match es exacto y sensible a mayúsculas: 'PSI' y 'RPM' existen tal cual en
  -- `procedimiento_pasos` hoy.
  ('PSI',   'PSI'),
  ('RPM',   'Revoluciones por minuto'),
  ('mm',    'Milímetros')
)
-- `g` (gravedades) se deja fuera del mapa a propósito: choca con gramos y con el
-- símbolo suelto de una plantilla cualquiera. Un valor de una sola letra tan
-- ambiguo no se reescribe sin mirarlo.
UPDATE public.medidores m
   SET unidad = k.a
  FROM k
 WHERE btrim(m.unidad) = k.de
   AND m.unidad <> k.a;

WITH k(de, a) AS (VALUES
  ('mm/s',  'Milímetros por segundo'),
  ('µm',    'Micrómetros'),
  ('A',     'Amperios'),
  ('V',     'Voltios'),
  ('kW',    'Kilovatios'),
  ('kWh',   'Kilovatios hora'),
  ('Hz',    'Hercios'),
  ('cos φ', 'Factor de potencia'),
  ('°C',    'Celsius'),
  ('°F',    'Fahrenheit'),
  ('K',     'Kelvin'),
  ('bar',   'Bar'),
  ('psi',   'PSI'),
  ('kPa',   'Kilopascales'),
  ('mca',   'Metros de columna de agua'),
  ('L/min', 'Litros por minuto'),
  ('m³/h',  'Metros cúbicos por hora'),
  ('L/s',   'Litros por segundo'),
  ('rpm',   'Revoluciones por minuto'),
  ('rad/s', 'Radianes por segundo'),
  ('horas', 'Horas'),
  ('h',     'Horas'),
  ('hr',    'Horas'),
  ('ciclos','Ciclos'),
  ('km',    'Kilómetros'),
  ('unidades', 'Unidades'),
  ('%',     'Porcentaje'),
  ('m',     'Metros'),
  ('cm',    'Centímetros'),
  ('L',     'Litros'),
  ('m³',    'Metros cúbicos'),
  ('PSI',   'PSI'),
  ('RPM',   'Revoluciones por minuto'),
  ('mm',    'Milímetros')
)
UPDATE public.procedimiento_pasos p
   SET unidad = k.a
  FROM k
 WHERE btrim(p.unidad) = k.de
   AND p.unidad <> k.a;
