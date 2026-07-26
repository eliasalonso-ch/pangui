CREATE TABLE IF NOT EXISTS public.material_withdrawal_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 withdrawal_id uuid NOT NULL REFERENCES public.material_withdrawals(id) ON DELETE RESTRICT, parte_id uuid NOT NULL REFERENCES public.partes(id) ON DELETE RESTRICT,
 ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones(id) ON DELETE RESTRICT, lugar_id uuid REFERENCES public.lugares(id) ON DELETE SET NULL,
 cantidad numeric(10,2) NOT NULL CHECK(cantidad>0), devuelto_por uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(), devuelto_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS material_withdrawal_returns_location_idx ON public.material_withdrawal_returns(ubicacion_id,devuelto_at DESC);
ALTER TABLE public.material_withdrawal_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace members can read material withdrawal returns" ON public.material_withdrawal_returns;
CREATE POLICY "workspace members can read material withdrawal returns" ON public.material_withdrawal_returns FOR SELECT USING(EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.workspace_id=material_withdrawal_returns.workspace_id));
CREATE OR REPLACE FUNCTION public.return_material_withdrawal(p_withdrawal_id uuid,p_cantidad numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.material_withdrawals%ROWTYPE; BEGIN
 IF p_cantidad<=0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
 SELECT * INTO w FROM public.material_withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
 IF w.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.workspace_id=w.workspace_id) THEN RAISE EXCEPTION 'Retiro no disponible'; END IF;
 IF p_cantidad>w.cantidad-w.cantidad_devuelta THEN RAISE EXCEPTION 'La cantidad supera lo pendiente de devolución'; END IF;
 UPDATE public.partes SET stock_actual=stock_actual+p_cantidad WHERE id=w.parte_id;
 UPDATE public.material_withdrawals SET cantidad_devuelta=cantidad_devuelta+p_cantidad,ultima_devolucion_at=now() WHERE id=p_withdrawal_id;
 INSERT INTO public.material_withdrawal_returns(workspace_id,withdrawal_id,parte_id,ubicacion_id,lugar_id,cantidad) VALUES(w.workspace_id,w.id,w.parte_id,w.ubicacion_id,w.lugar_id,p_cantidad);
END; $$;
REVOKE ALL ON FUNCTION public.return_material_withdrawal(uuid,numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.return_material_withdrawal(uuid,numeric) TO authenticated;
