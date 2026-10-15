-- El listado de OTs (fetchOrdenes, ~1000 filas en Electrilam) pasaba 43 ms
-- promedio en la BD y no por falta de índice: ya usa idx_ordenes_trabajo_active.
-- my_workspace_id() / solo_asignadas_para_mi() son SECURITY DEFINER, Postgres
-- no las inlinea y, dentro de un OR, las evaluaba UNA VEZ POR FILA (cada una
-- con su lookup a usuarios). Envueltas en (SELECT ...) se vuelven InitPlan y
-- corren una vez por query. Medido sobre el scan de órdenes: 18,5 ms → 1 ms.
-- Misma semántica: ambas son STABLE, devuelven lo mismo dentro del statement.
-- Solo las SELECT del camino del listado; el resto de policies queda igual.

ALTER POLICY ordenes_select ON public.ordenes_trabajo
  USING (
    workspace_id = (SELECT public.my_workspace_id())
    AND (
      NOT (SELECT public.solo_asignadas_para_mi())
      OR (SELECT auth.uid()) = ANY (COALESCE(asignados_ids, '{}'::uuid[]))
    )
  );

ALTER POLICY ubicaciones_select ON public.ubicaciones
  USING (workspace_id = (SELECT public.my_workspace_id()));

ALTER POLICY lugares_select ON public.lugares
  USING (
    workspace_id = (SELECT public.my_workspace_id())
    OR ubicacion_id IN (
      SELECT ubicaciones.id FROM public.ubicaciones
      WHERE ubicaciones.workspace_id = (SELECT public.my_workspace_id())
    )
  );

ALTER POLICY sociedades_select ON public.sociedades
  USING (workspace_id = (SELECT public.my_workspace_id()));

ALTER POLICY categorias_select ON public.categorias_ot
  USING (
    workspace_id = (SELECT public.my_workspace_id())
    OR (workspace_id IS NULL AND es_default = true)
  );

ALTER POLICY usuarios_select ON public.usuarios
  USING (
    workspace_id = (SELECT public.my_workspace_id())
    AND (activo = true OR id = (SELECT auth.uid()))
  );
