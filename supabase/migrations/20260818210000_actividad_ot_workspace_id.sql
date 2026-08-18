-- Denormaliza workspace_id en actividad_ot para sacar la subconsulta de RLS.
--
-- POR QUE
-- -------
-- actividad_ot es la consulta mas cara de la app despues del overhead fijo de
-- PostgREST: 780 llamadas, 66,6 ms de media, 2.767 ms de maximo, ~12% del
-- tiempo total del rol `authenticated`. La segunda variante (comentarios por
-- lote) esta en 80 ms de media.
--
-- No es por falta de indices ni por volumen: la tabla tiene 7.106 filas y ya
-- existe idx_actividad_ot_orden_id. El costo esta en PLANIFICAR, porque las
-- cuatro politicas referencian otra tabla:
--
--     orden_id IN (SELECT id FROM ordenes_trabajo WHERE workspace_id = my_workspace_id())
--
-- Eso obliga al planificador a mirar ordenes_trabajo (656 filas, 26 indices en
-- su momento) en cada consulta a actividad_ot. Medido con EXPLAIN sobre una OT
-- concreta:
--
--     con la subconsulta      -> 563 buffers de planificacion,  3,98 ms
--     reescrito como EXISTS   -> 563 buffers,                  55,65 ms  (peor)
--     sin referencia cruzada  -> 185 buffers,                   0,62 ms
--
-- O sea: 3x menos buffers y 6x menos tiempo de planificacion. La variante
-- EXISTS se probo y NO sirve -- el plan es identico. Lo unico que funciona es
-- que la politica compare una columna propia.
--
-- QUE HACE
-- --------
-- 1. Agrega workspace_id (nullable, sin default) y lo llena desde la OT.
-- 2. Un trigger BEFORE INSERT lo completa solo, para que ningun cliente tenga
--    que mandarlo. Web y mobile siguen insertando igual que hoy.
-- 3. Reemplaza las cuatro politicas por la version que compara la columna.
--
-- COMPATIBILIDAD
-- --------------
-- - Aditivo: no se borra ni se renombra nada. La columna queda nullable a
--   proposito (nada de NOT NULL, per ENGINEERING_STANDARDS).
-- - Las builds viejas de mobile siguen funcionando: el trigger llena la
--   columna aunque el cliente no la mande.
-- - La politica tolera workspace_id NULL cayendo de vuelta a la subconsulta,
--   para que una fila que se cuele sin el valor no se vuelva invisible.
-- - 7.106 filas, 0 huerfanas, 1,8 MB: el backfill es instantaneo.
--
-- OJO: esto es DDL. PostgREST recarga su cache de esquema y devuelve 503
-- durante unos segundos. Correr fuera de horario.

-- 1. Columna -----------------------------------------------------------------

ALTER TABLE public.actividad_ot
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);

-- 2. Backfill ----------------------------------------------------------------

UPDATE public.actividad_ot a
SET workspace_id = o.workspace_id
FROM public.ordenes_trabajo o
WHERE o.id = a.orden_id
  AND a.workspace_id IS DISTINCT FROM o.workspace_id;

-- El indice que hace util la nueva politica. Compuesto con orden_id porque el
-- patron real de consulta es "actividad de esta OT", ya filtrada por workspace.
CREATE INDEX IF NOT EXISTS idx_actividad_ot_workspace_orden
  ON public.actividad_ot (workspace_id, orden_id, created_at DESC);

-- 3. Trigger -----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.actividad_ot_set_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo se completa si viene vacio: si un cliente nuevo ya lo manda, se
  -- respeta (la politica de INSERT igual valida que sea el suyo).
  IF NEW.workspace_id IS NULL THEN
    SELECT o.workspace_id INTO NEW.workspace_id
    FROM public.ordenes_trabajo o
    WHERE o.id = NEW.orden_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actividad_ot_set_workspace ON public.actividad_ot;
CREATE TRIGGER trg_actividad_ot_set_workspace
  BEFORE INSERT ON public.actividad_ot
  FOR EACH ROW EXECUTE FUNCTION public.actividad_ot_set_workspace();

-- 4. Politicas ---------------------------------------------------------------
-- Mismas reglas de negocio que antes; cambia solo COMO se evalua la
-- pertenencia al workspace. El OR con workspace_id IS NULL es la red de
-- seguridad: si por lo que sea una fila quedara sin el valor, se sigue
-- resolviendo por la OT en vez de desaparecer de la vista.

DROP POLICY IF EXISTS actividad_select ON public.actividad_ot;
CREATE POLICY actividad_select ON public.actividad_ot
  FOR SELECT USING (
    workspace_id = public.my_workspace_id()
    OR (workspace_id IS NULL AND orden_id IN (
      SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
    ))
  );

DROP POLICY IF EXISTS actividad_insert ON public.actividad_ot;
CREATE POLICY actividad_insert ON public.actividad_ot
  FOR INSERT WITH CHECK (
    -- En INSERT el trigger corre BEFORE, asi que workspace_id ya viene puesto.
    -- Se deja el fallback por si el trigger no encontro la OT.
    workspace_id = public.my_workspace_id()
    OR (workspace_id IS NULL AND orden_id IN (
      SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
    ))
  );

DROP POLICY IF EXISTS actividad_update_own ON public.actividad_ot;
CREATE POLICY actividad_update_own ON public.actividad_ot
  FOR UPDATE
  USING (
    tipo = 'comentario'
    AND usuario_id = (SELECT auth.uid())
    AND (
      workspace_id = public.my_workspace_id()
      OR (workspace_id IS NULL AND orden_id IN (
        SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
      ))
    )
  )
  WITH CHECK (
    tipo = 'comentario'
    AND usuario_id = (SELECT auth.uid())
    AND (
      workspace_id = public.my_workspace_id()
      OR (workspace_id IS NULL AND orden_id IN (
        SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
      ))
    )
  );

DROP POLICY IF EXISTS actividad_delete_own ON public.actividad_ot;
CREATE POLICY actividad_delete_own ON public.actividad_ot
  FOR DELETE USING (
    tipo = 'comentario'
    AND usuario_id = (SELECT auth.uid())
    AND (
      workspace_id = public.my_workspace_id()
      OR (workspace_id IS NULL AND orden_id IN (
        SELECT id FROM public.ordenes_trabajo WHERE workspace_id = public.my_workspace_id()
      ))
    )
  );
