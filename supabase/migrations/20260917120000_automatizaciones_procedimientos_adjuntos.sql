-- Automatizaciones: procedimientos y adjuntos en la OT generada.
--
-- QUÉ FALTABA:
-- El motor leía nueve claves del `config` (titulo, descripcion, tipo_trabajo,
-- prioridad, activo_id, ubicacion_id, asignados_ids, categoria_ids y
-- tiempo_estimado) y nada más. El constructor ya podía guardar procedimientos y
-- adjuntos en el config, pero el trigger los ignoraba en silencio: la OT se
-- abría sin el procedimiento y parecía un bug del picker.
--
-- POR QUÉ ACÁ Y NO EN EL CLIENTE:
-- La OT la crea este trigger dentro de la transacción de la lectura. No hay
-- cliente escuchando —la lectura puede entrar por la cola offline del móvil o
-- por /api/medidores/lecturas con service role—, así que las filas hijas tienen
-- que escribirse en el mismo lugar o no las escribe nadie.
--
-- IMÁGENES COMO REFERENCIA:
-- Las imágenes del config no van a `links` sino a un álbum de fotos de tipo
-- 'referencia'. Nunca 'evidencia': el cierre de la OT exige evidencia
-- (foto_grupos.tipo = 'evidencia'), y estas fotos son material que la regla le
-- da al técnico antes de trabajar, no prueba del trabajo hecho.
--
-- POR QUÉ LOS ARCHIVOS NO SE COPIAN:
-- `links` guarda URLs de R2. El archivo se sube una vez, al guardar la
-- automatización, y cada OT generada apunta al mismo objeto. Copiar el binario
-- por ejecución multiplicaría el almacenamiento sin que nadie lo pidiera: el
-- manual adjunto a la regla es el mismo manual en las 200 OT que abra.
--
-- El resto del cuerpo es idéntico al de 20260914110000: plpgsql no se parchea
-- por partes, así que se reemplaza entero.

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
  v_grupo      uuid;
  v_links      jsonb;
  v_imgs       jsonb;
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

        -- ── Procedimientos ────────────────────────────────────────────────
        -- `config.procedimiento_ids` es un array de uuids. Se insertan las
        -- filas hijas que la UI de creación manual crea con attachProcedimiento,
        -- porque acá no hay cliente que las cree: cuando el trigger termina, la
        -- OT ya está y nadie más la va a tocar.
        --
        -- `adjuntado_por` es el autor de la automatización, el mismo criterio
        -- que `creado_por` de la OT: es el responsable más honesto que se puede
        -- afirmar sin inventar un usuario de sistema.
        --
        -- ON CONFLICT DO NOTHING por el UNIQUE (orden_id, procedimiento_id): un
        -- id repetido en el config no puede hacer fallar la creación entera.
        -- El JOIN contra `procedimientos` descarta los que ya no existen o son
        -- de otro workspace; sin él, un procedimiento borrado después de
        -- configurar la regla haría RAISE por la foreign key y la OT entera se
        -- registraría como fallida.
        IF v_accion.config ? 'procedimiento_ids' THEN
          INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id, adjuntado_por)
          SELECT v_orden, p.id, v_trigger.auto_creado_por
            FROM jsonb_array_elements_text(v_accion.config->'procedimiento_ids') AS t(pid)
            JOIN public.procedimientos p
              ON p.id = t.pid::uuid
             AND p.workspace_id = v_medidor.workspace_id
             AND p.activo
          ON CONFLICT (orden_id, procedimiento_id) DO NOTHING;
        END IF;

        -- ── Adjuntos (los que NO son imagen) ──────────────────────────────
        -- `config.links` ya viene con la forma de `ordenes_trabajo.links`
        -- ({url, nombre, tipo, origen}), porque los archivos se suben UNA vez
        -- al guardar la automatización y no por cada OT: el archivo es de la
        -- regla, no de la ejecución. Cada OT generada hereda la referencia.
        --
        -- Se escribe con UPDATE y no en el INSERT de arriba para no tocar esa
        -- lista de columnas: este bloque es aditivo y si falla queda aislado
        -- igual que el resto, dentro del mismo EXCEPTION.
        SELECT COALESCE(jsonb_agg(l), '[]'::jsonb)
          INTO v_links
          FROM jsonb_array_elements(COALESCE(v_accion.config->'links', '[]'::jsonb)) AS l
         WHERE l->>'url' !~* '\.(png|jpe?g|webp|gif|avif|heic)$';

        IF jsonb_array_length(v_links) > 0 THEN
          UPDATE public.ordenes_trabajo SET links = v_links WHERE id = v_orden;
        END IF;

        -- ── Imágenes: álbum de REFERENCIA ────────────────────────────────
        -- No van a `links` sino a un álbum, que es donde la ficha de la OT
        -- muestra fotos; en `links` aparecían como un archivo más en la lista
        -- de adjuntos y la galería quedaba vacía.
        --
        -- 'referencia' y NO 'evidencia', a propósito: la evidencia es la prueba
        -- del trabajo hecho y el cierre la exige (el gate cuenta
        -- foto_grupos.tipo = 'evidencia'). Estas fotos son material que la regla
        -- le entrega al técnico ANTES de trabajar —dónde queda la válvula, qué
        -- mirar—, así que si contaran como evidencia toda OT automatizada
        -- nacería con su requisito de fotos ya cumplido sin que nadie fotografíe
        -- nada.
        SELECT COALESCE(jsonb_agg(l ORDER BY o), '[]'::jsonb)
          INTO v_imgs
          FROM jsonb_array_elements(COALESCE(v_accion.config->'links', '[]'::jsonb))
               WITH ORDINALITY AS t(l, o)
         WHERE l->>'url' ~* '\.(png|jpe?g|webp|gif|avif|heic)$';

        IF jsonb_array_length(v_imgs) > 0 THEN
          INSERT INTO public.foto_grupos (orden_id, workspace_id, titulo, tipo, created_by)
          VALUES (v_orden, v_medidor.workspace_id, 'Referencia', 'referencia',
                  v_trigger.auto_creado_por)
          RETURNING id INTO v_grupo;

          INSERT INTO public.foto_grupo_items (grupo_id, url, orden_display)
          SELECT v_grupo, t.l->>'url', (t.o - 1)::int
            FROM jsonb_array_elements(v_imgs) WITH ORDINALITY AS t(l, o);
        END IF;

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
