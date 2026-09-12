-- Jerarquía de activos: integridad del árbol y cambio de estado en cascada.
--
-- Contexto. `activos.activo_padre_id` existe desde hace tiempo, pero solo con
-- una FK a sí misma: nada impedía que A fuera padre de B y B padre de A. Nadie
-- lo notó porque hasta hoy NINGÚN activo en producción tenía padre (verificado:
-- 0 filas con activo_padre_id no nulo). Al empezar a usarse la jerarquía —y
-- sobre todo al recorrerla desde código— un ciclo deja de ser teórico: cualquier
-- recorrido recursivo se cuelga.
--
-- Qué agrega este archivo:
--   1. Un trigger que rechaza ciclos y limita la profundidad del árbol.
--   2. `cambiar_estado_activos` — cambia el estado de varios activos de la misma
--      jerarquía en UNA transacción.
--
-- Por qué la cascada NO es automática. La norma ISO 14224 distingue componentes
-- en serie (si falla, cae el equipo padre) de componentes en paralelo /
-- redundantes (si falla, el padre sigue andando). Propagar el estado hacia
-- arriba siempre inventaría paradas en todo activo redundante, y de esas horas
-- salen la disponibilidad y el MTBF: números mal calculados en silencio son
-- peores que no tenerlos. Por eso la UI PROPONE (marca por defecto los hijos
-- `critico`, que son los que están en serie) y el usuario CONFIRMA. Es el mismo
-- modelo de MaintainX: "Update parent and sub-assets", no una regla automática.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Integridad del árbol: sin ciclos y con profundidad acotada.
--
-- El límite de niveles no es un capricho: acota el trabajo de cualquier
-- recorrido recursivo y es lo que hacen las herramientas del rubro (MaintainX
-- permite 3 niveles en su plan medio, 6 en el alto). 6 alcanza de sobra para
-- Planta → Área → Línea → Equipo → Conjunto → Componente.
CREATE OR REPLACE FUNCTION public.fn_validar_activo_padre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_max_niveles constant int := 6;
  v_cursor uuid;
  v_saltos int := 0;
BEGIN
  IF NEW.activo_padre_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.activo_padre_id = NEW.id THEN
    RAISE EXCEPTION 'Un activo no puede ser su propio padre.';
  END IF;

  -- Sube por la cadena de padres. Si vuelve a pasar por el activo que se está
  -- guardando, el enlace cerraría un ciclo.
  v_cursor := NEW.activo_padre_id;
  WHILE v_cursor IS NOT NULL LOOP
    v_saltos := v_saltos + 1;

    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'Ese activo ya está por debajo de este en la jerarquía: se haría un círculo.';
    END IF;

    -- Tope duro por si un ciclo preexistente dejara la cadena sin fin.
    IF v_saltos > v_max_niveles THEN
      RAISE EXCEPTION 'La jerarquía no puede tener más de % niveles.', v_max_niveles;
    END IF;

    SELECT activo_padre_id INTO v_cursor FROM public.activos WHERE id = v_cursor;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_activo_padre ON public.activos;
CREATE TRIGGER trg_validar_activo_padre
  BEFORE INSERT OR UPDATE OF activo_padre_id ON public.activos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_validar_activo_padre();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cambio de estado en cascada.
--
-- Recibe la lista EXPLÍCITA de activos que el usuario confirmó en el diálogo, no
-- un "propagá hacia abajo": la decisión de a quién alcanza la parada es del
-- usuario, y así esta función no tiene que adivinar nada sobre redundancias.
--
-- Todo ocurre en una transacción: o se registra la parada de la máquina y la de
-- sus componentes, o no se registra ninguna. A medio aplicar dejaría el reporte
-- de disponibilidad mintiendo.
--
-- Reusa `cambiar_estado_activo` por cada activo en vez de escribir la tabla a
-- mano. Esa función ya valida workspace, estado y fechas, y cierra el período
-- abierto antes de abrir el nuevo. Un UPDATE masivo sobre `activos.estado`
-- dispararía el trigger de respaldo, que asume `sin_planear` y marcaría como
-- avería una mantención programada.
CREATE OR REPLACE FUNCTION public.cambiar_estado_activos(
  p_activos          uuid[],
  p_estado           text,
  p_tipo_inactividad text DEFAULT NULL,
  p_desde            timestamptz DEFAULT NULL,
  p_notas            text DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_activo uuid;
  v_total  int := 0;
BEGIN
  IF p_activos IS NULL OR array_length(p_activos, 1) IS NULL THEN
    RAISE EXCEPTION 'No hay activos que actualizar.';
  END IF;

  -- Cota de seguridad: un árbol legítimo no llega a 100 nodos, y evita que un
  -- arreglo enorme tenga la transacción tomada.
  IF array_length(p_activos, 1) > 100 THEN
    RAISE EXCEPTION 'Demasiados activos en una sola actualización.';
  END IF;

  FOREACH v_activo IN ARRAY p_activos LOOP
    -- Un activo que ya está en el estado destino hace que la función lance
    -- excepción. En una cascada eso es esperable —el componente ya estaba
    -- parado— y no debe tumbar la operación entera, así que se saltea.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.activo_estado_periodos
       WHERE activo_id = v_activo AND fin IS NULL AND estado = p_estado
    );

    PERFORM public.cambiar_estado_activo(
      v_activo, p_estado, p_tipo_inactividad, p_desde, p_notas
    );
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.cambiar_estado_activos(uuid[], text, text, timestamptz, text) IS
  'Cambia el estado de varios activos de una jerarquía en una transacción. La '
  'lista la confirma el usuario en la UI: la cascada no es automática porque un '
  'componente redundante que falla no para el equipo padre (ISO 14224).';

REVOKE ALL ON FUNCTION public.cambiar_estado_activos(uuid[], text, text, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_activos(uuid[], text, text, timestamptz, text) TO authenticated;
