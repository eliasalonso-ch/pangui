-- Quien creo y quien actualizo por ultima vez cada material.
--
-- La ficha del material muestra el pie "Creado por / Ultima actualizacion" con
-- el avatar del usuario, igual que la ficha de OT. Hasta ahora `partes` solo
-- guardaba created_at/updated_at: habia CUANDO pero no QUIEN, asi que no habia
-- a quien preguntarle por un cambio de stock o de precio.
--
-- ON DELETE SET NULL y no CASCADE: dar de baja a un usuario no puede llevarse
-- por delante el material. La fila queda sin autor, que es la verdad -- el
-- material sigue existiendo.
ALTER TABLE public.partes
  ADD COLUMN IF NOT EXISTS creado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- Las filas que ya existian se quedan en NULL a proposito: nunca se registro
-- quien las creo, y rellenarlas con cualquier usuario (el owner del workspace,
-- por ejemplo) seria inventar un dato de auditoria. La ficha simplemente no
-- muestra autor hasta que alguien la edite.

CREATE INDEX IF NOT EXISTS partes_creado_por_idx
  ON public.partes (creado_por);

-- `actualizado_por` se sella en el trigger y no desde el cliente, por la misma
-- razon por la que `updated_at` no se manda en el payload: un UPDATE que se
-- olvide del campo -- o que lo mande a mano con otro id -- dejaria el registro
-- mintiendo sobre quien toco la fila.
--
-- Solo toca el autor: `updated_at` ya lo sella trg_materiales_updated_at, y dos
-- triggers escribiendo la misma columna dejan el resultado a merced del orden
-- alfabetico entre ambos.
CREATE OR REPLACE FUNCTION public.fn_partes_sellar_actualizado_por()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.actualizado_por := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partes_sellar_actualizado_por ON public.partes;
CREATE TRIGGER partes_sellar_actualizado_por
  BEFORE UPDATE ON public.partes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_partes_sellar_actualizado_por();
