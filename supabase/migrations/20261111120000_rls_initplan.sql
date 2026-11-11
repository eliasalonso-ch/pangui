-- RLS: evaluar los helpers una vez por consulta y no una vez por fila.
--
-- `workspace_id = my_workspace_id()` llama a la función por cada fila (es
-- SECURITY DEFINER, Postgres no la puede inlinear) y además impide usar el
-- índice de workspace_id. Envuelta en `(SELECT ...)` pasa a ser un InitPlan:
-- se calcula una vez y el resultado se compara como constante.
--
-- Medido en prod el 2026-11-11 con el owner de Electrilam:
--   count(*) en actividad_ot (14k filas)   433 ms  (sin envolver, seq scan)
--   count(*) en ordenes_trabajo             3,6 ms  (ya envuelta, usa índice)
--
-- Las funciones son STABLE y no dependen de la fila, así que el resultado es
-- idéntico. Verificado en una transacción con rollback: 16 usuarios (uno por
-- cada workspace/rol/solo_asignadas) x 112 tablas, 0 diferencias en filas
-- visibles; tiempo total 6.983 ms -> 1.940 ms.
--
-- Se reescribe desde el catálogo y no a mano: son 185 políticas en 67 tablas.
-- Idempotente: el lookbehind salta las llamadas que ya están envueltas.

-- ALTER POLICY toma un lock exclusivo breve por tabla. Si alguna está ocupada,
-- mejor fallar entero y reintentar que dejar consultas en cola detrás.
set lock_timeout = '3s';

do $$
declare
  r record;
begin
  for r in
    select policyname, tablename, qual, with_check,
      regexp_replace(regexp_replace(regexp_replace(qual,
        '(?<!SELECT )\m(my_workspace_id|my_rol|fn_mi_rol|solo_asignadas_para_mi)\(\)', '(SELECT public.\1())', 'g'),
        '(?<!SELECT )\mauth\.(uid|role|jwt)\(\)', '(SELECT auth.\1())', 'g'),
        '(?<!SELECT )\mfn_puede_ver\((''[a-z_]+''::text)\)', '(SELECT public.fn_puede_ver(\1))', 'g') as nq,
      regexp_replace(regexp_replace(regexp_replace(with_check,
        '(?<!SELECT )\m(my_workspace_id|my_rol|fn_mi_rol|solo_asignadas_para_mi)\(\)', '(SELECT public.\1())', 'g'),
        '(?<!SELECT )\mauth\.(uid|role|jwt)\(\)', '(SELECT auth.\1())', 'g'),
        '(?<!SELECT )\mfn_puede_ver\((''[a-z_]+''::text)\)', '(SELECT public.fn_puede_ver(\1))', 'g') as nw
    from pg_policies
    where schemaname = 'public'
  loop
    if r.nq is distinct from r.qual or r.nw is distinct from r.with_check then
      execute format('ALTER POLICY %I ON public.%I%s%s', r.policyname, r.tablename,
        case when r.qual is not null then ' USING (' || r.nq || ')' else '' end,
        case when r.with_check is not null then ' WITH CHECK (' || r.nw || ')' else '' end);
    end if;
  end loop;
end $$;
