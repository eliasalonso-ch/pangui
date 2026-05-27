-- Add 'presupuesto' as a valid tipo_trabajo. Used for licitation-driven
-- planned jobs that aren't reactiva/preventiva/inspeccion/mejora/levantamiento.

ALTER TABLE public.ordenes_trabajo
  DROP CONSTRAINT IF EXISTS ot_tipo_trabajo_check;

ALTER TABLE public.ordenes_trabajo
  ADD CONSTRAINT ot_tipo_trabajo_check
  CHECK (tipo_trabajo IS NULL OR tipo_trabajo IN (
    'reactiva', 'preventiva', 'inspeccion', 'mejora', 'levantamiento', 'presupuesto'
  ));
