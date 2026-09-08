-- Un plan de mantencion genera trabajo PREVENTIVO por definicion: se ejecuta
-- porque toca segun calendario, no porque algo se rompio. Dejar elegir el tipo
-- permitia crear planes "reactivos" o de "emergencia", y eso corrompe los KPIs
-- que separan mantenimiento planificado de correctivo — justo el indicador que
-- un plan existe para mejorar.
--
-- Se fija en la base y no solo en el formulario para que ninguna via de entrada
-- (import, API, edicion directa) pueda romper la clasificacion.

UPDATE public.planes_mantencion
SET tipo_trabajo = 'preventiva'
WHERE tipo_trabajo IS DISTINCT FROM 'preventiva';

ALTER TABLE public.planes_mantencion
  ALTER COLUMN tipo_trabajo SET DEFAULT 'preventiva';

ALTER TABLE public.planes_mantencion
  DROP CONSTRAINT IF EXISTS planes_tipo_trabajo_preventiva;

ALTER TABLE public.planes_mantencion
  ADD CONSTRAINT planes_tipo_trabajo_preventiva
    CHECK (tipo_trabajo IS NULL OR tipo_trabajo = 'preventiva');

-- Las OTs ya generadas por planes tambien se reclasifican: nacieron de un plan,
-- asi que son preventivas aunque el plan dijera otra cosa cuando corrieron.
UPDATE public.ordenes_trabajo
SET tipo_trabajo = 'preventiva'
WHERE origen = 'plan_mantencion' AND tipo_trabajo IS DISTINCT FROM 'preventiva';
