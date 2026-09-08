-- ajustar_stock_parte: suma p_delta al stock de un material y devuelve el saldo.
--
-- OTDetail.tsx la llama en tres puntos (agregar material, cambiar cantidad,
-- quitar material) desde antes de esta migracion, pero la funcion nunca existio
-- en la base: cada uno de esos tres flujos terminaba con "Could not find the
-- function public.ajustar_stock_parte(p_delta, p_parte_id) in the schema cache"
-- y el stock quedaba sin ajustar aunque orden_partes SI se habia escrito.
--
-- El delta se aplica dentro del UPDATE (no leer-modificar-escribir en el
-- cliente) y la fila se toma con FOR UPDATE, que es lo que evita la lost update
-- cuando web y movil tocan el mismo material a la vez.
--
-- Sigue el patron de receive_material_stock: SECURITY DEFINER para poder tocar
-- partes.stock_actual, search_path fijo, y la pertenencia al workspace validada
-- a mano porque SECURITY DEFINER se salta las policies de RLS.

CREATE OR REPLACE FUNCTION public.ajustar_stock_parte(
  p_parte_id uuid,
  p_delta numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
  v_stock numeric;
BEGIN
  IF p_delta IS NULL OR p_delta = 0 THEN
    RAISE EXCEPTION 'El ajuste de stock debe ser distinto de cero';
  END IF;

  -- FOR UPDATE serializa los ajustes concurrentes sobre este material: el
  -- segundo llamador espera aqui y lee el stock ya modificado por el primero.
  SELECT p.workspace_id, p.stock_actual
    INTO v_workspace_id, v_stock
  FROM public.partes p
  WHERE p.id = p_parte_id AND p.activo = true
  FOR UPDATE;

  IF v_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Material no disponible';
  END IF;

  -- Un stock negativo no es un estado que la bodega pueda representar: si la OT
  -- pide mas de lo que hay, el consumo se rechaza entero y el usuario ve por
  -- que. Devolver material (delta positivo) nunca entra aqui.
  IF v_stock + p_delta < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente: hay % y se intentan consumir %',
      v_stock, abs(p_delta);
  END IF;

  UPDATE public.partes
  SET stock_actual = stock_actual + p_delta,
      updated_at = now()
  WHERE id = p_parte_id
  RETURNING stock_actual INTO v_stock;

  RETURN v_stock;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ajustar_stock_parte(uuid, numeric) TO authenticated;
