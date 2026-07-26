ALTER TABLE public.hojas_inventario ADD COLUMN IF NOT EXISTS orden_id uuid REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE;;
