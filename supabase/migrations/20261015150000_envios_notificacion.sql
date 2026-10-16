-- Avisa al proveedor cuando le llega una OT.
--
-- crear_envio_ot es el único camino de un envío (manual, recurrencia y plan),
-- así que la notificación vive acá. Van a los owner/admin del workspace del
-- proveedor: son los que asignan técnicos. El push sale solo por
-- on_notification_insert.
-- Requiere 20261015130000_envios_multiples.sql.

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
  v_nombre_origen text;
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
  select w.nombre into v_nombre_origen from public.workspaces w where w.id = v.workspace_dueno;

  insert into public.ot_envios (
    orden_id, vinculo_id, workspace_origen, workspace_destino, activo, nota,
    nombre_origen, nombre_destino, enviado_por, enviado_at
  ) values (
    p_orden_id, v.id, v.workspace_dueno, v.workspace_contratista, true, nullif(btrim(p_nota), ''),
    v_nombre_origen, v_nombre_destino, p_por, now()
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

  insert into public.notifications (usuario_id, titulo, mensaje, tipo, url)
  select u.id,
         'Nueva OT de ' || coalesce(v_nombre_origen, 'un cliente'),
         v_ot.titulo || coalesce(' · ' || nullif(btrim(p_nota), ''), ''),
         'ot_recibida',
         '/orden/' || p_orden_id::text
  from public.usuarios u
  where u.workspace_id = v.workspace_contratista and u.rol in ('owner', 'admin') and coalesce(u.activo, true);
end;
$$;

revoke all on function public.crear_envio_ot(uuid, uuid, uuid, text) from public, anon, authenticated;
