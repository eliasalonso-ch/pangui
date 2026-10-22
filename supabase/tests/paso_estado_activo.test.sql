-- Prueba de 20261022230000_paso_estado_activo.sql contra prod ("Ford F150", Alonso Technologies).
-- Solo-rollback: termina en RAISE 'RESULTADO …' a propósito, así no queda nada.
-- Esperado:
--   1) fuera_servicio/sin_planear motivo=true orden_id_null=true notas=true
--   2) fuera_servicio abiertos=1
--   3) sin_activo_ok
--   4) motivo_malo_ok
-- Casos:
--   1) responder "fuera_servicio" con motivo → el activo queda fuera de servicio,
--      período sin planear, con motivo, SIN orden_id (cuenta como cambio manual)
--   2) guardar una nota sobre la misma respuesta → no abre otro período
--   3) OT sin activo → la respuesta se guarda y no pasa nada
--   4) motivo_id mal formado → la respuesta se guarda igual (el error se traga)
-- Ojo: en una transacción now() no avanza, así que solo el caso 1 cambia el estado.
do $prueba$
declare
  c_ws constant uuid := '94be4366-36e3-4c19-810e-cefc799c533e';
  c_activo constant uuid := '75a6226a-7f78-4d14-bcd8-2b20fe191186';
  c_user constant uuid := '758af123-f5b1-4df5-aef4-c1f38f59ac83';
  v_tipo text := (select tipo from public.ordenes_trabajo where tipo is not null limit 1);
  v_motivo uuid := (select id from public.motivos_inactividad where workspace_id = c_ws and activo limit 1);
  v_proc uuid; v_paso uuid; v_ot uuid; v_ot2 uuid; v_ej uuid; v_ej2 uuid; v_resp uuid;
  r1 text; r2 text; r3 text; r4 text;
begin
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_user), true);

  insert into public.procedimientos (workspace_id, nombre) values (c_ws, 'Prueba estado') returning id into v_proc;
  insert into public.procedimiento_pasos (procedimiento_id, orden, tipo, titulo)
  values (v_proc, 1, 'estado_activo', 'Estado') returning id into v_paso;

  -- 1) Con activo.
  insert into public.ordenes_trabajo (workspace_id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, activo_id)
  values (c_ws, 'Prueba estado', '', 'en_curso', 'media', v_tipo, 'reactiva', c_activo) returning id into v_ot;
  insert into public.procedimiento_ejecuciones (procedimiento_id, orden_id, estado)
  values (v_proc, v_ot, 'en_curso') returning id into v_ej;
  insert into public.paso_respuestas (ejecucion_id, paso_id, respondido_por, valor_texto, valor_json)
  values (v_ej, v_paso, c_user, 'fuera_servicio', jsonb_build_object('motivo_id', v_motivo)) returning id into v_resp;
  r1 := (select estado from public.activos where id = c_activo)
     || '/' || (select tipo_inactividad
                || ' motivo=' || (motivo_id = v_motivo)::text
                || ' orden_id_null=' || (orden_id is null)::text
                || ' notas=' || (notas like 'Desde el procedimiento%')::text
                from public.activo_estado_periodos where activo_id = c_activo and fin is null);

  -- 2) Nota sobre la misma respuesta.
  update public.paso_respuestas set notas = 'otra cosa', valor_texto = 'fuera_servicio' where id = v_resp;
  r2 := (select estado from public.activos where id = c_activo)
     || ' abiertos=' || (select count(*) from public.activo_estado_periodos where activo_id = c_activo and fin is null);

  -- 3) OT sin activo.
  insert into public.ordenes_trabajo (workspace_id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo)
  values (c_ws, 'Prueba sin activo', '', 'en_curso', 'media', v_tipo, 'reactiva') returning id into v_ot2;
  insert into public.procedimiento_ejecuciones (procedimiento_id, orden_id, estado)
  values (v_proc, v_ot2, 'en_curso') returning id into v_ej2;
  insert into public.paso_respuestas (ejecucion_id, paso_id, respondido_por, valor_texto)
  values (v_ej2, v_paso, c_user, 'operativo');
  r3 := 'sin_activo_ok';

  -- 4) Motivo mal formado: el cast revienta dentro del bloque protegido.
  update public.paso_respuestas set valor_texto = 'mantencion', valor_json = '{"motivo_id":"nope"}' where id = v_resp;
  r4 := 'motivo_malo_ok';

  raise exception 'RESULTADO 1) % || 2) % || 3) % || 4) %', r1, r2, r3, r4;
end $prueba$;
