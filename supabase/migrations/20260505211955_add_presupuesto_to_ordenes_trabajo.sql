
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS presupuesto text NULL;
;
