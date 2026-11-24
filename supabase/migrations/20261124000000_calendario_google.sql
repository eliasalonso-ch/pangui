-- Pendientes → Google Calendar con OAuth (etapa 2).
-- Especificación: docs/superpowers/plans/2026-11-23-google-calendar-oauth.md
--
-- Un owner/admin conecta una cuenta de Google y elige un calendario (por
-- ejemplo el del equipo). La edge function gcal-sync (cron) crea, actualiza y
-- borra un evento por cada pendiente del workspace. Un solo sentido: pangui → Google.
--
-- El refresh token vive en Vault; la tabla solo guarda el puntero. Leerlo y
-- guardarlo es solo para service_role (rutas /api/google/* y la edge function).

create table public.calendario_google (
  workspace_id    uuid primary key references public.workspaces(id) on delete cascade,
  google_email    text not null,
  calendar_id     text,                -- null hasta que el admin elige uno
  calendar_nombre text,
  secret_id       uuid not null,       -- refresh token en vault.secrets
  estado          text not null default 'activo' check (estado in ('activo', 'revocado', 'error')),
  ultimo_error    text,
  conectado_por   uuid references public.usuarios(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index calendario_google_conectado_por_idx on public.calendario_google (conectado_por);

alter table public.calendario_google enable row level security;

-- Owners/admins ven el estado de su conexión. Sin políticas de escritura:
-- se escribe solo por las funciones de abajo.
create policy calendario_google_select_admin on public.calendario_google
for select to authenticated
using (
  workspace_id = (select public.my_workspace_id())
  and (select public.my_rol()) in ('owner', 'admin')
);
revoke all on public.calendario_google from anon;
revoke insert, update, delete, truncate on public.calendario_google from authenticated;

-- ── Estado de sincronización en cada pendiente ───────────────────────────────
alter table public.ot_pendientes
  add column gcal_event_id text,
  add column gcal_sync     text not null default 'pendiente' check (gcal_sync in ('pendiente', 'ok', 'error')),
  add column gcal_intentos smallint not null default 0,
  add column gcal_error    text;

create index ot_pendientes_gcal_pendiente_idx on public.ot_pendientes (workspace_id)
  where gcal_sync = 'pendiente';

-- Un cambio que se ve en el evento lo vuelve a encolar. Los updates del propio
-- sync (gcal_*) y del push (avisado_at) no tocan estas columnas y no encolan.
create or replace function public.ot_pendientes_gcal_encolar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.nota, new.fecha, new.hora, new.estado, new.prioridad)
     is distinct from (old.nota, old.fecha, old.hora, old.estado, old.prioridad) then
    new.gcal_sync := 'pendiente';
    new.gcal_intentos := 0;
    new.gcal_error := null;
  end if;
  return new;
end
$function$;

create trigger trg_ot_pendientes_gcal_encolar
  before update on public.ot_pendientes
  for each row execute function public.ot_pendientes_gcal_encolar();

-- Un pendiente borrado deja su evento en esta cola para que el sync lo borre.
create table public.gcal_borrados (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id     text not null,
  intentos     smallint not null default 0,
  created_at   timestamptz not null default now()
);
create index gcal_borrados_workspace_idx on public.gcal_borrados (workspace_id);
alter table public.gcal_borrados enable row level security;  -- sin políticas: solo service_role
revoke all on public.gcal_borrados from anon, authenticated;

create or replace function public.ot_pendientes_gcal_borrado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.gcal_event_id is not null then
    insert into public.gcal_borrados (workspace_id, event_id) values (old.workspace_id, old.gcal_event_id);
  end if;
  return null;
end
$function$;
revoke all on function public.ot_pendientes_gcal_borrado() from public, anon, authenticated;

create trigger trg_ot_pendientes_gcal_borrado
  after delete on public.ot_pendientes
  for each row execute function public.ot_pendientes_gcal_borrado();

-- ── Funciones de la conexión ─────────────────────────────────────────────────

-- service_role: la llama /api/google/callback después de validar la sesión,
-- el rol y el state firmado. Reconectar reemplaza el token y reactiva.
create or replace function public.gcal_guardar_conexion(
  p_workspace uuid, p_usuario uuid, p_email text, p_refresh text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
begin
  if coalesce(p_refresh, '') = '' or coalesce(btrim(p_email), '') = '' then
    raise exception 'Faltan datos de la conexión' using errcode = '22023';
  end if;

  select secret_id into v_secret from public.calendario_google where workspace_id = p_workspace for update;

  if v_secret is null then
    v_secret := vault.create_secret(p_refresh, 'gcal_' || p_workspace::text, 'Refresh token Google Calendar');
    insert into public.calendario_google (workspace_id, google_email, secret_id, conectado_por)
    values (p_workspace, btrim(p_email), v_secret, p_usuario);
  else
    perform vault.update_secret(v_secret, p_refresh);
    update public.calendario_google
       set google_email = btrim(p_email), estado = 'activo', ultimo_error = null,
           conectado_por = p_usuario, updated_at = now()
     where workspace_id = p_workspace;
  end if;
end $$;

-- service_role: refresh token para pedir un access token.
create or replace function public.gcal_refresh_token(p_workspace uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
    from public.calendario_google c
    join vault.decrypted_secrets s on s.id = c.secret_id
   where c.workspace_id = p_workspace;
$$;

-- Owner/admin, de su workspace. Cambiar de calendario re-crea todos los eventos
-- en el nuevo (los del anterior quedan; la UI lo advierte).
create or replace function public.gcal_elegir_calendario(p_id text, p_nombre text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := public.my_workspace_id();
begin
  if coalesce(public.my_rol(), '') not in ('owner', 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.calendario_google
     set calendar_id = p_id, calendar_nombre = p_nombre, updated_at = now()
   where workspace_id = v_ws;
  if not found then
    raise exception 'Primero conecta Google Calendar' using errcode = '22023';
  end if;
  update public.ot_pendientes
     set gcal_event_id = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
   where workspace_id = v_ws;
end $$;

-- Owner/admin. Borra la conexión y el token; los pendientes quedan listos para
-- volver a crearse si se conecta otra vez. Revocar el token en Google lo hace la ruta.
create or replace function public.gcal_desconectar()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := public.my_workspace_id();
  v_secret uuid;
begin
  if coalesce(public.my_rol(), '') not in ('owner', 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  delete from public.calendario_google where workspace_id = v_ws returning secret_id into v_secret;
  if v_secret is not null then
    delete from vault.secrets where id = v_secret;
  end if;
  delete from public.gcal_borrados where workspace_id = v_ws;
  update public.ot_pendientes
     set gcal_event_id = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
   where workspace_id = v_ws;
end $$;

revoke all on function public.gcal_guardar_conexion(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.gcal_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.gcal_elegir_calendario(text, text) from public, anon;
revoke all on function public.gcal_desconectar() from public, anon;
grant execute on function public.gcal_guardar_conexion(uuid, uuid, text, text) to service_role;
grant execute on function public.gcal_refresh_token(uuid) to service_role;
grant execute on function public.gcal_elegir_calendario(text, text) to authenticated;
grant execute on function public.gcal_desconectar() to authenticated;

-- ── Cron: cada minuto, solo si hay alguna conexión lista ─────────────────────
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
  where exists (select 1 from public.calendario_google where estado = 'activo' and calendar_id is not null);
  $job$
);
