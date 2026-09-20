-- Los once operadores de un disparador de medidor.
--
-- Hasta acá había cuatro: mayor_igual, menor_igual, igual y entre. Faltaban los
-- estrictos (> y <), el distinto, y sobre todo los CUATRO DE DELTA, que son de
-- otra naturaleza: no miran el valor de la lectura sino cuánto cambió.
--
-- LOS DOS PARES DE DELTA, que se confunden todo el tiempo:
--
--   *_desde_disparo  — acumulado. "Cada 5.000 km". Compara contra un objetivo
--                      móvil (`proximo_disparo`) que avanza solo cada vez que
--                      dispara. Es el mantenimiento por uso: el odómetro nunca
--                      se reinicia, el objetivo sí.
--
--   *_desde_lectura  — salto. "Si subió 15° respecto de la lectura anterior".
--                      Compara dos lecturas consecutivas. Es la detección de
--                      cambios bruscos: no importa el valor absoluto, importa
--                      la velocidad. Un rodamiento a 80° estable está bien; uno
--                      que pasó de 40 a 80 en diez minutos, no.
--
-- La lectura anterior se toma por `ts` (cuándo se midió) y no por `created_at`
-- (cuándo entró la fila): un gateway que estuvo sin red manda su buffer después,
-- y comparar por orden de llegada enfrentaría lecturas que no son vecinas.

ALTER TABLE public.automatizacion_triggers
  DROP CONSTRAINT IF EXISTS automatizacion_triggers_operador_check;

ALTER TABLE public.automatizacion_triggers
  ADD CONSTRAINT automatizacion_triggers_operador_check CHECK (operador IN (
    'mayor', 'menor', 'mayor_igual', 'menor_igual', 'igual', 'distinto', 'entre',
    'aumenta_desde_disparo', 'disminuye_desde_disparo',
    'aumenta_desde_lectura', 'disminuye_desde_lectura'
  ));

-- El "Next trigger is at" de los operadores acumulados.
--
-- Es estado del motor, como `armado`: el usuario lo siembra (el camión recién
-- comprado se atiende a los 15.000, no a los 5.000) y a partir de ahí lo avanza
-- el trigger. NULL en los otros operadores, y también en un acumulado recién
-- creado sin valor inicial: ahí el primer disparo lo fija.
ALTER TABLE public.automatizacion_triggers
  ADD COLUMN IF NOT EXISTS proximo_disparo numeric;

COMMENT ON COLUMN public.automatizacion_triggers.proximo_disparo IS
  'Solo en los operadores *_desde_disparo: el valor de medidor en el que toca '
  'la próxima ejecución. Lo avanza el motor sumando (o restando) `valor`.';

-- `valor_hasta` sigue siendo exclusivo de 'entre'. La constraint se rehace sola
-- porque la anterior nombraba los operadores viejos en su rama negativa.
ALTER TABLE public.automatizacion_triggers
  DROP CONSTRAINT IF EXISTS automatizacion_triggers_hasta_solo_en_entre;

ALTER TABLE public.automatizacion_triggers
  ADD CONSTRAINT automatizacion_triggers_hasta_solo_en_entre CHECK (
    (operador = 'entre'  AND valor_hasta IS NOT NULL AND valor_hasta > valor)
    OR (operador <> 'entre' AND valor_hasta IS NULL)
  );

-- Un delta de 0 o negativo no es una regla: "cada 0 km" dispararía siempre y
-- "cada -5" no significa nada. El sentido lo da el operador, no el signo.
ALTER TABLE public.automatizacion_triggers
  DROP CONSTRAINT IF EXISTS automatizacion_triggers_delta_positivo;

ALTER TABLE public.automatizacion_triggers
  ADD CONSTRAINT automatizacion_triggers_delta_positivo CHECK (
    operador NOT IN ('aumenta_desde_disparo','disminuye_desde_disparo',
                     'aumenta_desde_lectura','disminuye_desde_lectura')
    OR valor > 0
  );

-- ── El motor, con los once operadores ───────────────────────────────
-- Se redefine entera por lo de siempre. El cuerpo es el de 20260920140000 con
-- el bloque de operadores nuevo y el avance de `proximo_disparo`; el resto no
-- cambia.

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
  v_bloqueo    text;
  v_activo_ot  uuid;
  v_estado_err text;
  v_previa     numeric;
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
    -- Los de umbral miran el valor; los de delta, cuánto cambió. Se separan
    -- porque los segundos necesitan contexto —la lectura anterior o el objetivo
    -- acumulado— y meterlos en el mismo CASE obligaría a consultarlo siempre.
    IF v_trigger.operador IN ('aumenta_desde_lectura','disminuye_desde_lectura') THEN
      -- La lectura inmediatamente anterior POR ts. No por created_at: un
      -- gateway que estuvo sin red manda su buffer después, y comparar por
      -- orden de llegada enfrentaría lecturas que no son vecinas en el tiempo.
      --
      -- `ts < NEW.ts` y no `id <> NEW.id`: con el buffer, una fila que llega
      -- ahora puede tener un ts viejo, y su "anterior" es la anterior a SU
      -- instante, no la última que entró.
      SELECT l.valor INTO v_previa
        FROM public.medidor_lecturas l
       WHERE l.medidor_id = NEW.medidor_id
         AND l.id <> NEW.id
         AND l.ts <= NEW.ts
       ORDER BY l.ts DESC, l.created_at DESC
       LIMIT 1;

      -- Sin lectura previa no hay delta que medir. La primera lectura de un
      -- medidor no puede "haber subido": no dispara y no deja fila, porque
      -- registrar 'omitida' en cada medidor nuevo es ruido.
      IF v_previa IS NULL THEN
        CONTINUE;
      END IF;

      v_cumple := CASE v_trigger.operador
        WHEN 'aumenta_desde_lectura'   THEN NEW.valor - v_previa >=  v_trigger.valor
        WHEN 'disminuye_desde_lectura' THEN v_previa - NEW.valor >=  v_trigger.valor
      END;

    ELSIF v_trigger.operador IN ('aumenta_desde_disparo','disminuye_desde_disparo') THEN
      -- Objetivo móvil. Sin sembrar, la PRIMERA lectura lo fija y no dispara:
      -- un odómetro que ya marca 80.000 km cuando se crea la regla "cada 5.000"
      -- no debe abrir una OT por los 80.000 que trae de antes.
      IF v_trigger.proximo_disparo IS NULL THEN
        UPDATE public.automatizacion_triggers
           SET proximo_disparo = CASE v_trigger.operador
                 WHEN 'aumenta_desde_disparo'   THEN NEW.valor + v_trigger.valor
                 ELSE                                NEW.valor - v_trigger.valor
               END
         WHERE id = v_trigger.id;
        CONTINUE;
      END IF;

      v_cumple := CASE v_trigger.operador
        WHEN 'aumenta_desde_disparo'   THEN NEW.valor >= v_trigger.proximo_disparo
        WHEN 'disminuye_desde_disparo' THEN NEW.valor <= v_trigger.proximo_disparo
      END;

    ELSE
      v_cumple := CASE v_trigger.operador
        WHEN 'mayor'       THEN NEW.valor >  v_trigger.valor
        WHEN 'menor'       THEN NEW.valor <  v_trigger.valor
        WHEN 'mayor_igual' THEN NEW.valor >= v_trigger.valor
        WHEN 'menor_igual' THEN NEW.valor <= v_trigger.valor
        WHEN 'igual'       THEN NEW.valor  = v_trigger.valor
        WHEN 'distinto'    THEN NEW.valor <> v_trigger.valor
        WHEN 'entre'       THEN NEW.valor >= v_trigger.valor
                            AND NEW.valor <= v_trigger.valor_hasta
      END;
    END IF;

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
        WHEN 'mayor'       THEN ult.valor >  v_trigger.valor
        WHEN 'menor'       THEN ult.valor <  v_trigger.valor
        WHEN 'mayor_igual' THEN ult.valor >= v_trigger.valor
        WHEN 'menor_igual' THEN ult.valor <= v_trigger.valor
        WHEN 'igual'       THEN ult.valor  = v_trigger.valor
        WHEN 'distinto'    THEN ult.valor <> v_trigger.valor
        WHEN 'entre'       THEN ult.valor >= v_trigger.valor
                            AND ult.valor <= v_trigger.valor_hasta
        -- Los de delta no entran acá: 'lecturas_multiples' pregunta cuántas de
        -- las últimas N cumplen un umbral, y un delta no es una propiedad de una
        -- lectura suelta. El constructor no deja combinarlos; si una fila vieja
        -- lo tuviera, ninguna cumple y la regla no dispara.
        ELSE false
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

    -- ── Condiciones ──────────────────────────────────────────────────────
    -- El disparador ya dijo que sí; acá se pregunta si además corresponde.
    --
    -- ANTES de las acciones y no dentro del loop: las condiciones cuelgan de la
    -- automatización, no de la acción, así que evaluarlas por acción repetiría
    -- las mismas consultas N veces y escribiría N filas idénticas en el
    -- historial. Igual que el gate de plan, que ya se resuelve una sola vez.
    --
    -- El activo es el que van a tocar las acciones: manda el de la config de la
    -- primera y si no hay, el del medidor. Los dos tipos implementados leen
    -- `config->>'activo_id'` con ese mismo respaldo, así que la precedencia
    -- coincide, y tiene que coincidir: preguntar por el estado de un activo
    -- distinto del que va a recibir la acción respondería otra pregunta.
    --
    -- El cast va dentro del bloque porque un uuid mal escrito en
    -- config->>'activo_id' hace RAISE, y esto corre dentro de la transacción de
    -- quien insertó la lectura: sin protección, una condición mal configurada
    -- abortaría el INSERT de las 500 lecturas del envío. Mismo criterio que el
    -- bloque de creación de la OT.
    BEGIN
      SELECT COALESCE((a.config->>'activo_id')::uuid, v_medidor.activo_id)
        INTO v_activo_ot
        FROM public.automatizacion_acciones a
       WHERE a.automatizacion_id = v_trigger.auto_id
       ORDER BY a.orden, a.id
       LIMIT 1;
      v_activo_ot := COALESCE(v_activo_ot, v_medidor.activo_id);

      v_bloqueo := public.fn_automatizacion_condiciones_bloqueo(
        v_trigger.auto_id, v_activo_ot, NEW.ts);
    EXCEPTION WHEN OTHERS THEN
      v_bloqueo := 'No se pudieron evaluar las condiciones: ' || SQLERRM;
    END;

    IF v_bloqueo IS NOT NULL THEN
      -- Una fila por automatización bloqueada, sin accion_id: no se llegó a
      -- elegir acción. El latch de 'una_lectura_reset' NO se baja, igual que con
      -- los frenos: la condición sigue pendiente y la próxima lectura la vuelve
      -- a evaluar.
      INSERT INTO public.automatizacion_ejecuciones
        (automatizacion_id, lectura_id, resultado, detalle, valor)
      VALUES (v_trigger.auto_id, NEW.id, 'omitida', v_bloqueo, NEW.valor);
      CONTINUE;
    END IF;

    -- ── Acciones ────────────────────────────────────────────────────────────
    v_ejecuto := false;

    FOR v_accion IN
      SELECT * FROM public.automatizacion_acciones
       WHERE automatizacion_id = v_trigger.auto_id
       ORDER BY orden, id
    LOOP
      -- Implementadas: crear_ot y cambiar_estado_activo. Las otras dos quedan
      -- registradas para que la ficha diga por qué no pasó nada, en vez de
      -- quedar muda.
      IF v_accion.tipo NOT IN ('crear_ot','cambiar_estado_activo') THEN
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
      -- Solo aplica a crear_ot: un cambio de estado no deja una OT que pueda
      -- quedar abierta, así que para esa acción el freno no significa nada.
      IF v_accion.solo_si_anterior_cerrada AND v_accion.tipo = 'crear_ot' THEN
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

      -- ── Cambiar el estado del activo ────────────────────────────
      -- El activo sale de la config si el usuario eligió uno; si no, el del
      -- medidor que disparó, que es el "Auto-asignar el activo que disparó"
      -- de la UI. Misma precedencia que en crear_ot.
      IF v_accion.tipo = 'cambiar_estado_activo' THEN
        BEGIN
          v_estado_err := public.fn_automatizacion_cambiar_estado(
            COALESCE((v_accion.config->>'activo_id')::uuid, v_medidor.activo_id),
            v_medidor.workspace_id,
            v_accion.config->>'estado',
            NULLIF(v_accion.config->>'tipo_inactividad', ''),
            NULLIF(v_accion.config->>'motivo_id', '')::uuid,
            v_accion.config->>'notas',
            v_trigger.auto_creado_por);
        EXCEPTION WHEN OTHERS THEN
          -- Un uuid mal escrito en la config hace RAISE en el cast, antes de
          -- entrar a la función. Mismo aislamiento que en crear_ot: una acción
          -- mal configurada no puede abortar el INSERT de la lectura.
          v_estado_err := 'No se pudo cambiar el estado: ' || SQLERRM;
        END;

        IF v_estado_err IS NOT NULL THEN
          -- 'omitida' y no 'fallida': casi todos los motivos de v_estado_err son
          -- situaciones normales ("ya estaba en ese estado"), no averías.
          INSERT INTO public.automatizacion_ejecuciones
            (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
          VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                  v_estado_err, NEW.valor);
          CONTINUE;
        END IF;

        INSERT INTO public.automatizacion_ejecuciones
          (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
        VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'ejecutada',
                format('El activo quedó %s.', v_accion.config->>'estado'), NEW.valor);

        IF v_trigger.modo = 'una_lectura_reset' THEN
          UPDATE public.automatizacion_triggers SET armado = false WHERE id = v_trigger.id;
        END IF;

        -- El objetivo acumulado avanza recién acá, con el disparo hecho: si un
        -- freno cortó antes, el kilometraje sigue pendiente y la próxima lectura
        -- lo vuelve a evaluar.
        --
        -- Se avanza HASTA PASAR la lectura actual, no un solo paso: un camión que
        -- estuvo un mes sin reportar puede llegar con 12.000 km de golpe sobre un
        -- objetivo de "cada 5.000", y sumar 5.000 una vez dejaría el objetivo
        -- todavía por debajo de la lectura, disparando otra vez con la siguiente.
        -- El servicio que no se hizo no se recupera abriendo tres OT.
        IF v_trigger.operador = 'aumenta_desde_disparo' THEN
          UPDATE public.automatizacion_triggers
             SET proximo_disparo = v_trigger.proximo_disparo
               + v_trigger.valor * ceil((NEW.valor - v_trigger.proximo_disparo + 1) / v_trigger.valor)
           WHERE id = v_trigger.id;
        ELSIF v_trigger.operador = 'disminuye_desde_disparo' THEN
          UPDATE public.automatizacion_triggers
             SET proximo_disparo = v_trigger.proximo_disparo
               - v_trigger.valor * ceil((v_trigger.proximo_disparo - NEW.valor + 1) / v_trigger.valor)
           WHERE id = v_trigger.id;
        END IF;

        v_ejecuto := true;
        CONTINUE;
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

        -- El objetivo acumulado avanza recién acá, con el disparo hecho: si un
        -- freno cortó antes, el kilometraje sigue pendiente y la próxima lectura
        -- lo vuelve a evaluar.
        --
        -- Se avanza HASTA PASAR la lectura actual, no un solo paso: un camión que
        -- estuvo un mes sin reportar puede llegar con 12.000 km de golpe sobre un
        -- objetivo de "cada 5.000", y sumar 5.000 una vez dejaría el objetivo
        -- todavía por debajo de la lectura, disparando otra vez con la siguiente.
        -- El servicio que no se hizo no se recupera abriendo tres OT.
        IF v_trigger.operador = 'aumenta_desde_disparo' THEN
          UPDATE public.automatizacion_triggers
             SET proximo_disparo = v_trigger.proximo_disparo
               + v_trigger.valor * ceil((NEW.valor - v_trigger.proximo_disparo + 1) / v_trigger.valor)
           WHERE id = v_trigger.id;
        ELSIF v_trigger.operador = 'disminuye_desde_disparo' THEN
          UPDATE public.automatizacion_triggers
             SET proximo_disparo = v_trigger.proximo_disparo
               - v_trigger.valor * ceil((v_trigger.proximo_disparo - NEW.valor + 1) / v_trigger.valor)
           WHERE id = v_trigger.id;
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

