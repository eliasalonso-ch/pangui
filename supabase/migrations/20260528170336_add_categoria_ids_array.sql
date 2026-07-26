-- Add multi-category array column, backfill from existing single value
ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS categoria_ids uuid[] DEFAULT NULL;

UPDATE public.ordenes_trabajo
  SET categoria_ids = ARRAY[categoria_id]
  WHERE categoria_id IS NOT NULL AND categoria_ids IS NULL;

NOTIFY pgrst, 'reload schema';
;
