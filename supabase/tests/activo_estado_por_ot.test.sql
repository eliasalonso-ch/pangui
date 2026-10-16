-- Prueba de 20261016010000_activo_estado_por_ot.sql contra prod ("Generador Arco", UdeC).
-- Solo-rollback: termina en RAISE 'RESULTADO …' a propósito, así no queda nada.
-- Esperado (2026-10-15):
--   1) mantencion/planeado:true pausa=mantencion fin=operativo
--   2) operativo
--   3) mantencion
--   4) mantencion -> operativo abiertos=1
-- Casos:
--   1) preventiva: iniciar → mantención/planeado ligada a la OT; pausar → sigue; completar → operativo
--   2) reactiva: iniciar no toca el activo
--   3) el período abierto dejó de ser de la OT (cambio manual): completar no lo toca
--   4) dos preventivas: termina la primera → sigue en mantención; termina la segunda → operativo
-- Ojo: en una transacción now() no avanza, así que el cambio manual del caso 3 se
-- simula soltando orden_id (un UPDATE de activos.estado chocaría con el
-- fin > inicio de fn_sync_activo_estado_periodo, cosa que en la vida real no pasa).
do $prueba$
declare
  c_ws constant uuid := 'd266776d-b1c0-4b94-bc18-b775b12846fd';
  c_activo constant uuid := '98bb8693-48ee-4644-b01f-2edf8b5af28f';
  v_tipo text := (select tipo from public.ordenes_trabajo where tipo is not null limit 1);
  v_a uuid; v_b uuid;
  r1 text; r2 text; r3 text; r4 text;
begin
  perform set_config('request.jwt.claims', '{"sub":"e2cdb060-fca0-49e3-a142-c87a478861e1","role":"authenticated"}', true);

  -- 1) Preventiva.
  insert into public.ordenes_trabajo (workspace_id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, activo_id)
  values (c_ws, 'Prev A', '', 'pendiente', 'media', v_tipo, 'preventiva', c_activo) returning id into v_a;
  update public.ordenes_trabajo set estado = 'en_curso' where id = v_a;
  r1 := (select estado from public.activos where id = c_activo)
     || '/' || (select tipo_inactividad || ':' || (orden_id = v_a)::text from public.activo_estado_periodos where activo_id = c_activo and fin is null);
  update public.ordenes_trabajo set estado = 'en_espera' where id = v_a;
  r1 := r1 || ' pausa=' || (select estado from public.activos where id = c_activo);
  update public.ordenes_trabajo set estado = 'en_curso' where id = v_a;
  update public.ordenes_trabajo set estado = 'completado' where id = v_a;
  r1 := r1 || ' fin=' || (select estado from public.activos where id = c_activo);

  -- 2) Reactiva.
  insert into public.ordenes_trabajo (workspace_id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, activo_id)
  values (c_ws, 'Reac', '', 'pendiente', 'media', v_tipo, 'reactiva', c_activo) returning id into v_b;
  update public.ordenes_trabajo set estado = 'en_curso' where id = v_b;
  r2 := (select estado from public.activos where id = c_activo);

  -- 4) Dos preventivas a la vez.
  insert into public.ordenes_trabajo (workspace_id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, activo_id)
  values (c_ws, 'Prev D1', '', 'pendiente', 'media', v_tipo, 'preventiva', c_activo) returning id into v_a;
  insert into public.ordenes_trabajo (workspace_id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, activo_id)
  values (c_ws, 'Prev D2', '', 'pendiente', 'media', v_tipo, 'preventiva', c_activo) returning id into v_b;
  update public.ordenes_trabajo set estado = 'en_curso' where id = v_a;
  update public.ordenes_trabajo set estado = 'en_curso' where id = v_b;
  update public.ordenes_trabajo set estado = 'completado' where id = v_a;
  r4 := (select estado from public.activos where id = c_activo);
  update public.ordenes_trabajo set estado = 'completado' where id = v_b;
  r4 := r4 || ' -> ' || (select estado from public.activos where id = c_activo)
     || ' abiertos=' || (select count(*) from public.activo_estado_periodos where activo_id = c_activo and fin is null);

  -- 3) El período deja de ser de la OT.
  insert into public.ordenes_trabajo (workspace_id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, activo_id)
  values (c_ws, 'Prev C', '', 'pendiente', 'media', v_tipo, 'preventiva', c_activo) returning id into v_a;
  update public.ordenes_trabajo set estado = 'en_curso' where id = v_a;
  update public.activo_estado_periodos set orden_id = null where activo_id = c_activo and fin is null;
  update public.ordenes_trabajo set estado = 'completado' where id = v_a;
  r3 := (select estado from public.activos where id = c_activo);

  raise exception 'RESULTADO 1) % || 2) % || 3) % || 4) %', r1, r2, r3, r4;
end $prueba$;
