-- categorias_ocultas: evalua auth.uid() una sola vez por consulta.
--
-- La politica usaba `usuarios.id = auth.uid()` sin envolver, asi que el planner
-- la re-evaluaba fila por fila en vez de subirla a un InitPlan. Es el unico
-- auth_rls_initplan que reporta el linter de Supabase; el resto de las politicas
-- ya usa `(select auth.uid())`.
--
-- La tabla esta vacia hoy, asi que no cambia nada medible: es para que no
-- degrade cuando se empiece a usar, y para dejar la convencion pareja.

alter policy "categorias_ocultas_por_workspace" on public.categorias_ocultas
  using (
    workspace_id in (
      select usuarios.workspace_id from usuarios
      where usuarios.id = (select auth.uid())
    )
  )
  with check (
    workspace_id in (
      select usuarios.workspace_id from usuarios
      where usuarios.id = (select auth.uid())
    )
  );
