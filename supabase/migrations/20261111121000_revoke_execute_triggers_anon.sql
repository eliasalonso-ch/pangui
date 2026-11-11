-- Cerrar funciones que PostgREST expone como /rest/v1/rpc/... sin necesidad.
--
-- 1) Funciones de trigger: nadie las llama por RPC. El permiso EXECUTE no se
--    revisa cuando el trigger dispara, así que quitarlo no afecta a los
--    triggers.
-- 2) Tres RPC que ya exigen auth.uid() adentro pero que `anon` podía invocar.
--
-- NO se tocan my_workspace_id / fn_mi_rol / fn_puede_ver /
-- solo_asignadas_para_mi: las políticas RLS las llaman también para `anon`
-- (devuelven NULL y no ve nada). Sin EXECUTE esas consultas pasarían de
-- "cero filas" a "permission denied".

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

revoke execute on function public.ajustar_stock_parte(uuid, numeric) from public, anon;
revoke execute on function public.deactivate_usuario(uuid) from public, anon;
revoke execute on function public.set_solo_asignadas(uuid, boolean) from public, anon;
grant execute on function public.ajustar_stock_parte(uuid, numeric) to authenticated, service_role;
grant execute on function public.deactivate_usuario(uuid) to authenticated, service_role;
grant execute on function public.set_solo_asignadas(uuid, boolean) to authenticated, service_role;
