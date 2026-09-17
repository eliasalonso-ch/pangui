-- Restaura fn_medidor_lectura_critica y su trigger tras el motor de automatizaciones.
--
-- QUÉ PASÓ: 20260914110000 (automatizaciones_motor) se diseñó el 2026-09-13
-- contra una base donde fn_medidor_lectura_critica era el disparo soldado viejo
-- —umbral crítico e intervalo de uso, sin configuración— y lo eliminaba a
-- propósito para no tener dos motores abriendo OT por la misma lectura.
--
-- Entre el diseño y la aplicación, 20260914210000 (medidores_alertas) REDEFINIÓ
-- esa misma función: notificar al cruzar advertencia/alarma con histéresis del
-- 5%, guardando el nivel en medidores.nivel_actual. Al aplicarse el motor en
-- producción, la borró junto con su trigger y puso en NULL los umbrales de los
-- 7 medidores manuales que esa función lee.
--
-- Esta migración deshace ese daño. El archivo del motor ya fue corregido para no
-- volver a borrarla, así que un replay limpio no necesitaría esto; existe para
-- las bases donde el motor alcanzó a aplicarse con la versión destructiva.
--
-- POR QUÉ CONVIVEN: son dos cosas sobre el mismo evento.
--   fn_medidor_lectura_critica -> umbrales fijos en el medidor: AVISA (y abre OT
--                                 en la transición a alarma), con histéresis.
--   fn_automatizacion_lectura  -> reglas configurables: abre la OT que el
--                                 usuario definió, con sus propios frenos.
-- Cada una en su trigger.

-- El cuerpo es idéntico a 20260914210000_medidores_alertas.sql.
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

-- El trigger también se restaura: 20260914210000 solo hacía CREATE OR REPLACE
-- FUNCTION y reutilizaba el trigger existente, así que al borrarlo el motor dejó
-- la función sin quién la llamara.
DROP TRIGGER IF EXISTS trg_medidor_lectura_critica ON public.medidor_lecturas;
CREATE TRIGGER trg_medidor_lectura_critica
  AFTER INSERT ON public.medidor_lecturas
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_medidor_lectura_critica();

-- ── Umbrales de los medidores manuales ──────────────────────────────────────
-- El motor los puso en NULL partiendo del supuesto de que los umbrales manuales
-- se retiraban. Con las alertas vivas ese supuesto no vale: son justamente lo
-- que la función de arriba lee. Valores capturados en producción el 2026-09-17
-- antes de aplicar el motor.
--
-- Guardado con WHERE por id y no un backfill genérico porque son datos, no
-- esquema: en una base que nunca sufrió el borrado estos UPDATE no encuentran
-- nada y no hacen daño.
UPDATE public.medidores SET advertencia = 2,   critico = 3,   intervalo_ot = NULL, ultimo_disparo_ot = NULL WHERE id = 'cec0ac8f-78d2-4532-93a5-7df1fd1d9d33' AND critico IS NULL;
UPDATE public.medidores SET advertencia = 0.2, critico = 0.4, intervalo_ot = NULL, ultimo_disparo_ot = NULL WHERE id = '5c13f14b-fc8f-42a9-876f-eecebeb139d0' AND critico IS NULL;
UPDATE public.medidores SET advertencia = 10,  critico = 12,  intervalo_ot = 12,   ultimo_disparo_ot = 12   WHERE id = 'a499e054-4754-40e0-853e-872e2ddb4dea' AND critico IS NULL;
UPDATE public.medidores SET advertencia = 70,  critico = 85,  intervalo_ot = NULL, ultimo_disparo_ot = NULL WHERE id = 'c1219dbf-2a25-4259-9a10-5f4486abc0ae' AND critico IS NULL;
UPDATE public.medidores SET advertencia = 2,   critico = 3,   intervalo_ot = NULL, ultimo_disparo_ot = NULL WHERE id = '9dc0eab1-acc2-467c-9cc0-ffc65125febb' AND critico IS NULL;
UPDATE public.medidores SET advertencia = 3,   critico = 5,   intervalo_ot = NULL, ultimo_disparo_ot = NULL WHERE id = '68c6a2e7-5caf-4c1b-9959-3186e845aeda' AND critico IS NULL;
UPDATE public.medidores SET advertencia = 300, critico = 500, intervalo_ot = NULL, ultimo_disparo_ot = NULL WHERE id = 'cc08a83d-bcde-4e2a-9bf3-bad958f76c63' AND critico IS NULL;
