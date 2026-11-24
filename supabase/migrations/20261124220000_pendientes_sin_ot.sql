-- Pendientes sin OT: tareas administrativas ("renovar el seguro", "pagar la
-- patente") que no deben ensuciar el ciclo de ninguna orden de trabajo.
--
-- Son la misma tabla: orden_id pasa a ser opcional. Un pendiente sin OT avisa
-- igual (push y correo), se repite igual y sale en Mis pendientes, pero no deja
-- líneas en ninguna Actividad. Google Calendar sigue recibiendo solo los de OT;
-- los sin OT van a Google Tasks (migración 20261124230000).

alter table public.ot_pendientes alter column orden_id drop not null;

-- ── RLS: la OT, si viene, tiene que ser del workspace ────────────────────────
drop policy pendientes_insert_own on public.ot_pendientes;
create policy pendientes_insert_own on public.ot_pendientes
for insert to authenticated
with check (
  usuario_id = (select auth.uid())
  and workspace_id = (select public.my_workspace_id())
  and (
    orden_id is null
    or exists (
      select 1 from public.ordenes_trabajo o
      where o.id = orden_id and o.workspace_id = (select public.my_workspace_id())
    )
  )
);

drop policy pendientes_update_own on public.ot_pendientes;
create policy pendientes_update_own on public.ot_pendientes
for update to authenticated
using (usuario_id = (select auth.uid()))
with check (
  usuario_id = (select auth.uid())
  and workspace_id = (select public.my_workspace_id())
  and (
    orden_id is null
    or exists (
      select 1 from public.ordenes_trabajo o
      where o.id = orden_id and o.workspace_id = (select public.my_workspace_id())
    )
  )
);

-- ── Actividad y recurrencia ──────────────────────────────────────────────────
-- Igual que 20261124140000, pero sin OT no hay Actividad donde escribir, y el
-- chequeo de duplicados compara orden_id con "is not distinct from" (null = null).
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

-- ── Push ─────────────────────────────────────────────────────────────────────
-- Igual que 20261124140000, con los sin OT: título "Pendiente" y el toque abre
-- Mis pendientes (la app móvil, que no conoce esa ruta, abre el inicio).
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
    where p.push
      and p.estado in ('por_hacer', 'en_curso')
      and p.avisado_at is null
      and p.fecha <= v_ahora::date + 366
      and p.fecha + coalesce(p.hora, time '08:30') - make_interval(mins => p.aviso_minutos) <= v_ahora
      and (
        p.orden_id is null
        or exists (select 1 from public.ordenes_trabajo o where o.id = p.orden_id and o.deleted_at is null)
      )
    returning p.usuario_id, p.orden_id, p.nota
  ),
  ins as (
    insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
    select v.usuario_id,
           case when v.orden_id is null then 'Pendiente'
                else 'Pendiente: ' || coalesce(nullif(btrim(o.titulo), ''), 'OT #' || o.numero, 'OT') end,
           v.nota,
           'pendiente',
           case when v.orden_id is null then '/pendientes' else '/orden/' || v.orden_id::text end
    from vencidos v
    left join public.ordenes_trabajo o on o.id = v.orden_id
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end
$function$;
