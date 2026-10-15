-- Mobile now pages ubicaciones / lugares / sociedades 25 at a time with
-- server-side filters, instead of downloading whole catalogs. These cover the
-- three filters that had no index:
--   sociedades: eq workspace_id, eq activa, order nombre  (no workspace index at all)
--   lugares:    eq ubicacion_id  ("lugares de esta ubicación")
--   ubicaciones: eq sociedad_id  ("ubicaciones de esta asociación")
-- The last two are also unindexed foreign keys (slow cascades/joins).
-- Tables are small (hundreds of rows), so a plain CREATE INDEX locks for
-- milliseconds; CONCURRENTLY can't run inside apply_migration's transaction.

create index if not exists idx_sociedades_workspace_activa_nombre
  on public.sociedades (workspace_id, activa, nombre);

create index if not exists idx_lugares_ubicacion
  on public.lugares (ubicacion_id);

create index if not exists idx_ubicaciones_sociedad
  on public.ubicaciones (sociedad_id);
