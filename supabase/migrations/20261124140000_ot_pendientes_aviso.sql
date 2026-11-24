-- Pendientes: aviso propio de cada pendiente ("avisarme N antes").
--
-- Reemplaza la regla por workspace de 20261124120000 (calendario_google.aviso_minutos):
-- cada pendiente elige cuándo avisar, desde "a la hora" hasta meses antes.
--   · aviso_minutos: minutos antes de fecha + hora (sin hora = 08:30). 0 = a la hora.
--     Hasta 1 año (525600).
--   · Push (pendientes_avisar): sale en fecha + hora − aviso.
--   · Correo diario: lo incluye desde ese momento hasta que se cierra (edge function).
--   · Google Calendar: el aviso del evento, con el tope de Google (4 semanas);
--     para avisos más largos avisa Pangui.

alter table public.ot_pendientes
  add column aviso_minutos integer not null default 0
  check (aviso_minutos between 0 and 525600);

alter table public.calendario_google drop column aviso_minutos;
drop function if exists public.gcal_cambiar_aviso(integer);

-- Cambiar el aviso también cambia el evento de Google: re-encolar.
create or replace function public.ot_pendientes_gcal_encolar()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.nota, new.fecha, new.hora, new.estado, new.prioridad, new.aviso_minutos)
     is distinct from (old.nota, old.fecha, old.hora, old.estado, old.prioridad, old.aviso_minutos) then
    new.gcal_sync := 'pendiente';
    new.gcal_intentos := 0;
    new.gcal_error := null;
  end if;
  return new;
end
$function$;

-- La siguiente ocurrencia de un recurrente hereda el aviso (resto igual a 20261123210000).
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
    insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
    values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_creado',
            to_char(new.fecha, 'DD/MM/YYYY') || coalesce(' ' || to_char(new.hora, 'HH24:MI'), '')
            || ' · ' || new.nota);
    return null;
  end if;

  if new.estado = 'hecho' and old.estado <> 'hecho' then
    insert into public.actividad_ot (orden_id, usuario_id, workspace_id, tipo, comentario)
    values (new.orden_id, new.usuario_id, new.workspace_id, 'pendiente_hecho', new.nota);

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
           where x.orden_id = new.orden_id and x.usuario_id = new.usuario_id
             and x.nota = new.nota and x.fecha = v_sig
             and x.estado in ('por_hacer', 'en_curso')
         ) then
        insert into public.ot_pendientes
          (workspace_id, orden_id, usuario_id, fecha, hora, nota, recurrencia, recurrencia_config,
           push, correo, prioridad, aviso_minutos)
        values
          (new.workspace_id, new.orden_id, new.usuario_id, v_sig, new.hora, new.nota,
           new.recurrencia, new.recurrencia_config, new.push, new.correo, new.prioridad, new.aviso_minutos);
      end if;
    end if;
  end if;
  return null;
end
$function$;

-- Push en fecha + hora − aviso. El tope de un año en fecha deja usar el índice parcial.
create or replace function public.pendientes_avisar()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ahora timestamp := now() at time zone 'America/Santiago';
  v_n integer;
begin
  with vencidos as (
    update public.ot_pendientes p
    set avisado_at = now()
    from public.ordenes_trabajo o
    where o.id = p.orden_id
      and o.deleted_at is null
      and p.push
      and p.estado in ('por_hacer', 'en_curso')
      and p.avisado_at is null
      and p.fecha <= v_ahora::date + 366
      and p.fecha + coalesce(p.hora, time '08:30') - make_interval(mins => p.aviso_minutos) <= v_ahora
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
