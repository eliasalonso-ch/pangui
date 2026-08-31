-- Publica actividad_ot en supabase_realtime para que los comentarios y la
-- actividad de una OT lleguen en vivo, sin poll ni refetch manual.
--
-- La tabla ya estaba en REPLICA IDENTITY FULL, asi que no hace falta tocarla:
-- con eso los UPDATE/DELETE llevan la fila vieja completa y el cliente puede
-- identificar que comentario se edito o se borro (con REPLICA IDENTITY default
-- solo viajaria la PK).
--
-- RLS: actividad_select ya resuelve por my_workspace_id(), y realtime evalua
-- esa misma politica por conexion, asi que cada usuario solo recibe eventos de
-- su propio workspace. No se agregan politicas nuevas.
--
-- Idempotente: si la tabla ya estuviera publicada, ALTER PUBLICATION fallaria
-- con "already member of publication", asi que se comprueba antes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'actividad_ot'
  ) then
    alter publication supabase_realtime add table public.actividad_ot;
  end if;
end
$$;
