-- Generacion automatica de ordenes de compra desde el plan de mantencion.
--
-- EL PROBLEMA QUE RESUELVE: un proyecto de mantencion se revisa con antelacion y
-- los materiales se definen antes de ejecutarlo. Sin esto, alguien tiene que
-- acordarse de mirar el plan, comparar contra bodega y escribirle al proveedor a
-- mano — y cuando llega el dia del trabajo los materiales no estan.
--
-- CUANDO CORRE: en la ventana de AVISO (dias_aviso_previo), no en la de apertura
-- de la OT. Son cosas distintas a proposito: la OT se abre pocos dias antes
-- porque es trabajo del terreno, pero comprar necesita plazo de entrega. Con
-- dias_aviso_previo = 30 la OC nace un mes antes, que es exactamente lo que pide
-- quien planifica.
--
-- IDEMPOTENCIA: una ocurrencia genera como maximo UNA orden por proveedor. La
-- ocurrencia sigue dentro de la ventana de aviso todos los dias hasta que llega
-- la fecha, asi que sin esto el cron crearia una OC nueva cada mañana. El
-- candado real es el indice unico parcial sobre plan_ocurrencia_id (ver
-- 20260909120000); el NOT EXISTS de aca solo evita el trabajo inutil.
--
-- POR QUE NACE EN 'pendiente_aprobacion' Y NO SE ENVIA SOLA: comprometer plata
-- con un proveedor no puede ser efecto secundario de un cron. El sistema arma el
-- documento y avisa; la persona lo revisa, lo aprueba y lo envia.

CREATE OR REPLACE FUNCTION public.plan_generar_ordenes_compra()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc        record;
  v_plan      public.planes_mantencion;
  v_grupo     record;
  v_orden     uuid;
  v_creadas   integer := 0;
  v_neto      numeric;
  v_usuario   uuid;
  v_titulo    text;
BEGIN
  FOR v_oc IN
    SELECT o.*
    FROM public.plan_ocurrencias o
    JOIN public.planes_mantencion p ON p.id = o.plan_id
    WHERE o.estado IN ('programada', 'avisada')
      AND p.activo
      AND p.dias_aviso_previo > 0
      -- Misma ventana que plan_avisar_proximas: falta igual o menos que el aviso.
      AND o.fecha_programada <= CURRENT_DATE + make_interval(days => p.dias_aviso_previo)
      AND o.fecha_programada >= CURRENT_DATE
      -- El plan tiene que declarar materiales; sin eso no hay nada que comprar.
      AND EXISTS (SELECT 1 FROM public.plan_materiales pm WHERE pm.plan_id = p.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.ordenes_compra oc WHERE oc.plan_ocurrencia_id = o.id
      )
    ORDER BY o.fecha_programada
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    SELECT * INTO v_plan FROM public.planes_mantencion WHERE id = v_oc.plan_id;

    -- Una OC por proveedor: no se le puede mandar a Rexel una orden que incluye
    -- items de otra maestranza. El proveedor preferido del plan manda; si no
    -- tiene, cae al que trae cada parte del catalogo. Las partes sin proveedor
    -- se agrupan bajo NULL y quedan en una OC sin destinatario, para que alguien
    -- la complete a mano en vez de perderse.
    FOR v_grupo IN
      SELECT COALESCE(v_plan.proveedor_id, pa.proveedor_id) AS proveedor_id,
             SUM(GREATEST(pm.cantidad - COALESCE(pa.stock_actual, 0), 0) * COALESCE(pa.precio_unitario, 0)) AS neto
      FROM public.plan_materiales pm
      JOIN public.partes pa ON pa.id = pm.parte_id
      WHERE pm.plan_id = v_plan.id
        -- Solo lo que falta: si hay stock suficiente no se compra.
        AND pm.cantidad > COALESCE(pa.stock_actual, 0)
      GROUP BY COALESCE(v_plan.proveedor_id, pa.proveedor_id)
    LOOP
      v_neto := ROUND(COALESCE(v_grupo.neto, 0));

      INSERT INTO public.ordenes_compra (
        workspace_id, proveedor_id, estado, origen,
        plan_id, plan_ocurrencia_id,
        fecha_emision, fecha_entrega_esperada,
        condiciones_pago,
        neto, iva, total,
        observaciones, precios_confirmados, creado_por
      ) VALUES (
        v_plan.workspace_id,
        v_grupo.proveedor_id,
        'pendiente_aprobacion',
        'plan_mantencion',
        v_plan.id,
        v_oc.id,
        CURRENT_DATE,
        -- Se necesita en terreno el dia programado, asi que la entrega se pide
        -- para entonces.
        v_oc.fecha_programada,
        (SELECT pr.condiciones_pago FROM public.proveedores pr WHERE pr.id = v_grupo.proveedor_id),
        v_neto,
        -- IVA por RESTA sobre el bruto, nunca ROUND(neto * 0.19): calcularlo
        -- aparte descuadra en $1 para ciertos montos y neto + iva != total.
        -- Misma regla que lib/tributario.ts.
        ROUND(v_neto * 1.19) - v_neto,
        ROUND(v_neto * 1.19),
        -- `observaciones` sale IMPRESO en el PDF que recibe el proveedor: es la
        -- caja "COMENTARIOS O INSTRUCCIONES ESPECIALES" del documento. Anotar
        -- ahi de que plan viene seria filtrarle al proveedor una nota interna.
        -- La trazabilidad ya vive en origen/plan_id/plan_ocurrencia_id, que la
        -- UI muestra como "Generada por un plan". Se deja NULL para que quien
        -- aprueba escriba instrucciones de verdad si hacen falta.
        NULL,
        -- Los precios salen de partes.precio_unitario (catalogo interno), no de
        -- una cotizacion del proveedor. Una OC declara "precios acordados" y
        -- tiene valor legal, asi que hasta que alguien los confirme la UI avisa
        -- y el PDF no puede salir a nombre de un acuerdo que no existe.
        false,
        v_plan.creado_por
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

      v_creadas := v_creadas + 1;

      -- Avisar a quien puede aprobarla. Mismo criterio que plan_avisar_proximas:
      -- los asignados del plan, y si no hay, quien lo creo.
      v_titulo := COALESCE(NULLIF(BTRIM(v_plan.titulo_ot), ''), v_plan.nombre);

      FOREACH v_usuario IN ARRAY (
        CASE WHEN COALESCE(array_length(v_plan.asignados_ids, 1), 0) > 0
             THEN v_plan.asignados_ids
             ELSE ARRAY[v_plan.creado_por] END
      )
      LOOP
        CONTINUE WHEN v_usuario IS NULL;

        INSERT INTO public.notifications (usuario_id, titulo, mensaje, url, tipo)
        VALUES (
          v_usuario,
          'Orden de compra por aprobar',
          'Se genero una orden de compra para "' || v_titulo || '" (mantencion del ' ||
            to_char(v_oc.fecha_programada, 'DD/MM/YYYY') || '). Revisala y apruebala para enviarla al proveedor.',
          '/ordenes-compra?id=' || v_orden,
          'orden_compra_generada'
        );
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_creadas;
END;
$$;

-- ── Engancharla al tick diario ───────────────────────────────────────────────
-- El cron job `planes-mantencion-tick` (06:00) ya llama a plan_tick_diario. Se
-- agrega el paso de compras ANTES de avisar, porque plan_avisar_proximas marca
-- la ocurrencia como 'avisada' y se queda sin volver a mirarla; generando
-- primero, la OC alcanza a nacer en la misma corrida en que se avisa.
CREATE OR REPLACE FUNCTION public.plan_tick_diario()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_avisadas integer;
  v_ots      integer;
  v_ocs      integer;
  v_nuevas   integer := 0;
  v_plan     record;
BEGIN
  v_ocs      := public.plan_generar_ordenes_compra();
  v_avisadas := public.plan_avisar_proximas();
  v_ots      := public.plan_generar_ordenes();

  FOR v_plan IN SELECT id FROM public.planes_mantencion WHERE activo LOOP
    v_nuevas := v_nuevas + public.plan_materializar_ocurrencias(v_plan.id, NULL);
  END LOOP;

  RETURN jsonb_build_object(
    'avisadas', v_avisadas,
    'ordenes_creadas', v_ots,
    'ordenes_compra_creadas', v_ocs,
    'ocurrencias_nuevas', v_nuevas,
    'corrida', now()
  );
END;
$$;
