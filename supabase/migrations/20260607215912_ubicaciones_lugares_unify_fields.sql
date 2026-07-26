-- Unify ubicacion + lugar especifico fields. Ubicacion is the parent of lugar.
-- Both now share: nombre, direccion, descripcion, grupo_cargo, imagen_url.
-- piso is removed entirely from ubicaciones.

ALTER TABLE public.ubicaciones DROP COLUMN IF EXISTS piso;
ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS descripcion text;

ALTER TABLE public.lugares ADD COLUMN IF NOT EXISTS grupo_cargo text;;
