-- Una OT puede enviarse a varios proveedores a la vez.
--
-- Antes ot_envios tenía una fila por OT (PK orden_id) y enviar a otro proveedor
-- reemplazaba al anterior. Ahora hay una fila por (OT, vínculo):
--   · cada proveedor ve la OT y la ejecuta con sus técnicos;
--   · retirar, desconectar y reconectar tocan solo a ese proveedor y a sus
--     técnicos (los de los demás no se mueven);
--   · cualquiera de ellos la envía a revisión; aprobar la cierra para todos.
-- Requiere 20261015120000_envios_desconexion.sql.

alter table public.ot_envios drop constraint ot_envios_pkey;
alter table public.ot_envios add primary key (orden_id, vinculo_id);

-- Técnicos de la OT que pertenecen (o no) a un workspace.
create or replace function public.asignados_de_workspace(p_asignados uuid[], p_ws uuid, p_pertenecen boolean)
returns uuid[]
language sql stable security definer
set search_path = public
as $$
  select coalesce(array_agg(a), '{}'::uuid[])
  from unnest(coalesce(p_asignados, '{}'::uuid[])) a
  where exists (select 1 from public.usuarios u where u.id = a and u.workspace_id = p_ws) = p_pertenecen;
$$;

revoke all on function public.asignados_de_workspace(uuid[], uuid, boolean) from public, anon, authenticated;

create or replace function public.crear_envio_ot(
  p_orden_id uuid, p_vinculo_id uuid, p_por uuid, p_nota text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.vinculos_contratista%rowtype;
  v_ot public.ordenes_trabajo%rowtype;
  v_nombre_destino text;
begin
  select * into v from public.vinculos_contratista where id = p_vinculo_id and estado = 'activo';
  if v.id is null then
    raise exception 'El proveedor no está conectado a Pangui.' using errcode = '22023';
  end if;
  select * into v_ot from public.ordenes_trabajo where id = p_orden_id;
  if v_ot.id is null or v_ot.deleted_at is not null then
    raise exception 'La OT no existe.' using errcode = '22023';
  end if;
  if v_ot.workspace_id is distinct from v.workspace_dueno then
    raise exception 'La OT no es de este cliente.' using errcode = '42501';
  end if;
  if v_ot.estado in ('completado', 'cancelado') then
    raise exception 'La OT ya está cerrada.' using errcode = '22023';
  end if;

  select p.nombre into v_nombre_destino from public.proveedores p where p.id = v.proveedor_id;

  insert into public.ot_envios (
    orden_id, vinculo_id, workspace_origen, workspace_destino, activo, nota,
    nombre_origen, nombre_destino, enviado_por, enviado_at
  ) values (
    p_orden_id, v.id, v.workspace_dueno, v.workspace_contratista, true, nullif(btrim(p_nota), ''),
    (select w.nombre from public.workspaces w where w.id = v.workspace_dueno),
    v_nombre_destino, p_por, now()
  )
  on conflict (orden_id, vinculo_id) do update set
    workspace_destino = excluded.workspace_destino,
    activo = true,
    nota = excluded.nota,
    nombre_origen = excluded.nombre_origen,
    nombre_destino = excluded.nombre_destino,
    enviado_por = excluded.enviado_por,
    enviado_at = excluded.enviado_at,
    cortado_en_revocacion = false,
    asignados_previos = null;

  insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
  values (p_orden_id, p_por, 'editado', 'Enviada a ' || coalesce(v_nombre_destino, 'proveedor'));
end;
$$;

revoke all on function public.crear_envio_ot(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Retira la OT de un proveedor (o de todos si p_vinculo_id es null). Solo se
-- desasignan los técnicos de ese proveedor.
drop function if exists public.retirar_envio_ot(uuid);
create or replace function public.retirar_envio_ot(p_orden_id uuid, p_vinculo_id uuid default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
begin
  if not exists (
    select 1 from public.ordenes_trabajo o
    where o.id = p_orden_id and o.workspace_id = public.my_workspace_id()
  ) or public.my_rol() not in ('owner', 'admin', 'member') then
    raise exception 'No puedes retirar esta OT.' using errcode = '42501';
  end if;
  for r in
    update public.ot_envios set activo = false, cortado_en_revocacion = false, asignados_previos = null
    where orden_id = p_orden_id and activo and (p_vinculo_id is null or vinculo_id = p_vinculo_id)
    returning workspace_destino, nombre_destino
  loop
    update public.ordenes_trabajo
    set asignados_ids = public.asignados_de_workspace(asignados_ids, r.workspace_destino, false)
    where id = p_orden_id;
    insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
    values (p_orden_id, auth.uid(), 'editado', 'Retirada de ' || r.nombre_destino);
  end loop;
end;
$$;

revoke all on function public.retirar_envio_ot(uuid, uuid) from public, anon;
grant execute on function public.retirar_envio_ot(uuid, uuid) to authenticated;

create or replace function public.revocar_vinculo_contratista(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v public.vinculos_contratista%rowtype;
  v_ws uuid := public.my_workspace_id();
  v_otro uuid;
  v_quien text;
  v_abiertas integer := 0;
  r record;
begin
  select * into v from public.vinculos_contratista where id = p_id for update;
  if v.id is null or v.estado = 'revocado'
     or v_ws is null or v_ws not in (v.workspace_dueno, coalesce(v.workspace_contratista, v.workspace_dueno))
     or public.my_rol() not in ('owner', 'admin') then
    raise exception 'No puedes desconectar este vínculo.' using errcode = '42501';
  end if;

  update public.vinculos_contratista
  set estado = 'revocado', revocado_at = now(), revocado_por = auth.uid(), revocado_por_workspace = v_ws
  where id = p_id;

  if v.estado <> 'activo' then
    return;
  end if;

  v_quien := public.nombre_lado_vinculo(v, v_ws);
  v_otro := case when v_ws = v.workspace_dueno then v.workspace_contratista else v.workspace_dueno end;

  -- Solo salen los técnicos de este proveedor; los de otros proveedores de la
  -- misma OT siguen trabajando.
  for r in
    update public.ot_envios e
    set activo = false, cortado_en_revocacion = true,
        asignados_previos = public.asignados_de_workspace(o.asignados_ids, e.workspace_destino, true)
    from public.ordenes_trabajo o
    where o.id = e.orden_id and e.vinculo_id = p_id and e.activo
      and o.estado not in ('completado', 'cancelado')
    returning e.orden_id, e.workspace_destino
  loop
    update public.ordenes_trabajo
    set asignados_ids = public.asignados_de_workspace(asignados_ids, r.workspace_destino, false)
    where id = r.orden_id;
    insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
    values (r.orden_id, auth.uid(), 'editado', v_quien || ' cortó la conexión. Sus técnicos quedaron fuera de la OT.');
    v_abiertas := v_abiertas + 1;
  end loop;

  insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
  select u.id,
         v_quien || ' cortó la conexión',
         case when v_abiertas = 0 then 'Ya no comparten OTs por Pangui.'
              when v_abiertas = 1 then '1 OT abierta quedó sin ese proveedor.'
              else v_abiertas || ' OTs abiertas quedaron sin ese proveedor.' end,
         'vinculo_contratista',
         case when v_otro = v.workspace_dueno then '/proveedores?id=' || v.proveedor_id else '/espacio-trabajo' end
  from public.usuarios u
  where u.workspace_id = v_otro and u.rol in ('owner', 'admin') and coalesce(u.activo, true);
end;
$$;

create or replace function public.reconectar_vinculo_contratista(p_id uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  v public.vinculos_contratista%rowtype;
  v_ws uuid := public.my_workspace_id();
  v_otro uuid;
  v_quien text;
  v_vueltas integer := 0;
  r record;
begin
  select * into v from public.vinculos_contratista where id = p_id for update;
  if v.id is null or v.estado <> 'revocado' or v.workspace_contratista is null
     or v.revocado_por_workspace is distinct from v_ws
     or public.my_rol() not in ('owner', 'admin') then
    raise exception 'No puedes reconectar este vínculo.' using errcode = '42501';
  end if;
  if v.revocado_at <= now() - interval '30 days' then
    raise exception 'Pasaron más de 30 días desde el corte: hace falta una invitación nueva.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.vinculos_contratista x
    where x.id <> p_id and x.estado <> 'revocado'
      and (x.proveedor_id = v.proveedor_id
           or (x.workspace_dueno = v.workspace_dueno and x.workspace_contratista = v.workspace_contratista))
  ) then
    raise exception 'Ya hay otra conexión o invitación vigente entre estas empresas.' using errcode = '22023';
  end if;

  update public.vinculos_contratista
  set estado = 'activo', revocado_at = null, revocado_por = null, revocado_por_workspace = null
  where id = p_id;

  v_quien := public.nombre_lado_vinculo(v, v_ws);
  v_otro := case when v_ws = v.workspace_dueno then v.workspace_contratista else v.workspace_dueno end;

  for r in
    update public.ot_envios e
    set activo = true, cortado_en_revocacion = false
    from public.ordenes_trabajo o
    where o.id = e.orden_id and e.vinculo_id = p_id and e.cortado_en_revocacion and not e.activo
      and o.deleted_at is null and o.estado not in ('completado', 'cancelado')
    returning e.orden_id, e.asignados_previos
  loop
    -- Sus técnicos vuelven junto a los que haya ahora (sin duplicar).
    update public.ordenes_trabajo
    set asignados_ids = array(
      select distinct a from unnest(coalesce(asignados_ids, '{}'::uuid[]) || coalesce(r.asignados_previos, '{}'::uuid[])) a
    )
    where id = r.orden_id and r.asignados_previos is not null and cardinality(r.asignados_previos) > 0;
    insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
    values (r.orden_id, auth.uid(), 'editado', v_quien || ' restableció la conexión.');
    v_vueltas := v_vueltas + 1;
  end loop;

  update public.ot_envios set asignados_previos = null where vinculo_id = p_id and activo;

  insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
  select u.id,
         v_quien || ' restableció la conexión',
         case when v_vueltas = 0 then 'Vuelven a compartir OTs por Pangui.'
              when v_vueltas = 1 then '1 OT abierta volvió al proveedor.'
              else v_vueltas || ' OTs abiertas volvieron al proveedor.' end,
         'vinculo_contratista',
         case when v_otro = v.workspace_dueno then '/proveedores?id=' || v.proveedor_id else '/espacio-trabajo' end
  from public.usuarios u
  where u.workspace_id = v_otro and u.rol in ('owner', 'admin') and coalesce(u.activo, true);

  return v_vueltas;
end;
$$;

-- La siguiente OT de una recurrencia va a TODOS los proveedores activos de la
-- OT anterior; la de un plan, al proveedor del plan.
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
    select v.id into v_vinculo
    from public.planes_mantencion p
    join public.vinculos_contratista v on v.proveedor_id = p.proveedor_id and v.estado = 'activo'
    where p.id = new.plan_id;
    if v_vinculo is not null and not exists (
      select 1 from public.ot_envios e where e.orden_id = new.orden_id and e.vinculo_id = v_vinculo and e.activo
    ) then
      perform public.crear_envio_ot(new.orden_id, v_vinculo, null, 'Plan de mantención');
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_envio_automatico_ot() from public, anon, authenticated;
