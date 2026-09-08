-- Numero correlativo del plan: el identificador que la gente lee y busca
-- ("#12"). El uuid sirve para las relaciones pero nadie lo dicta por telefono.
--
-- A diferencia de ordenes_trabajo.numero, que reinicia en 1 por workspace, este
-- contador es GLOBAL: #1 identifica a un unico plan en toda la instalacion, sin
-- importar de que espacio de trabajo sea. Si un workspace crea un plan obtiene
-- #1 y el siguiente plan de CUALQUIER workspace obtiene #2.
--
-- Con un contador global la secuencia es la herramienta correcta: entrega
-- valores sin colisiones bajo concurrencia y sin locks.

ALTER TABLE public.planes_mantencion
  ADD COLUMN IF NOT EXISTS numero integer;

WITH numerados AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
  FROM public.planes_mantencion
  WHERE numero IS NULL
)
UPDATE public.planes_mantencion p
SET numero = numerados.n
FROM numerados
WHERE p.id = numerados.id;

CREATE SEQUENCE IF NOT EXISTS public.planes_mantencion_numero_seq AS integer;

-- Arranca despues del ultimo numero ya asignado.
SELECT setval(
  'public.planes_mantencion_numero_seq',
  GREATEST((SELECT COALESCE(MAX(numero), 0) FROM public.planes_mantencion), 1),
  true
);

ALTER TABLE public.planes_mantencion
  ALTER COLUMN numero SET DEFAULT nextval('public.planes_mantencion_numero_seq');

ALTER SEQUENCE public.planes_mantencion_numero_seq OWNED BY public.planes_mantencion.numero;

CREATE UNIQUE INDEX IF NOT EXISTS planes_mantencion_numero_idx
  ON public.planes_mantencion (numero);
