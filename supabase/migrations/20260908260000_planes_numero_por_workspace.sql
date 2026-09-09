-- El numero de plan pasa de global a correlativo POR workspace, y deja de
-- reutilizar numeros de planes borrados.
--
-- Antes: una secuencia unica para toda la instalacion. El primer plan de un
-- workspace podia salir #7 porque otras empresas ya habian creado seis, lo que
-- no tiene sentido para quien lo lee — y ademas filtra cuantos planes existen
-- fuera de tu espacio.
--
-- POR QUE UNA TABLA CONTADOR Y NO `MAX(numero) + 1` (como ordenes_trabajo):
-- `deletePlan` borra la fila de verdad (DELETE, no baja logica). Con MAX+1, si
-- se borra el plan #3 y era el ultimo, el siguiente plan vuelve a ser #3: dos
-- planes distintos con el mismo numero en el historial, y cualquier referencia
-- escrita ("revisar el #3") pasa a apuntar a otra cosa. El contador guarda el
-- ultimo numero ENTREGADO, asi que los borrados siguen contando y un numero no
-- se repite nunca.

-- ── Contador por workspace ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.planes_numero_contador (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ultimo_numero integer NOT NULL DEFAULT 0
);

ALTER TABLE public.planes_numero_contador ENABLE ROW LEVEL SECURITY;

-- Solo lectura para el workspace propio: quien escribe es el trigger, que corre
-- como SECURITY DEFINER. Sin politica de INSERT/UPDATE nadie puede saltarse el
-- correlativo a mano.
DROP POLICY IF EXISTS planes_numero_contador_select ON public.planes_numero_contador;
CREATE POLICY planes_numero_contador_select ON public.planes_numero_contador
  FOR SELECT USING (workspace_id = my_workspace_id());

-- ── Renumerar lo que ya existe, por workspace y respetando el orden ──────────
WITH numerados AS (
  SELECT id,
         row_number() OVER (PARTITION BY workspace_id ORDER BY created_at, id) AS n
  FROM public.planes_mantencion
)
UPDATE public.planes_mantencion p
SET numero = numerados.n
FROM numerados
WHERE p.id = numerados.id;

-- El contador arranca en el maximo ya asignado de cada workspace.
INSERT INTO public.planes_numero_contador (workspace_id, ultimo_numero)
SELECT workspace_id, COALESCE(MAX(numero), 0)
FROM public.planes_mantencion
WHERE workspace_id IS NOT NULL
GROUP BY workspace_id
ON CONFLICT (workspace_id) DO UPDATE
  SET ultimo_numero = GREATEST(public.planes_numero_contador.ultimo_numero, EXCLUDED.ultimo_numero);

-- ── Fuera la secuencia global ────────────────────────────────────────────────
ALTER TABLE public.planes_mantencion ALTER COLUMN numero DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.planes_mantencion_numero_seq;

-- El indice unico global impedia que dos workspaces tuvieran su propio #1.
DROP INDEX IF EXISTS public.planes_mantencion_numero_idx;
CREATE UNIQUE INDEX IF NOT EXISTS planes_mantencion_numero_ws_idx
  ON public.planes_mantencion (workspace_id, numero);

-- ── Trigger que entrega el correlativo ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_assign_plan_numero()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Un numero explicito se respeta (sirve para migrar o restaurar).
  IF NEW.numero IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- INSERT ... ON CONFLICT DO UPDATE toma el lock de la fila del contador, asi
  -- que dos altas simultaneas del mismo workspace se serializan y no pueden
  -- llevarse el mismo numero.
  INSERT INTO public.planes_numero_contador AS c (workspace_id, ultimo_numero)
  VALUES (NEW.workspace_id, 1)
  ON CONFLICT (workspace_id) DO UPDATE
    SET ultimo_numero = c.ultimo_numero + 1
  RETURNING ultimo_numero INTO NEW.numero;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_plan_numero ON public.planes_mantencion;
CREATE TRIGGER trg_assign_plan_numero
  BEFORE INSERT ON public.planes_mantencion
  FOR EACH ROW EXECUTE FUNCTION public.fn_assign_plan_numero();
