-- Add lugar_id to activos so an asset can point to a specific lugar within its
-- ubicacion (mirrors ordenes_trabajo.lugar_id). ON DELETE SET NULL so deleting a
-- lugar doesn't cascade-delete assets — they just lose the specific-location ref.
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS lugar_id uuid REFERENCES public.lugares(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activos_lugar_id ON public.activos(lugar_id);;
