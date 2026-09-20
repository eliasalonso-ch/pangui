-- Condiciones: el paso "Sólo si además…" del constructor, que hasta acá estaba
-- dibujado con el botón bajo llave.
--
-- Un disparador dice CUÁNDO mirar (llegó una lectura y cruzó un valor). Una
-- condición dice SI ADEMÁS corresponde actuar. Son cosas distintas y por eso no
-- son más filas de `automatizacion_triggers`: el disparador se evalúa contra la
-- lectura que entra, la condición contra el estado del mundo en ese instante.
--
-- POR QUÉ SE EVALÚAN EN EL MISMO TRIGGER:
-- Por lo mismo que el motor es un trigger y no la API (ver 20260914110000): la
-- lectura entra por tres caminos. Una condición que viviera en la API dejaría
-- pasar todo lo que llega por la cola offline del móvil.
--
-- QUÉ NO ES ESTO:
-- No es un programador. `ventana_horaria` filtra QUÉ LECTURAS cuentan, no
-- despierta a nadie a las 22:00. "Revisa todos los lunes a las 22:00 aunque no
-- haya lecturas" es pg_cron, al lado de preventivos-cron, y es otra función.

CREATE TABLE IF NOT EXISTS public.automatizacion_condiciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automatizacion_id uuid NOT NULL REFERENCES public.automatizaciones(id) ON DELETE CASCADE,

  tipo              text NOT NULL CHECK (tipo IN
                    ('estado_activo','ventana_horaria','sin_ot_abierta_en_activo','criticidad_activo')),

  -- jsonb por el mismo motivo que en `automatizacion_acciones`: cada tipo lleva
  -- campos distintos (una lista de estados, dos horas y siete días, nada) y una
  -- columna por campo dejaría la tabla 80% NULL.
  --
  --   estado_activo             {"estados": ["mantencion","fuera_servicio"]}
  --   ventana_horaria           {"desde":"22:00","hasta":"06:00","dias":[1,2,3,4,5]}
  --   sin_ot_abierta_en_activo  {}
  --   criticidad_activo         {"criticidades": ["critico","semi_critico"]}
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- La misma condición al revés, sin duplicar el tipo.
  --
  -- Es lo que hace útil a `estado_activo`: el caso que de verdad duele no es
  -- "actúa si está operativo" sino "NO actúes si ya está en mantención", que es
  -- el que hoy llena de OT duplicadas una máquina que ya está intervenida.
  negado            boolean NOT NULL DEFAULT false,

  orden             integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_automatizacion_condiciones_auto
  ON public.automatizacion_condiciones (automatizacion_id, orden);

ALTER TABLE public.automatizacion_condiciones ENABLE ROW LEVEL SECURITY;

-- Misma forma que triggers y acciones: el workspace se resuelve por el padre,
-- no se denormaliza, para que un hijo no pueda quedar en otro workspace.
DROP POLICY IF EXISTS automatizacion_condiciones_all ON public.automatizacion_condiciones;
CREATE POLICY automatizacion_condiciones_all ON public.automatizacion_condiciones
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.automatizaciones a
     WHERE a.id = automatizacion_id AND a.workspace_id = my_workspace_id()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.automatizaciones a
     WHERE a.id = automatizacion_id AND a.workspace_id = my_workspace_id()
  ));

-- El índice que pide `sin_ot_abierta_en_activo`: OT abiertas de un activo.
-- El que ya existe es por `automatizacion_id`, que es justo el que NO sirve acá
-- —la gracia de esta condición es mirar las OT de cualquier origen.
CREATE INDEX IF NOT EXISTS idx_ordenes_activo_abiertas
  ON public.ordenes_trabajo (activo_id)
  WHERE activo_id IS NOT NULL AND estado NOT IN ('completado','cancelado');

-- ── El evaluador ────────────────────────────────────────────────────────────
-- Devuelve NULL si todas las condiciones se cumplen, o la frase que explica cuál
-- bloqueó. Frase y no booleano: el historial existe para responder "¿por qué no
-- pasó nada?", y un `false` no responde eso.
--
-- Función aparte y no un bloque dentro del motor: el motor ya tiene 300 líneas y
-- este pedazo se prueba solo, con un INSERT y una llamada.
CREATE OR REPLACE FUNCTION public.fn_automatizacion_condiciones_bloqueo(
  p_automatizacion_id uuid,
  p_activo_id         uuid,
  p_ts                timestamptz
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_cond    record;
  v_cumple  boolean;
  v_estado  text;
  v_crit    text;
  v_local   timestamp;
  v_hhmm    text;
  v_dia     integer;
  v_desde   text;
  v_hasta   text;
  v_dias    jsonb;
  v_ot      uuid;
  v_texto   text;
BEGIN
  FOR v_cond IN
    SELECT * FROM public.automatizacion_condiciones
     WHERE automatizacion_id = p_automatizacion_id
     ORDER BY orden, id
  LOOP
    v_texto := NULL;

    IF v_cond.tipo = 'estado_activo' THEN
      -- Sin activo no hay estado que mirar. La condición no puede cumplirse, y
      -- decirlo es mejor que dejarla pasar callada: una regla sobre un medidor
      -- suelto con una condición de activo está mal configurada.
      IF p_activo_id IS NULL THEN
        RETURN 'La condición mira el estado del activo, pero ni el medidor ni la acción tienen uno.';
      END IF;
      -- El período abierto ES el estado actual: hay un índice único parcial que
      -- garantiza que no hay dos. Sin período abierto se asume 'operativo', que
      -- es el default que usa el resto de la app.
      SELECT estado INTO v_estado
        FROM public.activo_estado_periodos
       WHERE activo_id = p_activo_id AND fin IS NULL
       LIMIT 1;
      v_estado := COALESCE(v_estado, 'operativo');

      v_cumple := v_cond.config->'estados' ? v_estado;
      v_texto  := format('El activo está %s.', v_estado);

    ELSIF v_cond.tipo = 'criticidad_activo' THEN
      IF p_activo_id IS NULL THEN
        RETURN 'La condición mira la criticidad del activo, pero ni el medidor ni la acción tienen uno.';
      END IF;
      SELECT criticidad INTO v_crit FROM public.activos WHERE id = p_activo_id;
      -- Un activo sin criticidad cargada no pertenece a ninguna lista: la regla
      -- no actúa y el historial dice por qué, en vez de tratarlo como crítico.
      v_cumple := v_crit IS NOT NULL AND v_cond.config->'criticidades' ? v_crit;
      v_texto  := CASE WHEN v_crit IS NULL
                       THEN 'El activo no tiene criticidad cargada.'
                       ELSE format('La criticidad del activo es %s.', v_crit) END;

    ELSIF v_cond.tipo = 'sin_ot_abierta_en_activo' THEN
      IF p_activo_id IS NULL THEN
        RETURN 'La condición mira las órdenes abiertas del activo, pero ni el medidor ni la acción tienen uno.';
      END IF;
      SELECT o.id INTO v_ot
        FROM public.ordenes_trabajo o
       WHERE o.activo_id = p_activo_id
         AND o.estado NOT IN ('completado','cancelado')
       LIMIT 1;
      -- Se cumple cuando NO hay ninguna abierta: el nombre de la condición es
      -- la afirmación, y `negado` la da vuelta como en las demás.
      v_cumple := v_ot IS NULL;
      v_texto  := 'El activo ya tiene una orden de trabajo abierta.';

    ELSIF v_cond.tipo = 'ventana_horaria' THEN
      -- En hora local y no UTC: "entre las 22:00 y las 06:00" es una frase sobre
      -- el reloj de la planta. Con `ts` en UTC la ventana se corre una hora cada
      -- cambio de horario, que es justo cuando nadie lo está mirando.
      v_local := p_ts AT TIME ZONE 'America/Santiago';
      v_hhmm  := to_char(v_local, 'HH24:MI');
      -- ISODOW: lunes=1 … domingo=7. Se elige sobre DOW porque el domingo=0 de
      -- DOW obliga a un caso especial en la UI y en el JSON.
      v_dia   := EXTRACT(ISODOW FROM v_local)::integer;

      v_desde := COALESCE(v_cond.config->>'desde', '00:00');
      v_hasta := COALESCE(v_cond.config->>'hasta', '23:59');
      v_dias  := COALESCE(v_cond.config->'dias', '[]'::jsonb);

      v_cumple :=
        (jsonb_array_length(v_dias) = 0 OR v_dias ? v_dia::text)
        AND CASE
          -- Ventana que cruza la medianoche (22:00 → 06:00): es O, no Y. Sin
          -- esta rama, el turno de noche —el caso que más se pide— no matchea
          -- nunca, porque no hay hora que sea a la vez >= 22:00 y <= 06:00.
          WHEN v_desde > v_hasta THEN v_hhmm >= v_desde OR v_hhmm <= v_hasta
          ELSE v_hhmm >= v_desde AND v_hhmm <= v_hasta
        END;

      v_texto := format('La lectura es del %s a las %s, fuera de la ventana configurada.',
                        CASE v_dia WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
                                   WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' WHEN 6 THEN 'sábado'
                                   ELSE 'domingo' END,
                        v_hhmm);
    ELSE
      -- Tipo desconocido: la tabla podría tener una fila escrita por una versión
      -- más nueva. Se bloquea en vez de ignorarla, porque ignorar una condición
      -- que el usuario escribió es actuar cuando no correspondía.
      RETURN format('La condición "%s" no la entiende esta versión.', v_cond.tipo);
    END IF;

    IF v_cond.negado THEN
      v_cumple := NOT v_cumple;
      -- Negada, la frase de arriba explica por qué la condición NO se cumplía,
      -- así que usarla para explicar el bloqueo diría justo lo contrario de lo
      -- que pasó. Se arma la frase de la condición invertida, y en castellano:
      -- el `tipo` crudo ('estado_activo') no es texto para mostrarle a nadie.
      v_texto := CASE v_cond.tipo
        WHEN 'estado_activo' THEN
          format('El activo está %s, que es uno de los estados excluidos.', v_estado)
        WHEN 'criticidad_activo' THEN
          format('La criticidad del activo es %s, que es una de las excluidas.',
                 COALESCE(v_crit, 'desconocida'))
        WHEN 'sin_ot_abierta_en_activo' THEN
          'El activo no tiene ninguna orden de trabajo abierta.'
        WHEN 'ventana_horaria' THEN
          format('La lectura es de las %s, dentro de la ventana excluida.', v_hhmm)
      END;
    END IF;

    IF NOT v_cumple THEN
      RETURN v_texto;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

-- ── El motor, con el gate de condiciones ────────────────────────────────────
-- Se redefine entera (CREATE OR REPLACE) en vez de parchearla: una función
-- plpgsql no se edita por pedazos. El cuerpo es el de 20260914110000 con dos
-- variables nuevas y el bloque "Condiciones" antes del loop de acciones; el
-- resto —gate de plan, modos, los dos frenos, creación de la OT— no cambia.
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

    -- ── Condiciones ──────────────────────────────────────────────────────
    -- El disparador ya dijo que sí; acá se pregunta si además corresponde.
    --
    -- ANTES de las acciones y no dentro del loop: las condiciones cuelgan de la
    -- automatización, no de la acción, así que evaluarlas por acción repetiría
    -- las mismas consultas N veces y escribiría N filas idénticas en el
    -- historial. Igual que el gate de plan, que ya se resuelve una sola vez.
    --
    -- El activo es el que tendría la OT: manda el de la config de la primera
    -- acción y si no hay, el del medidor. Es la misma precedencia del INSERT de
    -- más abajo, y tiene que serlo: preguntar por el estado de un activo
    -- distinto del que va a recibir la orden respondería otra pregunta.
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

