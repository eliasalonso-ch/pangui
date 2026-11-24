-- Pendientes de OT: "esto falta hacer, y me lo recuerdas tal día".
--
-- Una notificación que llega el día que se crea la OT se olvida al instante,
-- y lo que importa en 5 meses se pierde. Un pendiente hace VOLVER la OT el día
-- en que hay que actuar (push) y sigue saliendo en el correo diario hasta que
-- alguien lo marca hecho o lo pospone. Una OT puede tener varios.
--
-- El modelo: Actividad = lo que pasó; Pendientes = lo que falta, con fecha.
-- Crear un pendiente y marcarlo hecho deja su línea en la Actividad, así la
-- OT cuenta en un solo lugar qué se hizo y qué viene.
--
-- Personales en esta versión: cada usuario se deja pendientes a sí mismo.
-- La fecha es obligatoria a propósito: un pendiente sin fecha nunca avisa.

create table public.ot_pendientes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.my_workspace_id()
               references public.workspaces(id) on delete cascade,
  orden_id     uuid not null references public.ordenes_trabajo(id) on delete cascade,
  usuario_id   uuid not null default auth.uid()
               references public.usuarios(id) on delete cascade,
  fecha        date not null,
  nota         text not null check (btrim(nota) <> ''),
  hecho_at     timestamptz,
  -- Sello del push: el cron avisa una sola vez por fecha. Posponer lo limpia
  -- para que la nueva fecha vuelva a avisar.
  avisado_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index ot_pendientes_abiertos_idx on public.ot_pendientes (fecha) where hecho_at is null;
create index ot_pendientes_orden_idx     on public.ot_pendientes (orden_id);
create index ot_pendientes_usuario_idx   on public.ot_pendientes (usuario_id);
create index ot_pendientes_workspace_idx on public.ot_pendientes (workspace_id);

alter table public.ot_pendientes enable row level security;

create policy pendientes_select_own on public.ot_pendientes
for select to authenticated
using (usuario_id = (select auth.uid()));

create policy pendientes_insert_own on public.ot_pendientes
for insert to authenticated
with check (
  usuario_id = (select auth.uid())
  and workspace_id = (select public.my_workspace_id())
  and exists (
    select 1 from public.ordenes_trabajo o
    where o.id = orden_id and o.workspace_id = (select public.my_workspace_id())
  )
);

create policy pendientes_update_own on public.ot_pendientes
for update to authenticated
using (usuario_id = (select auth.uid()))
with check (
  usuario_id = (select auth.uid())
  and workspace_id = (select public.my_workspace_id())
  and exists (
    select 1 from public.ordenes_trabajo o
    where o.id = orden_id and o.workspace_id = (select public.my_workspace_id())
  )
);

create policy pendientes_delete_own on public.ot_pendientes
for delete to authenticated
using (usuario_id = (select auth.uid()));

grant select, insert, update, delete on public.ot_pendientes to authenticated;

-- ── Línea en la Actividad ────────────────────────────────────────────────────
-- Tipos propios y no 'comentario': trigger_notify_comment solo notifica los
-- 'comentario', y un recordatorio personal no debe mandarle push a cada
-- asignado de la OT. La app móvil sin actualizar muestra los tipos que no
-- conoce como "actualizó la orden" con el texto, sin romperse.
alter table public.actividad_ot drop constraint actividad_ot_tipo_check;
alter table public.actividad_ot add constraint actividad_ot_tipo_check check (tipo = any (array[
  'creado', 'asignado', 'estado_cambiado', 'prioridad_cambiada', 'editado',
  'ubicacion_cambiada', 'iniciado', 'pausado', 'reanudado', 'completado',
  'cancelado', 'comentario', 'fotos_grupo_subidas',
  'pendiente_creado', 'pendiente_hecho'
]));

create or replace function public.ot_pendientes_actividad()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
    values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_creado',
            to_char(new.fecha, 'DD/MM/YYYY') || ' · ' || new.nota);
  elsif new.hecho_at is not null and old.hecho_at is null then
    insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
    values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_hecho', new.nota);
  end if;
  return null;
end
$function$;

revoke all on function public.ot_pendientes_actividad() from public, anon, authenticated;

create trigger trg_ot_pendientes_actividad
  after insert or update of hecho_at on public.ot_pendientes
  for each row execute function public.ot_pendientes_actividad();

-- ── Push del día ─────────────────────────────────────────────────────────────
-- Una notificación por pendiente que vence hoy (o venció y nunca avisó). El
-- insert en notifications dispara on_notification_insert, que es el camino al
-- push móvil. Las OTs en la papelera no avisan.
create or replace function public.pendientes_avisar()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n integer;
begin
  with vencidos as (
    update public.ot_pendientes p
    set avisado_at = now()
    from public.ordenes_trabajo o
    where o.id = p.orden_id
      and o.deleted_at is null
      and p.hecho_at is null
      and p.avisado_at is null
      and p.fecha <= (now() at time zone 'America/Santiago')::date
    returning p.usuario_id, p.orden_id, p.nota, o.numero, o.titulo
  ),
  ins as (
    insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
    select usuario_id,
           'Pendiente: ' || coalesce(nullif(btrim(titulo), ''), 'OT #' || numero, 'OT'),
           nota,
           'pendiente',
           '/orden/' || orden_id::text
    from vencidos
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end
$function$;

revoke all on function public.pendientes_avisar() from public, anon, authenticated;

-- Días hábiles a las 08:30 de Chile. pg_cron corre en UTC y Chile cambia de
-- horario (UTC-3 / UTC-4), así que se programa a las 11:30 y 12:30 UTC y solo
-- pasa la corrida en que en Santiago son las 8. El mismo tick manda el push y
-- llama a la edge function del correo diario.
select cron.schedule(
  'pendientes-tick',
  '30 11,12 * * 1-5',
  $job$
  select public.pendientes_avisar(),
         net.http_post(
           url     := 'https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/pendientes-digest',
           headers := jsonb_build_object(
             'Content-Type',  'application/json',
             'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
           ),
           body    := '{}'::jsonb
         )
  from (select now() at time zone 'America/Santiago' as ts) a
  where extract(hour from a.ts) = 8;
  $job$
);
