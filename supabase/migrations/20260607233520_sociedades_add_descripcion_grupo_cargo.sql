-- Give sociedades (asociaciones) the same user-facing fields as ubicaciones,
-- since the app now treats asociacion as the parent of ubicacion with the same
-- edit/create form (nombre, direccion, descripcion, grupo_cargo, foto).
ALTER TABLE public.sociedades ADD COLUMN IF NOT EXISTS descripcion text;
ALTER TABLE public.sociedades ADD COLUMN IF NOT EXISTS grupo_cargo text;;
