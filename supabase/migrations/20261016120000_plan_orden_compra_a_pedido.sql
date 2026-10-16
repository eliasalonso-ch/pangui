-- Orden de compra desde el plan de mantencion: A PEDIDO, no por cron.
--
-- Hasta aca plan_tick_diario armaba la OC solo, apenas la ocurrencia entraba en
-- la ventana de aviso (20260909130000). Eso volvia obligatorio algo que no lo
-- es: agregar materiales a un plan para dejar documentado que usa la mantencion
-- no significa querer comprarlos cada vez. Ahora la OC nace cuando alguien
-- aprieta "Generar orden de compra" en el detalle del plan.
--
-- QUE ARMA: lo mismo que armaba el cron. Una OC por proveedor (el preferido del
-- plan, o el de cada parte), solo con lo que falta en bodega, precios del
-- catalogo sin confirmar, IVA por resta. Entrega esperada = la proxima
-- mantencion programada.
--
-- DIFERENCIAS CON EL CRON, A PROPOSITO:
--   * Nace en 'borrador', como una OC manual: la armo una persona que la va a
--     revisar ahora mismo, no un proceso que tiene que avisarle a alguien.
--     Por lo mismo no manda notificaciones.
--   * NO se liga a plan_ocurrencia_id. El indice unico parcial sobre esa
--     columna (20260909120000) permite UNA OC por ocurrencia, asi que un plan
--     con materiales de dos proveedores reventaba en la segunda. Y a pedido
--     tiene sentido volver a generarla (se rechazo, cambio el stock). La
--     trazabilidad queda en origen = 'plan_mantencion' + plan_id.
--   * SECURITY INVOKER: corre con los permisos de quien la llama, asi que la
--     RLS de ordenes_compra (solo owner/admin escriben) se aplica sola. El
--     chequeo de rol de arriba es solo para devolver una frase en vez del
--     error generico de RLS.
--
-- Devuelve los ids creados. Vacio = habia stock de todo y no hay que comprar.

CREATE OR REPLACE FUNCTION public.plan_generar_orden_compra(p_plan_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_plan   public.planes_mantencion;
  v_fecha  date;
  v_grupo  record;
  v_orden  uuid;
  v_neto   numeric;
  v_ids    uuid[] := '{}';
BEGIN
  IF public.my_rol() IS DISTINCT FROM 'owner' AND public.my_rol() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede generar órdenes de compra.' USING errcode = '42501';
  END IF;

  SELECT * INTO v_plan
  FROM public.planes_mantencion
  WHERE id = p_plan_id AND workspace_id = public.my_workspace_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El plan no pertenece a tu espacio de trabajo.' USING errcode = '42501';
  END IF;

  -- La proxima mantencion que todavia no se ejecuta: para entonces se necesitan
  -- los materiales en terreno. Sin ocurrencias futuras queda sin fecha.
  SELECT MIN(o.fecha_programada) INTO v_fecha
  FROM public.plan_ocurrencias o
  WHERE o.plan_id = p_plan_id
    AND o.estado IN ('programada', 'avisada')
    AND o.fecha_programada >= CURRENT_DATE;

  FOR v_grupo IN
    SELECT COALESCE(v_plan.proveedor_id, pa.proveedor_id) AS proveedor_id,
           SUM((pm.cantidad - COALESCE(pa.stock_actual, 0)) * COALESCE(pa.precio_unitario, 0)) AS neto
    FROM public.plan_materiales pm
    JOIN public.partes pa ON pa.id = pm.parte_id
    WHERE pm.plan_id = v_plan.id
      -- Solo lo que falta: si hay stock suficiente no se compra.
      AND pm.cantidad > COALESCE(pa.stock_actual, 0)
    GROUP BY COALESCE(v_plan.proveedor_id, pa.proveedor_id)
  LOOP
    v_neto := ROUND(COALESCE(v_grupo.neto, 0));

    INSERT INTO public.ordenes_compra (
      workspace_id, proveedor_id, estado, origen, plan_id,
      fecha_emision, fecha_entrega_esperada, condiciones_pago,
      neto, iva, total,
      observaciones, precios_confirmados, creado_por
    ) VALUES (
      v_plan.workspace_id,
      v_grupo.proveedor_id,
      'borrador',
      'plan_mantencion',
      v_plan.id,
      CURRENT_DATE,
      v_fecha,
      (SELECT pr.condiciones_pago FROM public.proveedores pr WHERE pr.id = v_grupo.proveedor_id),
      v_neto,
      -- IVA por RESTA sobre el bruto, nunca ROUND(neto * 0.19): calcularlo
      -- aparte descuadra en $1 para ciertos montos. Misma regla que
      -- lib/tributario.ts.
      ROUND(v_neto * 1.19) - v_neto,
      ROUND(v_neto * 1.19),
      -- `observaciones` sale impreso en el PDF del proveedor: no va una nota
      -- interna de que plan viene (ver 20260909130000).
      NULL,
      -- Precios del catalogo interno, no de una cotizacion: hasta que alguien
      -- los confirme la UI avisa.
      false,
      auth.uid()
    )
    RETURNING id INTO v_orden;

    INSERT INTO public.ordenes_compra_lineas (
      orden_compra_id, parte_id, descripcion, codigo, unidad,
      cantidad, precio_unitario, total, orden
    )
    SELECT
      v_orden,
      pa.id,
      pa.nombre,
      pa.codigo,
      pa.unidad,
      pm.cantidad - COALESCE(pa.stock_actual, 0),
      COALESCE(pa.precio_unitario, 0),
      ROUND((pm.cantidad - COALESCE(pa.stock_actual, 0)) * COALESCE(pa.precio_unitario, 0)),
      row_number() OVER (ORDER BY pa.nombre)
    FROM public.plan_materiales pm
    JOIN public.partes pa ON pa.id = pm.parte_id
    WHERE pm.plan_id = v_plan.id
      AND pm.cantidad > COALESCE(pa.stock_actual, 0)
      AND COALESCE(v_plan.proveedor_id, pa.proveedor_id) IS NOT DISTINCT FROM v_grupo.proveedor_id;

    v_ids := v_ids || v_orden;
  END LOOP;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.plan_generar_orden_compra(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_generar_orden_compra(uuid) TO authenticated;

-- ── El cron deja de comprar ──────────────────────────────────────────────────
-- Mismo tick que antes, sin el paso de compras.
CREATE OR REPLACE FUNCTION public.plan_tick_diario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avisadas integer;
  v_ots      integer;
  v_nuevas   integer := 0;
  v_plan     record;
BEGIN
  v_avisadas := public.plan_avisar_proximas();
  v_ots      := public.plan_generar_ordenes();

  FOR v_plan IN SELECT id FROM public.planes_mantencion WHERE activo LOOP
    v_nuevas := v_nuevas + public.plan_materializar_ocurrencias(v_plan.id, NULL);
  END LOOP;

  RETURN jsonb_build_object(
    'avisadas', v_avisadas,
    'ordenes_creadas', v_ots,
    'ocurrencias_nuevas', v_nuevas,
    'corrida', now()
  );
END;
$$;

-- Sin llamadores: la unica era plan_tick_diario.
DROP FUNCTION IF EXISTS public.plan_generar_ordenes_compra();
