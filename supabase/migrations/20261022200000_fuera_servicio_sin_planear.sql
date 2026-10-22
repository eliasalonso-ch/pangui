-- "Fuera de servicio" es siempre una parada sin planear.
--
-- Un activo fuera de servicio es uno que se echó a perder; la parada
-- planificada es la mantención (preventiva, inspección). Las dos apps dejaban
-- elegir "planificada" con fuera de servicio, y esas horas habrían salido de la
-- disponibilidad imprevista sin serlo. En producción no hay ningún período así
-- (2026-10-22), así que el CHECK entra validado.
--
-- El CHECK cubre a todos los que escriben períodos. Las dos funciones que
-- reciben el tipo desde afuera lo revisan antes, con un mensaje legible:
--   - cambiar_estado_activo (y cambiar_estado_activos, que la llama): las
--     versiones viejas del móvil pueden seguir mandando la combinación.
--   - fn_automatizacion_cambiar_estado: devuelve el motivo como texto en vez de
--     lanzar, y no debe tumbar la lectura de medidor que la disparó.
-- Cuerpos copiados de las funciones vivas en producción (2026-10-22); el único
-- cambio es ese chequeo. Misma firma: CREATE OR REPLACE conserva los permisos.
-- Los triggers (fn_sync_activo_estado_periodo, fn_abrir_periodo_activo_nuevo,
-- fn_activo_estado_por_ot) ya cumplen la regla.

begin;

alter table public.activo_estado_periodos
  add constraint activo_estado_periodos_fuera_servicio_sin_planear
  check (estado <> 'fuera_servicio' or tipo_inactividad = 'sin_planear');

CREATE OR REPLACE FUNCTION public.cambiar_estado_activo(p_activo uuid, p_estado text, p_tipo_inactividad text DEFAULT NULL::text, p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone, p_notas text DEFAULT NULL::text, p_motivo uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
  IF p_estado = 'fuera_servicio' AND p_tipo_inactividad <> 'sin_planear' THEN
    RAISE EXCEPTION 'Fuera de servicio es siempre una parada sin planear.';
  END IF;

  -- Motivo obligatorio solo para la parada imprevista.
  IF p_tipo_inactividad = 'sin_planear' AND p_motivo IS NULL THEN
    RAISE EXCEPTION 'Elige el motivo de la parada imprevista.';
  END IF;
  IF p_estado = 'operativo' AND p_motivo IS NOT NULL THEN
    RAISE EXCEPTION 'Un activo operativo no lleva motivo de parada.';
  END IF;

  -- El motivo tiene que ser del mismo workspace y estar vigente.
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_automatizacion_cambiar_estado(p_activo uuid, p_workspace uuid, p_estado text, p_tipo text, p_motivo uuid, p_notas text, p_actor uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_abierto record;
  v_ahora   timestamptz := now();
BEGIN
  IF p_activo IS NULL THEN
    RETURN 'La acción cambia el estado de un activo, pero ni el medidor ni la acción tienen uno.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.activos
     WHERE id = p_activo AND workspace_id = p_workspace AND COALESCE(activo, true)
  ) THEN
    RETURN 'El activo no existe, fue dado de baja o no pertenece a este espacio.';
  END IF;

  IF p_estado NOT IN ('operativo','fuera_servicio','mantencion','baja') THEN
    RETURN format('El estado "%s" no es válido.', p_estado);
  END IF;

  IF p_estado = 'operativo' AND p_tipo IS NOT NULL THEN
    RETURN 'Un activo operativo no lleva tipo de inactividad.';
  END IF;
  IF p_estado <> 'operativo' AND p_tipo IS NULL THEN
    RETURN 'Falta indicar si la inactividad es planeada o sin planear.';
  END IF;
  IF p_estado = 'fuera_servicio' AND p_tipo <> 'sin_planear' THEN
    RETURN 'Fuera de servicio es siempre una parada sin planear.';
  END IF;
  IF p_tipo = 'sin_planear' AND p_motivo IS NULL THEN
    RETURN 'Falta el motivo de la parada imprevista.';
  END IF;
  IF p_estado = 'operativo' AND p_motivo IS NOT NULL THEN
    RETURN 'Un activo operativo no lleva motivo de parada.';
  END IF;
  IF p_motivo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.motivos_inactividad
     WHERE id = p_motivo AND workspace_id = p_workspace AND activo
  ) THEN
    RETURN 'El motivo de parada no existe o fue desactivado.';
  END IF;

  SELECT id, inicio, estado INTO v_abierto
    FROM public.activo_estado_periodos
   WHERE activo_id = p_activo AND fin IS NULL
   LIMIT 1;

  IF FOUND THEN
    -- No es un error: es el caso normal de una regla que se cumple dos veces
    -- seguidas. Cerrar y reabrir el mismo estado partiría el período en dos.
    IF v_abierto.estado = p_estado THEN
      RETURN format('El activo ya estaba %s.', p_estado);
    END IF;
    IF v_ahora <= v_abierto.inicio THEN
      RETURN 'El estado actual del activo empieza después de esta lectura.';
    END IF;
    UPDATE public.activo_estado_periodos
       SET fin = v_ahora
     WHERE id = v_abierto.id;
  END IF;

  INSERT INTO public.activo_estado_periodos
    (activo_id, workspace_id, estado, tipo_inactividad, inicio, notas, creado_por, motivo_id)
  VALUES
    (p_activo, p_workspace, p_estado, p_tipo, v_ahora,
     NULLIF(btrim(p_notas), ''), p_actor, p_motivo);

  -- `activos.estado` es la fuente de listados y filtros; la tabla de arriba es
  -- el historial. La RPC actualiza las dos y acá tiene que pasar lo mismo.
  UPDATE public.activos SET estado = p_estado WHERE id = p_activo;

  RETURN NULL;
END;
$function$;

commit;
