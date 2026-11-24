-- Google Calendar y link .ics pasan de uno por workspace a uno por persona.
--
-- Los pendientes son personales (RLS usuario_id = auth.uid()), así que su
-- calendario también: cada persona conecta su propia cuenta de Google, elige su
-- calendario y recibe sus avisos. gcal-sync escribe los pendientes de cada
-- persona con la cuenta de esa persona. El link .ics trae solo los pendientes
-- de quien lo creó.
--
-- La conexión y el link que ya existían quedan para quien los creó.

-- ── calendario_google: PK usuario_id ─────────────────────────────────────────
delete from vault.secrets where id in (select secret_id from public.calendario_google where conectado_por is null);
delete from public.calendario_google where conectado_por is null;

alter table public.calendario_google drop constraint calendario_google_pkey;
alter table public.calendario_google drop constraint calendario_google_conectado_por_fkey;
drop index public.calendario_google_conectado_por_idx;
alter table public.calendario_google rename column conectado_por to usuario_id;
alter table public.calendario_google
  alter column usuario_id set not null,
  add primary key (usuario_id),
  add constraint calendario_google_usuario_id_fkey foreign key (usuario_id) references public.usuarios(id) on delete cascade;
create index calendario_google_workspace_idx on public.calendario_google (workspace_id);

drop policy calendario_google_select_admin on public.calendario_google;
create policy calendario_google_select_propia on public.calendario_google
for select to authenticated
using (usuario_id = (select auth.uid()));

-- ── Cola de sync por persona ─────────────────────────────────────────────────
drop index public.ot_pendientes_gcal_pendiente_idx;
create index ot_pendientes_gcal_pendiente_idx on public.ot_pendientes (usuario_id)
  where gcal_sync = 'pendiente';

-- Cada borrado guarda de qué conexión (persona) es el evento.
alter table public.gcal_borrados
  add column usuario_id uuid references public.usuarios(id) on delete cascade;
update public.gcal_borrados b set usuario_id = c.usuario_id
  from public.calendario_google c where c.workspace_id = b.workspace_id;
delete from public.gcal_borrados where usuario_id is null;
alter table public.gcal_borrados alter column usuario_id set not null;
create index gcal_borrados_usuario_idx on public.gcal_borrados (usuario_id);

create or replace function public.ot_pendientes_gcal_borrado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.gcal_event_id is not null then
    insert into public.gcal_borrados (workspace_id, usuario_id, event_id)
    values (old.workspace_id, old.usuario_id, old.gcal_event_id);
  end if;
  return null;
end
$function$;

-- ── Funciones de la conexión ─────────────────────────────────────────────────

-- service_role (/api/google/callback, después de validar sesión, rol y state).
create or replace function public.gcal_guardar_conexion(
  p_workspace uuid, p_usuario uuid, p_email text, p_refresh text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_secret uuid;
begin
  if coalesce(p_refresh, '') = '' or coalesce(btrim(p_email), '') = '' or p_usuario is null then
    raise exception 'Faltan datos de la conexión' using errcode = '22023';
  end if;

  select secret_id into v_secret from public.calendario_google where usuario_id = p_usuario for update;

  if v_secret is null then
    v_secret := vault.create_secret(p_refresh, 'gcal_u_' || p_usuario::text, 'Refresh token Google Calendar');
    insert into public.calendario_google (workspace_id, usuario_id, google_email, secret_id)
    values (p_workspace, p_usuario, btrim(p_email), v_secret);
  else
    perform vault.update_secret(v_secret, p_refresh);
    update public.calendario_google
       set workspace_id = p_workspace, google_email = btrim(p_email), estado = 'activo', ultimo_error = null, updated_at = now()
     where usuario_id = p_usuario;
  end if;
end $$;

-- service_role: refresh token de la conexión de una persona.
drop function public.gcal_refresh_token(uuid);
create function public.gcal_refresh_token(p_usuario uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret
    from public.calendario_google c
    join vault.decrypted_secrets s on s.id = c.secret_id
   where c.usuario_id = p_usuario;
$$;

-- La propia conexión. Cambiar de calendario re-crea los eventos en el nuevo.
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
   where usuario_id = v_yo;
end $$;

-- La propia conexión. Revocar el token en Google lo hace la ruta.
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
     set gcal_event_id = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
   where usuario_id = v_yo;
end $$;

revoke all on function public.gcal_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.gcal_refresh_token(uuid) to service_role;

-- ── calendario_feeds: un link por persona ────────────────────────────────────
delete from public.calendario_feeds where creado_por is null;
alter table public.calendario_feeds drop constraint calendario_feeds_pkey;
alter table public.calendario_feeds drop constraint calendario_feeds_creado_por_fkey;
drop index public.calendario_feeds_creado_por_idx;
alter table public.calendario_feeds rename column creado_por to usuario_id;
alter table public.calendario_feeds
  alter column usuario_id set not null,
  add primary key (usuario_id),
  add constraint calendario_feeds_usuario_id_fkey foreign key (usuario_id) references public.usuarios(id) on delete cascade;
create index calendario_feeds_workspace_idx on public.calendario_feeds (workspace_id);

drop policy calendario_feeds_admin on public.calendario_feeds;
create policy calendario_feeds_propio on public.calendario_feeds
for all to authenticated
using (usuario_id = (select auth.uid()))
with check (usuario_id = (select auth.uid()) and workspace_id = (select public.my_workspace_id()));
