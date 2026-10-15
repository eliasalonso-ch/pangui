-- Materiales de OT: el stock se mueve en UN solo lugar (este trigger) y las
-- reservas de una ubicación se pueden usar directo en una OT.
--
-- Antes la web descontaba al agregar el material y el móvil al completar la OT:
-- agregar en web y completar en móvil descontaba dos veces, y borrar en web algo
-- agregado en móvil devolvía stock que nunca salió. Ahora los clientes solo
-- escriben orden_partes y nunca tocan partes.stock_actual:
--
--   * Fila de bodega (withdrawal_id NULL): descuenta al completarse la OT lo
--     usado (cantidad_utilizada, o cantidad si nadie la ajustó). Reabrir la OT o
--     quitar la fila lo devuelve. stock_descontado guarda cuánto lleva
--     descontado la fila, así cada cambio aplica solo la diferencia.
--   * Fila de reserva (withdrawal_id): nace de usar_reserva_en_orden, que ya
--     retiró las unidades de la reserva (material_withdrawals). Bajar la
--     cantidad o quitar la fila las devuelve a bodega, igual que cualquier
--     devolución de retiro.

ALTER TABLE public.orden_partes
  ADD COLUMN IF NOT EXISTS stock_descontado numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS withdrawal_id uuid UNIQUE
    REFERENCES public.material_withdrawals(id) ON DELETE RESTRICT;

-- Un material puede venir de bodega y además de una o más reservas en la misma OT.
ALTER TABLE public.orden_partes DROP CONSTRAINT IF EXISTS orden_partes_orden_id_parte_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS orden_partes_bodega_unique
  ON public.orden_partes (orden_id, parte_id) WHERE withdrawal_id IS NULL;
CREATE INDEX IF NOT EXISTS orden_partes_orden_id_idx ON public.orden_partes (orden_id);

-- OTs ya completadas: el cliente viejo ya descontó lo usado. Va antes del
-- trigger para no descontarlo de nuevo.
UPDATE public.orden_partes op
SET stock_descontado = COALESCE(op.cantidad_utilizada, op.cantidad)
FROM public.ordenes_trabajo o
WHERE o.id = op.orden_id AND o.estado = 'completado';

CREATE OR REPLACE FUNCTION public.orden_partes_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_id uuid;
  v_withdrawal_id uuid;
  v_estado text;
  v_workspace_id uuid;
  v_objetivo numeric;
  v_devolver numeric := 0;
  w public.material_withdrawals%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_orden_id := OLD.orden_id;
    v_withdrawal_id := OLD.withdrawal_id;
  ELSE
    v_orden_id := NEW.orden_id;
    v_withdrawal_id := NEW.withdrawal_id;
  END IF;

  SELECT o.estado, o.workspace_id INTO v_estado, v_workspace_id
  FROM public.ordenes_trabajo o WHERE o.id = v_orden_id;

  IF TG_OP = 'DELETE' THEN
    -- OT borrada (llega en cascada, la OT ya no está): lo descontado o
    -- retirado se da por usado y no vuelve.
    IF v_workspace_id IS NULL THEN RETURN OLD; END IF;
    IF OLD.withdrawal_id IS NULL THEN
      IF OLD.stock_descontado <> 0 THEN
        UPDATE public.partes SET stock_actual = stock_actual + OLD.stock_descontado
        WHERE id = OLD.parte_id;
      END IF;
    ELSE
      v_devolver := OLD.cantidad;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.partes p WHERE p.id = NEW.parte_id AND p.workspace_id = v_workspace_id
    ) THEN
      RAISE EXCEPTION 'Material no disponible';
    END IF;
    IF TG_OP = 'UPDATE' AND (NEW.orden_id, NEW.parte_id, NEW.withdrawal_id)
       IS DISTINCT FROM (OLD.orden_id, OLD.parte_id, OLD.withdrawal_id) THEN
      RAISE EXCEPTION 'No se puede cambiar el material ni la OT de una fila';
    END IF;

    IF NEW.withdrawal_id IS NULL THEN
      v_objetivo := CASE WHEN v_estado = 'completado'
                         THEN COALESCE(NEW.cantidad_utilizada, NEW.cantidad) ELSE 0 END;
      -- Sin piso en cero: si se usó más de lo que decía el sistema, el stock
      -- negativo muestra que el conteo está mal en vez de esconderlo.
      IF v_objetivo <> (CASE WHEN TG_OP = 'UPDATE' THEN OLD.stock_descontado ELSE 0 END) THEN
        UPDATE public.partes
        SET stock_actual = stock_actual
          - (v_objetivo - CASE WHEN TG_OP = 'UPDATE' THEN OLD.stock_descontado ELSE 0 END)
        WHERE id = NEW.parte_id;
      END IF;
      NEW.stock_descontado := v_objetivo;
    ELSE
      NEW.stock_descontado := 0;
      IF TG_OP = 'INSERT' THEN
        IF current_setting('pangui.usar_reserva', true) IS DISTINCT FROM NEW.withdrawal_id::text THEN
          RAISE EXCEPTION 'Los materiales reservados se agregan con usar_reserva_en_orden';
        END IF;
      ELSIF NEW.cantidad > OLD.cantidad THEN
        RAISE EXCEPTION 'Para usar más, toma otra vez de la reserva';
      ELSE
        v_devolver := OLD.cantidad - NEW.cantidad;
      END IF;
    END IF;
  END IF;

  -- Devolución de un retiro a bodega (lo mismo que return_material_withdrawal,
  -- sin su chequeo de sesión: acá ya pasó el RLS de orden_partes).
  IF v_devolver > 0 THEN
    SELECT * INTO w FROM public.material_withdrawals WHERE id = v_withdrawal_id FOR UPDATE;
    UPDATE public.partes SET stock_actual = stock_actual + v_devolver WHERE id = w.parte_id;
    UPDATE public.material_withdrawals
    SET cantidad_devuelta = cantidad_devuelta + v_devolver, ultima_devolucion_at = now()
    WHERE id = w.id;
    INSERT INTO public.material_withdrawal_returns (workspace_id, withdrawal_id, parte_id, ubicacion_id, lugar_id, cantidad)
    VALUES (w.workspace_id, w.id, w.parte_id, w.ubicacion_id, w.lugar_id, v_devolver);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_partes_stock ON public.orden_partes;
CREATE TRIGGER trg_orden_partes_stock
  BEFORE INSERT OR UPDATE OR DELETE ON public.orden_partes
  FOR EACH ROW EXECUTE FUNCTION public.orden_partes_stock();

-- Completar o reabrir la OT recalcula sus filas de bodega: el toque vacío
-- dispara trg_orden_partes_stock, que descuenta o devuelve la diferencia.
CREATE OR REPLACE FUNCTION public.orden_partes_stock_por_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orden_partes SET stock_descontado = stock_descontado
  WHERE orden_id = NEW.id AND withdrawal_id IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orden_partes_stock_por_estado ON public.ordenes_trabajo;
CREATE TRIGGER trg_orden_partes_stock_por_estado
  AFTER UPDATE OF estado ON public.ordenes_trabajo
  FOR EACH ROW
  WHEN ((OLD.estado = 'completado') IS DISTINCT FROM (NEW.estado = 'completado'))
  EXECUTE FUNCTION public.orden_partes_stock_por_estado();

-- Usar material reservado en una OT: lo retira de la reserva (queda en el
-- historial de la ubicación como cualquier retiro) y lo deja en la OT.
CREATE OR REPLACE FUNCTION public.usar_reserva_en_orden(
  p_orden_id uuid, p_reservation_id uuid, p_cantidad numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.material_reservations%ROWTYPE;
  v_withdrawal_id uuid;
  v_id uuid;
BEGIN
  SELECT * INTO r FROM public.material_reservations WHERE id = p_reservation_id;
  IF r.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ordenes_trabajo o
    JOIN public.usuarios u ON u.workspace_id = o.workspace_id
    WHERE o.id = p_orden_id AND u.id = auth.uid() AND o.workspace_id = r.workspace_id
  ) THEN
    RAISE EXCEPTION 'Reserva no disponible';
  END IF;

  v_withdrawal_id := public.consume_material_reservation(p_reservation_id, p_cantidad);
  PERFORM set_config('pangui.usar_reserva', v_withdrawal_id::text, true);
  INSERT INTO public.orden_partes (orden_id, parte_id, cantidad, withdrawal_id)
  VALUES (p_orden_id, r.parte_id, p_cantidad, v_withdrawal_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.orden_partes_stock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orden_partes_stock_por_estado() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.usar_reserva_en_orden(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usar_reserva_en_orden(uuid, uuid, numeric) TO authenticated;
