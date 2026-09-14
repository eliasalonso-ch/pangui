-- Lectura manual: lo que hace que un medidor `manual` sirva de algo.
--
-- Hasta acá el medidor manual se podía crear y no se podía usar: `registrarLectura`
-- existía en lib/medidores-api.ts y no la llamaba nadie. Esta migración agrega las
-- dos cosas que faltaban para cerrar el ciclo — la foto del instrumento y, sobre
-- todo, el disparo por USO acumulado.
--
-- ── Por qué el umbral `critico` no alcanza ──────────────────────────────────
-- `fn_medidor_lectura_critica` compara la lectura contra una línea fija: sirve
-- para una magnitud instantánea (vibró 9 mm/s → está mal ahora). No sirve para un
-- contador acumulado, que es el caso típico del medidor manual: horómetro,
-- odómetro, ciclos. Ahí el número solo sube, así que "≥ 500 h" se cumple una vez
-- y después se cumple para siempre — el dedupe por OT abierta es lo único que
-- impide una OT por lectura, y el mantenimiento de las 750 h no lo pide nadie.
--
-- Lo que el rubro pide (y MaintainX implementa) es "cada N unidades": cada 250
-- horas, cada 10.000 km. Eso no es un umbral, es un módulo — y necesita recordar
-- en qué valor se disparó la última vez, porque el contador no se resetea.

-- ── Foto de la lectura ──────────────────────────────────────────────────────
-- Una sola foto y no una tabla aparte: es la foto DEL instrumento en el momento
-- de leerlo (el display del horómetro, la aguja del manómetro), que es una y
-- respalda ese número. Misma decisión que `comentarios.foto_url`.
ALTER TABLE public.medidor_lecturas
  ADD COLUMN IF NOT EXISTS foto_url text;

COMMENT ON COLUMN public.medidor_lecturas.foto_url IS
  'Foto del instrumento que respalda la lectura. Solo en las manuales; NULL en las de API.';

-- ── Mantenimiento por uso acumulado ─────────────────────────────────────────
ALTER TABLE public.medidores
  ADD COLUMN IF NOT EXISTS intervalo_ot numeric;

-- En qué valor del contador se disparó la última OT por intervalo. NULL = nunca.
--
-- Se guarda el VALOR y no un contador de disparos porque el medidor puede
-- recibir lecturas fuera de orden (un horómetro que se anota al día siguiente) y
-- porque el contador físico se puede reemplazar: si la máquina cambia de
-- horómetro y vuelve a 0, el operador edita esta columna y la cuenta sigue desde
-- ahí sin tener que borrar el historial.
ALTER TABLE public.medidores
  ADD COLUMN IF NOT EXISTS ultimo_disparo_ot numeric;

COMMENT ON COLUMN public.medidores.intervalo_ot IS
  'Cada cuántas unidades acumuladas se abre una OT preventiva (horómetro, odómetro). NULL = sin mantenimiento por uso.';
COMMENT ON COLUMN public.medidores.ultimo_disparo_ot IS
  'Valor del contador en el que se disparó la última OT por intervalo. NULL = todavía ninguna.';

ALTER TABLE public.medidores
  DROP CONSTRAINT IF EXISTS medidores_intervalo_positivo;

ALTER TABLE public.medidores
  ADD CONSTRAINT medidores_intervalo_positivo
  CHECK (intervalo_ot IS NULL OR intervalo_ot > 0);

-- ── El disparo ──────────────────────────────────────────────────────────────
-- Se reemplaza la función entera en vez de agregar un segundo trigger: las dos
-- reglas miran la misma fila recién insertada y una lectura que cruza el crítico
-- Y completa el intervalo no debería abrir dos OTs.
--
-- Orden: primero el crítico (es una emergencia, gana), después el intervalo.
CREATE OR REPLACE FUNCTION public.fn_medidor_lectura_critica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_medidor record;
  v_abierta uuid;
  v_numero  integer;
  v_titulo  text;
  v_desc    text;
  v_tipo    text;
  v_prio    text;
  v_base    numeric;
BEGIN
  SELECT id, nombre, unidad, activo_id, ubicacion_id, advertencia, critico,
         intervalo_ot, ultimo_disparo_ot, creado_por, workspace_id
    INTO v_medidor
    FROM public.medidores
   WHERE id = NEW.medidor_id;

  -- Sin activo no hay a qué asociar la OT, cualquiera sea la regla.
  IF v_medidor.activo_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Regla 1: umbral crítico (magnitud instantánea) ──────────────────────
  IF v_medidor.critico IS NOT NULL AND NEW.valor >= v_medidor.critico THEN
    v_titulo := v_medidor.nombre || ' en nivel crítico';
    v_desc := format(
      'Lectura de %s: %s %s (umbral crítico: %s %s) el %s.',
      v_medidor.nombre,
      rtrim(trim(to_char(NEW.valor, 'FM999999990.999')), '.'), v_medidor.unidad,
      rtrim(trim(to_char(v_medidor.critico, 'FM999999990.999')), '.'), v_medidor.unidad,
      to_char(NEW.ts AT TIME ZONE 'America/Santiago', 'DD/MM/YYYY HH24:MI')
    );
    v_tipo := 'emergencia';
    v_prio := 'alta';

  -- ── Regla 2: intervalo de uso acumulado ─────────────────────────────────
  -- `COALESCE(ultimo_disparo, 0)`: un horómetro que se empieza a registrar en
  -- 1.240 h con intervalo de 250 dispara al tiro, que es lo correcto — esa
  -- máquina ya se pasó del mantenimiento. Después el disparo queda anclado en
  -- 1.240 y el siguiente cae en 1.490, no en 1.250.
  ELSIF v_medidor.intervalo_ot IS NOT NULL THEN
    v_base := COALESCE(v_medidor.ultimo_disparo_ot, 0);

    -- Un contador que baja (se reemplazó el instrumento, o la lectura es de un
    -- medidor que no es acumulativo) no debe disparar nada.
    IF NEW.valor - v_base < v_medidor.intervalo_ot THEN
      RETURN NEW;
    END IF;

    v_titulo := 'Mantenimiento por uso · ' || v_medidor.nombre;
    v_desc := format(
      'El medidor %s marca %s %s. Corresponde el mantenimiento cada %s %s (último a las %s %s).',
      v_medidor.nombre,
      rtrim(trim(to_char(NEW.valor, 'FM999999990.999')), '.'), v_medidor.unidad,
      rtrim(trim(to_char(v_medidor.intervalo_ot, 'FM999999990.999')), '.'), v_medidor.unidad,
      rtrim(trim(to_char(v_base, 'FM999999990.999')), '.'), v_medidor.unidad
    );
    -- Preventiva y no emergencia: el uso llegó al intervalo, la máquina no se
    -- rompió. Es exactamente la diferencia que el cliente quiere ver en el
    -- informe de fin de mes.
    v_tipo := 'preventiva';
    v_prio := 'media';

  ELSE
    RETURN NEW;
  END IF;

  -- Dedupe, común a las dos reglas: mientras siga abierta la OT anterior de
  -- ESTE medidor, no se abre otra.
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

  -- Se ancla el disparo DESPUÉS de insertar y solo en la regla de intervalo: si
  -- el dedupe cortó arriba, el intervalo sigue pendiente y la próxima lectura
  -- con la OT ya cerrada lo vuelve a evaluar.
  IF v_tipo = 'preventiva' THEN
    UPDATE public.medidores
       SET ultimo_disparo_ot = NEW.valor
     WHERE id = NEW.medidor_id;
  END IF;

  RETURN NEW;
END;
$$;
