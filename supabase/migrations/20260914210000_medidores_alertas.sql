-- Alertas de medidor: notificar al cruzar advertencia/alarma, una sola vez.
--
-- Lo que faltaba: `medidores.advertencia` existía desde 20260911200000 y no hacía
-- absolutamente nada salvo pintar una línea en el gráfico. Y el umbral crítico
-- abría una OT pero no avisaba a nadie — el usuario se enteraba si entraba a la
-- bandeja.
--
-- ── Por qué hace falta guardar un estado ────────────────────────────────────
-- "Notificar cuando supera el umbral, una sola vez mientras se mantenga arriba"
-- no se puede decidir mirando solo la lectura nueva: hay que saber si el medidor
-- YA estaba arriba. Comparar contra la lectura inmediatamente anterior tampoco
-- sirve — con un gateway que publica cada 5 segundos, un sensor que oscila entre
-- 11.9 y 12.1 A cruza el umbral decenas de veces por hora y cada cruce sería una
-- notificación. Eso es exactamente el flapping que hay que evitar.
--
-- ── Histéresis, no ventana de tiempo ────────────────────────────────────────
-- Para ENTRAR a un nivel basta cruzar el umbral. Para SALIR hay que bajar al 95%
-- de ese umbral:
--
--   advertencia >= 10 A  ->  rearma bajo 9.5 A
--   alarma      >= 12 A  ->  rearma bajo 11.4 A
--
-- Un silencio por minutos habría sido igual de corto de escribir, pero se come
-- un evento real nuevo dentro de la ventana. La histéresis solo se come el ruido
-- alrededor del umbral, que es el ruido que molesta.
--
-- ponytail: el 5% es constante, no columna. Es un valor que nadie sabe elegir
-- mejor que un default razonable, y hacerlo configurable agrega un campo al
-- formulario, validación contra los dos umbrales y una migración. Si algún
-- cliente con un sensor muy ruidoso lo pide, se sube a columna con default 0.05.

-- ── El estado ───────────────────────────────────────────────────────────────
-- NULL = el medidor está normal (o nunca se evaluó). Es el único estado que hay
-- que recordar: con el nivel actual y la lectura nueva se decide todo.
ALTER TABLE public.medidores
  ADD COLUMN IF NOT EXISTS nivel_actual text;

ALTER TABLE public.medidores
  DROP CONSTRAINT IF EXISTS medidores_nivel_actual_valido;

ALTER TABLE public.medidores
  ADD CONSTRAINT medidores_nivel_actual_valido
  CHECK (nivel_actual IS NULL OR nivel_actual IN ('advertencia','alarma'));

COMMENT ON COLUMN public.medidores.nivel_actual IS
  'Nivel en el que está el medidor según la última lectura, con histéresis del 5%. NULL = normal. Lo escribe fn_medidor_lectura_critica; no se edita a mano.';

-- ── El disparo ──────────────────────────────────────────────────────────────
-- Se reemplaza la función entera (misma decisión que 20260913120000): las reglas
-- miran la misma fila recién insertada y tienen que decidirse juntas.
CREATE OR REPLACE FUNCTION public.fn_medidor_lectura_critica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  -- Fracción del umbral a la que hay que bajar para considerar que el medidor
  -- salió del nivel. 0.95 = tiene que bajar un 5% por debajo del umbral.
  c_histeresis constant numeric := 0.95;

  v_medidor record;
  v_abierta uuid;
  v_numero  integer;
  v_titulo  text;
  v_desc    text;
  v_tipo    text;
  v_prio    text;
  v_base    numeric;

  v_nivel_previo text;
  v_nivel_nuevo  text;
  v_subio        boolean;
  v_valor_txt    text;
BEGIN
  SELECT id, nombre, unidad, activo_id, ubicacion_id, advertencia, critico,
         intervalo_ot, ultimo_disparo_ot, nivel_actual, creado_por, workspace_id
    INTO v_medidor
    FROM public.medidores
   WHERE id = NEW.medidor_id;

  v_nivel_previo := v_medidor.nivel_actual;
  v_valor_txt := rtrim(trim(to_char(NEW.valor, 'FM999999990.999')), '.');

  -- ── Nivel que corresponde a esta lectura, con histéresis ─────────────────
  -- De mayor a menor: la alarma gana sobre la advertencia.
  --
  -- La condición de permanencia (`v_nivel_previo = 'alarma' AND valor >= umbral
  -- * 0.95`) es la que impide que 11.9 saque al medidor de alarma habiendo
  -- entrado en 12.1. Sin ella, cada bajada mínima rearmaría el aviso.
  IF v_medidor.critico IS NOT NULL
     AND (NEW.valor >= v_medidor.critico
          OR (v_nivel_previo = 'alarma'
              AND NEW.valor >= v_medidor.critico * c_histeresis)) THEN
    v_nivel_nuevo := 'alarma';

  ELSIF v_medidor.advertencia IS NOT NULL
     AND (NEW.valor >= v_medidor.advertencia
          OR (v_nivel_previo IN ('advertencia','alarma')
              AND NEW.valor >= v_medidor.advertencia * c_histeresis)) THEN
    v_nivel_nuevo := 'advertencia';

  ELSE
    v_nivel_nuevo := NULL;
  END IF;

  -- ¿Subió de nivel? Solo eso notifica. Bajar de alarma a advertencia, o de
  -- advertencia a normal, no molesta a nadie: la condición está mejorando.
  v_subio := (v_nivel_nuevo = 'alarma' AND v_nivel_previo IS DISTINCT FROM 'alarma')
          OR (v_nivel_nuevo = 'advertencia' AND v_nivel_previo IS NULL);

  -- Se persiste SIEMPRE, incluso cuando no se notifica: es lo que permite que la
  -- próxima lectura sepa contra qué comparar. Una salida temprana que se saltara
  -- este UPDATE dejaría el medidor pegado en 'alarma' para siempre.
  IF v_nivel_nuevo IS DISTINCT FROM v_nivel_previo THEN
    UPDATE public.medidores
       SET nivel_actual = v_nivel_nuevo
     WHERE id = NEW.medidor_id;
  END IF;

  -- ── Notificación ─────────────────────────────────────────────────────────
  -- Va antes del corte por `activo_id`: un medidor sin activo no puede abrir OT
  -- (no hay a qué asociarla) pero sí puede avisar, que es justamente el caso del
  -- medidor de consumo de un edificio.
  --
  -- A owners y admins: un medidor no tiene asignados, y el creador puede ser un
  -- integrador que configuró el gateway y no trabaja acá. Se incluye igual por
  -- si el workspace no tiene admins activos y el aviso se perdería en el vacío.
  IF v_subio THEN
    INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
    SELECT DISTINCT u.id,
      CASE WHEN v_nivel_nuevo = 'alarma'
           THEN v_medidor.nombre || ': ALARMA'
           ELSE v_medidor.nombre || ': advertencia' END,
      format(
        '%s %s (umbral de %s: %s %s) el %s.',
        v_valor_txt, v_medidor.unidad,
        CASE WHEN v_nivel_nuevo = 'alarma' THEN 'alarma' ELSE 'advertencia' END,
        rtrim(trim(to_char(
          CASE WHEN v_nivel_nuevo = 'alarma' THEN v_medidor.critico
               ELSE v_medidor.advertencia END,
          'FM999999990.999')), '.'),
        v_medidor.unidad,
        to_char(NEW.ts AT TIME ZONE 'America/Santiago', 'DD/MM/YYYY HH24:MI')
      ),
      'medidor_' || v_nivel_nuevo,
      '/medidores?id=' || v_medidor.id::text
      FROM public.usuarios u
     WHERE u.workspace_id = v_medidor.workspace_id
       AND u.activo
       AND (u.rol IN ('owner','admin') OR u.id = v_medidor.creado_por);
  END IF;

  -- ── OT ───────────────────────────────────────────────────────────────────
  IF v_medidor.activo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Regla 1: alarma. Solo en la TRANSICIÓN, no mientras se mantenga arriba.
  --
  -- Antes se abría por cada lectura >= crítico y lo único que lo frenaba era el
  -- dedupe por OT abierta: si alguien cerraba la OT con el sensor todavía
  -- arriba, la lectura siguiente abría otra. Ahora hay que bajar del 95% y
  -- volver a subir, que es el mismo criterio que la notificación.
  IF v_subio AND v_nivel_nuevo = 'alarma' THEN
    v_titulo := v_medidor.nombre || ' en nivel crítico';
    v_desc := format(
      'Lectura de %s: %s %s (umbral crítico: %s %s) el %s.',
      v_medidor.nombre,
      v_valor_txt, v_medidor.unidad,
      rtrim(trim(to_char(v_medidor.critico, 'FM999999990.999')), '.'), v_medidor.unidad,
      to_char(NEW.ts AT TIME ZONE 'America/Santiago', 'DD/MM/YYYY HH24:MI')
    );
    v_tipo := 'emergencia';
    v_prio := 'alta';

  -- Regla 2: intervalo de uso acumulado. Sin cambios respecto a 20260913120000.
  ELSIF v_medidor.intervalo_ot IS NOT NULL THEN
    v_base := COALESCE(v_medidor.ultimo_disparo_ot, 0);

    IF NEW.valor - v_base < v_medidor.intervalo_ot THEN
      RETURN NEW;
    END IF;

    v_titulo := 'Mantenimiento por uso · ' || v_medidor.nombre;
    v_desc := format(
      'El medidor %s marca %s %s. Corresponde el mantenimiento cada %s %s (último a las %s %s).',
      v_medidor.nombre,
      v_valor_txt, v_medidor.unidad,
      rtrim(trim(to_char(v_medidor.intervalo_ot, 'FM999999990.999')), '.'), v_medidor.unidad,
      rtrim(trim(to_char(v_base, 'FM999999990.999')), '.'), v_medidor.unidad
    );
    v_tipo := 'preventiva';
    v_prio := 'media';

  ELSE
    RETURN NEW;
  END IF;

  -- Dedupe: segunda red. La histéresis ya evita el caso normal, pero esto cubre
  -- el medidor que baja del rearme y vuelve a subir con la OT anterior todavía
  -- sin atender.
  SELECT o.id INTO v_abierta
    FROM public.ordenes_trabajo o
   WHERE o.medidor_id = NEW.medidor_id
     AND o.estado NOT IN ('completado','cancelado')
   LIMIT 1;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
    FROM public.ordenes_trabajo
   WHERE workspace_id = v_medidor.workspace_id;

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, estado, prioridad,
    activo_id, ubicacion_id, medidor_id, numero, origen
  ) VALUES (
    v_medidor.workspace_id,
    v_medidor.creado_por,
    v_titulo,
    v_desc,
    'solicitud',
    v_tipo,
    'pendiente',
    v_prio,
    v_medidor.activo_id,
    v_medidor.ubicacion_id,
    NEW.medidor_id,
    v_numero,
    'medidor'
  );

  IF v_tipo = 'preventiva' THEN
    UPDATE public.medidores
       SET ultimo_disparo_ot = NEW.valor
     WHERE id = NEW.medidor_id;
  END IF;

  RETURN NEW;
END;
$$;
