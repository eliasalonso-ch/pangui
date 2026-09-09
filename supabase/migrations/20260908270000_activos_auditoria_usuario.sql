-- Quien creo, quien actualizo y cuando, para cada activo.
--
-- La ficha del activo va a mostrar el pie "Creado / Ultima actualizacion" con
-- el avatar del usuario, igual que la ficha de material y la de OT. Hasta ahora
-- `activos` solo tenia `created_at`: habia CUANDO se creo, pero ni quien lo
-- hizo ni cuando se toco por ultima vez — asi que ante un cambio de ubicacion o
-- de estado no habia a quien preguntarle.
--
-- Mismo criterio que 20260908230000_partes_auditoria_usuario.sql.
--
-- ON DELETE SET NULL y no CASCADE: dar de baja a un usuario no puede llevarse
-- por delante el activo. La fila queda sin autor, que es la verdad -- el equipo
-- sigue existiendo.
ALTER TABLE public.activos
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Las filas que ya existian se quedan en NULL a proposito: nunca se registro
-- quien las creo, y rellenarlas con cualquier usuario (el owner del workspace,
-- por ejemplo) seria inventar un dato de auditoria. La ficha simplemente no
-- muestra autor hasta que alguien la edite.

CREATE INDEX IF NOT EXISTS activos_creado_por_idx
  ON public.activos (creado_por);

-- `actualizado_por` y `updated_at` se sellan en el trigger y no desde el
-- cliente: un UPDATE que se olvide del campo -- o que lo mande a mano con otro
-- id -- dejaria el registro mintiendo sobre quien toco la fila.
--
-- A diferencia de `partes`, aca el mismo trigger escribe las dos columnas
-- porque `activos` no tenia trigger de updated_at: no hay dos triggers
-- disputandose la misma columna.
CREATE OR REPLACE FUNCTION public.fn_activos_sellar_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.actualizado_por := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activos_sellar_auditoria ON public.activos;
CREATE TRIGGER activos_sellar_auditoria
  BEFORE UPDATE ON public.activos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_activos_sellar_auditoria();

-- `updated_at` arranca igual a `created_at` en las filas que ya existian: un
-- activo que nadie edito tiene como ultimo cambio su propia creacion, y eso es
-- cierto. Sin esto el pie "Ultima actualizacion" no se dibujaba en NINGUN
-- activo hasta que alguien lo editara, que es peor que mostrar la fecha real.
-- El autor se queda en NULL a proposito: nunca se registro quien fue.
--
-- OJO: el UPDATE dispara el trigger de arriba, que sellaria `updated_at = now()`
-- y `actualizado_por = auth.uid()` (NULL fuera de una sesion de usuario) en
-- TODAS las filas -- justo lo contrario de lo que se busca. Por eso se
-- desactiva mientras dura el relleno.
ALTER TABLE public.activos DISABLE TRIGGER activos_sellar_auditoria;
UPDATE public.activos SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE public.activos ENABLE TRIGGER activos_sellar_auditoria;
