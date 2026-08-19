-- Saca la subconsulta a `usuarios` de la politica de UPDATE de ordenes_trabajo.
--
-- POR QUE
-- -------
-- El PATCH que cierra una OT es lo mas lento de la app: 1.142 ms de media y
-- hasta 3.242 ms (pg_stat_statements, muestra limpia del 2026-08-19).
--
-- Medido con EXPLAIN (ANALYZE) sobre un cierre forzado real:
--
--   Planning Time:   127,9 ms   <- 722 buffers
--   Execution Time:  111,4 ms
--   Los 7 triggers:   35,5 ms   <- NO son el problema
--
-- O sea: planificar cuesta mas que ejecutar, y los 14 triggers de la tabla
-- suman apenas 35 ms entre todos. El costo esta en la politica:
--
--   (SELECT usuarios.rol FROM usuarios WHERE usuarios.id = auth.uid() LIMIT 1)
--     = ANY (ARRAY['owner','admin','member'])
--
-- Esa subconsulta obliga al planificador a mirar `usuarios` en cada UPDATE.
-- Es el mismo patron que se corrigio ayer en actividad_ot, donde pasar la
-- referencia cruzada a una comparacion directa bajo la planificacion de 563 a
-- 207 buffers.
--
-- QUE HACE
-- --------
-- Agrega my_rol(), gemela de las que ya existen (my_workspace_id,
-- solo_asignadas_para_mi): SQL, STABLE, SECURITY DEFINER. Al ser STABLE,
-- Postgres la evalua una vez por sentencia en vez de replanificar la
-- subconsulta.
--
-- Solo se reescribe ordenes_update. Hay 30 politicas con el mismo patron, pero
-- esta es la unica medida; el resto se evalua despues con datos propios en vez
-- de cambiarlas a ciegas.
--
-- EXPECTATIVA HONESTA
-- -------------------
-- Ataca ~128 ms de los 1.142 ms. El resto es el viaje Chile -> us-east-1
-- (~400 ms, preflight CORS incluido) y la instancia Nano bajo carga, que
-- explica los picos de 3 s. Mejora, no vuelve instantaneo el cierre.
--
-- SEGURIDAD: la regla no cambia. Sigue siendo "mismo workspace Y rol en
-- (owner, admin, member)"; cambia como se obtiene el rol, no que se exige.
--
-- OJO: es DDL. PostgREST recarga su cache de esquema y devuelve 503 unos
-- segundos. Correr fuera de horario.

CREATE OR REPLACE FUNCTION public.my_rol()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT rol FROM public.usuarios WHERE id = (SELECT auth.uid()) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_rol() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_rol() TO authenticated, service_role;

DROP POLICY IF EXISTS ordenes_update ON public.ordenes_trabajo;
CREATE POLICY ordenes_update ON public.ordenes_trabajo
  FOR UPDATE USING (
    workspace_id = public.my_workspace_id()
    AND public.my_rol() = ANY (ARRAY['owner', 'admin', 'member'])
  );
