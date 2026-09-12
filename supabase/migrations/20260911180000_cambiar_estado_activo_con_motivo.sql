-- `cambiar_estado_activo` y su versión en lote reciben el motivo de la parada.
--
-- El motivo es OBLIGATORIO cuando la parada es imprevista (`sin_planear`): una
-- avería sin causa registrada es justamente el dato que después no se puede
-- reconstruir —nadie se acuerda en dos meses por qué paró la máquina un
-- martes—, y sin él el Pareto de motivos queda con una barra "sin clasificar"
-- que se come al resto y no decide nada.
--
-- Para la parada planificada es opcional: la mantención programada ya se
-- explica sola.
--
-- La validación vive acá y no en un NOT NULL de la tabla porque los períodos
-- anteriores a esta migración no tienen motivo y siguen siendo válidos. Esta
-- función es el único camino de escritura de la UI (web y móvil), así que
-- imponerlo acá alcanza para todo lo que se registre de ahora en adelante.
--
-- `p_motivo` va al final y con DEFAULT NULL para no romper a quien todavía
-- llame con cinco argumentos.

CREATE OR REPLACE FUNCTION public.cambiar_estado_activo(
  p_activo           uuid,
  p_estado           text,
  p_tipo_inactividad text DEFAULT NULL,
  p_desde            timestamptz DEFAULT NULL,
  p_notas            text DEFAULT NULL,
  p_motivo           uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_workspace uuid;
  v_desde     timestamptz := COALESCE(p_desde, now());
  v_abierto   record;
  v_nuevo     uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No hay sesión activa.';
  END IF;

  SELECT workspace_id INTO v_workspace
    FROM public.activos
   WHERE id = p_activo AND COALESCE(activo, true);
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'El activo no existe o fue dado de baja.';
  END IF;

  IF v_workspace IS DISTINCT FROM public.my_workspace_id() THEN
    RAISE EXCEPTION 'El activo no pertenece a tu espacio de trabajo.';
  END IF;

  IF p_estado NOT IN ('operativo','fuera_servicio','mantencion','baja') THEN
    RAISE EXCEPTION 'Estado inválido.';
  END IF;

  IF p_estado = 'operativo' AND p_tipo_inactividad IS NOT NULL THEN
    RAISE EXCEPTION 'Un activo operativo no lleva tipo de inactividad.';
  END IF;
  IF p_estado <> 'operativo' AND p_tipo_inactividad IS NULL THEN
    RAISE EXCEPTION 'Elige si la inactividad es planeada o sin planear.';
  END IF;

  IF p_tipo_inactividad = 'sin_planear' AND p_motivo IS NULL THEN
    RAISE EXCEPTION 'Elige el motivo de la parada imprevista.';
  END IF;
  IF p_estado = 'operativo' AND p_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'Un activo operativo no lleva motivo de parada.';
  END IF;

  IF p_motivo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.motivos_inactividad
     WHERE id = p_motivo AND workspace_id = v_workspace AND activo
  ) THEN
    RAISE EXCEPTION 'El motivo no existe o no está disponible.';
  END IF;

  IF v_desde > now() THEN
    RAISE EXCEPTION 'La fecha de inicio no puede estar en el futuro.';
  END IF;

  SELECT id, inicio, estado INTO v_abierto
    FROM public.activo_estado_periodos
   WHERE activo_id = p_activo AND fin IS NULL
   LIMIT 1;

  IF FOUND THEN
    IF v_abierto.estado = p_estado THEN
      RAISE EXCEPTION 'El activo ya está en ese estado.';
    END IF;
    IF v_desde <= v_abierto.inicio THEN
      RAISE EXCEPTION 'La fecha de inicio tiene que ser posterior al comienzo del estado actual.';
    END IF;
    UPDATE public.activo_estado_periodos
       SET fin = v_desde
     WHERE id = v_abierto.id;
  END IF;

  INSERT INTO public.activo_estado_periodos
    (activo_id, workspace_id, estado, tipo_inactividad, inicio, notas, creado_por, motivo_id)
  VALUES
    (p_activo, v_workspace, p_estado, p_tipo_inactividad, v_desde,
     NULLIF(btrim(p_notas), ''), v_actor, p_motivo)
  RETURNING id INTO v_nuevo;

  UPDATE public.activos SET estado = p_estado WHERE id = p_activo;

  RETURN v_nuevo;
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_estado_activo(uuid, text, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_activo(uuid, text, text, timestamptz, text, uuid) TO authenticated;

-- La versión en lote pasa el mismo motivo a cada activo de la jerarquía: si el
-- motor se quemó y arrastró al equipo, la causa de las dos paradas es la misma.
CREATE OR REPLACE FUNCTION public.cambiar_estado_activos(
  p_activos          uuid[],
  p_estado           text,
  p_tipo_inactividad text DEFAULT NULL,
  p_desde            timestamptz DEFAULT NULL,
  p_notas            text DEFAULT NULL,
  p_motivo           uuid DEFAULT NULL
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
  IF array_length(p_activos, 1) > 100 THEN
    RAISE EXCEPTION 'Demasiados activos en una sola actualización.';
  END IF;

  FOREACH v_activo IN ARRAY p_activos LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.activo_estado_periodos
       WHERE activo_id = v_activo AND fin IS NULL AND estado = p_estado
    );
    PERFORM public.cambiar_estado_activo(
      v_activo, p_estado, p_tipo_inactividad, p_desde, p_notas, p_motivo
    );
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.cambiar_estado_activos(uuid[], text, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_activos(uuid[], text, text, timestamptz, text, uuid) TO authenticated;
