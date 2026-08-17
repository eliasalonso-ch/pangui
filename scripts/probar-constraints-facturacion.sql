-- Prueba funcional de las constraints de documentos_tributarios.
--
-- Correr en el SQL Editor DESPUÉS de verificar-migracion-facturacion.sql.
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja
-- ningún dato. Si alguna prueba no levanta la excepción esperada, la
-- constraint correspondiente no está protegiendo nada.

begin;

-- Se necesita un workspace real para la FK. Se toma cualquiera; nada se
-- persiste por el rollback final.
create temporary table _ws on commit drop as
  select id from workspaces limit 1;

do $$
declare
  v_ws uuid;
  v_ok boolean;
begin
  select id into v_ws from _ws;
  if v_ws is null then
    raise notice 'SIN WORKSPACES: no se puede probar. Salta este script.';
    return;
  end if;

  -- 1. Un documento que no cuadra debe ser rechazado.
  v_ok := false;
  begin
    insert into documentos_tributarios
      (workspace_id, periodo_inicio, periodo_fin, neto_clp, iva_clp, total_clp,
       usuarios_facturados, precio_unitario_clp)
    values
      (v_ws, '2099-01-01', '2099-01-31', 1000, 190, 9999,  -- 1000+190 != 9999
       1, 1190);
  exception when check_violation then
    v_ok := true;
  end;
  raise notice '1. rechaza neto+iva != total ......... %',
    case when v_ok then 'OK' else 'FALLA: aceptó un documento descuadrado' end;

  -- 2. Un documento que sí cuadra debe entrar.
  v_ok := false;
  begin
    insert into documentos_tributarios
      (workspace_id, subscription_id, periodo_inicio, periodo_fin,
       neto_clp, iva_clp, total_clp, usuarios_facturados, precio_unitario_clp)
    values
      (v_ws, null, '2099-01-01', '2099-01-31',
       8395, 1595, 9990, 1, 9990);  -- desglose real del plan Pro
    v_ok := true;
  exception when others then
    raise notice '   error inesperado: %', sqlerrm;
  end;
  raise notice '2. acepta un documento que cuadra .... %',
    case when v_ok then 'OK' else 'FALLA' end;

  -- 3. Un período invertido debe ser rechazado.
  v_ok := false;
  begin
    insert into documentos_tributarios
      (workspace_id, periodo_inicio, periodo_fin, neto_clp, iva_clp, total_clp,
       usuarios_facturados, precio_unitario_clp)
    values
      (v_ws, '2099-03-31', '2099-03-01', 8395, 1595, 9990, 1, 9990);
  exception when check_violation then
    v_ok := true;
  end;
  raise notice '3. rechaza período invertido ......... %',
    case when v_ok then 'OK' else 'FALLA' end;

  -- 4. Un tipo de DTE inválido debe ser rechazado.
  v_ok := false;
  begin
    insert into documentos_tributarios
      (workspace_id, tipo_dte, periodo_inicio, periodo_fin,
       neto_clp, iva_clp, total_clp, usuarios_facturados, precio_unitario_clp)
    values
      (v_ws, 99, '2099-04-01', '2099-04-30', 8395, 1595, 9990, 1, 9990);
  exception when check_violation then
    v_ok := true;
  end;
  raise notice '4. rechaza tipo_dte inválido ......... %',
    case when v_ok then 'OK' else 'FALLA' end;

  -- 5. Un tipo_receptor inválido en billing_profiles debe ser rechazado.
  v_ok := false;
  begin
    insert into billing_profiles (workspace_id, tipo_receptor)
    values (v_ws, 'marciano')
    on conflict (workspace_id) do update set tipo_receptor = 'marciano';
  exception when check_violation then
    v_ok := true;
  end;
  raise notice '5. rechaza tipo_receptor inválido .... %',
    case when v_ok then 'OK' else 'FALLA' end;

  -- 6. Dos eventos con la misma clave de idempotencia: el segundo debe fallar.
  v_ok := false;
  begin
    insert into subscription_events (workspace_id, event_type, flow_payload, idempotency_key)
    values (v_ws, 'test.dup', '{}'::jsonb, '__prueba_idempotencia__');
    insert into subscription_events (workspace_id, event_type, flow_payload, idempotency_key)
    values (v_ws, 'test.dup', '{}'::jsonb, '__prueba_idempotencia__');
  exception when unique_violation then
    v_ok := true;
  end;
  raise notice '6. rechaza evento duplicado .......... %',
    case when v_ok then 'OK' else 'FALLA: el webhook reprocesaría duplicados' end;

  -- 7. Varios eventos SIN clave deben poder coexistir (índice parcial).
  v_ok := false;
  begin
    insert into subscription_events (workspace_id, event_type, flow_payload, idempotency_key)
    values (v_ws, 'test.null', '{}'::jsonb, null);
    insert into subscription_events (workspace_id, event_type, flow_payload, idempotency_key)
    values (v_ws, 'test.null', '{}'::jsonb, null);
    v_ok := true;
  exception when others then
    raise notice '   error inesperado: %', sqlerrm;
  end;
  raise notice '7. permite varios sin clave .......... %',
    case when v_ok then 'OK' else 'FALLA: los eventos históricos romperían' end;
end $$;

-- Nada de lo anterior se guarda.
rollback;
