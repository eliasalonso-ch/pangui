-- Geolocalización: coordenadas en sociedades y ubicaciones.
--
-- Modelo de dos niveles geográficos (lugares queda SOLO texto a propósito):
--   sociedades  -> el recinto principal (ej. Universidad de Concepción)
--   ubicaciones -> campus y edificios dentro del recinto (ej. Facultad de Ingeniería)
--   lugares     -> interiores sin coordenada ("Techo", "CUBO 5", "Baño 3er piso").
--                  No reciben lat/lng: no son geocodificables y a escala de edificio
--                  colapsarían en el mismo pin. Se muestran como texto en el detalle.
--
-- Sin índices nuevos sobre ordenes_trabajo: esa tabla ya sufre planning time > execution
-- time por exceso de índices. El mapa se sirve con idx_ordenes_trabajo_workspace_id.

alter table public.sociedades
  add column if not exists lat double precision,
  add column if not exists lng double precision;

alter table public.ubicaciones
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  -- Procedencia de la coordenada: 'google' = geocodificada automáticamente,
  -- 'manual' = corregida a mano en el mapa. El script de geocodificación NUNCA
  -- debe sobrescribir una fila marcada como 'manual'.
  add column if not exists geo_origen text,
  add column if not exists geo_actualizado_at timestamptz;

-- Rangos válidos; permite null (la mayoría aún no tiene coordenada).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sociedades_latlng_valido') then
    alter table public.sociedades add constraint sociedades_latlng_valido
      check (
        (lat is null and lng is null)
        or (lat between -90 and 90 and lng between -180 and 180)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_latlng_valido') then
    alter table public.ubicaciones add constraint ubicaciones_latlng_valido
      check (
        (lat is null and lng is null)
        or (lat between -90 and 90 and lng between -180 and 180)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ubicaciones_geo_origen_valido') then
    alter table public.ubicaciones add constraint ubicaciones_geo_origen_valido
      check (geo_origen is null or geo_origen in ('google', 'manual'));
  end if;
end $$;

comment on column public.ubicaciones.geo_origen is
  'google = geocodificada automáticamente; manual = corregida a mano. No sobrescribir manual.';

-- Semilla verificada desde enlaces de Google Maps (coordenadas del marcador !3d/!4d,
-- no del centro del viewport @, que apunta a otro lugar en el enlace de la UdeC).
update public.sociedades
   set lat = -36.8299341, lng = -73.0357019
 where nombre ilike '%Universidad de Concepci%'
   and lat is null;

-- Solo UNA fila: 'FACULTAD DE INGENIERIA ADMINISTRACION' está duplicada y
-- 'DPTO ING. DE SISTEMAS' es otro edificio, así que no comparten coordenada.
update public.ubicaciones u
   set lat = -36.8301756,
       lng = -73.0370559,
       geo_origen = 'manual',
       geo_actualizado_at = now()
 where u.id = (
   select u2.id
     from public.ubicaciones u2
     join public.sociedades s on s.id = u2.sociedad_id
    where s.nombre ilike '%Universidad de Concepci%'
      and u2.edificio = 'FACULTAD DE INGENIERIA ADMINISTRACION'
      and u2.lat is null
    order by u2.created_at
    limit 1
 );
