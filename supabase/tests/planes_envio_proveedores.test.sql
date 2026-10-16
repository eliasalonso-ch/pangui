-- Prueba de 20261015160000_planes_envio_proveedores.sql contra prod (UdeC → Alonso Technologies).
-- Solo-rollback: termina en RAISE 'RESULTADO …' a propósito, así no queda nada
-- guardado ni sale ningún push (pg_net encola dentro de la transacción).
-- Correr DESPUÉS de aplicar la migración.
--   A) plan creado con el proveedor → la OT de hoy nace y le llega (envío + notificación)
--   B) plan sin proveedor → al agregarlo, le llegan sus OTs abiertas
do $prueba$
declare
  c_ws_udec constant uuid := 'd266776d-b1c0-4b94-bc18-b775b12846fd';
  c_ws_juan constant uuid := '94be4366-36e3-4c19-810e-cefc799c533e';
  c_vinculo constant uuid := 'd93ec309-c71b-4cac-9087-ff0f6fd126e2';
  c_activo  constant uuid := 'e1cd4cda-9b6a-4245-b7c0-b5ad50179e60';
  v_plan uuid; v_plan2 uuid;
  a_ots int; a_envios int; a_notifs int; a_msg text;
  b_antes int; b_envios int; b_notifs int;
begin

  -- Sesión del owner de la UdeC (auth.uid / my_workspace_id / my_rol).
  perform set_config('request.jwt.claims', '{"sub":"e2cdb060-fca0-49e3-a142-c87a478861e1","role":"authenticated"}', true);

  -- A) Crear un plan con el proveedor: la OT de hoy nace y se envía al tiro.
  insert into public.planes_mantencion (workspace_id, nombre, activo_id, recurrencia, fecha_inicio, envio_vinculo_ids, tipo_trabajo)
  values (c_ws_udec, 'Plan de prueba', c_activo, 'diaria', current_date, array[c_vinculo], 'preventiva')
  returning id into v_plan;
  perform public.plan_materializar_ocurrencias(v_plan, null);
  a_ots := public.plan_generar_ordenes_ya(v_plan);
  select count(*) into a_envios from public.ot_envios e join public.plan_ocurrencias oc on oc.orden_id = e.orden_id
   where oc.plan_id = v_plan and e.activo and e.workspace_destino = c_ws_juan;
  select count(*), max(n.titulo || ' | ' || n.mensaje) into a_notifs, a_msg
   from public.notifications n join public.usuarios u on u.id = n.usuario_id
   where n.tipo = 'ot_recibida' and u.workspace_id = c_ws_juan and n.created_at = now();

  -- B) Plan sin proveedor; agregarlo después envía sus OTs abiertas.
  insert into public.planes_mantencion (workspace_id, nombre, activo_id, recurrencia, fecha_inicio, tipo_trabajo)
  values (c_ws_udec, 'Plan de prueba 2', c_activo, 'diaria', current_date, 'preventiva')
  returning id into v_plan2;
  perform public.plan_materializar_ocurrencias(v_plan2, null);
  perform public.plan_generar_ordenes_ya(v_plan2);
  select count(*) into b_antes from public.ot_envios e join public.plan_ocurrencias oc on oc.orden_id = e.orden_id where oc.plan_id = v_plan2;
  update public.planes_mantencion set envio_vinculo_ids = array[c_vinculo] where id = v_plan2;
  select count(*) into b_envios from public.ot_envios e join public.plan_ocurrencias oc on oc.orden_id = e.orden_id
   where oc.plan_id = v_plan2 and e.activo;
  select count(*) - a_notifs into b_notifs
   from public.notifications n join public.usuarios u on u.id = n.usuario_id
   where n.tipo = 'ot_recibida' and u.workspace_id = c_ws_juan and n.created_at = now();

  raise exception 'RESULTADO A: ots=% envios=% notifs=% [%] || B: envios_antes=% envios_despues=% notifs=%',
    a_ots, a_envios, a_notifs, a_msg, b_antes, b_envios, b_notifs;
end $prueba$;
