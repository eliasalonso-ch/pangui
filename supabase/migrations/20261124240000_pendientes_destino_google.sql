-- A dónde va cada pendiente en Google: Calendar (evento), Tasks (tarea) o a
-- ninguno. Lo elige la persona en el diálogo; por defecto, con hora → Calendar
-- (es una cita) y sin hora → Tasks (es un to-do del día). Reemplaza la regla
-- de 20261124230000 (de OT → Calendar, sin OT → Tasks).
--
-- gcal_event_id sigue siendo el único id remoto; gcal_remoto_tipo dice dónde
-- vive, para borrarlo del lado correcto cuando el destino cambia.

alter table public.ot_pendientes
  add column gcal_destino     text check (gcal_destino in ('calendar', 'tasks', 'ninguno')),
  add column gcal_remoto_tipo text check (gcal_remoto_tipo in ('evento', 'tarea'));

-- Los que ya existen quedan donde están hoy.
update public.ot_pendientes
   set gcal_destino     = case when orden_id is null then 'tasks' else 'calendar' end,
       gcal_remoto_tipo = case when gcal_event_id is null then null
                               when orden_id is null then 'tarea' else 'evento' end;

alter table public.ot_pendientes alter column gcal_destino set not null;

-- ── Encolar: el default al crear, y re-encolar si cambia el destino ──────────
create or replace function public.ot_pendientes_gcal_encolar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if tg_op = 'INSERT' then
    -- Quien no elige (otra app, una versión vieja) recibe el default.
    new.gcal_destino := coalesce(new.gcal_destino, case when new.hora is null then 'tasks' else 'calendar' end);
    return new;
  end if;
  if (new.nota, new.fecha, new.hora, new.estado, new.prioridad, new.aviso_minutos, new.gcal_destino)
     is distinct from (old.nota, old.fecha, old.hora, old.estado, old.prioridad, old.aviso_minutos, old.gcal_destino) then
    new.gcal_sync := 'pendiente';
    new.gcal_intentos := 0;
    new.gcal_error := null;
  end if;
  return new;
end
$function$;

drop trigger trg_ot_pendientes_gcal_encolar on public.ot_pendientes;
create trigger trg_ot_pendientes_gcal_encolar
  before insert or update on public.ot_pendientes
  for each row execute function public.ot_pendientes_gcal_encolar();

-- ── Borrado: del lado donde vive ─────────────────────────────────────────────
create or replace function public.ot_pendientes_gcal_borrado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.gcal_event_id is not null then
    insert into public.gcal_borrados (workspace_id, usuario_id, event_id, tipo)
    values (old.workspace_id, old.usuario_id, old.gcal_event_id, coalesce(old.gcal_remoto_tipo, 'evento'));
  end if;
  return null;
end
$function$;

-- ── Elegir calendario o lista: re-crea los de ese destino ────────────────────
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
     set gcal_event_id = null, gcal_remoto_tipo = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
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
     set gcal_event_id = null, gcal_remoto_tipo = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
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
     set gcal_event_id = null, gcal_remoto_tipo = null, gcal_sync = 'pendiente', gcal_intentos = 0, gcal_error = null
   where usuario_id = v_yo;
end $$;

-- ── La siguiente ocurrencia de un recurrente hereda el destino ───────────────
create or replace function public.ot_pendientes_actividad()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_hoy   date := (now() at time zone 'America/Santiago')::date;
  v_sig   date;
  v_fin   date;
  v_guard integer := 0;
begin
  if tg_op = 'INSERT' then
    if new.orden_id is not null then
      insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
      values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_creado',
              to_char(new.fecha, 'DD/MM/YYYY') || coalesce(' ' || to_char(new.hora, 'HH24:MI'), '')
              || ' · ' || new.nota);
    end if;
    return null;
  end if;

  if new.estado = 'hecho' and old.estado <> 'hecho' then
    if new.orden_id is not null then
      insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
      values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_hecho', new.nota);
    end if;

    if new.recurrencia <> 'ninguna' then
      v_sig := new.fecha;
      loop
        v_sig := public.recurrente_advance_date(v_sig, new.recurrencia, new.recurrencia_config);
        v_guard := v_guard + 1;
        exit when v_sig is null or v_sig > v_hoy or v_guard > 1000;
      end loop;

      v_fin := nullif(new.recurrencia_config->>'end_date', '')::date;
      if v_sig is not null and v_sig > v_hoy and (v_fin is null or v_sig <= v_fin)
         and not exists (
           select 1 from public.ot_pendientes x
           where x.orden_id is not distinct from new.orden_id and x.usuario_id = new.usuario_id
             and x.nota = new.nota and x.fecha = v_sig
             and x.estado in ('por_hacer', 'en_curso')
         ) then
        insert into public.ot_pendientes
          (workspace_id, orden_id, usuario_id, fecha, hora, nota, recurrencia, recurrencia_config,
           push, correo, prioridad, aviso_minutos, gcal_destino)
        values
          (new.workspace_id, new.orden_id, new.usuario_id, v_sig, new.hora, new.nota,
           new.recurrencia, new.recurrencia_config, new.push, new.correo, new.prioridad, new.aviso_minutos,
           new.gcal_destino);
      end if;
    end if;
  end if;
  return null;
end
$function$;
