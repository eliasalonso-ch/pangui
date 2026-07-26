-- Track who created a ubicacion so the detail screen can show "Creado por …".
-- Nullable + ON DELETE SET NULL: existing rows have no creator recorded, and
-- removing a user shouldn't delete their ubicaciones.
ALTER TABLE public.ubicaciones
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;;
