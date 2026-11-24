-- Google Tasks: los pendientes sin OT (tareas administrativas) van a una lista
-- de Google Tasks; los de OT siguen yendo a Google Calendar.
--
-- Es la MISMA conexión de Google (calendario_google, una por persona): un solo
-- refresh token en Vault que, con include_granted_scopes, junta los permisos de
-- Calendar y de Tasks. `scopes` guarda lo que Google concedió de verdad, así la
-- UI sabe qué falta pedir y gcal-sync no intenta lo que no puede.
--
-- Cada pendiente sigue teniendo UN id remoto (gcal_event_id): el de un evento
-- si tiene OT, el de una tarea si no. Un pendiente no cambia de OT, así que su
-- destino nunca cambia.

alter table public.calendario_google
  add column tasklist_id     text,   -- null hasta que la persona elige una lista
  add column tasklist_nombre text,
  add column scopes          text;   -- los permisos concedidos, separados por espacio

-- Las conexiones que ya existen se hicieron solo con los permisos de Calendar.
update public.calendario_google
   set scopes = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events'
 where scopes is null;

-- ── Borrados: evento o tarea ─────────────────────────────────────────────────
alter table public.gcal_borrados
  add column tipo text not null default 'evento' check (tipo in ('evento', 'tarea'));

create or replace function public.ot_pendientes_gcal_borrado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.gcal_event_id is not null then
    insert into public.gcal_borrados (workspace_id, usuario_id, event_id, tipo)
    values (old.workspace_id, old.usuario_id, old.gcal_event_id,
            case when old.orden_id is null then 'tarea' else 'evento' end);
  end if;
  return null;
end
$function$;

-- ── Guardar la conexión con sus permisos ─────────────────────────────────────
-- service_role (/api/google/callback). Sin un permiso, su destino se apaga
-- (calendar_id o tasklist_id a null) para no escribir con un token que no puede.
-- p_email null = se queda el que había. p_scopes null = una llamada de la web
-- anterior a este cambio (4 argumentos), que solo conectaba Calendar: así la web
-- en producción sigue funcionando entre esta migración y su deploy.
drop function public.gcal_guardar_conexion(uuid, uuid, text, text);
create function public.gcal_guardar_conexion(
  p_workspace uuid, p_usuario uuid, p_email text, p_refresh text, p_scopes text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_scopes   text := coalesce(p_scopes,
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events');
  v_secret   uuid;
  v_calendar boolean := position('auth/calendar.events' in v_scopes) > 0;
  v_tasks    boolean := position('auth/tasks' in v_scopes) > 0;
begin
  if coalesce(p_refresh, '') = '' or p_usuario is null then
    raise exception 'Faltan datos de la conexión' using errcode = '22023';
  end if;

  select secret_id into v_secret from public.calendario_google where usuario_id = p_usuario for update;

  if v_secret is null then
    v_secret := vault.create_secret(p_refresh, 'gcal_u_' || p_usuario::text, 'Refresh token Google');
    insert into public.calendario_google (workspace_id, usuario_id, google_email, secret_id, scopes)
    values (p_workspace, p_usuario, coalesce(nullif(btrim(p_email), ''), 'Cuenta de Google'), v_secret, v_scopes);
  else
    perform vault.update_secret(v_secret, p_refresh);
    update public.calendario_google
       set workspace_id    = p_workspace,
           google_email    = coalesce(nullif(btrim(p_email), ''), google_email),
           scopes          = v_scopes,
           calendar_id     = case when v_calendar then calendar_id end,
           calendar_nombre = case when v_calendar then calendar_nombre end,
           tasklist_id     = case when v_tasks then tasklist_id end,
           tasklist_nombre = case when v_tasks then tasklist_nombre end,
           estado = 'activo', ultimo_error = null, updated_at = now()
     where usuario_id = p_usuario;
  end if;
end $$;

revoke all on function public.gcal_guardar_conexion(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.gcal_guardar_conexion(uuid, uuid, text, text, text) to service_role;

-- ── Elegir destino ───────────────────────────────────────────────────────────
-- Cambiar de calendario re-crea en el nuevo solo los pendientes de OT.
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
     set gcal_event_id = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
   where usuario_id = v_yo and orden_id is not null;
end $$;

-- Cambiar de lista re-crea en la nueva solo los pendientes sin OT.
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
     set gcal_event_id = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
   where usuario_id = v_yo and orden_id is null;
end $$;

revoke all on function public.gtasks_elegir_lista(text, text) from public, anon;
grant execute on function public.gtasks_elegir_lista(text, text) to authenticated;

-- ── Cron: también si solo hay una lista de tareas elegida ────────────────────
-- cron.schedule con el mismo nombre reemplaza el job.
select cron.schedule(
  'gcal-sync',
  '* * * * *',
  $job$
  select net.http_post(
           url     := 'https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/gcal-sync',
           headers := jsonb_build_object(
             'Content-Type',  'application/json',
             'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
           ),
           body    := '{}'::jsonb
         )
  from (select 1) uno
  where exists (
    select 1 from public.calendario_google
    where estado = 'activo' and (calendar_id is not null or tasklist_id is not null)
  );
  $job$
);
