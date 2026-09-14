-- Test de la histéresis de alertas de medidor (20260914210000_medidores_alertas).
--
-- Corre entero dentro de una transacción que SIEMPRE hace ROLLBACK: crea un
-- medidor de prueba, le mete una secuencia de lecturas y verifica cuántas
-- notificaciones salieron. No deja nada en la base.
--
-- Uso:  psql "$DATABASE_URL" -f scripts/test-medidor-alertas.sql
--
-- Lo que verifica es la única regla no obvia: oscilar alrededor del umbral no
-- puede renotificar, pero bajar de verdad y volver a subir sí.

BEGIN;

DO $test$
DECLARE
  v_ws       uuid;
  v_activo   uuid;
  v_user     uuid;
  v_medidor  uuid;
  v_alarmas  integer;
  v_advs     integer;
  v_nivel    text;
  v_ots      integer;
BEGIN
  -- Se cuelga de un workspace real para no pelear con las FK de usuarios. Tiene
  -- que tener activos: sin activo el medidor no puede abrir OT y medio test no
  -- probaría nada.
  SELECT u.workspace_id, u.id INTO v_ws, v_user
    FROM public.usuarios u
   WHERE u.activo AND u.rol IN ('owner','admin')
     AND EXISTS (SELECT 1 FROM public.activos a WHERE a.workspace_id = u.workspace_id)
   LIMIT 1;

  SELECT id INTO v_activo FROM public.activos WHERE workspace_id = v_ws LIMIT 1;

  IF v_ws IS NULL OR v_activo IS NULL THEN
    RAISE EXCEPTION 'No hay workspace/activo para correr el test';
  END IF;

  INSERT INTO public.medidores
    (workspace_id, nombre, unidad, tipo, advertencia, critico, activo_id, creado_por)
  VALUES
    (v_ws, '__test_histeresis__', 'Amperios', 'manual', 10, 12, v_activo, v_user)
  RETURNING id INTO v_medidor;

  -- Secuencia: normal -> alarma -> oscila -> baja de verdad -> alarma otra vez.
  -- Con alarma en 12, el rearme está en 11.4 (12 * 0.95).
  INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor) VALUES
    (v_medidor, v_ws,  9.0),   -- normal
    (v_medidor, v_ws, 12.1),   -- ENTRA en alarma       -> notifica (1)
    (v_medidor, v_ws, 11.9),   -- baja pero no del 11.4 -> silencio
    (v_medidor, v_ws, 12.1),   -- vuelve a subir        -> silencio (ya estaba)
    (v_medidor, v_ws, 11.5),   -- sigue sin cruzar 11.4 -> silencio
    (v_medidor, v_ws,  9.0),   -- baja de verdad        -> rearma, vuelve a normal
    (v_medidor, v_ws, 12.1);   -- ENTRA de nuevo        -> notifica (2)

  SELECT count(*) INTO v_alarmas
    FROM public.notifications
   WHERE tipo = 'medidor_alarma'
     AND url = '/medidores?id=' || v_medidor::text
     AND usuario_id = v_user;

  ASSERT v_alarmas = 2,
    format('Se esperaban 2 notificaciones de alarma, salieron %s', v_alarmas);

  -- Al pasar por 9.0 tuvo que cruzar hacia abajo la advertencia y volver a
  -- entrar; pero de 9.0 saltó directo a 12.1, así que nunca hubo un tramo en
  -- 'advertencia' sin alarma. La primera lectura de 9.0 tampoco notifica.
  SELECT count(*) INTO v_advs
    FROM public.notifications
   WHERE tipo = 'medidor_advertencia'
     AND url = '/medidores?id=' || v_medidor::text;

  ASSERT v_advs = 0,
    format('No debían salir avisos de advertencia, salieron %s', v_advs);

  -- El estado quedó persistido, que es lo que hace funcionar la próxima lectura.
  SELECT nivel_actual INTO v_nivel FROM public.medidores WHERE id = v_medidor;
  ASSERT v_nivel = 'alarma',
    format('nivel_actual debía quedar en alarma, quedó en %L', v_nivel);

  -- La OT también respeta la histéresis: 2 entradas a alarma, pero el dedupe por
  -- OT abierta deja solo 1 (la primera nunca se cerró).
  SELECT count(*) INTO v_ots
    FROM public.ordenes_trabajo WHERE medidor_id = v_medidor;
  ASSERT v_ots = 1,
    format('Se esperaba 1 OT (dedupe por OT abierta), hay %s', v_ots);

  -- ── Segundo caso: la advertencia sola no abre OT ──────────────────────────
  DECLARE
    v_m2   uuid;
    v_a2   integer;
    v_ot2  integer;
  BEGIN
    INSERT INTO public.medidores
      (workspace_id, nombre, unidad, tipo, advertencia, critico, activo_id, creado_por)
    VALUES
      (v_ws, '__test_advertencia__', 'Amperios', 'manual', 10, 12, v_activo, v_user)
    RETURNING id INTO v_m2;

    INSERT INTO public.medidor_lecturas (medidor_id, workspace_id, valor) VALUES
      (v_m2, v_ws,  9.0),
      (v_m2, v_ws, 10.4),   -- entra en advertencia -> notifica, sin OT
      (v_m2, v_ws,  9.8),   -- sobre 9.5, sigue en advertencia -> silencio
      (v_m2, v_ws, 10.4);   -- -> silencio

    SELECT count(*) INTO v_a2
      FROM public.notifications
     WHERE tipo = 'medidor_advertencia'
       AND url = '/medidores?id=' || v_m2::text
       AND usuario_id = v_user;

    ASSERT v_a2 = 1,
      format('Se esperaba 1 aviso de advertencia, salieron %s', v_a2);

    SELECT count(*) INTO v_ot2
      FROM public.ordenes_trabajo WHERE medidor_id = v_m2;
    ASSERT v_ot2 = 0,
      format('La advertencia no debe abrir OT, se abrieron %s', v_ot2);
  END;

  RAISE NOTICE 'OK: histéresis, advertencia sin OT y persistencia de nivel_actual';
END;
$test$;

ROLLBACK;
