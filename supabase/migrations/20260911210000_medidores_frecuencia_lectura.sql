-- Frecuencia de lectura: cada cuanto le toca a alguien leer este medidor.
--
-- Solo tiene sentido en los manuales. Un medidor automatizado publica al ritmo
-- que decide su gateway; decirle "cada 7 dias" desde acá no cambia nada, y
-- mostrarlo en el formulario solo confunde sobre quien manda.
--
-- Se guarda en dias y no como {numero, unidad} porque "cada 2 semanas" y "cada
-- 14 dias" son la misma ronda: dos columnas obligarian a normalizar en cada
-- consulta que compare frecuencias. El formulario ofrece dias/semanas/meses y
-- multiplica antes de guardar.
--
-- NULL = sin ronda definida: el medidor existe y se puede leer cuando sea, pero
-- nadie tiene que recordarlo.
ALTER TABLE public.medidores
  ADD COLUMN IF NOT EXISTS frecuencia_dias integer;

ALTER TABLE public.medidores
  DROP CONSTRAINT IF EXISTS medidores_frecuencia_positiva;

ALTER TABLE public.medidores
  ADD CONSTRAINT medidores_frecuencia_positiva
  CHECK (frecuencia_dias IS NULL OR frecuencia_dias > 0);

COMMENT ON COLUMN public.medidores.frecuencia_dias IS
  'Cada cuantos dias corresponde tomar la lectura. Solo para tipo=manual; NULL = sin ronda.';
