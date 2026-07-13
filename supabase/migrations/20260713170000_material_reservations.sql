-- Shared mobile/web reserved inventory model. Reserving stock transfers units
-- out of partes.stock_actual; releasing a reservation returns them atomically.
CREATE TABLE IF NOT EXISTS public.material_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parte_id uuid NOT NULL REFERENCES public.partes(id) ON DELETE CASCADE,
  ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones(id) ON DELETE CASCADE,
  lugar_id uuid REFERENCES public.lugares(id) ON DELETE CASCADE,
  cantidad numeric(10, 2) NOT NULL CHECK (cantidad > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS material_reservations_location_unique
  ON public.material_reservations (parte_id, ubicacion_id) WHERE lugar_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS material_reservations_place_unique
  ON public.material_reservations (parte_id, ubicacion_id, lugar_id) WHERE lugar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS material_reservations_workspace_idx ON public.material_reservations (workspace_id);
CREATE INDEX IF NOT EXISTS material_reservations_ubicacion_idx ON public.material_reservations (ubicacion_id);

ALTER TABLE public.material_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace members can read material reservations" ON public.material_reservations;
CREATE POLICY "workspace members can read material reservations"
  ON public.material_reservations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = material_reservations.workspace_id
  ));

CREATE OR REPLACE FUNCTION public.reserve_material(
  p_parte_id uuid, p_ubicacion_id uuid, p_lugar_id uuid, p_cantidad numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_workspace_id uuid;
BEGIN
  IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
  SELECT p.workspace_id INTO v_workspace_id FROM public.partes p
  WHERE p.id = p_parte_id AND p.activo = true;
  IF v_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid() AND u.workspace_id = v_workspace_id
  ) THEN RAISE EXCEPTION 'Material no disponible'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ubicaciones u
    WHERE u.id = p_ubicacion_id AND u.workspace_id = v_workspace_id AND u.activa = true
  ) THEN RAISE EXCEPTION 'Ubicación no válida'; END IF;
  IF p_lugar_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lugares l WHERE l.id = p_lugar_id AND l.workspace_id = v_workspace_id
      AND l.ubicacion_id = p_ubicacion_id AND l.activo = true
  ) THEN RAISE EXCEPTION 'Lugar específico no válido'; END IF;

  UPDATE public.partes SET stock_actual = stock_actual - p_cantidad
  WHERE id = p_parte_id AND stock_actual >= p_cantidad;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stock disponible insuficiente'; END IF;

  IF p_lugar_id IS NULL THEN
    INSERT INTO public.material_reservations (workspace_id, parte_id, ubicacion_id, lugar_id, cantidad)
    VALUES (v_workspace_id, p_parte_id, p_ubicacion_id, NULL, p_cantidad)
    ON CONFLICT (parte_id, ubicacion_id) WHERE lugar_id IS NULL
    DO UPDATE SET cantidad = material_reservations.cantidad + EXCLUDED.cantidad, updated_at = now();
  ELSE
    INSERT INTO public.material_reservations (workspace_id, parte_id, ubicacion_id, lugar_id, cantidad)
    VALUES (v_workspace_id, p_parte_id, p_ubicacion_id, p_lugar_id, p_cantidad)
    ON CONFLICT (parte_id, ubicacion_id, lugar_id) WHERE lugar_id IS NOT NULL
    DO UPDATE SET cantidad = material_reservations.cantidad + EXCLUDED.cantidad, updated_at = now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_material_reservation(
  p_reservation_id uuid, p_cantidad numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_reservation public.material_reservations%ROWTYPE;
BEGIN
  IF p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
  SELECT * INTO v_reservation FROM public.material_reservations
  WHERE id = p_reservation_id FOR UPDATE;
  IF v_reservation.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = v_reservation.workspace_id
  ) THEN RAISE EXCEPTION 'Reserva no disponible'; END IF;
  IF p_cantidad > v_reservation.cantidad THEN RAISE EXCEPTION 'La cantidad supera lo reservado'; END IF;

  UPDATE public.partes SET stock_actual = stock_actual + p_cantidad
  WHERE id = v_reservation.parte_id;
  IF p_cantidad = v_reservation.cantidad THEN
    DELETE FROM public.material_reservations WHERE id = p_reservation_id;
  ELSE
    UPDATE public.material_reservations SET cantidad = cantidad - p_cantidad, updated_at = now()
    WHERE id = p_reservation_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_material(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_material_reservation(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_material(uuid, uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_material_reservation(uuid, numeric) TO authenticated;
