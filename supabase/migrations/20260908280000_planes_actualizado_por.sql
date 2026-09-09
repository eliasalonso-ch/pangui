-- Quien actualizo por ultima vez un plan de mantencion.
--
-- `planes_mantencion` ya tenia creado_por / created_at / updated_at: faltaba
-- QUIEN hizo el ultimo cambio, que es lo que muestra el pie "Ultima
-- actualizacion" de la ficha (mismo pie que material y activo).
--
-- ON DELETE SET NULL, como en partes y activos: dar de baja a un usuario no
-- puede llevarse por delante el plan.
ALTER TABLE public.planes_mantencion
  ADD COLUMN IF NOT EXISTS actualizado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- Se sella en el trigger y no desde el cliente: un UPDATE que se olvide del
-- campo dejaria el registro mintiendo sobre quien toco la fila.
CREATE OR REPLACE FUNCTION public.fn_planes_sellar_actualizado_por()
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

DROP TRIGGER IF EXISTS planes_sellar_actualizado_por ON public.planes_mantencion;
CREATE TRIGGER planes_sellar_actualizado_por
  BEFORE UPDATE ON public.planes_mantencion
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_planes_sellar_actualizado_por();
