CREATE TABLE IF NOT EXISTS public.material_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parte_id uuid NOT NULL REFERENCES public.partes(id) ON DELETE RESTRICT, ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones(id) ON DELETE RESTRICT,
  lugar_id uuid REFERENCES public.lugares(id) ON DELETE SET NULL, cantidad numeric(10,2) NOT NULL CHECK(cantidad>0),
  cantidad_devuelta numeric(10,2) NOT NULL DEFAULT 0 CHECK(cantidad_devuelta>=0 AND cantidad_devuelta<=cantidad),
  retirado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(), retirado_at timestamptz NOT NULL DEFAULT now(), ultima_devolucion_at timestamptz
);
CREATE INDEX IF NOT EXISTS material_withdrawals_workspace_idx ON public.material_withdrawals(workspace_id);
CREATE INDEX IF NOT EXISTS material_withdrawals_location_idx ON public.material_withdrawals(ubicacion_id, retirado_at DESC);
ALTER TABLE public.material_withdrawals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace members can read material withdrawals" ON public.material_withdrawals;
CREATE POLICY "workspace members can read material withdrawals" ON public.material_withdrawals FOR SELECT USING(EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.workspace_id=material_withdrawals.workspace_id));

CREATE OR REPLACE FUNCTION public.consume_material_reservation(p_reservation_id uuid,p_cantidad numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.material_reservations%ROWTYPE; wid uuid;
BEGIN
 IF p_cantidad<=0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
 SELECT * INTO r FROM public.material_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF r.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.workspace_id=r.workspace_id) THEN RAISE EXCEPTION 'Reserva no disponible'; END IF;
 IF p_cantidad>r.cantidad THEN RAISE EXCEPTION 'La cantidad supera lo reservado'; END IF;
 INSERT INTO public.material_withdrawals(workspace_id,parte_id,ubicacion_id,lugar_id,cantidad) VALUES(r.workspace_id,r.parte_id,r.ubicacion_id,r.lugar_id,p_cantidad) RETURNING id INTO wid;
 IF p_cantidad=r.cantidad THEN DELETE FROM public.material_reservations WHERE id=p_reservation_id; ELSE UPDATE public.material_reservations SET cantidad=cantidad-p_cantidad,updated_at=now() WHERE id=p_reservation_id; END IF;
 RETURN wid;
END; $$;

CREATE OR REPLACE FUNCTION public.return_material_withdrawal(p_withdrawal_id uuid,p_cantidad numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.material_withdrawals%ROWTYPE;
BEGIN
 IF p_cantidad<=0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
 SELECT * INTO w FROM public.material_withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
 IF w.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.workspace_id=w.workspace_id) THEN RAISE EXCEPTION 'Retiro no disponible'; END IF;
 IF p_cantidad>w.cantidad-w.cantidad_devuelta THEN RAISE EXCEPTION 'La cantidad supera lo pendiente de devolución'; END IF;
 UPDATE public.partes SET stock_actual=stock_actual+p_cantidad WHERE id=w.parte_id;
 UPDATE public.material_withdrawals SET cantidad_devuelta=cantidad_devuelta+p_cantidad,ultima_devolucion_at=now() WHERE id=p_withdrawal_id;
END; $$;
REVOKE ALL ON FUNCTION public.consume_material_reservation(uuid,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.return_material_withdrawal(uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_material_reservation(uuid,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_material_withdrawal(uuid,numeric) TO authenticated;
