-- Sync con Google al instante: crear, editar, completar o borrar un pendiente
-- llega a Google Calendar / Tasks en segundos, no al minuto siguiente.
--
-- Cómo:
--   1. Empujón: un trigger POR SENTENCIA llama a gcal-sync con pg_net apenas
--      hay algo encolado. pg_net manda la llamada después del commit, así que
--      guardar nunca espera a Google (si Google está caído, el pendiente se
--      guarda igual y queda en la cola).
--   2. Cola con reclamo (FOR UPDATE SKIP LOCKED): el empujón y el cron pueden
--      correr a la vez; cada fila la toma UNA sola corrida, así nunca se crea
--      el mismo evento dos veces. Si una corrida muere a medio camino, sus filas
--      se liberan a los 2 minutos.
--   3. Versión por fila: si alguien edita un pendiente mientras se está
--      subiendo, la corrida lo nota al terminar y lo deja encolado otra vez (con
--      el id remoto ya guardado, para actualizar y no duplicar).
--   4. El cron de cada minuto queda como red de seguridad: reintentos (los
--      reintentos por error NO empujan, para no martillar a Google), filas
--      huérfanas y conexiones que vuelven.

-- ── Estado 'enviando', versión y momento del reclamo ─────────────────────────
alter table public.ot_pendientes drop constraint ot_pendientes_gcal_sync_check;
alter table public.ot_pendientes add constraint ot_pendientes_gcal_sync_check
  check (gcal_sync in ('pendiente', 'enviando', 'ok', 'error'));

alter table public.ot_pendientes
  add column gcal_version      integer not null default 0,
  add column gcal_reclamado_at timestamptz;

-- ── Encolar: sube la versión; si se está enviando, no le quita el reclamo ────
create or replace function public.ot_pendientes_gcal_encolar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    new.gcal_destino := coalesce(new.gcal_destino, case when new.hora is null then 'tasks' else 'calendar' end);
    return new;
  end if;
  if (new.nota, new.fecha, new.hora, new.estado, new.prioridad, new.aviso_minutos, new.gcal_destino)
     is distinct from (old.nota, old.fecha, old.hora, old.estado, old.prioridad, old.aviso_minutos, old.gcal_destino) then
    new.gcal_version := old.gcal_version + 1;
    -- La corrida que lo tiene lo verá por la versión y lo re-encolará al terminar.
    if old.gcal_sync <> 'enviando' then new.gcal_sync := 'pendiente'; end if;
    new.gcal_intentos := 0;
    new.gcal_error := null;
  end if;
  return new;
end
$function$;

-- ── Reclamar filas (service_role, gcal-sync) ─────────────────────────────────
create or replace function public.gcal_reclamar(p_usuario uuid, p_limite integer default 50)
returns table (id uuid, version integer)
language sql
security definer
set search_path = ''
as $$
  update public.ot_pendientes p
     set gcal_sync = 'enviando', gcal_reclamado_at = now()
   where p.id in (
     select x.id from public.ot_pendientes x
      where x.usuario_id = p_usuario
        and (x.gcal_sync = 'pendiente'
             or (x.gcal_sync = 'enviando' and x.gcal_reclamado_at < now() - interval '2 minutes'))
      order by x.created_at
      limit p_limite
      for update skip locked
   )
  returning p.id, p.gcal_version;
$$;

revoke all on function public.gcal_reclamar(uuid, integer) from public, anon, authenticated;
grant execute on function public.gcal_reclamar(uuid, integer) to service_role;

-- ── Elegir destino / desconectar: también suben la versión ───────────────────
-- Así una corrida en vuelo no marca 'ok' algo que se acaba de re-encolar.
create or replace function public.gcal_elegir_calendario(p_id text, p_nombre text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
begin
  update public.calendario_google
     set calendar_id = p_id, calendar_nombre = p_nombre, updated_at = now()
   where usuario_id = v_yo;
  if not found then
    raise exception 'Primero conecta Google Calendar' using errcode = '22023';
  end if;
  update public.ot_pendientes
     set gcal_event_id = null, gcal_remoto_tipo = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null,
         gcal_version = gcal_version + 1
   where usuario_id = v_yo and gcal_destino = 'calendar';
end $$;

create or replace function public.gtasks_elegir_lista(p_id text, p_nombre text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
begin
  update public.calendario_google
     set tasklist_id = p_id, tasklist_nombre = p_nombre, updated_at = now()
   where usuario_id = v_yo and position('auth/tasks' in coalesce(scopes, '')) > 0;
  if not found then
    raise exception 'Primero conecta Google Tasks' using errcode = '22023';
  end if;
  update public.ot_pendientes
     set gcal_event_id = null, gcal_remoto_tipo = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null,
         gcal_version = gcal_version + 1
   where usuario_id = v_yo and gcal_destino = 'tasks';
end $$;

create or replace function public.gcal_desconectar()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_secret uuid;
begin
  delete from public.calendario_google where usuario_id = v_yo returning secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  delete from public.gcal_borrados where usuario_id = v_yo;
  update public.ot_pendientes
     set gcal_event_id = null, gcal_remoto_tipo = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null,
         gcal_version = gcal_version + 1
   where usuario_id = v_yo;
end $$;

-- ── Empujón ──────────────────────────────────────────────────────────────────
-- Una llamada por SENTENCIA (marcar 20 hechos = 1 llamada), y solo si quedó
-- algo que subir de alguien con Google conectado. No empuja:
--   - los updates del propio sync ('enviando', 'ok'),
--   - los reintentos por error (gcal_intentos > 0): esos van con el cron,
--   - a quien no tiene conexión.
create or replace function public.ot_pendientes_gcal_empujar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hay boolean;
begin
  if tg_op = 'DELETE' then
    select exists (
      select 1 from viejos v
      join public.calendario_google c on c.usuario_id = v.usuario_id and c.estado = 'activo'
      where v.gcal_event_id is not null
    ) into v_hay;
  else
    select exists (
      select 1 from nuevos n
      join public.calendario_google c on c.usuario_id = n.usuario_id and c.estado = 'activo'
       and (c.calendar_id is not null or c.tasklist_id is not null)
      where n.gcal_sync = 'pendiente' and n.gcal_intentos = 0
    ) into v_hay;
  end if;

  if v_hay then
    perform net.http_post(
      url     := 'https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/gcal-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body    := '{"origen": "trigger"}'::jsonb
    );
  end if;
  return null;
end
$function$;

revoke all on function public.ot_pendientes_gcal_empujar() from public, anon, authenticated;

-- Tres triggers: las tablas de transición no se pueden declarar en un trigger de varios eventos.
create trigger trg_ot_pendientes_gcal_empujar_ins
  after insert on public.ot_pendientes
  referencing new table as nuevos
  for each statement execute function public.ot_pendientes_gcal_empujar();

create trigger trg_ot_pendientes_gcal_empujar_upd
  after update on public.ot_pendientes
  referencing new table as nuevos
  for each statement execute function public.ot_pendientes_gcal_empujar();

create trigger trg_ot_pendientes_gcal_empujar_del
  after delete on public.ot_pendientes
  referencing old table as viejos
  for each statement execute function public.ot_pendientes_gcal_empujar();
