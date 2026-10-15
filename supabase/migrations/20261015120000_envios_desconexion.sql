-- Desconectar y reconectar un vínculo dueño ↔ contratista sin perder trabajo.
--
-- Cualquiera de los dos lados (owner/admin) puede cortar. Al cortar:
--   · las OTs abiertas dejan de verse para el contratista, quedan sin sus
--     técnicos y registran el corte en su actividad;
--   · owners/admins del otro lado reciben una notificación.
-- Si fue un error, el MISMO lado que cortó puede reconectar durante 30 días:
-- vuelven exactamente los envíos que ese corte desactivó (no los que el dueño
-- retiró a propósito) y, si nadie los reasignó, sus técnicos.
-- Requiere 20261014230000_envios_contratista.sql.

alter table public.vinculos_contratista
  add column if not exists revocado_por uuid references auth.users(id) on delete set null,
  add column if not exists revocado_por_workspace uuid references public.workspaces(id) on delete set null;

alter table public.ot_envios
  -- true solo si lo desactivó un corte del vínculo: es lo que reconectar devuelve.
  add column if not exists cortado_en_revocacion boolean not null default false,
  add column if not exists asignados_previos uuid[];

-- Un envío nuevo o reenviado parte limpio.
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
  v_destino_previo uuid;
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

  select e.workspace_destino into v_destino_previo
  from public.ot_envios e where e.orden_id = p_orden_id and e.activo;
  select p.nombre into v_nombre_destino from public.proveedores p where p.id = v.proveedor_id;

  insert into public.ot_envios (
    orden_id, vinculo_id, workspace_origen, workspace_destino, activo, nota,
    nombre_origen, nombre_destino, enviado_por, enviado_at
  ) values (
    p_orden_id, v.id, v.workspace_dueno, v.workspace_contratista, true, nullif(btrim(p_nota), ''),
    (select w.nombre from public.workspaces w where w.id = v.workspace_dueno),
    v_nombre_destino, p_por, now()
  )
  on conflict (orden_id) do update set
    vinculo_id = excluded.vinculo_id,
    workspace_destino = excluded.workspace_destino,
    activo = true,
    nota = excluded.nota,
    nombre_origen = excluded.nombre_origen,
    nombre_destino = excluded.nombre_destino,
    enviado_por = excluded.enviado_por,
    enviado_at = excluded.enviado_at,
    cortado_en_revocacion = false,
    asignados_previos = null;

  if v_destino_previo is not null and v_destino_previo <> v.workspace_contratista then
    update public.ordenes_trabajo set asignados_ids = '{}'::uuid[] where id = p_orden_id;
  end if;

  insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
  values (p_orden_id, p_por, 'editado', 'Enviada a ' || coalesce(v_nombre_destino, 'proveedor'));
end;
$$;

revoke all on function public.crear_envio_ot(uuid, uuid, uuid, text) from public, anon, authenticated;

-- Retirar a propósito nunca se deshace con "reconectar".
create or replace function public.retirar_envio_ot(p_orden_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if not exists (
    select 1 from public.ordenes_trabajo o
    where o.id = p_orden_id and o.workspace_id = public.my_workspace_id()
  ) or public.my_rol() not in ('owner', 'admin', 'member') then
    raise exception 'No puedes retirar esta OT.' using errcode = '42501';
  end if;
  update public.ot_envios set activo = false, cortado_en_revocacion = false, asignados_previos = null
  where orden_id = p_orden_id and activo
  returning nombre_destino into v_nombre;
  if v_nombre is null then
    return;
  end if;
  update public.ordenes_trabajo set asignados_ids = '{}'::uuid[] where id = p_orden_id;
  insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
  values (p_orden_id, auth.uid(), 'editado', 'Retirada de ' || v_nombre);
end;
$$;

-- Nombre con que el otro lado conoce a quien actúa: el dueño ve el nombre del
-- proveedor; el contratista, el del workspace del dueño.
create or replace function public.nombre_lado_vinculo(v public.vinculos_contratista, p_ws uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when p_ws = v.workspace_dueno then (select w.nombre from public.workspaces w where w.id = v.workspace_dueno)
    else (select p.nombre from public.proveedores p where p.id = v.proveedor_id)
  end;
$$;

revoke all on function public.nombre_lado_vinculo(public.vinculos_contratista, uuid) from public, anon, authenticated;

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

  -- Una invitación sin aceptar no tiene OTs ni otro lado a quien avisar.
  if v.estado <> 'activo' then
    return;
  end if;

  v_quien := public.nombre_lado_vinculo(v, v_ws);
  v_otro := case when v_ws = v.workspace_dueno then v.workspace_contratista else v.workspace_dueno end;

  -- Las cerradas se quedan visibles: el contratista las necesita para cobrar.
  for r in
    update public.ot_envios e
    set activo = false, cortado_en_revocacion = true, asignados_previos = o.asignados_ids
    from public.ordenes_trabajo o
    where o.id = e.orden_id and e.vinculo_id = p_id and e.activo
      and o.estado not in ('completado', 'cancelado')
    returning e.orden_id
  loop
    update public.ordenes_trabajo set asignados_ids = '{}'::uuid[] where id = r.orden_id;
    insert into public.actividad_ot (orden_id, usuario_id, tipo, comentario)
    values (r.orden_id, auth.uid(), 'editado', v_quien || ' cortó la conexión. La OT quedó sin técnicos asignados.');
    v_abiertas := v_abiertas + 1;
  end loop;

  insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
  select u.id,
         v_quien || ' cortó la conexión',
         case when v_abiertas = 0 then 'Ya no comparten OTs por Pangui.'
              when v_abiertas = 1 then '1 OT abierta quedó sin proveedor.'
              else v_abiertas || ' OTs abiertas quedaron sin proveedor.' end,
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
  -- Solo el lado que cortó deshace su propio corte: si cortó el otro, volver
  -- exige una invitación nueva que ese lado acepte.
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
    -- Los técnicos vuelven solo si nadie reasignó la OT mientras tanto.
    update public.ordenes_trabajo set asignados_ids = r.asignados_previos
    where id = r.orden_id and r.asignados_previos is not null
      and coalesce(cardinality(asignados_ids), 0) = 0;
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

-- Las conexiones de mi workspace vistas desde mi lado, con lo que la UI
-- necesita para confirmar un corte o deshacerlo.
create or replace function public.mis_vinculos()
returns table (
  id uuid, proveedor_id uuid, contraparte text, contraparte_es text, estado text,
  email_invitado text, aceptado_at timestamptz, revocado_at timestamptz,
  puedo_reconectar boolean, ots_abiertas integer
)
language sql stable security definer
set search_path = public
as $$
  select v.id,
         case when v.workspace_dueno = public.my_workspace_id() then v.proveedor_id end,
         case when v.workspace_dueno = public.my_workspace_id()
              then (select p.nombre from public.proveedores p where p.id = v.proveedor_id)
              else (select w.nombre from public.workspaces w where w.id = v.workspace_dueno) end,
         case when v.workspace_dueno = public.my_workspace_id() then 'contratista' else 'cliente' end,
         v.estado, v.email_invitado, v.aceptado_at, v.revocado_at,
         v.estado = 'revocado' and v.workspace_contratista is not null
           and v.revocado_por_workspace = public.my_workspace_id()
           and v.revocado_at > now() - interval '30 days'
           and public.my_rol() in ('owner', 'admin'),
         (select count(*)::integer
            from public.ot_envios e join public.ordenes_trabajo o on o.id = e.orden_id
           where e.vinculo_id = v.id and e.activo and o.deleted_at is null
             and o.estado not in ('completado', 'cancelado'))
  from public.vinculos_contratista v
  where public.my_workspace_id() in (v.workspace_dueno, v.workspace_contratista)
  order by v.created_at desc;
$$;

revoke all on function public.reconectar_vinculo_contratista(uuid) from public, anon;
revoke all on function public.mis_vinculos() from public, anon;
grant execute on function public.reconectar_vinculo_contratista(uuid) to authenticated;
grant execute on function public.mis_vinculos() to authenticated;
