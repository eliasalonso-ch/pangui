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
  v_numero     integer;
  v_orden      uuid;
  v_titulo     text;
  v_desc       text;
  v_es_empresa boolean;
BEGIN
  SELECT id, nombre, unidad, activo_id, ubicacion_id, workspace_id
    INTO v_medidor
    FROM public.medidores
   WHERE id = NEW.medidor_id;

  -- El gate de plan vive acá y no solo en la UI: una automatización creada en
  -- Empresa seguiría corriendo después de bajar de plan, que es exactamente la
  -- clase de cobro fantasma que nadie quiere explicar.
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.workspace_id = v_medidor.workspace_id
       AND s.plan_key = 'enterprise'
       AND s.status IN ('active','trialing','past_due')
  ) INTO v_es_empresa;

  FOR v_trigger IN
    SELECT t.*, a.id AS auto_id, a.creado_por AS auto_creado_por
      FROM public.automatizacion_triggers t
      JOIN public.automatizaciones a ON a.id = t.automatizacion_id
     WHERE t.medidor_id = NEW.medidor_id
       AND a.activa
       AND a.workspace_id = v_medidor.workspace_id
  LOOP
    IF NOT v_es_empresa THEN
      INSERT INTO public.automatizacion_ejecuciones
        (automatizacion_id, lectura_id, resultado, detalle, valor)
      VALUES (v_trigger.auto_id, NEW.id, 'omitida',
              'El plan del espacio no incluye automatizaciones.', NEW.valor);
      CONTINUE;
    END IF;

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
        CONTINUE;  -- ya disparó y la condición nunca se despejó
      END IF;

    ELSIF v_trigger.modo = 'lecturas_multiples' THEN
      IF NOT v_cumple THEN
        CONTINUE;
      END IF;
      -- Las últimas N lecturas del medidor, ESTA incluida, tienen que cumplir
      -- todas. Se cuenta sobre la ventana en vez de llevar un contador: un
      -- contador se desincroniza si alguien borra una lectura.
      SELECT count(*) INTO v_cumplen_n FROM (
        SELECT l.valor
          FROM public.medidor_lecturas l
         WHERE l.medidor_id = NEW.medidor_id
         ORDER BY l.ts DESC
         LIMIT v_trigger.modo_n
      ) ult
      WHERE CASE v_trigger.operador
        WHEN 'mayor_igual' THEN ult.valor >= v_trigger.valor
        WHEN 'menor_igual' THEN ult.valor <= v_trigger.valor
        WHEN 'igual'       THEN ult.valor  = v_trigger.valor
        WHEN 'entre'       THEN ult.valor >= v_trigger.valor
                            AND ult.valor <= v_trigger.valor_hasta
      END;

      IF v_cumplen_n < v_trigger.modo_n THEN
        CONTINUE;
      END IF;

    ELSE  -- 'una_lectura'
      IF NOT v_cumple THEN
        CONTINUE;
      END IF;
    END IF;

    -- ── Acciones ────────────────────────────────────────────────────────────
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
      IF v_accion.retrigger_minutos > 0 THEN
        SELECT max(created_at) INTO v_ultima
          FROM public.automatizacion_ejecuciones
         WHERE accion_id = v_accion.id AND resultado = 'ejecutada';

        IF v_ultima IS NOT NULL
           AND v_ultima > now() - make_interval(mins => v_accion.retrigger_minutos) THEN
          INSERT INTO public.automatizacion_ejecuciones
            (automatizacion_id, accion_id, lectura_id, resultado, detalle, valor)
          VALUES (v_trigger.auto_id, v_accion.id, NEW.id, 'omitida',
                  format('Se ejecutó hace menos de %s minutos.', v_accion.retrigger_minutos),
                  NEW.valor);
          CONTINUE;
        END IF;
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

      SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
        FROM public.ordenes_trabajo
       WHERE workspace_id = v_medidor.workspace_id;

      INSERT INTO public.ordenes_trabajo (
        workspace_id, creado_por, titulo, descripcion,
        tipo, tipo_trabajo, estado, prioridad,
        activo_id, ubicacion_id, medidor_id, automatizacion_id,
        asignados_ids, categoria_ids, tiempo_estimado,
        numero, origen
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
        v_numero,
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
    END LOOP;

    UPDATE public.automatizaciones
       SET ultima_ejecucion_at = now()
     WHERE id = v_trigger.auto_id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_automatizacion_lectura ON public.medidor_lecturas;
CREATE TRIGGER trg_automatizacion_lectura
  AFTER INSERT ON public.medidor_lecturas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_automatizacion_lectura();

-- ── Retirada del motor viejo ────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_medidor_lectura_critica ON public.medidor_lecturas;
DROP FUNCTION IF EXISTS public.fn_medidor_lectura_critica();

-- Los umbrales dejan de existir en los medidores manuales: ahí la vigilancia se
-- configura como automatización. En los automatizados se quedan (el gateway los
-- usa para colorear la serie), por eso las columnas NO se borran.
UPDATE public.medidores
   SET advertencia = NULL, critico = NULL, intervalo_ot = NULL
 WHERE tipo = 'manual'
   AND (advertencia IS NOT NULL OR critico IS NOT NULL OR intervalo_ot IS NOT NULL);
