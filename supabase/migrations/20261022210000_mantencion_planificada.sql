-- El estado define el tipo de parada; ya no se pregunta.
--   fuera_servicio = siempre sin planear (avería). Ya regía: 20261022200000.
--   mantencion     = siempre planificada (preventiva, inspección). Nuevo.
-- Para los números "fuera de servicio" y "mantención sin planear" eran lo
-- mismo (imprevista, misma falla para MTBF/MTTR); la diferencia era solo de
-- etiqueta y confundía. Una avería que se está reparando sigue en fuera de
-- servicio hasta volver a operar.
--
-- 1. Los 5 períodos "mantención sin planear" que había (datos de prueba de
--    Alonso Technologies y Almar, 2026-10-22) pasan a fuera de servicio: mismas
--    fechas y motivo, cuentan igual. Los 2 abiertos arrastran activos.estado
--    (fn_sync ve el período ya en ese estado y no duplica). Así el CHECK entra
--    validado y esos períodos se pueden cerrar.
--    ids: 82fd7cd5, 0ae919f2, 9601c75b (abierto), f813e792, aa265062 (abierto).
-- 2. CHECK mantencion => planeado, al lado del de fuera_servicio.
-- 3. Los triggers que abren períodos sin RPC (sync de activos.estado y alta de
--    activo) asumían sin_planear para todo; mantención ahora va planificada.
-- 4. cambiar_estado_activo y fn_automatizacion_cambiar_estado lo rechazan con
--    un mensaje legible (las apps viejas pueden mandar la combinación).
-- Cuerpos copiados de las funciones vivas (2026-10-22); misma firma, conserva
-- permisos.

begin;

update public.activo_estado_periodos
   set estado = 'fuera_servicio'
 where estado = 'mantencion' and tipo_inactividad = 'sin_planear';

update public.activos a
   set estado = 'fuera_servicio'
  from public.activo_estado_periodos p
 where p.activo_id = a.id and p.fin is null
   and p.estado = 'fuera_servicio' and a.estado = 'mantencion';

alter table public.activo_estado_periodos
  add constraint activo_estado_periodos_mantencion_planeado
  check (estado <> 'mantencion' or tipo_inactividad = 'planeado');

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
  IF p_estado = 'mantencion' AND p_tipo_inactividad <> 'planeado' THEN
    RAISE EXCEPTION 'En mantención es siempre una parada planificada; una avería va como fuera de servicio.';
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
  IF p_estado = 'mantencion' AND p_tipo <> 'planeado' THEN
    RETURN 'En mantención es siempre una parada planificada; una avería va como fuera de servicio.';
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

CREATE OR REPLACE FUNCTION public.fn_sync_activo_estado_periodo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_abierto record;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  SELECT id, estado, inicio INTO v_abierto
    FROM public.activo_estado_periodos
   WHERE activo_id = NEW.id AND fin IS NULL
   LIMIT 1;

  -- `cambiar_estado_activo` ya dejó el período correcto: no duplicar.
  IF FOUND AND v_abierto.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  IF FOUND THEN
    UPDATE public.activo_estado_periodos SET fin = now() WHERE id = v_abierto.id;
  END IF;

  INSERT INTO public.activo_estado_periodos
    (activo_id, workspace_id, estado, tipo_inactividad, inicio, creado_por)
  VALUES (
    NEW.id,
    NEW.workspace_id,
    NEW.estado,
    CASE NEW.estado WHEN 'operativo' THEN NULL WHEN 'mantencion' THEN 'planeado' ELSE 'sin_planear' END,
    now(),
    auth.uid()
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_abrir_periodo_activo_nuevo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.activo_estado_periodos
    (activo_id, workspace_id, estado, tipo_inactividad, inicio, creado_por)
  VALUES (
    NEW.id,
    NEW.workspace_id,
    COALESCE(NULLIF(NEW.estado, ''), 'operativo'),
    CASE COALESCE(NULLIF(NEW.estado, ''), 'operativo') WHEN 'operativo' THEN NULL WHEN 'mantencion' THEN 'planeado' ELSE 'sin_planear' END,
    COALESCE(NEW.created_at, now()),
    auth.uid()
  );

  RETURN NEW;
END;
$function$;

commit;
