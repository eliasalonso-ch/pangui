
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS clasificacion text null
  CONSTRAINT ordenes_trabajo_clasificacion_check CHECK (clasificacion IN ('levantamiento', 'ejecucion'));

CREATE INDEX IF NOT EXISTS idx_ot_workspace_clasificacion
  ON public.ordenes_trabajo (workspace_id, clasificacion)
  WHERE clasificacion IS NOT NULL;
;
