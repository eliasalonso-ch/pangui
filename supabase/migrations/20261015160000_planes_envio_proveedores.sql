-- Planes de mantención con envío a proveedores conectados a Pangui.
--
-- Antes el plan enviaba sus OTs al vínculo de `proveedor_id`, pero esa columna
-- es el "Proveedor preferido" de los materiales (orden de compra): elegir quién
-- vende los insumos no puede mandar la OT a ejecutar. Ahora el envío tiene su
-- propio campo, igual al "Enviar a proveedores" de una OT.
--   · cada OT que genera el plan llega sola a esos proveedores;
--   · agregar un proveedor a un plan ya creado le envía sus OTs abiertas;
--   · plan_generar_ordenes_ya abre al tiro la OT que ya cae en la ventana de
--     apertura, sin esperar al cron de las 6:00 (si no, "crear el plan" no
--     envía nada hasta mañana).
-- En prod ningún plan usaba el envío por proveedor_id (verificado 2026-10-15).
-- Requiere 20261015150000_envios_notificacion.sql.

alter table public.planes_mantencion
  add column if not exists envio_vinculo_ids uuid[] not null default '{}';

comment on column public.planes_mantencion.envio_vinculo_ids is
  'Vínculos (vinculos_contratista) a los que se envía cada OT del plan.';

-- Vínculos activos del plan, solo los del mismo dueño: un id ajeno en el
-- arreglo no manda nada.
create or replace function public.vinculos_envio_plan(p_plan_id uuid)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select v.id
  from public.planes_mantencion p
  join public.vinculos_contratista v
    on v.id = any(p.envio_vinculo_ids) and v.estado = 'activo' and v.workspace_dueno = p.workspace_id
  where p.id = p_plan_id;
$$;

revoke all on function public.vinculos_envio_plan(uuid) from public, anon, authenticated;

create or replace function public.fn_envio_automatico_ot()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_vinculo uuid;
  v_anterior uuid;
begin
  if tg_table_name = 'ordenes_trabajo' then
    if new.recurrencia_origen_id is null then
      return new;
    end if;
    -- La OT previa más reciente de la cadena que tenga envíos activos.
    select o.id into v_anterior
    from public.ordenes_trabajo o
    where o.id <> new.id
      and (o.id = new.recurrencia_origen_id or o.recurrencia_origen_id = new.recurrencia_origen_id)
      and exists (select 1 from public.ot_envios e where e.orden_id = o.id and e.activo)
    order by o.created_at desc
    limit 1;
    for v_vinculo in
      select e.vinculo_id
      from public.ot_envios e
      join public.vinculos_contratista v on v.id = e.vinculo_id and v.estado = 'activo'
      where e.orden_id = v_anterior and e.activo
    loop
      perform public.crear_envio_ot(new.id, v_vinculo, null, null);
    end loop;
  else
    if new.orden_id is null
       or (tg_op = 'UPDATE' and old.orden_id is not distinct from new.orden_id) then
      return new;
    end if;
    for v_vinculo in select public.vinculos_envio_plan(new.plan_id) loop
      if not exists (
        select 1 from public.ot_envios e where e.orden_id = new.orden_id and e.vinculo_id = v_vinculo and e.activo
      ) then
        perform public.crear_envio_ot(new.orden_id, v_vinculo, null, 'Plan de mantención');
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_envio_automatico_ot() from public, anon, authenticated;

-- Proveedor agregado a un plan existente: le llegan las OTs abiertas del plan.
-- Quitarlo no retira nada: eso se hace OT por OT desde Compartir.
create or replace function public.fn_envio_plan_editado()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select oc.orden_id, v.vinculo_id
    from public.plan_ocurrencias oc
    join public.ordenes_trabajo o
      on o.id = oc.orden_id and o.deleted_at is null and o.estado not in ('completado', 'cancelado')
    cross join lateral public.vinculos_envio_plan(new.id) as v(vinculo_id)
    where oc.plan_id = new.id
      and not (v.vinculo_id = any(coalesce(old.envio_vinculo_ids, '{}'::uuid[])))
      and not exists (
        select 1 from public.ot_envios e where e.orden_id = oc.orden_id and e.vinculo_id = v.vinculo_id and e.activo
      )
  loop
    perform public.crear_envio_ot(r.orden_id, r.vinculo_id, auth.uid(), 'Plan de mantención');
  end loop;
  return new;
end;
$$;

revoke all on function public.fn_envio_plan_editado() from public, anon, authenticated;

drop trigger if exists trg_envio_plan_editado on public.planes_mantencion;
create trigger trg_envio_plan_editado
  after update of envio_vinculo_ids on public.planes_mantencion
  for each row
  when (old.envio_vinculo_ids is distinct from new.envio_vinculo_ids)
  execute function public.fn_envio_plan_editado();

-- Genera ya las OTs del plan cuya apertura es hoy o antes (lo mismo que hace el
-- cron, acotado a un plan del espacio de quien llama).
create or replace function public.plan_generar_ordenes_ya(p_plan_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.planes_mantencion p
    where p.id = p_plan_id and p.workspace_id = public.my_workspace_id()
  ) or public.my_rol() not in ('owner', 'admin', 'member') then
    raise exception 'El plan no pertenece a tu espacio de trabajo.' using errcode = '42501';
  end if;
  return public.plan_generar_ordenes(p_plan_id);
end;
$$;

revoke all on function public.plan_generar_ordenes_ya(uuid) from public, anon;
grant execute on function public.plan_generar_ordenes_ya(uuid) to authenticated;
