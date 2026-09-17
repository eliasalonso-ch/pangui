-- El motor de automatizaciones. Reemplaza a fn_medidor_lectura_critica.
--
-- POR QUÉ SIGUE SIENDO UN TRIGGER (y no la API):
-- Una lectura entra por tres caminos —el formulario web, la cola offline del
-- móvil y /api/medidores/lecturas con service role— y las tres tienen que
-- disparar igual. Es el mismo motivo que estaba comentado en la migración
-- original y no cambió: si el chequeo viviera en la API, el técnico que anota la
-- lectura en la ronda no abriría ninguna OT.
--
-- POR QUÉ SE BORRA EL ANTERIOR:
-- Los umbrales soldados hacían exactamente esto con dos reglas fijas. Dejarlos
-- correr al lado del motor significa que un medidor con umbral Y automatización
-- abre DOS OT por la misma lectura.

CREATE OR REPLACE FUNCTION public.fn_automatizacion_lectura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_medidor    record;
  v_trigger    record;
  v_accion     record;
  v_cumple     boolean;
  v_cumplen_n  integer;
  v_abierta    uuid;
  v_ultima     timestamptz;
  v_orden      uuid;
  v_titulo     text;
  v_desc       text;
  v_es_empresa boolean;
  v_ejecuto    boolean;
BEGIN
  SELECT id, nombre, unidad, activo_id, ubicacion_id, workspace_id
    INTO v_medidor
    FROM public.medidores
   WHERE id = NEW.medidor_id;

  -- El gate de plan vive acá y no solo en la UI: una automatización creada en
  -- Empresa seguiría corriendo después de bajar de plan, que es exactamente la
  -- clase de cobro fantasma que nadie quiere explicar.
  --
  -- 'trialing' queda afuera a propósito: effectivePlan() mapea el trial a pro,
  -- no a enterprise, así que la UI esconde la función durante el trial. Si el
  -- motor la corriera igual, dispararía una automatización que el usuario ni
  -- siquiera puede ver en su plan actual.
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.workspace_id = v_medidor.workspace_id
       AND s.plan_key = 'enterprise'
       AND s.status IN ('active','past_due')
  ) INTO v_es_empresa;

  -- El gate se resuelve UNA vez por lectura, no una vez por trigger: un
  -- workspace con 3 triggers sobre el mismo medidor y un envío de 500
  -- lecturas generaría 1500 filas 'omitida' idénticas si el chequeo viviera
  -- dentro del loop de abajo. Acá es una fila por automatización afectada.
  IF NOT v_es_empresa THEN
    INSERT INTO public.automatizacion_ejecuciones
      (automatizacion_id, lectura_id, resultado, detalle, valor)
    SELECT DISTINCT a.id, NEW.id, 'omitida',
           'El plan del espacio no incluye automatizaciones.', NEW.valor
      FROM public.automatizacion_triggers t
      JOIN public.automatizaciones a ON a.id = t.automatizacion_id
     WHERE t.medidor_id = NEW.medidor_id
       AND a.activa
       AND a.workspace_id = v_medidor.workspace_id;
    RETURN NEW;
  END IF;

  FOR v_trigger IN
    SELECT t.*, a.id AS auto_id, a.creado_por AS auto_creado_por
      FROM public.automatizacion_triggers t
      JOIN public.automatizaciones a ON a.id = t.automatizacion_id
     WHERE t.medidor_id = NEW.medidor_id
       AND a.activa
       AND a.workspace_id = v_medidor.workspace_id
  LOOP
    -- ── ¿La lectura cumple el operador? ─────────────────────────────────────
    v_cumple := CASE v_trigger.operador
      WHEN 'mayor_igual' THEN NEW.valor >= v_trigger.valor
      WHEN 'menor_igual' THEN NEW.valor <= v_trigger.valor
      WHEN 'igual'       THEN NEW.valor  = v_trigger.valor
      WHEN 'entre'       THEN NEW.valor >= v_trigger.valor
                          AND NEW.valor <= v_trigger.valor_hasta
    END;

    -- ── El modo ─────────────────────────────────────────────────────────────
    IF v_trigger.modo = 'una_lectura_reset' THEN
      -- Latch: al dejar de cumplirse se rearma y no se dispara nada más.
      IF NOT v_cumple THEN
        IF NOT v_trigger.armado THEN
          UPDATE public.automatizacion_triggers SET armado = true WHERE id = v_trigger.id;
        END IF;
        CONTINUE;
      END IF;
      IF NOT v_trigger.armado THEN
        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, lectura_id, resultado, detalle, valor)
        VALUES (v_trigger.auto_id, NEW.id, 'omitida',
                'Ya se disparó y la condición no se ha despejado.', NEW.valor);
        CONTINUE;  -- ya disparó y la condición nunca se despejó
      END IF;

    ELSIF v_trigger.modo = 'lecturas_multiples' THEN
      IF NOT v_cumple THEN
        CONTINUE;
      END IF;
      -- Las últimas N lecturas del medidor, ESTA incluida, tienen que cumplir
      -- todas. Se cuenta sobre la ventana en vez de llevar un contador: un
      -- contador se desincroniza si alguien borra una lectura.
      --
      -- ESTA lectura se fuerza con UNION ALL en vez de salir del ORDER BY...
      -- LIMIT: un gateway que manda lecturas atrasadas (ts viejo, llega
      -- recién ahora) puede insertar una fila cuyo ts la deja fuera de sus
      -- propias últimas N por timestamp, y el trigger se evaluaría contra una
      -- ventana que no la incluye. Se pide la lectura actual aparte y N-1 del
      -- resto para completar la ventana.
      SELECT count(*) INTO v_cumplen_n FROM (
        SELECT NEW.valor AS valor
        UNION ALL
        SELECT l.valor
          FROM public.medidor_lecturas l
         WHERE l.medidor_id = NEW.medidor_id AND l.id <> NEW.id
         ORDER BY l.ts DESC
         LIMIT v_trigger.modo_n - 1
      ) ult
      WHERE CASE v_trigger.operador
        WHEN 'mayor_igual' THEN ult.valor >= v_trigger.valor
        WHEN 'menor_igual' THEN ult.valor <= v_trigger.valor
        WHEN 'igual'       THEN ult.valor  = v_trigger.valor
        WHEN 'entre'       THEN ult.valor >= v_trigger.valor
                            AND ult.valor <= v_trigger.valor_hasta
      END;

      IF v_cumplen_n < v_trigger.modo_n THEN
        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, lectura_id, resultado, detalle, valor)
        VALUES (v_trigger.auto_id, NEW.id, 'omitida',
                format('Solo %s de las últimas %s lecturas cumplen la condición.',
                       v_cumplen_n, v_trigger.modo_n),
                NEW.valor);
        CONTINUE;
      END IF;

    ELSE  -- 'una_lectura'
      IF NOT v_cumple THEN
        CONTINUE;
      END IF;
    END IF;

    -- ── Acciones ────────────────────────────────────────────────────────────
    v_ejecuto := false;

    FOR v_accion IN
      SELECT * FROM public.automatizacion_acciones
       WHERE automatizacion_id = v_trigger.auto_id
       ORDER BY orden, id
    LOOP
      -- v1 solo ejecuta crear_ot. El resto queda registrado para que la ficha
      -- diga por qué no pasó nada, en vez de quedar muda.
      IF v_accion.tipo <> 'crear_ot' THEN
        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
        VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                'Este tipo de acción todavía no está disponible.', NEW.valor);
        CONTINUE;
      END IF;

      -- Freno 1: retrigger.
      -- Se consulta SIEMPRE, incluso con retrigger_minutos = 0: la API de
      -- lecturas acepta hasta 500 filas en un solo INSERT (mismo statement,
      -- mismo now()), y si el chequeo se saltara con 0 esas 500 filas del
      -- mismo envío abrirían 500 OT. Con mins => 0 la comparación
      -- `v_ultima > now()` da false para el primer disparo (todavía no hay
      -- ejecución) y true para el resto del mismo envío (now() es el mismo
      -- timestamp de transacción para todas las filas), así que el freno
      -- sigue dejando pasar UNA por envío sin bloquear envíos futuros.
      SELECT max(created_at) INTO v_ultima
        FROM public.automatizacion_ejecuciones
       WHERE accion_id = v_accion.id AND resultado = 'ejecutada';

      IF v_ultima IS NOT NULL
         AND v_ultima > now() - make_interval(mins => v_accion.retrigger_minutos) THEN
        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
        VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                CASE WHEN v_accion.retrigger_minutos = 0
                     THEN 'Ya se ejecutó con otra lectura del mismo envío.'
                     ELSE format('Se ejecutó hace menos de %s minutos.', v_accion.retrigger_minutos)
                END,
                NEW.valor);
        CONTINUE;
      END IF;

      -- Freno 2: la OT anterior de ESTA automatización sigue abierta.
      IF v_accion.solo_si_anterior_cerrada THEN
        SELECT o.id INTO v_abierta
          FROM public.ordenes_trabajo o
         WHERE o.automatizacion_id = v_trigger.auto_id
           AND o.estado NOT IN ('completado','cancelado')
         LIMIT 1;

        IF v_abierta IS NOT NULL THEN
          INSERT INTO public.automatizacion_ejecuciones
            (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor, orden_id)
          VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                  'La orden de trabajo anterior sigue abierta.', NEW.valor, v_abierta);
          CONTINUE;
        END IF;
      END IF;

      -- ── Crear la OT ───────────────────────────────────────────────────────
      -- config es jsonb sin validación de forma: un uuid mal escrito, un
      -- asignados_ids que no es array, un tiempo_estimado no numérico o un
      -- tipo_trabajo inválido hacen RAISE en el cast. Como esto corre AFTER
      -- INSERT dentro de la transacción de quien llamó, una acción mal
      -- configurada podría abortar el INSERT completo y perder las 500
      -- lecturas del envío. Una acción mal configurada no puede impedir que
      -- se registre la lectura: se aísla en su propio bloque y se registra
      -- como 'fallida' en vez de propagar el error.
      BEGIN
        v_titulo := COALESCE(NULLIF(btrim(v_accion.config->>'titulo'), ''),
                             v_medidor.nombre || ' — automatización');

        -- `descripcion` es NOT NULL en ordenes_trabajo, así que siempre hay texto:
        -- el del usuario, o el hecho que disparó. Nunca cadena vacía sola.
        v_desc := COALESCE(NULLIF(btrim(v_accion.config->>'descripcion'), ''), '')
          || CASE WHEN COALESCE(btrim(v_accion.config->>'descripcion'), '') = '' THEN '' ELSE E'\n\n' END
          || format('Generada por automatización: %s marcó %s %s el %s.',
               v_medidor.nombre,
               rtrim(trim(to_char(NEW.valor, 'FM999999990.999')), '.'),
               v_medidor.unidad,
               to_char(NEW.ts AT TIME ZONE 'America/Santiago', 'DD/MM/YYYY HH24:MI'));

        INSERT INTO public.ordenes_trabajo (
          workspace_id, creado_por, titulo, descripcion,
          tipo, tipo_trabajo, estado, prioridad,
          activo_id, ubicacion_id, medidor_id, automatizacion_id,
          asignados_ids, categoria_ids, tiempo_estimado,
          origen
        ) VALUES (
          v_medidor.workspace_id,
          -- A nombre de quien creó la automatización: es lo más cercano a un
          -- responsable que se puede afirmar sin inventar un usuario de sistema.
          v_trigger.auto_creado_por,
          v_titulo,
          v_desc,
          'solicitud',
          COALESCE(NULLIF(v_accion.config->>'tipo_trabajo', ''), 'reactiva'),
          'pendiente',
          COALESCE(NULLIF(v_accion.config->>'prioridad', ''), 'media'),
          -- El activo de la config manda; si no hay, el del medidor. Un medidor
          -- sin activo y sin activo en la config deja la OT sin activo, que es
          -- válido (a diferencia del motor viejo, que en ese caso no disparaba).
          COALESCE((v_accion.config->>'activo_id')::uuid, v_medidor.activo_id),
          COALESCE((v_accion.config->>'ubicacion_id')::uuid, v_medidor.ubicacion_id),
          NEW.medidor_id,
          v_trigger.auto_id,
          CASE WHEN v_accion.config ? 'asignados_ids'
               THEN ARRAY(SELECT jsonb_array_elements_text(v_accion.config->'asignados_ids')::uuid)
               ELSE NULL END,
          CASE WHEN v_accion.config ? 'categoria_ids'
               THEN ARRAY(SELECT jsonb_array_elements_text(v_accion.config->'categoria_ids')::uuid)
               ELSE NULL END,
          NULLIF(v_accion.config->>'tiempo_estimado', '')::integer,
          -- `numero` NO se pasa: trg_assign_orden_numero (BEFORE INSERT) lo asigna y
          -- pisa cualquier valor que mandemos. Un solo asignador, no dos.
          -- ponytail: ese asignador es MAX+1 sin unique en (workspace_id, numero), así
          -- que dos inserts concurrentes pueden colisionar. Fuera del alcance de esta
          -- tarea; se arregla con una secuencia por workspace o un unique + reintento.
          'medidor'
        )
        RETURNING id INTO v_orden;

        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, accion_id, lectura_id, resultado, valor, orden_id)
        VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'ejecutada', NEW.valor, v_orden);

        -- El latch se baja recién acá: si un freno cortó arriba, la condición
        -- sigue pendiente y la próxima lectura la vuelve a evaluar.
        IF v_trigger.modo = 'una_lectura_reset' THEN
          UPDATE public.automatizacion_triggers SET armado = false WHERE id = v_trigger.id;
        END IF;

        v_ejecuto := true;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
        VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'fallida',
                'No se pudo crear la orden de trabajo: ' || SQLERRM, NEW.valor);
      END;
    END LOOP;

    -- Solo se actualiza si de verdad se creó una OT: si todas las acciones se
    -- omitieron o fallaron, "hace 2 minutos" en la ficha mentiría sobre una
    -- ejecución que no pasó.
    IF v_ejecuto THEN
      UPDATE public.automatizaciones
         SET ultima_ejecucion_at = now()
       WHERE id = v_trigger.auto_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automatizacion_lectura ON public.medidor_lecturas;
CREATE TRIGGER trg_automatizacion_lectura
  AFTER INSERT ON public.medidor_lecturas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_automatizacion_lectura();

-- ── Convivencia con las alertas de medidor ──────────────────────────────────
-- ESTA MIGRACIÓN YA NO BORRA fn_medidor_lectura_critica.
--
-- El diseño original (2026-09-13) la eliminaba: en ese momento era el disparo
-- soldado viejo —umbral crítico e intervalo de uso, sin configuración— y tenerlo
-- vivo al lado del motor significaba dos OT por la misma lectura.
--
-- Entre el diseño y la aplicación, 20260914193001 (medidores_alertas) redefinió
-- esa misma función: ahora notifica al cruzar advertencia/alarma con histéresis
-- del 5%, y guarda el nivel en medidores.nivel_actual. Eso NO es lo que este
-- motor reemplaza. Son dos cosas sobre el mismo evento:
--   - fn_medidor_lectura_critica  -> avisa (y abre OT en la transición a alarma)
--   - fn_automatizacion_lectura   -> abre la OT que el usuario configuró
-- Cada una en su trigger. Borrar la primera acá apagaría las alertas.
--
-- Por el mismo motivo tampoco se limpian los umbrales de los medidores
-- manuales: son exactamente lo que la función de alertas lee.

-- ponytail: un medidor con umbral Y una automatización sobre el mismo valor
-- puede abrir dos OT. El dedupe por OT abierta de fn_medidor_lectura_critica lo
-- cubre en la práctica. Si molesta, el upgrade es que las alertas dejen de abrir
-- OT y solo notifiquen, moviendo ese trabajo a una automatización.
