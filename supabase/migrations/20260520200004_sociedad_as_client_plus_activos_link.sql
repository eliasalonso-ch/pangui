-- 1. Extend sociedades with the fields a service-provider needs for client work.
ALTER TABLE public.sociedades
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS contacto_nombre text,
  ADD COLUMN IF NOT EXISTS contacto_email text,
  ADD COLUMN IF NOT EXISTS contacto_telefono text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS contrato_ref text,
  ADD COLUMN IF NOT EXISTS contrato_inicio date,
  ADD COLUMN IF NOT EXISTS contrato_termino date,
  ADD COLUMN IF NOT EXISTS brand_color text,
  ADD COLUMN IF NOT EXISTS notas text;

-- 2. Direct link from activo to its sociedad/client. Today the link is indirect
--    through ubicaciones.sociedad_id; the direct column lets us query per-client
--    activos in one hop and survives edge cases (mobile/temp assets without a
--    fixed ubicacion).
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS sociedad_id uuid REFERENCES public.sociedades(id) ON DELETE SET NULL;

-- 3. Backfill: derive sociedad_id from each activo's ubicacion where possible.
--    Only fills NULLs; never overwrites existing values.
UPDATE public.activos a
SET sociedad_id = u.sociedad_id
FROM public.ubicaciones u
WHERE a.ubicacion_id = u.id
  AND a.sociedad_id IS NULL
  AND u.sociedad_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activos_sociedad
  ON public.activos (sociedad_id)
  WHERE activo = true;;
