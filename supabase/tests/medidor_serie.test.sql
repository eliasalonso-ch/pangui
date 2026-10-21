-- Prueba de 20261021120000_medidor_serie.sql. Solo lectura, contra prod: toma el
-- medidor con más lecturas del último año y no inserta nada (una lectura nueva
-- dispararía fn_medidor_lectura_critica, que puede abrir OTs y notificar).
-- Termina en RAISE 'RESULTADO …' para que se lea el resultado de un vistazo.
-- Esperado: crudo=ok agregado=ok
-- Casos:
--   crudo:    con p_puntos >= lecturas, devuelve cada lectura (n = 1, con id).
--   agregado: con p_puntos chico, a lo más p_puntos tramos (el tope inferior es
--             10), la suma de n es el total, mín <= promedio <= máx, sin id.
do $prueba$
declare
  v_medidor uuid := (
    select medidor_id from public.medidor_lecturas
    where ts > now() - interval '365 days'
    group by medidor_id order by count(*) desc limit 1);
  v_desde timestamptz := now() - interval '365 days';
  v_hasta timestamptz := now();
  v_total int := (select count(*) from public.medidor_lecturas
                  where medidor_id = v_medidor and ts between v_desde and v_hasta);
  r_crudo text; r_agr text;
begin
  if v_total < 11 then
    raise exception 'RESULTADO sin datos suficientes (% lecturas): no se puede probar el agregado', v_total;
  end if;

  r_crudo := (select case when count(*) = v_total and bool_and(n = 1 and id is not null and valor_min = valor and valor_max = valor)
                          then 'ok' else 'MAL filas=' || count(*) || '/' || v_total end
              from public.medidor_serie(v_medidor, v_desde, v_hasta, v_total));

  r_agr := (select case when count(*) <= 10 and sum(n) = v_total and bool_and(valor_min <= valor and valor <= valor_max and id is null) and bool_or(n > 1)
                        then 'ok' else 'MAL tramos=' || count(*) || ' suma_n=' || sum(n) || '/' || v_total end
            from public.medidor_serie(v_medidor, v_desde, v_hasta, 10));

  raise exception 'RESULTADO crudo=% agregado=%', r_crudo, r_agr;
end
$prueba$;
