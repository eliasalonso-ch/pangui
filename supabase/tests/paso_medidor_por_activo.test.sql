-- Prueba de 20261104120000_paso_medidor_por_activo.sql. Contra prod, sin dejar
-- rastro: todo lo que inserta se deshace con el RAISE final (los medidores de
-- prueba no tienen umbral, así que no abren OTs).
-- Esperado: par=ok sin_par=ok
-- Casos:
--   par:     paso con molde en el activo A, OT del activo B que tiene un medidor
--            con el mismo nombre → la lectura cae en el medidor de B.
--   sin_par: molde sin medidor homónimo en B → no se registra lectura.
do $prueba$
declare
  v_orden  uuid;
  v_act_b  uuid;
  v_ws     uuid;
  v_act_a  uuid;
  m_a1 uuid; m_a2 uuid; m_b1 uuid;
  v_proc uuid; v_paso1 uuid; v_paso2 uuid; v_ejec uuid;
  r_par text; r_sin text;
begin
  select o.id, o.activo_id, o.workspace_id into v_orden, v_act_b, v_ws
    from public.ordenes_trabajo o where o.activo_id is not null
   order by o.created_at desc limit 1;
  select a.id into v_act_a from public.activos a
   where a.workspace_id = v_ws and a.id <> v_act_b limit 1;

  insert into public.medidores (workspace_id, nombre, unidad, activo_id)
    values (v_ws, 'Prueba Molde', 'V', v_act_a) returning id into m_a1;
  insert into public.medidores (workspace_id, nombre, unidad, activo_id)
    values (v_ws, 'Prueba Sin Par', 'V', v_act_a) returning id into m_a2;
  insert into public.medidores (workspace_id, nombre, unidad, activo_id)
    values (v_ws, ' prueba molde ', 'V', v_act_b) returning id into m_b1;

  insert into public.procedimientos (workspace_id, nombre) values (v_ws, 'Prueba paso medidor') returning id into v_proc;
  insert into public.procedimiento_pasos (procedimiento_id, orden, tipo, titulo, medidor_id)
    values (v_proc, 1, 'medidor', 'p1', m_a1) returning id into v_paso1;
  insert into public.procedimiento_pasos (procedimiento_id, orden, tipo, titulo, medidor_id)
    values (v_proc, 2, 'medidor', 'p2', m_a2) returning id into v_paso2;
  insert into public.procedimiento_ejecuciones (procedimiento_id, orden_id)
    values (v_proc, v_orden) returning id into v_ejec;

  insert into public.paso_respuestas (ejecucion_id, paso_id, valor_medido) values (v_ejec, v_paso1, 7);
  insert into public.paso_respuestas (ejecucion_id, paso_id, valor_medido) values (v_ejec, v_paso2, 8);

  r_par := case when (select count(*) from public.medidor_lecturas where medidor_id = m_b1 and valor = 7) = 1
                 and (select count(*) from public.medidor_lecturas where medidor_id = m_a1) = 0
                then 'ok' else 'MAL' end;
  r_sin := case when (select count(*) from public.medidor_lecturas where medidor_id in (m_a2, m_b1) and valor = 8) = 0
                then 'ok' else 'MAL' end;

  raise exception 'RESULTADO par=% sin_par=%', r_par, r_sin;
end
$prueba$;
