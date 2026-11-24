-- Pendientes: estado y prioridad, como las tareas del ejemplo "Tasks".
--
-- Sigue a 20261123120000 y 20261123180000 (aplicadas).
--   · estado: por_hacer | en_curso | hecho | cancelado. Es la fuente de verdad;
--     hecho_at queda como sello y lo mantiene un trigger (se pone al pasar a
--     'hecho' y se limpia al salir). Así nada lo desincroniza a mano.
--   · prioridad: el mismo vocabulario de las OTs (baja, media, alta, urgente).
--   · Push, correo y recurrencia miran estado: los abiertos son por_hacer y
--     en_curso; cancelado no avisa ni genera la siguiente ocurrencia.

alter table public.ot_pendientes
  add column estado    text not null default 'por_hacer'
             check (estado in ('por_hacer', 'en_curso', 'hecho', 'cancelado')),
  add column prioridad text not null default 'media'
             check (prioridad in ('baja', 'media', 'alta', 'urgente'));

-- Orden numérico para ordenar en el servidor (la tabla pagina con .range()):
-- alfabético, "alta" quedaría antes que "urgente" y "en_curso" antes que "por_hacer".
alter table public.ot_pendientes
  add column prioridad_orden smallint generated always as (
    case prioridad when 'urgente' then 4 when 'alta' then 3 when 'media' then 2 else 1 end
  ) stored,
  add column estado_orden smallint generated always as (
    case estado when 'por_hacer' then 1 when 'en_curso' then 2 when 'hecho' then 3 else 4 end
  ) stored;

update public.ot_pendientes set estado = 'hecho' where hecho_at is not null;

drop index if exists public.ot_pendientes_abiertos_idx;
create index ot_pendientes_abiertos_idx on public.ot_pendientes (fecha)
  where estado in ('por_hacer', 'en_curso');

-- ── hecho_at sigue a estado ──────────────────────────────────────────────────
create or replace function public.ot_pendientes_sync_hecho()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Compatibilidad: un cliente anterior marca hecho poniendo solo hecho_at.
  if tg_op = 'UPDATE' and new.hecho_at is not null and old.hecho_at is null
     and new.estado = old.estado then
    new.estado := 'hecho';
  end if;

  if new.estado = 'hecho' then
    if tg_op = 'INSERT' or old.estado <> 'hecho' then
      new.hecho_at := now();
    end if;
  else
    new.hecho_at := null;
  end if;
  return new;
end
$function$;

create trigger trg_ot_pendientes_sync_hecho
  before insert or update on public.ot_pendientes
  for each row execute function public.ot_pendientes_sync_hecho();

-- ── Actividad + repetición, ahora por estado ─────────────────────────────────
-- El trigger AFTER ya no puede ser "update of hecho_at": ese filtro mira las
-- columnas del SET y hecho_at ahora lo pone el trigger BEFORE.
drop trigger if exists trg_ot_pendientes_actividad on public.ot_pendientes;

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
      -- Reabrir y volver a marcar hecho no duplica la siguiente ocurrencia.
      if v_sig is not null and v_sig > v_hoy and (v_fin is null or v_sig <= v_fin)
         and not exists (
           select 1 from public.ot_pendientes x
           where x.orden_id = new.orden_id and x.usuario_id = new.usuario_id
             and x.nota = new.nota and x.fecha = v_sig
             and x.estado in ('por_hacer', 'en_curso')
         ) then
        insert into public.ot_pendientes
          (workspace_id, orden_id, usuario_id, fecha, hora, nota, recurrencia, recurrencia_config,
           push, correo, prioridad)
        values
          (new.workspace_id, new.orden_id, new.usuario_id, v_sig, new.hora, new.nota,
           new.recurrencia, new.recurrencia_config, new.push, new.correo, new.prioridad);
      end if;
    end if;
  end if;
  return null;
end
$function$;

create trigger trg_ot_pendientes_actividad
  after insert or update on public.ot_pendientes
  for each row execute function public.ot_pendientes_actividad();

-- ── Push: solo los abiertos ──────────────────────────────────────────────────
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
      and p.push
      and p.estado in ('por_hacer', 'en_curso')
      and p.avisado_at is null
      and p.fecha <= (now() at time zone 'America/Santiago')::date
      and p.fecha + coalesce(p.hora, time '08:30') <= now() at time zone 'America/Santiago'
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
