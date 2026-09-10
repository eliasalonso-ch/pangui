-- Costos flexibles del documento y recepcion transaccional.
--
-- DOS PROBLEMAS, UNA MIGRACION porque ambos tocan la misma OC.
--
-- 1. COSTOS: `otros_costos` era UN numero suelto. Un flete, un despacho y un
--    servicio exento caian todos en la misma bolsa sin nombre, y el proveedor
--    recibia un PDF que decia "OTROS $47.000" sin explicar de que. Ahora cada
--    costo es una fila con nombre propio, y puede expresarse como monto fijo o
--    como porcentaje del subtotal.
--
--    EL IVA NO ES UNA DE ESAS FILAS. Se calcula solo, 19%, por resta. La
--    referencia que se miro (MaintainX) permite escribir el IVA como una fila
--    libre, y en la prueba real alguien escribio "19" pensando 19% sobre
--    $66.099 y el documento sumo $19 en vez de $12.559: un IVA 660 veces menor
--    al que corresponde. En Chile ese documento no concilia contra la factura
--    del proveedor. Por eso la flexibilidad llega hasta los otros costos y no
--    toca el impuesto.
--
-- 2. RECEPCION: registrarRecepcion() corria en el NAVEGADOR haciendo N llamadas
--    a receive_material_stock + N updates de cantidad_recibida + 1 update de
--    estado, sin transaccion. Si se cortaba a la mitad el stock quedaba sumado
--    pero la OC no lo registraba, y reintentar sumaba el stock DE NUEVO. Aca
--    pasa a ser una sola funcion: o entra todo o no entra nada.

-- ── Costos con nombre ────────────────────────────────────────────────────────
-- jsonb y no tabla aparte: son 0-5 filas que solo se leen junto al documento y
-- nunca se consultan por separado. Mismo criterio que `adjuntos`.
--
-- Forma de cada fila:
--   { "nombre": "Flete", "valor": 15000, "tipo": "monto"|"porcentaje",
--     "afecto": true }
--
-- `otros_costos` SE MANTIENE con el total resuelto de estas filas: el PDF, el
-- cron y toda lectura existente siguen cuadrando sin tocarse. Las OC que ya
-- existen quedan con costos = [] y su otros_costos intacto; no hay backfill que
-- hacer porque un monto suelto sin nombre no se puede desglosar hacia atras.
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS costos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Lineas exentas de IVA (un servicio, un honorario). Sin esto habria que elegir
-- entre cobrarles IVA que no corresponde o sacarlas del documento.
ALTER TABLE public.ordenes_compra_lineas
  ADD COLUMN IF NOT EXISTS exenta boolean NOT NULL DEFAULT false;

-- ── Recibos ──────────────────────────────────────────────────────────────────
-- Cada entrega parcial deja una fila. Sin esto la OC solo sabe el acumulado
-- (cantidad_recibida por linea) y se pierde el "llegaron 10 el martes y 493 el
-- jueves", que es justo lo que se reclama cuando el proveedor factura distinto
-- a lo que despacho.
CREATE TABLE IF NOT EXISTS public.ordenes_compra_recepciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_compra_id uuid NOT NULL REFERENCES public.ordenes_compra(id) ON DELETE CASCADE,

  -- Correlativo POR OC: "Recibo #1", "#2". No es global.
  numero integer NOT NULL,

  nota text,

  -- Se guardan calculados, no se derivan al leer: son el resumen de lo que
  -- llego ESE dia, y las lineas siguen cambiando despues.
  unidades numeric NOT NULL DEFAULT 0,
  items integer NOT NULL DEFAULT 0,
  valor numeric NOT NULL DEFAULT 0,

  recibido_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ordenes_compra_recepciones_numero_unico UNIQUE (orden_compra_id, numero)
);

CREATE INDEX IF NOT EXISTS ordenes_compra_recepciones_oc_idx
  ON public.ordenes_compra_recepciones (orden_compra_id);

ALTER TABLE public.ordenes_compra_recepciones ENABLE ROW LEVEL SECURITY;

-- Se hereda del padre, igual que ordenes_compra_lineas: si puedes ver la OC,
-- ves sus recibos.
DROP POLICY IF EXISTS ordenes_compra_recepciones_select ON public.ordenes_compra_recepciones;
CREATE POLICY ordenes_compra_recepciones_select ON public.ordenes_compra_recepciones
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ordenes_compra oc
    JOIN public.usuarios u ON u.workspace_id = oc.workspace_id
    WHERE oc.id = orden_compra_id AND u.id = auth.uid()
  ));

-- Escribir es solo de la RPC (SECURITY DEFINER). No hay policy de INSERT para
-- nadie mas: un recibo suelto insertado a mano descuadraria el stock.

-- ── Recepcion transaccional ──────────────────────────────────────────────────
-- p_items: [{ "linea_id": uuid, "cantidad": numeric }, ...]
--
-- Reemplaza el bucle del cliente. Todo ocurre en una transaccion: stock, lineas,
-- recibo y estado. Si algo falla, no queda nada a medias.
CREATE OR REPLACE FUNCTION public.recibir_orden_compra(
  p_oc_id uuid,
  p_items jsonb,
  p_nota text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_workspace_id uuid;
  v_estado       text;
  v_proveedor_id uuid;
  v_item         jsonb;
  v_linea        record;
  v_cantidad     numeric;
  v_unidades     numeric := 0;
  v_items        integer := 0;
  v_valor        numeric := 0;
  v_numero       integer;
  v_recepcion_id uuid;
  v_completa     boolean;
BEGIN
  -- La fila de la OC se toma FOR UPDATE: dos recepciones simultaneas de la
  -- misma orden se serializan aca y la segunda ve las cantidades ya sumadas por
  -- la primera.
  SELECT oc.workspace_id, oc.estado, oc.proveedor_id
    INTO v_workspace_id, v_estado, v_proveedor_id
  FROM public.ordenes_compra oc
  WHERE oc.id = p_oc_id
  FOR UPDATE;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Orden de compra no encontrada';
  END IF;

  -- SECURITY DEFINER se salta RLS, asi que la pertenencia y el rol se validan a
  -- mano. Mismo patron que receive_material_stock.
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.workspace_id = v_workspace_id
      AND u.rol IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para recibir esta orden de compra';
  END IF;

  IF v_estado NOT IN ('enviada', 'recibida_parcial') THEN
    RAISE EXCEPTION 'Solo se puede recibir una orden enviada (estado actual: %)', v_estado;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay items que recibir';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_cantidad := (v_item->>'cantidad')::numeric;
    CONTINUE WHEN v_cantidad IS NULL OR v_cantidad <= 0;

    SELECT l.id, l.parte_id, l.cantidad, l.cantidad_recibida, l.precio_unitario, l.descripcion
      INTO v_linea
    FROM public.ordenes_compra_lineas l
    WHERE l.id = (v_item->>'linea_id')::uuid
      AND l.orden_compra_id = p_oc_id
    FOR UPDATE;

    IF v_linea.id IS NULL THEN
      RAISE EXCEPTION 'La linea % no pertenece a esta orden', v_item->>'linea_id';
    END IF;

    -- Nada impedia recibir 500 de una linea de 10. Un sobre-recibo infla el
    -- stock con mercaderia que nunca llego y despues nadie sabe de donde salio.
    IF v_linea.cantidad_recibida + v_cantidad > v_linea.cantidad THEN
      RAISE EXCEPTION 'No se puede recibir % de "%": quedan % pendientes',
        v_cantidad, v_linea.descripcion, v_linea.cantidad - v_linea.cantidad_recibida;
    END IF;

    -- Las lineas sin parte_id (un flete, un servicio) se marcan recibidas pero
    -- no mueven stock: no hay que mover.
    IF v_linea.parte_id IS NOT NULL THEN
      UPDATE public.partes
      SET stock_actual = stock_actual + v_cantidad
      WHERE id = v_linea.parte_id;

      -- El libro de entradas a bodega, igual que la recepcion manual.
      INSERT INTO public.material_stock_entries (
        workspace_id, parte_id, proveedor_id, cantidad, recibido_at, notas, registrado_por
      ) VALUES (
        v_workspace_id,
        v_linea.parte_id,
        v_proveedor_id,
        v_cantidad,
        now(),
        NULLIF(BTRIM(COALESCE(p_nota, '')), ''),
        auth.uid()
      );
    END IF;

    UPDATE public.ordenes_compra_lineas
    SET cantidad_recibida = cantidad_recibida + v_cantidad
    WHERE id = v_linea.id;

    v_unidades := v_unidades + v_cantidad;
    v_items    := v_items + 1;
    v_valor    := v_valor + ROUND(v_cantidad * COALESCE(v_linea.precio_unitario, 0));
  END LOOP;

  IF v_items = 0 THEN
    RAISE EXCEPTION 'No hay items que recibir';
  END IF;

  -- El correlativo se calcula con la OC ya bloqueada arriba, asi que no hay
  -- carrera posible por el mismo numero.
  SELECT COALESCE(MAX(r.numero), 0) + 1 INTO v_numero
  FROM public.ordenes_compra_recepciones r
  WHERE r.orden_compra_id = p_oc_id;

  INSERT INTO public.ordenes_compra_recepciones (
    orden_compra_id, numero, nota, unidades, items, valor, recibido_por
  ) VALUES (
    p_oc_id, v_numero, NULLIF(BTRIM(COALESCE(p_nota, '')), ''),
    v_unidades, v_items, v_valor, auth.uid()
  )
  RETURNING id INTO v_recepcion_id;

  -- El estado sale de lo que quedo GUARDADO, no de lo que creemos que se
  -- guardo.
  SELECT bool_and(l.cantidad_recibida >= l.cantidad) INTO v_completa
  FROM public.ordenes_compra_lineas l
  WHERE l.orden_compra_id = p_oc_id;

  UPDATE public.ordenes_compra
  SET estado = CASE WHEN COALESCE(v_completa, false) THEN 'completada' ELSE 'recibida_parcial' END
  WHERE id = p_oc_id;

  RETURN v_recepcion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recibir_orden_compra(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recibir_orden_compra(uuid, jsonb, text) TO authenticated;
