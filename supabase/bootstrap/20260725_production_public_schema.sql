--
-- PostgreSQL database dump
--

-- \restrict 5MOPAAeqmH7WNuPLkBwJyPAiMlq2ghmjsygu18L6AuNea1ucSseHgggXlUXIA1S

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: export_schedule_filter; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."export_schedule_filter" AS ENUM (
    'todas',
    'pendientes',
    'sin_asignar',
    'en_curso',
    'urgentes',
    'completadas',
    'levantamientos'
);


ALTER TYPE "public"."export_schedule_filter" OWNER TO "postgres";

--
-- Name: export_schedule_frequency; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."export_schedule_frequency" AS ENUM (
    'weekly',
    'monthly',
    'yearly'
);


ALTER TYPE "public"."export_schedule_frequency" OWNER TO "postgres";

--
-- Name: message_rarity; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."message_rarity" AS ENUM (
    'common',
    'rare',
    'legendary',
    'mythic'
);


ALTER TYPE "public"."message_rarity" OWNER TO "postgres";

--
-- Name: assign_entity_qr_code(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."assign_entity_qr_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE prefix text;
BEGIN
  prefix := CASE TG_TABLE_NAME WHEN 'sociedades' THEN 'ASO-' WHEN 'ubicaciones' THEN 'UBI-' ELSE 'LUG-' END;
  NEW.qr_code := nullif(btrim(NEW.qr_code), '');
  IF NEW.qr_code IS NULL THEN NEW.qr_code := prefix || upper(substr(replace(NEW.id::text, '-', ''), 1, 10)); END IF;
  IF EXISTS (SELECT 1 FROM public.sociedades x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND (TG_TABLE_NAME <> 'sociedades' OR x.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.ubicaciones x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND (TG_TABLE_NAME <> 'ubicaciones' OR x.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.lugares x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND (TG_TABLE_NAME <> 'lugares' OR x.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.partes x WHERE x.workspace_id = NEW.workspace_id AND x.qr_code = NEW.qr_code AND x.activo = true)
  THEN RAISE EXCEPTION 'Este código QR ya está asignado a otro elemento' USING ERRCODE = '23505'; END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."assign_entity_qr_code"() OWNER TO "postgres";

--
-- Name: auto_adjuntar_procedimientos(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."auto_adjuntar_procedimientos"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO ot_procedimientos (orden_id, procedimiento_id)
  SELECT NEW.id, p.id
  FROM procedimientos p
  WHERE p.workspace_id = NEW.workspace_id
    AND p.activo = true
    AND (p.auto_adjuntar = true OR p.bloquea_inicio = true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_adjuntar_procedimientos"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: partes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."partes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "codigo" "text" NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "categoria" "text",
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "unidad" "text" DEFAULT 'un'::"text" NOT NULL,
    "stock_actual" numeric DEFAULT 0 NOT NULL,
    "stock_minimo" numeric DEFAULT 0 NOT NULL,
    "precio_unitario" numeric DEFAULT 0 NOT NULL,
    "ubicacion_bodega" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "imagen_url" "text",
    "archivo_url" "text",
    "archivo_nombre" "text",
    "tipo_parte_id" "uuid",
    "activo_id" "uuid",
    "proveedor_id" "uuid",
    "grupo_responsable" "text",
    "ubicacion_id" "uuid",
    "workspace_id" "uuid",
    "qr_code" "text",
    "fabricante_id" "uuid",
    "modelo_id" "uuid"
);


ALTER TABLE "public"."partes" OWNER TO "postgres";

--
-- Name: buscar_materiales("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."buscar_materiales"("planta" "uuid", "query" "text") RETURNS SETOF "public"."partes"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT * FROM materiales
  WHERE planta_id = planta
    AND activo = true
    AND (
      codigo      ILIKE '%' || query || '%'
      OR nombre      ILIKE '%' || query || '%'
      OR descripcion ILIKE '%' || query || '%'
      OR query = ANY(tags)
    )
  ORDER BY
    CASE
      WHEN codigo ILIKE query || '%'        THEN 0
      WHEN codigo ILIKE '%' || query || '%' THEN 1
      WHEN nombre ILIKE query || '%'        THEN 2
      ELSE 3
    END,
    nombre
  LIMIT 20;
$$;


ALTER FUNCTION "public"."buscar_materiales"("planta" "uuid", "query" "text") OWNER TO "postgres";

--
-- Name: calcular_costo_total(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."calcular_costo_total"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  new.costo_total := coalesce(new.costo_materiales, 0) + coalesce(new.costo_mano_obra, 0);
  return new;
end;
$$;


ALTER FUNCTION "public"."calcular_costo_total"() OWNER TO "postgres";

--
-- Name: consume_material_reservation("uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."consume_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE r public.material_reservations%ROWTYPE; wid uuid;
BEGIN
 IF p_cantidad<=0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
 SELECT * INTO r FROM public.material_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF r.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.workspace_id=r.workspace_id) THEN RAISE EXCEPTION 'Reserva no disponible'; END IF;
 IF p_cantidad>r.cantidad THEN RAISE EXCEPTION 'La cantidad supera lo reservado'; END IF;
 INSERT INTO public.material_withdrawals(workspace_id,parte_id,ubicacion_id,lugar_id,cantidad) VALUES(r.workspace_id,r.parte_id,r.ubicacion_id,r.lugar_id,p_cantidad) RETURNING id INTO wid;
 IF p_cantidad=r.cantidad THEN DELETE FROM public.material_reservations WHERE id=p_reservation_id; ELSE UPDATE public.material_reservations SET cantidad=cantidad-p_cantidad,updated_at=now() WHERE id=p_reservation_id; END IF;
 RETURN wid;
END; $$;


ALTER FUNCTION "public"."consume_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) OWNER TO "postgres";

--
-- Name: crear_correctiva_desde_paso("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."crear_correctiva_desde_paso"("p_respuesta_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_resp           public.paso_respuestas%ROWTYPE;
  v_paso           public.procedimiento_pasos%ROWTYPE;
  v_parent_ot      public.ordenes_trabajo%ROWTYPE;
  v_workspace_id   uuid;
  v_new_ot_id      uuid;
  v_plantilla      jsonb;
  v_titulo         text;
  v_descripcion    text;
  v_prioridad      text;
  v_tipo_trabajo   text;
BEGIN
  SELECT * INTO v_resp FROM public.paso_respuestas WHERE id = p_respuesta_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_resp.correctiva_ot_id IS NOT NULL THEN
    RETURN v_resp.correctiva_ot_id;
  END IF;

  SELECT * INTO v_paso FROM public.procedimiento_pasos WHERE id = v_resp.paso_id;
  IF NOT FOUND OR NOT v_paso.genera_correctiva THEN
    RETURN NULL;
  END IF;

  SELECT ot.* INTO v_parent_ot
  FROM public.procedimiento_ejecuciones pe
  JOIN public.ordenes_trabajo ot ON ot.id = pe.orden_id
  WHERE pe.id = v_resp.ejecucion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'parent OT not found for ejecucion %', v_resp.ejecucion_id;
  END IF;

  v_workspace_id := v_parent_ot.workspace_id;
  v_plantilla := COALESCE(v_paso.correctiva_plantilla, '{}'::jsonb);
  v_titulo := COALESCE(
    NULLIF(v_plantilla->>'titulo', ''),
    'Acción correctiva: ' || COALESCE(v_paso.titulo, 'paso sin título')
  );
  v_descripcion := COALESCE(
    v_plantilla->>'descripcion',
    'Generado automáticamente por una respuesta de falla en el procedimiento.'
  );
  v_prioridad := COALESCE(v_plantilla->>'prioridad', v_parent_ot.prioridad, 'media');
  v_tipo_trabajo := COALESCE(v_plantilla->>'tipo_trabajo', 'reactiva');

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, estado, prioridad,
    parent_id, asignados_ids, origen, origen_paso_id, origen_ejecucion_id
  ) VALUES (
    v_workspace_id,
    v_resp.respondido_por,
    v_titulo,
    v_descripcion,
    'solicitud',
    v_tipo_trabajo,
    'pendiente',
    v_prioridad,
    v_parent_ot.id,
    COALESCE(v_parent_ot.asignados_ids, '{}'::uuid[]),
    'correctiva_procedimiento',
    v_paso.id,
    v_resp.ejecucion_id
  )
  RETURNING id INTO v_new_ot_id;

  UPDATE public.paso_respuestas
    SET correctiva_ot_id = v_new_ot_id
    WHERE id = p_respuesta_id;

  RETURN v_new_ot_id;
END
$$;


ALTER FUNCTION "public"."crear_correctiva_desde_paso"("p_respuesta_id" "uuid") OWNER TO "postgres";

--
-- Name: deactivate_usuario("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."deactivate_usuario"("target_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  caller_rol text;
  target_rol text;
BEGIN
  SELECT rol INTO caller_rol FROM usuarios WHERE id = auth.uid();
  SELECT rol INTO target_rol FROM usuarios WHERE id = target_id;

  IF target_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes desactivar tu propia cuenta';
  END IF;

  IF caller_rol NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Sin permisos para desactivar usuarios';
  END IF;

  IF target_rol = 'owner' THEN
    RAISE EXCEPTION 'No puedes desactivar al dueño de la organización';
  END IF;

  IF caller_rol = 'admin' AND target_rol = 'admin' THEN
    RAISE EXCEPTION 'Los administradores no pueden desactivar a otros administradores';
  END IF;

  UPDATE usuarios SET activo = false WHERE id = target_id;
END;
$$;


ALTER FUNCTION "public"."deactivate_usuario"("target_id" "uuid") OWNER TO "postgres";

--
-- Name: export_schedules_next_run_at("public"."export_schedule_frequency", smallint, smallint, smallint, smallint, "text", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."export_schedules_next_run_at"("p_frequency" "public"."export_schedule_frequency", "p_day_of_week" smallint, "p_day_of_month" smallint, "p_month_of_year" smallint, "p_hour_local" smallint, "p_timezone" "text", "p_from" timestamp with time zone DEFAULT "now"()) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  local_now   timestamp;
  candidate   timestamp;
  target_dom  smallint;
  last_dom    smallint;
BEGIN
  local_now := (p_from AT TIME ZONE p_timezone);

  IF p_frequency = 'weekly' THEN
    candidate := date_trunc('day', local_now)
               + ((p_day_of_week - EXTRACT(DOW FROM local_now)::int + 7) % 7) * INTERVAL '1 day'
               + p_hour_local * INTERVAL '1 hour';
    IF candidate <= local_now THEN
      candidate := candidate + INTERVAL '7 days';
    END IF;

  ELSIF p_frequency = 'monthly' THEN
    last_dom := EXTRACT(DAY FROM (date_trunc('month', local_now) + INTERVAL '1 month - 1 day'));
    target_dom := LEAST(p_day_of_month, last_dom);
    candidate := date_trunc('month', local_now)
               + (target_dom - 1) * INTERVAL '1 day'
               + p_hour_local * INTERVAL '1 hour';
    IF candidate <= local_now THEN
      candidate := date_trunc('month', local_now) + INTERVAL '1 month';
      last_dom := EXTRACT(DAY FROM (candidate + INTERVAL '1 month - 1 day'));
      target_dom := LEAST(p_day_of_month, last_dom);
      candidate := candidate + (target_dom - 1) * INTERVAL '1 day' + p_hour_local * INTERVAL '1 hour';
    END IF;

  ELSE
    last_dom := EXTRACT(DAY FROM
      (make_date(EXTRACT(YEAR FROM local_now)::int, p_month_of_year, 1)::timestamp + INTERVAL '1 month - 1 day'));
    target_dom := LEAST(p_day_of_month, last_dom);
    candidate := make_date(EXTRACT(YEAR FROM local_now)::int, p_month_of_year, target_dom)::timestamp
               + p_hour_local * INTERVAL '1 hour';
    IF candidate <= local_now THEN
      candidate := make_date(EXTRACT(YEAR FROM local_now)::int + 1, p_month_of_year, target_dom)::timestamp
                 + p_hour_local * INTERVAL '1 hour';
    END IF;
  END IF;

  RETURN candidate AT TIME ZONE p_timezone;
END $$;


ALTER FUNCTION "public"."export_schedules_next_run_at"("p_frequency" "public"."export_schedule_frequency", "p_day_of_week" smallint, "p_day_of_month" smallint, "p_month_of_year" smallint, "p_hour_local" smallint, "p_timezone" "text", "p_from" timestamp with time zone) OWNER TO "postgres";

--
-- Name: export_schedules_set_next_run_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."export_schedules_set_next_run_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  NEW.next_run_at := export_schedules_next_run_at(
    NEW.frequency, NEW.day_of_week, NEW.day_of_month,
    NEW.month_of_year, NEW.hour_local, NEW.timezone, now()
  );
  NEW.updated_at := now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."export_schedules_set_next_run_at"() OWNER TO "postgres";

--
-- Name: fn_assign_orden_numero(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_assign_orden_numero"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  SELECT COALESCE(MAX(numero), 0) + 1
    INTO NEW.numero
    FROM public.ordenes_trabajo
   WHERE workspace_id = NEW.workspace_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_assign_orden_numero"() OWNER TO "postgres";

--
-- Name: fn_calc_duracion(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_calc_duracion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  IF NEW.hora_termino IS NOT NULL AND NEW.hora_inicio IS NOT NULL THEN
    NEW.duracion_min := EXTRACT(EPOCH FROM (NEW.hora_termino - NEW.hora_inicio)) / 60;
  ELSE
    NEW.duracion_min := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_calc_duracion"() OWNER TO "postgres";

--
-- Name: fn_effective_plan("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_effective_plan"("p_workspace_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT CASE
    WHEN s.status IN ('trialing') THEN 'pro'
    ELSE s.plan_key
  END
  FROM subscriptions s
  WHERE s.workspace_id = p_workspace_id
    AND s.status <> 'canceled'
  ORDER BY s.created_at DESC
  LIMIT 1
$$;


ALTER FUNCTION "public"."fn_effective_plan"("p_workspace_id" "uuid") OWNER TO "postgres";

--
-- Name: fn_import_templates_touch(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_import_templates_touch"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."fn_import_templates_touch"() OWNER TO "postgres";

--
-- Name: fn_log_actividad_activo(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_log_actividad_activo"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user uuid := auth.uid();
  v_campos text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario)
    VALUES (NEW.id, v_user, 'creado', NEW.nombre);
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.id, v_user, 'estado_cambiado', NEW.estado,
            jsonb_build_object('de', OLD.estado, 'a', NEW.estado));
  END IF;

  IF NEW.activo = false AND OLD.activo = true THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario)
    VALUES (NEW.id, v_user, 'eliminado', NULL);
    RETURN NEW;
  END IF;

  IF NEW.nombre          IS DISTINCT FROM OLD.nombre          THEN v_campos := array_append(v_campos, 'Nombre'); END IF;
  IF NEW.descripcion     IS DISTINCT FROM OLD.descripcion     THEN v_campos := array_append(v_campos, 'Descripción'); END IF;
  IF NEW.ubicacion_id    IS DISTINCT FROM OLD.ubicacion_id    THEN v_campos := array_append(v_campos, 'Ubicación'); END IF;
  IF NEW.sociedad_id     IS DISTINCT FROM OLD.sociedad_id     THEN v_campos := array_append(v_campos, 'Cliente'); END IF;
  IF NEW.fabricante_id   IS DISTINCT FROM OLD.fabricante_id   THEN v_campos := array_append(v_campos, 'Fabricante'); END IF;
  IF NEW.modelo_id       IS DISTINCT FROM OLD.modelo_id       THEN v_campos := array_append(v_campos, 'Modelo'); END IF;
  IF NEW.proveedor_id    IS DISTINCT FROM OLD.proveedor_id    THEN v_campos := array_append(v_campos, 'Proveedor'); END IF;
  IF NEW.responsable_id  IS DISTINCT FROM OLD.responsable_id  THEN v_campos := array_append(v_campos, 'Responsable'); END IF;
  IF NEW.activo_padre_id IS DISTINCT FROM OLD.activo_padre_id THEN v_campos := array_append(v_campos, 'Activo padre'); END IF;
  IF NEW.criticidad      IS DISTINCT FROM OLD.criticidad      THEN v_campos := array_append(v_campos, 'Criticidad'); END IF;
  IF NEW.numero_serie    IS DISTINCT FROM OLD.numero_serie    THEN v_campos := array_append(v_campos, 'N° de serie'); END IF;
  IF NEW."año_fabricacion" IS DISTINCT FROM OLD."año_fabricacion" THEN v_campos := array_append(v_campos, 'Año'); END IF;
  IF NEW.fecha_garantia  IS DISTINCT FROM OLD.fecha_garantia  THEN v_campos := array_append(v_campos, 'Garantía'); END IF;
  IF NEW.imagen_url      IS DISTINCT FROM OLD.imagen_url      THEN v_campos := array_append(v_campos, 'Foto'); END IF;
  IF NEW.adjuntos        IS DISTINCT FROM OLD.adjuntos        THEN v_campos := array_append(v_campos, 'Adjuntos'); END IF;

  IF array_length(v_campos, 1) > 0 THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.id, v_user, 'editado',
            array_to_string(v_campos, ', '),
            jsonb_build_object('campos', to_jsonb(v_campos)));
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_log_actividad_activo"() OWNER TO "postgres";

--
-- Name: fn_log_actividad_activo_from_ot(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_log_actividad_activo_from_ot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- OT created already linked to an asset.
    IF NEW.activo_id IS NOT NULL THEN
      INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
      VALUES (NEW.activo_id, NEW.creado_por, 'ot_vinculada',
              COALESCE(NEW.titulo, 'OT #' || COALESCE(NEW.numero::text, '')),
              jsonb_build_object('orden_id', NEW.id, 'numero', NEW.numero));
    END IF;
    RETURN NEW;
  END IF;

  -- OT linked to an asset after the fact (activo_id changed to non-null).
  IF NEW.activo_id IS DISTINCT FROM OLD.activo_id AND NEW.activo_id IS NOT NULL THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.activo_id, NEW.creado_por, 'ot_vinculada',
            COALESCE(NEW.titulo, 'OT #' || COALESCE(NEW.numero::text, '')),
            jsonb_build_object('orden_id', NEW.id, 'numero', NEW.numero));
  END IF;

  -- OT completed while tied to an asset.
  IF NEW.estado = 'completado' AND OLD.estado IS DISTINCT FROM 'completado'
     AND NEW.activo_id IS NOT NULL THEN
    INSERT INTO actividad_activo (activo_id, usuario_id, tipo, comentario, meta)
    VALUES (NEW.activo_id, NEW.completado_por, 'ot_completada',
            COALESCE(NEW.titulo, 'OT #' || COALESCE(NEW.numero::text, '')),
            jsonb_build_object('orden_id', NEW.id, 'numero', NEW.numero));
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_log_actividad_activo_from_ot"() OWNER TO "postgres";

--
-- Name: fn_materiales_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_materiales_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_materiales_updated_at"() OWNER TO "postgres";

--
-- Name: fn_mi_rol(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_mi_rol"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT rol FROM usuarios WHERE id = (SELECT auth.uid());
$$;


ALTER FUNCTION "public"."fn_mi_rol"() OWNER TO "postgres";

--
-- Name: fn_mi_workspace(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_mi_workspace"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT workspace_id FROM usuarios WHERE id = auth.uid()
$$;


ALTER FUNCTION "public"."fn_mi_workspace"() OWNER TO "postgres";

--
-- Name: fn_movimientos_ajustar_stock(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_movimientos_ajustar_stock"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_stock_actual numeric;
  v_stock_nuevo  numeric;
BEGIN
  -- Leer stock actual con bloqueo para evitar race conditions
  SELECT stock_actual INTO v_stock_actual
  FROM materiales
  WHERE id = NEW.material_id
  FOR UPDATE;

  -- Calcular nuevo stock
  CASE NEW.tipo
    WHEN 'ingreso' THEN v_stock_nuevo := v_stock_actual + NEW.cantidad;
    WHEN 'egreso'  THEN v_stock_nuevo := v_stock_actual - NEW.cantidad;
    WHEN 'ajuste'  THEN v_stock_nuevo := NEW.cantidad;
  END CASE;

  -- Actualizar stock en materiales
  UPDATE materiales
  SET stock_actual = v_stock_nuevo
  WHERE id = NEW.material_id;

  -- Guardar snapshot en el movimiento
  NEW.stock_anterior := v_stock_actual;
  NEW.stock_nuevo    := v_stock_nuevo;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_movimientos_ajustar_stock"() OWNER TO "postgres";

--
-- Name: fn_paso_respuesta_historial(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_paso_respuesta_historial"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  ws uuid;
BEGIN
  -- Resolve workspace via the ejecucion → orden_trabajo → workspace_id chain.
  SELECT ot.workspace_id INTO ws
  FROM public.procedimiento_ejecuciones pe
  JOIN public.ordenes_trabajo ot ON ot.id = pe.orden_id
  WHERE pe.id = NEW.ejecucion_id
  LIMIT 1;

  INSERT INTO public.paso_respuesta_historial
    (respuesta_id, workspace_id, valor_anterior, valor_nuevo, editado_por)
  VALUES (
    NEW.id,
    ws,
    to_jsonb(OLD),
    to_jsonb(NEW),
    COALESCE(NEW.editado_por, NEW.respondido_por, auth.uid())
  );
  RETURN NEW;
END
$$;


ALTER FUNCTION "public"."fn_paso_respuesta_historial"() OWNER TO "postgres";

--
-- Name: fn_puede_ver("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_puede_ver"("p_modulo" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT COALESCE(
    (SELECT puede_ver FROM permisos_usuario
     WHERE usuario_id = auth.uid() AND modulo = p_modulo),
    true
  );
$$;


ALTER FUNCTION "public"."fn_puede_ver"("p_modulo" "text") OWNER TO "postgres";

--
-- Name: fn_set_procedimiento_created_by(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_set_procedimiento_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_set_procedimiento_created_by"() OWNER TO "postgres";

--
-- Name: fn_set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."fn_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_set_updated_at"() OWNER TO "postgres";

--
-- Name: generar_siguiente_ot_recurrente(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."generar_siguiente_ot_recurrente"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_series_id uuid;
  v_next_iter integer;
  v_next_start date;
  v_next_end date;
  v_end_date date;
  v_new_parent_id uuid;
  v_child record;
  v_new_child_id uuid;
BEGIN
  IF NEW.estado <> 'completado'
     OR COALESCE(OLD.estado, '') = 'completado'
     OR NEW.parent_id IS NOT NULL
     OR COALESCE(NEW.recurrencia, 'ninguna') = 'ninguna' THEN
    RETURN NEW;
  END IF;

  v_series_id := COALESCE(NEW.recurrencia_origen_id, NEW.id);
  v_next_iter := COALESCE(NEW.recurrencia_iteracion, 1) + 1;

  v_next_start := public.recurrente_advance_date(
    COALESCE(OLD.fecha_inicio::date, NEW.created_at::date),
    NEW.recurrencia,
    NEW.recurrencia_config
  );

  IF OLD.fecha_termino IS NOT NULL AND OLD.fecha_inicio IS NOT NULL THEN
    v_next_end := v_next_start + (OLD.fecha_termino::date - OLD.fecha_inicio::date);
  ELSIF OLD.fecha_termino IS NOT NULL THEN
    v_next_end := public.recurrente_advance_date(OLD.fecha_termino::date, NEW.recurrencia, NEW.recurrencia_config);
  ELSE
    v_next_end := NULL;
  END IF;

  v_end_date := NULLIF(NEW.recurrencia_config->>'end_date', '')::date;
  IF v_end_date IS NOT NULL AND v_next_start > v_end_date THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ordenes_trabajo
    WHERE recurrencia_origen_id = v_series_id
      AND recurrencia_iteracion = v_next_iter
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, clasificacion, estado, prioridad,
    recurrencia, recurrencia_config, proxima_ejecucion,
    recurrencia_origen_id, recurrencia_iteracion,
    estado_cobro, requiere_materiales, requiere_hoja, requiere_fotos,
    categoria_id, ubicacion_id, lugar_id, sociedad_id, activo_id,
    asignados_ids, fecha_inicio, fecha_termino,
    n_serie, solicitante, hito, presupuesto,
    imagen_url, links, origen
  )
  VALUES (
    NEW.workspace_id, NEW.creado_por,
    public.recurrente_title(NEW.titulo, v_next_iter, v_next_start, v_next_end),
    COALESCE(NEW.descripcion, ''),
    COALESCE(NEW.tipo, 'solicitud'), NEW.tipo_trabajo, NEW.clasificacion,
    'pendiente', NEW.prioridad,
    NEW.recurrencia, NEW.recurrencia_config, v_next_start,
    v_series_id, v_next_iter,
    COALESCE(NEW.estado_cobro, 'no_cobrable'),
    COALESCE(NEW.requiere_materiales, false),
    COALESCE(NEW.requiere_hoja, false),
    COALESCE(NEW.requiere_fotos, false),
    NEW.categoria_id, NEW.ubicacion_id, NEW.lugar_id, NEW.sociedad_id, NEW.activo_id,
    COALESCE(NEW.asignados_ids, '{}'::uuid[]),
    v_next_start, v_next_end,
    NEW.n_serie, NEW.solicitante, NEW.hito, NEW.presupuesto,
    NEW.imagen_url, COALESCE(NEW.links, '[]'::jsonb), 'recurrente'
  )
  RETURNING id INTO v_new_parent_id;

  INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id, adjuntado_por, hereda_a_hijos)
  SELECT v_new_parent_id, procedimiento_id, NEW.creado_por, hereda_a_hijos
  FROM public.ot_procedimientos
  WHERE orden_id = NEW.id
  ON CONFLICT DO NOTHING;

  FOR v_child IN
    SELECT *
    FROM public.ordenes_trabajo
    WHERE parent_id = NEW.id
    ORDER BY created_at ASC
  LOOP
    INSERT INTO public.ordenes_trabajo (
      workspace_id, creado_por, titulo, descripcion,
      tipo, tipo_trabajo, clasificacion, estado, prioridad,
      recurrencia, recurrencia_config, proxima_ejecucion,
      estado_cobro, requiere_materiales, requiere_hoja, requiere_fotos,
      categoria_id, ubicacion_id, lugar_id, sociedad_id, activo_id,
      asignados_ids, fecha_inicio, fecha_termino,
      n_serie, solicitante, hito, presupuesto,
      imagen_url, links, parent_id, origen
    )
    VALUES (
      v_child.workspace_id, v_child.creado_por, v_child.titulo, COALESCE(v_child.descripcion, ''),
      COALESCE(v_child.tipo, 'solicitud'), v_child.tipo_trabajo, v_child.clasificacion,
      'pendiente', v_child.prioridad,
      'ninguna', NULL, NULL,
      COALESCE(v_child.estado_cobro, 'no_cobrable'),
      COALESCE(v_child.requiere_materiales, false),
      COALESCE(v_child.requiere_hoja, false),
      COALESCE(v_child.requiere_fotos, false),
      v_child.categoria_id, v_child.ubicacion_id, v_child.lugar_id, v_child.sociedad_id,
      COALESCE(v_child.activo_id, NEW.activo_id),
      COALESCE(v_child.asignados_ids, NEW.asignados_ids, '{}'::uuid[]),
      v_next_start, v_next_end,
      v_child.n_serie, COALESCE(v_child.solicitante, NEW.solicitante), COALESCE(v_child.hito, NEW.hito), v_child.presupuesto,
      v_child.imagen_url, COALESCE(v_child.links, '[]'::jsonb), v_new_parent_id, 'recurrente'
    )
    RETURNING id INTO v_new_child_id;

    INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id, adjuntado_por, hereda_a_hijos)
    SELECT v_new_child_id, procedimiento_id, NEW.creado_por, hereda_a_hijos
    FROM public.ot_procedimientos
    WHERE orden_id = v_child.id
    ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, url, tipo)
  SELECT DISTINCT uid, 'OT recurrente creada',
    public.recurrente_title(NEW.titulo, v_next_iter, v_next_start, v_next_end),
    '/ordenes?id=' || v_new_parent_id::text,
    'orden'
  FROM unnest(COALESCE(NEW.asignados_ids, '{}'::uuid[])) AS uid;

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, url, tipo)
  SELECT u.id, 'OT recurrente creada',
    public.recurrente_title(NEW.titulo, v_next_iter, v_next_start, v_next_end),
    '/ordenes?id=' || v_new_parent_id::text,
    'orden'
  FROM public.usuarios u
  WHERE u.workspace_id = NEW.workspace_id
    AND u.rol = ANY (ARRAY['owner'::text, 'admin'::text])
    AND NOT (u.id = ANY(COALESCE(NEW.asignados_ids, '{}'::uuid[])));

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generar_siguiente_ot_recurrente"() OWNER TO "postgres";

--
-- Name: get_completion_message("uuid", "uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_completion_message"("p_workspace_id" "uuid", "p_oficio_id" "uuid" DEFAULT NULL::"uuid", "p_cargo_id" "uuid" DEFAULT NULL::"uuid", "p_rol" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "message" "text", "rarity" "public"."message_rarity")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_roll   float;
  v_target public.message_rarity;
  v_result RECORD;
BEGIN
  v_roll := random();

  IF    v_roll < 0.0001 THEN v_target := 'mythic';
  ELSIF v_roll < 0.0076 THEN v_target := 'legendary';
  ELSIF v_roll < 0.1276 THEN v_target := 'rare';
  ELSE                       v_target := 'common';
  END IF;

  -- Try to find a message at the target rarity, falling back down if none found
  LOOP
    SELECT cm.id, cm.message, cm.rarity INTO v_result
    FROM public.completion_messages cm
    WHERE cm.activo = true
      AND cm.rarity = v_target
      AND (cm.workspace_id IS NULL OR cm.workspace_id = p_workspace_id)
      AND (
        cm.oficio_id IS NULL OR cm.oficio_id = p_oficio_id
      )
      AND (
        cm.cargo_id IS NULL OR cm.cargo_id = p_cargo_id
      )
      AND (
        cm.rol_target IS NULL OR cm.rol_target = p_rol
      )
    ORDER BY random()
    LIMIT 1;

    IF v_result IS NOT NULL THEN
      RETURN QUERY SELECT v_result.id, v_result.message, v_result.rarity;
      RETURN;
    END IF;

    -- Fall back to lower rarity
    IF    v_target = 'mythic'    THEN v_target := 'legendary';
    ELSIF v_target = 'legendary' THEN v_target := 'rare';
    ELSIF v_target = 'rare'      THEN v_target := 'common';
    ELSE  EXIT; -- no common messages found either, return nothing
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."get_completion_message"("p_workspace_id" "uuid", "p_oficio_id" "uuid", "p_cargo_id" "uuid", "p_rol" "text") OWNER TO "postgres";

--
-- Name: get_overview_stats("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_overview_stats"("p_workspace_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  WITH base AS (
    SELECT
      id,
      prioridad,
      estado,
      fecha_termino,
      updated_at,
      asignados_ids
    FROM ordenes_trabajo
    WHERE workspace_id = p_workspace_id
      AND (p_user_id IS NULL OR asignados_ids @> ARRAY[p_user_id])
  ),
  now_vals AS (
    SELECT
      date_trunc('day', now())                        AS start_today,
      date_trunc('day', now()) + interval '1 day'     AS end_today,
      now() - interval '7 days'                       AS seven_days_ago
  )
  SELECT json_build_object(
    'altaPrioridad',
      (SELECT count(*) FROM base
       WHERE prioridad IN ('alta', 'urgente')
         AND estado NOT IN ('completado', 'cancelado')),
    'vencidas',
      (SELECT count(*) FROM base, now_vals
       WHERE fecha_termino < start_today
         AND estado NOT IN ('completado', 'cancelado')),
    'vencenHoy',
      (SELECT count(*) FROM base, now_vals
       WHERE fecha_termino >= start_today
         AND fecha_termino < end_today
         AND estado NOT IN ('completado', 'cancelado')),
    'completadasUltimos7Dias',
      (SELECT count(*) FROM base, now_vals
       WHERE estado = 'completado'
         AND updated_at >= seven_days_ago)
  ) FROM now_vals;
$$;


ALTER FUNCTION "public"."get_overview_stats"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  meta jsonb;
BEGIN
  meta := NEW.raw_user_meta_data;

  INSERT INTO public.usuarios (
    id,
    nombre,
    rol,
    cargo,
    workspace_id,
    activo,
    onboarding_done
  )
  VALUES (
    NEW.id,
    COALESCE(meta->>'nombre', split_part(NEW.email, '@', 1)),
    COALESCE(meta->>'rol', 'member'),
    meta->>'cargo',
    -- Only assign workspace if this came from an invite (metadata set by Edge Function)
    CASE WHEN meta->>'workspace_id' IS NOT NULL
         THEN (meta->>'workspace_id')::uuid
         ELSE NULL
    END,
    true,
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET
      nombre          = COALESCE(EXCLUDED.nombre, usuarios.nombre),
      workspace_id    = COALESCE(usuarios.workspace_id, EXCLUDED.workspace_id),
      activo          = true;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: mark_user_guide_seen("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."mark_user_guide_seen"("p_screen_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_guides jsonb;
BEGIN
  IF NULLIF(btrim(p_screen_key), '') IS NULL OR length(p_screen_key) > 100 THEN
    RAISE EXCEPTION 'Invalid guide key';
  END IF;

  UPDATE public.usuarios
  SET guias_vistas = COALESCE(guias_vistas, '{}'::jsonb)
    || jsonb_build_object(p_screen_key, now())
  WHERE id = auth.uid()
  RETURNING guias_vistas INTO v_guides;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user profile not found';
  END IF;

  RETURN v_guides;
END;
$$;


ALTER FUNCTION "public"."mark_user_guide_seen"("p_screen_key" "text") OWNER TO "postgres";

--
-- Name: my_workspace_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."my_workspace_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  SELECT workspace_id FROM public.usuarios WHERE id = (SELECT auth.uid()) LIMIT 1;
$$;


ALTER FUNCTION "public"."my_workspace_id"() OWNER TO "postgres";

--
-- Name: normalize_alert_rule_minimum_interval(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."normalize_alert_rule_minimum_interval"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.umbral_minutos := GREATEST(COALESCE(NEW.umbral_minutos, 60), 60);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normalize_alert_rule_minimum_interval"() OWNER TO "postgres";

--
-- Name: notify_procedure_completed(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."notify_procedure_completed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_proc public.procedimientos%ROWTYPE;
  v_ot public.ordenes_trabajo%ROWTYPE;
  v_rule public.reglas_alerta_workspace%ROWTYPE;
  v_otp_id uuid;
  v_actor_name text;
  v_has_selected boolean;
BEGIN
  IF NEW.estado <> 'completado' OR OLD.estado IS NOT DISTINCT FROM NEW.estado THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_proc FROM public.procedimientos WHERE id = NEW.procedimiento_id;
  IF NOT FOUND OR NOT v_proc.notificar_al_completar THEN RETURN NEW; END IF;

  SELECT * INTO v_rule
  FROM public.reglas_alerta_workspace
  WHERE workspace_id = v_proc.workspace_id
    AND tipo = 'procedimiento_completado'
    AND activa = true
  LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = NEW.orden_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT id INTO v_otp_id
  FROM public.ot_procedimientos
  WHERE orden_id = NEW.orden_id AND procedimiento_id = NEW.procedimiento_id
  LIMIT 1;
  IF v_otp_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(TRIM(nombre), ''), 'Un usuario')
  INTO v_actor_name
  FROM public.usuarios
  WHERE id = NEW.completado_por;
  v_actor_name := COALESCE(v_actor_name, 'Un usuario');

  SELECT EXISTS (
    SELECT 1 FROM public.reglas_alerta_usuarios rau WHERE rau.regla_id = v_rule.id
  ) INTO v_has_selected;

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
  SELECT u.id,
         'Procedimiento completado',
         v_actor_name || ' completó "' || v_proc.nombre || '" en la OT "' || v_ot.titulo || '".',
         'procedimiento_completado',
         '/orden/' || NEW.orden_id::text || '/procedimiento/' || v_otp_id::text
  FROM public.usuarios u
  WHERE u.workspace_id = v_proc.workspace_id
    AND COALESCE(u.activo, true) = true
    AND (
      NOT v_has_selected OR EXISTS (
        SELECT 1 FROM public.reglas_alerta_usuarios rau
        WHERE rau.regla_id = v_rule.id AND rau.usuario_id = u.id
      )
    );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_procedure_completed"() OWNER TO "postgres";

--
-- Name: notify_users("uuid"[], "text", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."notify_users"("p_usuario_ids" "uuid"[], "p_titulo" "text", "p_mensaje" "text", "p_tipo" "text", "p_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  uid uuid;
BEGIN
  FOREACH uid IN ARRAY p_usuario_ids LOOP
    INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
    VALUES (uid, p_titulo, p_mensaje, p_tipo, p_url);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."notify_users"("p_usuario_ids" "uuid"[], "p_titulo" "text", "p_mensaje" "text", "p_tipo" "text", "p_url" "text") OWNER TO "postgres";

--
-- Name: prevent_disabling_mandatory_alert_rule(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."prevent_disabling_mandatory_alert_rule"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.es_obligatoria AND OLD.activa AND NOT NEW.activa THEN
    RAISE EXCEPTION 'Las reglas obligatorias no se pueden desactivar';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_disabling_mandatory_alert_rule"() OWNER TO "postgres";

--
-- Name: recalcular_costo_materiales(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."recalcular_costo_materiales"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_orden_id uuid;
  v_costo    numeric;
begin
  v_orden_id := coalesce(new.orden_id, old.orden_id);

  select coalesce(sum(mu.cantidad * coalesce(mu.precio_unitario, 0)), 0)
    into v_costo
    from materiales_usados mu
   where mu.orden_id = v_orden_id;

  update ordenes_trabajo
     set costo_materiales = v_costo
   where id = v_orden_id;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."recalcular_costo_materiales"() OWNER TO "postgres";

--
-- Name: receive_material_stock("uuid", "uuid", numeric, timestamp with time zone, "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."receive_material_stock"("p_parte_id" "uuid", "p_proveedor_id" "uuid", "p_cantidad" numeric, "p_recibido_at" timestamp with time zone, "p_notas" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_workspace_id uuid;
  v_entry_id uuid;
BEGIN
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
  END IF;

  SELECT p.workspace_id INTO v_workspace_id
  FROM public.partes p
  WHERE p.id = p_parte_id AND p.activo = true
  FOR UPDATE;

  IF v_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Material no disponible';
  END IF;

  IF p_proveedor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.proveedores p
    WHERE p.id = p_proveedor_id AND p.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Proveedor no valido';
  END IF;

  UPDATE public.partes
  SET stock_actual = stock_actual + p_cantidad
  WHERE id = p_parte_id;

  INSERT INTO public.material_stock_entries (
    workspace_id, parte_id, proveedor_id, cantidad, recibido_at, notas
  ) VALUES (
    v_workspace_id,
    p_parte_id,
    p_proveedor_id,
    p_cantidad,
    COALESCE(p_recibido_at, now()),
    NULLIF(BTRIM(p_notas), '')
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;


ALTER FUNCTION "public"."receive_material_stock"("p_parte_id" "uuid", "p_proveedor_id" "uuid", "p_cantidad" numeric, "p_recibido_at" timestamp with time zone, "p_notas" "text") OWNER TO "postgres";

--
-- Name: recurrente_advance_date("date", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."recurrente_advance_date"("p_date" "date", "p_recurrencia" "text", "p_config" "jsonb" DEFAULT NULL::"jsonb") RETURNS "date"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_interval integer := GREATEST(1, COALESCE((p_config->>'interval')::integer, 1));
  v_weekdays jsonb := COALESCE(p_config->'weekdays', '[]'::jsonb);
  v_month_day integer := NULLIF(p_config->>'month_day', '')::integer;
  v_candidate date;
  v_month_start date;
  v_month_last date;
  v_guard integer := 0;
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;

  CASE p_recurrencia
    WHEN 'diaria' THEN
      IF jsonb_array_length(v_weekdays) > 0 THEN
        v_candidate := p_date + 1;
        WHILE v_guard < 370 LOOP
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_weekdays) d(day)
            WHERE d.day::int = EXTRACT(dow FROM v_candidate)::int
          ) THEN
            RETURN v_candidate;
          END IF;
          v_candidate := v_candidate + 1;
          v_guard := v_guard + 1;
        END LOOP;
      END IF;
      RETURN p_date + v_interval;

    WHEN 'semanal' THEN
      v_candidate := p_date + (v_interval * 7);
      IF jsonb_array_length(v_weekdays) > 0 THEN
        WHILE v_guard < 14 LOOP
          IF EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_weekdays) d(day)
            WHERE d.day::int = EXTRACT(dow FROM v_candidate)::int
          ) THEN
            RETURN v_candidate;
          END IF;
          v_candidate := v_candidate + 1;
          v_guard := v_guard + 1;
        END LOOP;
      END IF;
      RETURN v_candidate;

    WHEN 'quincenal' THEN
      RETURN p_date + 15;

    WHEN 'mensual', 'mensual_fecha', 'mensual_dia' THEN
      v_month_start := date_trunc('month', p_date + make_interval(months => v_interval))::date;
      v_month_last := (v_month_start + interval '1 month - 1 day')::date;
      RETURN v_month_start + (LEAST(COALESCE(v_month_day, EXTRACT(day FROM p_date)::int), EXTRACT(day FROM v_month_last)::int) - 1);

    WHEN 'anual' THEN
      RETURN (p_date + make_interval(years => v_interval))::date;

    WHEN 'personalizada' THEN
      CASE COALESCE(p_config->>'unit', 'day')
        WHEN 'day' THEN
          RETURN p_date + v_interval;
        WHEN 'week' THEN
          RETURN p_date + (v_interval * 7);
        WHEN 'month' THEN
          RETURN (p_date + make_interval(months => v_interval))::date;
        WHEN 'year' THEN
          RETURN (p_date + make_interval(years => v_interval))::date;
        ELSE
          RETURN p_date + v_interval;
      END CASE;

    ELSE
      RETURN NULL;
  END CASE;
END;
$$;


ALTER FUNCTION "public"."recurrente_advance_date"("p_date" "date", "p_recurrencia" "text", "p_config" "jsonb") OWNER TO "postgres";

--
-- Name: recurrente_base_title("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."recurrente_base_title"("p_title" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $_$
  SELECT trim(regexp_replace(COALESCE($1, 'Orden recurrente'), '\s*#\d+\s*/\s*Del .+$', '', 'i'));
$_$;


ALTER FUNCTION "public"."recurrente_base_title"("p_title" "text") OWNER TO "postgres";

--
-- Name: recurrente_format_date_es("date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."recurrente_format_date_es"("p_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_months text[] := ARRAY[
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
BEGIN
  IF p_date IS NULL THEN
    RETURN '';
  END IF;

  RETURN EXTRACT(day FROM p_date)::int || ' de ' ||
    v_months[EXTRACT(month FROM p_date)::int] || ' ' ||
    EXTRACT(year FROM p_date)::int;
END;
$$;


ALTER FUNCTION "public"."recurrente_format_date_es"("p_date" "date") OWNER TO "postgres";

--
-- Name: recurrente_title("text", integer, "date", "date"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."recurrente_title"("p_title" "text", "p_iteracion" integer, "p_inicio" "date", "p_termino" "date") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_base text := public.recurrente_base_title(p_title);
BEGIN
  IF p_inicio IS NULL THEN
    RETURN v_base || ' #' || p_iteracion;
  END IF;

  IF p_termino IS NULL OR p_termino = p_inicio THEN
    RETURN v_base || ' #' || p_iteracion || ' / ' || public.recurrente_format_date_es(p_inicio);
  END IF;

  RETURN v_base || ' #' || p_iteracion || ' / Del ' ||
    public.recurrente_format_date_es(p_inicio) || ' al ' ||
    public.recurrente_format_date_es(p_termino);
END;
$$;


ALTER FUNCTION "public"."recurrente_title"("p_title" "text", "p_iteracion" integer, "p_inicio" "date", "p_termino" "date") OWNER TO "postgres";

--
-- Name: refresh_extension_version_cache(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."refresh_extension_version_cache"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  -- Clear old rows
  TRUNCATE TABLE public.extension_version_cache;

  -- Repopulate
  INSERT INTO public.extension_version_cache (
    extname, version, schema,
    name_default, installed_version, installed_schema, default_version
  )
  SELECT
    ev.name AS extname,
    ev.version,
    ev.schema AS schema,
    (ev.version = e.default_version) AS name_default,

    x.extversion AS installed_version,
    n.nspname   AS installed_schema,
    e.default_version
  FROM pg_available_extensions e
  LEFT JOIN pg_extension x
    ON x.extname = e.name
  LEFT JOIN pg_namespace n
    ON n.oid = x.extnamespace
  JOIN pg_available_extension_versions ev
    ON ev.name = e.name;
  
  -- Stamp refresh time
  UPDATE public.extension_version_cache
  SET last_refreshed_at = now();
END;
$$;


ALTER FUNCTION "public"."refresh_extension_version_cache"() OWNER TO "postgres";

--
-- Name: release_material_reservation("uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."release_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_reservation material_reservations%ROWTYPE;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
  END IF;

  SELECT * INTO v_reservation
  FROM material_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF v_reservation.id IS NULL OR NOT EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = v_reservation.workspace_id
  ) THEN
    RAISE EXCEPTION 'Reserva no disponible';
  END IF;

  IF p_cantidad > v_reservation.cantidad THEN
    RAISE EXCEPTION 'La cantidad supera lo reservado';
  END IF;

  UPDATE partes
  SET stock_actual = stock_actual + p_cantidad
  WHERE id = v_reservation.parte_id;

  IF p_cantidad = v_reservation.cantidad THEN
    DELETE FROM material_reservations WHERE id = p_reservation_id;
  ELSE
    UPDATE material_reservations
    SET cantidad = cantidad - p_cantidad, updated_at = now()
    WHERE id = p_reservation_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."release_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) OWNER TO "postgres";

--
-- Name: reserve_material("uuid", "uuid", "uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."reserve_material"("p_parte_id" "uuid", "p_ubicacion_id" "uuid", "p_lugar_id" "uuid", "p_cantidad" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
  END IF;

  SELECT p.workspace_id INTO v_workspace_id
  FROM public.partes p
  WHERE p.id = p_parte_id AND p.activo = true
  FOR UPDATE;

  IF v_workspace_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Material no disponible';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ubicaciones u
    WHERE u.id = p_ubicacion_id AND u.workspace_id = v_workspace_id AND u.activa = true
  ) THEN
    RAISE EXCEPTION 'Ubicación no válida';
  END IF;

  IF p_lugar_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.lugares l
    WHERE l.id = p_lugar_id AND l.workspace_id = v_workspace_id
      AND l.ubicacion_id = p_ubicacion_id AND l.activo = true
  ) THEN
    RAISE EXCEPTION 'Lugar específico no válido';
  END IF;

  UPDATE public.partes
  SET stock_actual = stock_actual - p_cantidad
  WHERE id = p_parte_id AND stock_actual >= p_cantidad;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock disponible insuficiente';
  END IF;

  INSERT INTO public.material_reservations (
    workspace_id, parte_id, ubicacion_id, lugar_id, cantidad
  ) VALUES (
    v_workspace_id, p_parte_id, p_ubicacion_id, p_lugar_id, p_cantidad
  );
END;
$$;


ALTER FUNCTION "public"."reserve_material"("p_parte_id" "uuid", "p_ubicacion_id" "uuid", "p_lugar_id" "uuid", "p_cantidad" numeric) OWNER TO "postgres";

--
-- Name: return_material_withdrawal("uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."return_material_withdrawal"("p_withdrawal_id" "uuid", "p_cantidad" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE w public.material_withdrawals%ROWTYPE; BEGIN
 IF p_cantidad<=0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
 SELECT * INTO w FROM public.material_withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
 IF w.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.workspace_id=w.workspace_id) THEN RAISE EXCEPTION 'Retiro no disponible'; END IF;
 IF p_cantidad>w.cantidad-w.cantidad_devuelta THEN RAISE EXCEPTION 'La cantidad supera lo pendiente de devolución'; END IF;
 UPDATE public.partes SET stock_actual=stock_actual+p_cantidad WHERE id=w.parte_id;
 UPDATE public.material_withdrawals SET cantidad_devuelta=cantidad_devuelta+p_cantidad,ultima_devolucion_at=now() WHERE id=p_withdrawal_id;
 INSERT INTO public.material_withdrawal_returns(workspace_id,withdrawal_id,parte_id,ubicacion_id,lugar_id,cantidad) VALUES(w.workspace_id,w.id,w.parte_id,w.ubicacion_id,w.lugar_id,p_cantidad);
END; $$;


ALTER FUNCTION "public"."return_material_withdrawal"("p_withdrawal_id" "uuid", "p_cantidad" numeric) OWNER TO "postgres";

--
-- Name: sanitize_orden_activo_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sanitize_orden_activo_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.activo_id is not null
     and not exists (select 1 from activos a where a.id = new.activo_id) then
    new.activo_id := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sanitize_orden_activo_id"() OWNER TO "postgres";

--
-- Name: seed_notificacion_preferencias(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."seed_notificacion_preferencias"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  INSERT INTO notificacion_preferencias (usuario_id)
  VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_notificacion_preferencias"() OWNER TO "postgres";

--
-- Name: seed_reglas_alerta(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."seed_reglas_alerta"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  INSERT INTO public.reglas_alerta_workspace
    (workspace_id, tipo, umbral_minutos, es_obligatoria, rol_destino)
  VALUES
    (NEW.id, 'ot_vencida',                60,   true,  null),
    (NEW.id, 'ot_sin_asignar',            480,  false, null),
    (NEW.id, 'ot_urgente_sin_asignar',    60,   true,  null),
    (NEW.id, 'ot_bloqueada',              1440, true,  null),
    (NEW.id, 'ot_abierta_sin_progreso',   4320, false, null),
    (NEW.id, 'ot_en_curso_inactiva',      480,  false, null),
    (NEW.id, 'timer_inactivo_tecnico',    60,   false, 'member'),
    (NEW.id, 'timer_inactivo_supervisor', 120,  false, 'admin'),
    (NEW.id, 'timer_inactivo_manager',    1440, false, 'owner'),
    (NEW.id, 'inventario_stock_bajo',     60,   false, 'admin'),
    (NEW.id, 'procedimiento_completado',  60,   false, 'admin');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."seed_reglas_alerta"() OWNER TO "postgres";

--
-- Name: set_requiere_materiales_from_workspace(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_requiere_materiales_from_workspace"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN
  IF NEW.workspace_id IS NOT NULL THEN
    SELECT requiere_materiales_global INTO NEW.requiere_materiales
    FROM public.workspaces
    WHERE id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_requiere_materiales_from_workspace"() OWNER TO "postgres";

--
-- Name: set_solo_asignadas("uuid", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_solo_asignadas"("target_id" "uuid", "value" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  caller_rol text;
  target_rol text;
BEGIN
  SELECT rol INTO caller_rol FROM usuarios WHERE id = auth.uid();
  SELECT rol INTO target_rol FROM usuarios WHERE id = target_id;

  IF caller_rol NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  IF target_rol NOT IN ('member') THEN
    RAISE EXCEPTION 'Solo se puede cambiar la visibilidad de miembros completos';
  END IF;

  UPDATE usuarios SET solo_asignadas = value WHERE id = target_id;
END;
$$;


ALTER FUNCTION "public"."set_solo_asignadas"("target_id" "uuid", "value" boolean) OWNER TO "postgres";

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

--
-- Name: spawn_route_run("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."spawn_route_run"("p_route_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_route          public.inspection_routes%ROWTYPE;
  v_parent_id      uuid;
  v_item           public.inspection_route_items%ROWTYPE;
  v_sub_id         uuid;
  v_now            timestamptz := now();
  v_creator        uuid;
  v_procs          uuid[];
  v_asignados      uuid[];
  v_titulo         text;
BEGIN
  SELECT * INTO v_route FROM public.inspection_routes WHERE id = p_route_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection_routes row % not found', p_route_id;
  END IF;
  IF NOT v_route.activo_flag THEN
    RAISE EXCEPTION 'route % is archived', p_route_id;
  END IF;

  v_creator := auth.uid();
  v_titulo := v_route.nombre || ' — ' || to_char(v_now, 'DD/MM/YYYY');

  -- Parent OT
  INSERT INTO public.ordenes_trabajo (
    workspace_id, creado_por, titulo, descripcion,
    tipo, tipo_trabajo, estado, prioridad,
    recurrencia, recurrencia_config,
    sociedad_id, asignados_ids,
    requiere_materiales, requiere_hoja, requiere_fotos,
    inspection_route_id,
    estado_cobro, links
  ) VALUES (
    v_route.workspace_id, v_creator, v_titulo,
    COALESCE(v_route.descripcion, ''),
    'solicitud', v_route.tipo_trabajo, 'pendiente', v_route.prioridad,
    'ninguna', NULL,
    v_route.sociedad_id, v_route.default_asignados_ids,
    v_route.requiere_materiales, v_route.requiere_hoja, v_route.requiere_fotos,
    v_route.id,
    'no_cobrable', '[]'::jsonb
  )
  RETURNING id INTO v_parent_id;

  -- One sub-OT per route item, ordered by `orden` then created_at.
  FOR v_item IN
    SELECT * FROM public.inspection_route_items
    WHERE route_id = v_route.id
    ORDER BY orden ASC, created_at ASC
  LOOP
    v_procs := COALESCE(v_item.procedimiento_ids, v_route.default_procedimiento_ids);
    v_asignados := COALESCE(v_item.asignados_ids, v_route.default_asignados_ids);

    INSERT INTO public.ordenes_trabajo (
      workspace_id, creado_por, titulo, descripcion,
      tipo, tipo_trabajo, estado, prioridad,
      recurrencia, recurrencia_config,
      parent_id, activo_id, sociedad_id,
      ubicacion_id,
      asignados_ids,
      requiere_materiales, requiere_hoja, requiere_fotos,
      inspection_route_id, inspection_route_item_id,
      estado_cobro, links
    )
    SELECT
      v_route.workspace_id, v_creator,
      a.nombre,                          -- sub-OT title defaults to the activo name
      COALESCE(v_item.notas, ''),
      'solicitud', v_route.tipo_trabajo, 'pendiente', v_route.prioridad,
      'ninguna', NULL,
      v_parent_id, v_item.activo_id, v_route.sociedad_id,
      a.ubicacion_id,
      v_asignados,
      v_route.requiere_materiales, v_route.requiere_hoja, v_route.requiere_fotos,
      v_route.id, v_item.id,
      'no_cobrable', '[]'::jsonb
    FROM public.activos a
    WHERE a.id = v_item.activo_id
    RETURNING id INTO v_sub_id;

    -- Attach procedimientos (one ot_procedimientos row per proc id).
    IF v_procs IS NOT NULL AND array_length(v_procs, 1) IS NOT NULL THEN
      INSERT INTO public.ot_procedimientos (orden_id, procedimiento_id)
      SELECT v_sub_id, p FROM unnest(v_procs) AS p
      WHERE p IS NOT NULL;
    END IF;
  END LOOP;

  RETURN v_parent_id;
END;
$$;


ALTER FUNCTION "public"."spawn_route_run"("p_route_id" "uuid") OWNER TO "postgres";

--
-- Name: touch_clientes_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."touch_clientes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."touch_clientes_updated_at"() OWNER TO "postgres";

--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

--
-- Name: trigger_notify_assignment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trigger_notify_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  new_ids  uuid[];
  prev_ids uuid[];
  added    uuid[];
  actor    uuid;
  uid      uuid;
BEGIN
  new_ids  := COALESCE(NEW.asignados_ids, '{}');
  prev_ids := CASE WHEN TG_OP = 'INSERT' THEN '{}'::uuid[] ELSE COALESCE(OLD.asignados_ids, '{}') END;
  actor    := NEW.creado_por;

  SELECT ARRAY(SELECT UNNEST(new_ids) EXCEPT SELECT UNNEST(prev_ids)) INTO added;
  IF array_length(added, 1) IS NULL THEN RETURN NEW; END IF;

  FOREACH uid IN ARRAY added LOOP
    IF uid IS DISTINCT FROM actor AND EXISTS (SELECT 1 FROM public.usuarios WHERE id = uid) THEN
      INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
      VALUES (uid, 'Nueva orden asignada', 'Te han asignado a la orden: ' || NEW.titulo, 'asignado', '/orden/' || NEW.id::text);
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_notify_assignment"() OWNER TO "postgres";

--
-- Name: trigger_notify_comment(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trigger_notify_comment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  orden_row record;
BEGIN
  IF NEW.tipo <> 'comentario' THEN
    RETURN NEW;
  END IF;

  SELECT id, creado_por, asignados_ids
  INTO orden_row
  FROM public.ordenes_trabajo
  WHERE id = NEW.orden_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
  SELECT DISTINCT recipient.uid,
    'Nuevo comentario en orden',
    NEW.comentario,
    'comentario',
    '/orden/' || orden_row.id::text
  FROM (
    SELECT orden_row.creado_por AS uid
    UNION ALL
    SELECT unnest(COALESCE(orden_row.asignados_ids, '{}'::uuid[]))
  ) AS recipient
  INNER JOIN public.usuarios AS usuario ON usuario.id = recipient.uid
  WHERE recipient.uid IS NOT NULL
    AND recipient.uid <> NEW.usuario_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_notify_comment"() OWNER TO "postgres";

--
-- Name: trigger_notify_completion(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trigger_notify_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  recipients uuid[];
  recip      uuid;
BEGIN
  IF NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN
    SELECT ARRAY(
      SELECT DISTINCT sub.uid FROM (
        SELECT NEW.creado_por AS uid
        UNION ALL
        SELECT UNNEST(COALESCE(NEW.asignados_ids, '{}'))
      ) sub
      WHERE sub.uid IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.usuarios WHERE id = sub.uid)
    ) INTO recipients;

    FOREACH recip IN ARRAY recipients LOOP
      INSERT INTO public.notifications (usuario_id, titulo, mensaje, tipo, url)
      VALUES (recip, 'Orden completada', 'La orden "' || NEW.titulo || '" ha sido completada.', 'completado', '/orden/' || NEW.id::text);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_notify_completion"() OWNER TO "postgres";

--
-- Name: actividad_activo; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."actividad_activo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activo_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "tipo" "text" NOT NULL,
    "comentario" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."actividad_activo" OWNER TO "postgres";

--
-- Name: actividad_ot; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."actividad_ot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "tipo" "text" NOT NULL,
    "comentario" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "foto_url" "text",
    "audio_url" "text",
    "editado_at" timestamp with time zone,
    CONSTRAINT "actividad_ot_tipo_check" CHECK (("tipo" = ANY (ARRAY['creado'::"text", 'asignado'::"text", 'estado_cambiado'::"text", 'prioridad_cambiada'::"text", 'editado'::"text", 'ubicacion_cambiada'::"text", 'iniciado'::"text", 'pausado'::"text", 'reanudado'::"text", 'completado'::"text", 'cancelado'::"text", 'comentario'::"text", 'fotos_grupo_subidas'::"text"])))
);

ALTER TABLE ONLY "public"."actividad_ot" REPLICA IDENTITY FULL;


ALTER TABLE "public"."actividad_ot" OWNER TO "postgres";

--
-- Name: activo_materiales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."activo_materiales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activo_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "cantidad_recomendada" numeric DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activo_materiales" OWNER TO "postgres";

--
-- Name: activos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."activos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "ubicacion_id" "uuid",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fabricante_id" "uuid",
    "modelo_id" "uuid",
    "proveedor_id" "uuid",
    "responsable_id" "uuid",
    "activo_padre_id" "uuid",
    "numero_serie" "text",
    "año_fabricacion" integer,
    "criticidad" "text" DEFAULT 'no_critico'::"text",
    "fecha_garantia" "date",
    "imagen_url" "text",
    "archivo_url" "text",
    "archivo_nombre" "text",
    "estado" "text" DEFAULT 'operativo'::"text",
    "workspace_id" "uuid",
    "adjuntos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "sociedad_id" "uuid",
    "lugar_id" "uuid",
    CONSTRAINT "activos_criticidad_check" CHECK (("criticidad" = ANY (ARRAY['critico'::"text", 'semi_critico'::"text", 'no_critico'::"text"])))
);


ALTER TABLE "public"."activos" OWNER TO "postgres";

--
-- Name: alerta_enviada; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."alerta_enviada" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "enviada_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."alerta_enviada" OWNER TO "postgres";

--
-- Name: app_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."app_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_config" OWNER TO "postgres";

--
-- Name: archivos_orden; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."archivos_orden" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "url" "text" NOT NULL,
    "tipo_mime" "text",
    "tamano_kb" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo" "text" DEFAULT 'evidencia'::"text" NOT NULL,
    CONSTRAINT "archivos_orden_tipo_check" CHECK (("tipo" = ANY (ARRAY['contexto'::"text", 'evidencia'::"text"])))
);


ALTER TABLE "public"."archivos_orden" OWNER TO "postgres";

--
-- Name: COLUMN "archivos_orden"."tipo"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."archivos_orden"."tipo" IS 'contexto: foto del problema; evidencia: foto del trabajo realizado';


--
-- Name: auditoria_ot; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."auditoria_ot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid",
    "usuario_id" "uuid",
    "usuario_nombre" "text",
    "campo" "text",
    "valor_anterior" "text",
    "valor_nuevo" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."auditoria_ot" OWNER TO "postgres";

--
-- Name: capacitacion_asistentes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."capacitacion_asistentes" (
    "capacitacion_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL
);


ALTER TABLE "public"."capacitacion_asistentes" OWNER TO "postgres";

--
-- Name: capacitaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."capacitaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "instructor" "text",
    "fecha" "date" NOT NULL,
    "duracion_horas" numeric,
    "proveedor" "text",
    "codigo_sence" "text",
    "descripcion" "text",
    "archivo_url" "text",
    "archivo_nombre" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    CONSTRAINT "capacitaciones_tipo_check" CHECK (("tipo" = ANY (ARRAY['induccion'::"text", 'prevencion_riesgos'::"text", 'primeros_auxilios'::"text", 'uso_epp'::"text", 'emergencias'::"text", 'especifico'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."capacitaciones" OWNER TO "postgres";

--
-- Name: cargos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cargos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "nombre" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "nivel" smallint DEFAULT 1 NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cargos_nivel_check" CHECK ((("nivel" >= 1) AND ("nivel" <= 5)))
);


ALTER TABLE "public"."cargos" OWNER TO "postgres";

--
-- Name: categorias_ot; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."categorias_ot" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "icono" "text" NOT NULL,
    "color" "text" NOT NULL,
    "es_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_id" "uuid"
);


ALTER TABLE "public"."categorias_ot" OWNER TO "postgres";

--
-- Name: comentarios_orden; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."comentarios_orden" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "planta_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "tipo" "text" DEFAULT 'comentario'::"text" NOT NULL,
    "contenido" "text" NOT NULL,
    "metadatos" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."comentarios_orden" OWNER TO "postgres";

--
-- Name: completion_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."completion_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "rol_target" "text",
    "cargo_id" "uuid",
    "oficio_id" "uuid",
    "message" "text" NOT NULL,
    "rarity" "public"."message_rarity" DEFAULT 'common'::"public"."message_rarity" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."completion_messages" OWNER TO "postgres";

--
-- Name: cuadrilla_usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cuadrilla_usuarios" (
    "cuadrilla_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL
);


ALTER TABLE "public"."cuadrilla_usuarios" OWNER TO "postgres";

--
-- Name: cuadrillas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."cuadrillas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "tipo" "text" NOT NULL,
    "icono" "text" NOT NULL,
    "color" "text" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid"
);


ALTER TABLE "public"."cuadrillas" OWNER TO "postgres";

--
-- Name: export_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."export_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "ok" boolean,
    "num_emails_sent" integer DEFAULT 0 NOT NULL,
    "num_files_attached" integer DEFAULT 0 NOT NULL,
    "total_bytes" bigint DEFAULT 0 NOT NULL,
    "recipients_count" integer DEFAULT 0 NOT NULL,
    "ordenes_count" integer DEFAULT 0 NOT NULL,
    "error_message" "text",
    "error_detail" "jsonb"
);


ALTER TABLE "public"."export_runs" OWNER TO "postgres";

--
-- Name: export_schedules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."export_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "frequency" "public"."export_schedule_frequency" NOT NULL,
    "day_of_week" smallint,
    "day_of_month" smallint,
    "month_of_year" smallint,
    "hour_local" smallint DEFAULT 6 NOT NULL,
    "timezone" "text" DEFAULT 'America/Santiago'::"text" NOT NULL,
    "filter_preset" "public"."export_schedule_filter" DEFAULT 'todas'::"public"."export_schedule_filter" NOT NULL,
    "columns_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recipients" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "next_run_at" timestamp with time zone NOT NULL,
    "last_run_at" timestamp with time zone,
    "last_ok" boolean,
    "last_error" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "export_schedules_dom_range" CHECK ((("day_of_month" IS NULL) OR (("day_of_month" >= 1) AND ("day_of_month" <= 31)))),
    CONSTRAINT "export_schedules_dow_range" CHECK ((("day_of_week" IS NULL) OR (("day_of_week" >= 0) AND ("day_of_week" <= 6)))),
    CONSTRAINT "export_schedules_hour_range" CHECK ((("hour_local" >= 0) AND ("hour_local" <= 23))),
    CONSTRAINT "export_schedules_moy_range" CHECK ((("month_of_year" IS NULL) OR (("month_of_year" >= 1) AND ("month_of_year" <= 12)))),
    CONSTRAINT "export_schedules_recipients_nonempty" CHECK (("cardinality"("recipients") > 0))
);


ALTER TABLE "public"."export_schedules" OWNER TO "postgres";

--
-- Name: extension_version_cache; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."extension_version_cache" (
    "extname" "text" NOT NULL,
    "version" "text" NOT NULL,
    "schema" "text",
    "name_default" boolean DEFAULT false NOT NULL,
    "installed_version" "text",
    "installed_schema" "text",
    "default_version" "text",
    "last_refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."extension_version_cache" OWNER TO "postgres";

--
-- Name: fabricantes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."fabricantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    "created_by" "uuid"
);


ALTER TABLE "public"."fabricantes" OWNER TO "postgres";

--
-- Name: feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid",
    "tipo" "text" NOT NULL,
    "mensaje" "text" NOT NULL,
    "rating" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."feedback" OWNER TO "postgres";

--
-- Name: flow_customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."flow_customers" (
    "workspace_id" "uuid" NOT NULL,
    "flow_customer_id" "text" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "has_card" boolean DEFAULT false NOT NULL,
    "card_last4" "text",
    "card_brand" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."flow_customers" OWNER TO "postgres";

--
-- Name: foto_grupo_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."foto_grupo_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "orden_display" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."foto_grupo_items" OWNER TO "postgres";

--
-- Name: foto_grupos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."foto_grupos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "titulo" "text" DEFAULT ''::"text" NOT NULL,
    "descripcion" "text" DEFAULT ''::"text" NOT NULL,
    "orden_display" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "tipo" "text" DEFAULT 'evidencia'::"text" NOT NULL,
    CONSTRAINT "foto_grupos_tipo_check" CHECK (("tipo" = ANY (ARRAY['referencia'::"text", 'evidencia'::"text"])))
);


ALTER TABLE "public"."foto_grupos" OWNER TO "postgres";

--
-- Name: hitos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."hitos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hitos" OWNER TO "postgres";

--
-- Name: hojas_inventario; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."hojas_inventario" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "nombre" "text" DEFAULT 'Hoja 1'::"text" NOT NULL,
    "columnas" "jsonb" DEFAULT '[{"id": "c1", "tipo": "texto", "label": "Ítem"}, {"id": "c2", "tipo": "numero", "label": "Cantidad"}, {"id": "c3", "tipo": "texto", "label": "Unidad"}]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "orden_id" "uuid",
    "levantamiento_id" "uuid",
    "tipo" "text" DEFAULT 'general'::"text" NOT NULL,
    CONSTRAINT "hojas_inventario_tipo_check" CHECK (("tipo" = ANY (ARRAY['general'::"text", 'materiales_usados'::"text", 'materiales_solicitados'::"text"])))
);


ALTER TABLE "public"."hojas_inventario" OWNER TO "postgres";

--
-- Name: hojas_inventario_filas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."hojas_inventario_filas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "hoja_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "celdas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hojas_inventario_filas" OWNER TO "postgres";

--
-- Name: import_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."import_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" DEFAULT 'materiales'::"text" NOT NULL,
    "hoja" "text",
    "rango" "text" NOT NULL,
    "columnas" "jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archivo_url" "text",
    "archivo_nombre" "text",
    CONSTRAINT "import_templates_tipo_check" CHECK (("tipo" = 'materiales'::"text"))
);


ALTER TABLE "public"."import_templates" OWNER TO "postgres";

--
-- Name: incidentes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."incidentes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "fecha_ocurrencia" timestamp with time zone NOT NULL,
    "trabajador_id" "uuid",
    "trabajador_nombre" "text",
    "descripcion" "text" NOT NULL,
    "lugar" "text",
    "dias_perdidos" integer DEFAULT 0,
    "estado" "text" DEFAULT 'abierto'::"text" NOT NULL,
    "causa_raiz" "text",
    "medidas_correctivas" "jsonb" DEFAULT '[]'::"jsonb",
    "imagen_url" "text",
    "archivo_url" "text",
    "archivo_nombre" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    CONSTRAINT "incidentes_estado_check" CHECK (("estado" = ANY (ARRAY['abierto'::"text", 'investigando'::"text", 'cerrado'::"text"]))),
    CONSTRAINT "incidentes_tipo_check" CHECK (("tipo" = ANY (ARRAY['accidente'::"text", 'casi_accidente'::"text", 'enfermedad_profesional'::"text", 'emergencia'::"text"])))
);


ALTER TABLE "public"."incidentes" OWNER TO "postgres";

--
-- Name: inspection_route_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."inspection_route_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_id" "uuid" NOT NULL,
    "activo_id" "uuid" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "notas" "text",
    "procedimiento_ids" "uuid"[],
    "asignados_ids" "uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_route_items" OWNER TO "postgres";

--
-- Name: inspection_routes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."inspection_routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "sociedad_id" "uuid",
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "tipo_trabajo" "text" DEFAULT 'preventiva'::"text",
    "prioridad" "text" DEFAULT 'media'::"text",
    "recurrencia" "text" DEFAULT 'semanal'::"text",
    "recurrencia_config" "jsonb",
    "next_due_at" timestamp with time zone,
    "default_asignados_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "default_procedimiento_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "requiere_fotos" boolean DEFAULT true NOT NULL,
    "requiere_hoja" boolean DEFAULT false NOT NULL,
    "requiere_materiales" boolean DEFAULT false NOT NULL,
    "activo_flag" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inspection_routes" OWNER TO "postgres";

--
-- Name: levantamiento_actividad; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."levantamiento_actividad" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "levantamiento_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "comentario" "text",
    "usuario_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "levantamiento_actividad_tipo_check" CHECK (("tipo" = ANY (ARRAY['creado'::"text", 'asignado'::"text", 'estado_cambiado'::"text", 'enviado_revision'::"text", 'aprobado'::"text", 'no_viable'::"text", 'requiere_info'::"text", 'ot_creada'::"text", 'comentario'::"text"])))
);


ALTER TABLE "public"."levantamiento_actividad" OWNER TO "postgres";

--
-- Name: levantamiento_foto_grupos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."levantamiento_foto_grupos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "levantamiento_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text" DEFAULT ''::"text" NOT NULL,
    "orden_display" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."levantamiento_foto_grupos" OWNER TO "postgres";

--
-- Name: levantamiento_foto_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."levantamiento_foto_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "grupo_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "orden_display" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."levantamiento_foto_items" OWNER TO "postgres";

--
-- Name: levantamiento_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."levantamiento_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seccion_id" "uuid" NOT NULL,
    "campo" "text" NOT NULL,
    "tipo" "text" DEFAULT 'texto'::"text" NOT NULL,
    "valor_texto" "text",
    "valor_numero" numeric,
    "valor_bool" boolean,
    "unidad" "text",
    "orden_display" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "levantamiento_items_tipo_check" CHECK (("tipo" = ANY (ARRAY['texto'::"text", 'numero'::"text", 'si_no'::"text", 'opcion'::"text", 'medicion'::"text"])))
);


ALTER TABLE "public"."levantamiento_items" OWNER TO "postgres";

--
-- Name: levantamiento_materiales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."levantamiento_materiales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "levantamiento_id" "uuid" NOT NULL,
    "parte_id" "uuid" NOT NULL,
    "cantidad" numeric DEFAULT 1 NOT NULL,
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."levantamiento_materiales" OWNER TO "postgres";

--
-- Name: levantamiento_secciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."levantamiento_secciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "levantamiento_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "orden_display" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."levantamiento_secciones" OWNER TO "postgres";

--
-- Name: levantamientos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."levantamientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "numero" integer NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "estado" "text" DEFAULT 'creado'::"text" NOT NULL,
    "sociedad_id" "uuid",
    "ubicacion_id" "uuid",
    "lugar" "text",
    "creado_por" "uuid",
    "asignado_a" "uuid",
    "resultado_notas" "text",
    "orden_id" "uuid",
    "enviado_revision_at" timestamp with time zone,
    "revisado_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "levantamientos_estado_check" CHECK (("estado" = ANY (ARRAY['creado'::"text", 'en_terreno'::"text", 'en_revision'::"text", 'aprobado'::"text", 'no_viable'::"text", 'requiere_info'::"text"])))
);


ALTER TABLE "public"."levantamientos" OWNER TO "postgres";

--
-- Name: levantamientos_numero_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."levantamientos_numero_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."levantamientos_numero_seq" OWNER TO "postgres";

--
-- Name: levantamientos_numero_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE "public"."levantamientos_numero_seq" OWNED BY "public"."levantamientos"."numero";


--
-- Name: lugares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."lugares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "ubicacion_id" "uuid",
    "nombre" "text" NOT NULL,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "imagen_url" "text",
    "descripcion" "text",
    "direccion" "text",
    "grupo_cargo" "text",
    "qr_code" "text"
);


ALTER TABLE "public"."lugares" OWNER TO "postgres";

--
-- Name: material_proveedores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."material_proveedores" (
    "parte_id" "uuid" NOT NULL,
    "proveedor_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."material_proveedores" OWNER TO "postgres";

--
-- Name: material_reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."material_reservations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "parte_id" "uuid" NOT NULL,
    "ubicacion_id" "uuid" NOT NULL,
    "lugar_id" "uuid",
    "cantidad" numeric(10,2) NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_reservations_cantidad_check" CHECK (("cantidad" > (0)::numeric))
);


ALTER TABLE "public"."material_reservations" OWNER TO "postgres";

--
-- Name: material_stock_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."material_stock_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "parte_id" "uuid" NOT NULL,
    "proveedor_id" "uuid",
    "cantidad" numeric(10,2) NOT NULL,
    "recibido_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notas" "text",
    "registrado_por" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_stock_entries_cantidad_check" CHECK (("cantidad" > (0)::numeric))
);


ALTER TABLE "public"."material_stock_entries" OWNER TO "postgres";

--
-- Name: material_withdrawal_returns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."material_withdrawal_returns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "withdrawal_id" "uuid" NOT NULL,
    "parte_id" "uuid" NOT NULL,
    "ubicacion_id" "uuid" NOT NULL,
    "lugar_id" "uuid",
    "cantidad" numeric(10,2) NOT NULL,
    "devuelto_por" "uuid" DEFAULT "auth"."uid"(),
    "devuelto_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "material_withdrawal_returns_cantidad_check" CHECK (("cantidad" > (0)::numeric))
);


ALTER TABLE "public"."material_withdrawal_returns" OWNER TO "postgres";

--
-- Name: material_withdrawals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."material_withdrawals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "parte_id" "uuid" NOT NULL,
    "ubicacion_id" "uuid" NOT NULL,
    "lugar_id" "uuid",
    "cantidad" numeric(10,2) NOT NULL,
    "cantidad_devuelta" numeric(10,2) DEFAULT 0 NOT NULL,
    "retirado_por" "uuid" DEFAULT "auth"."uid"(),
    "retirado_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ultima_devolucion_at" timestamp with time zone,
    CONSTRAINT "material_withdrawals_cantidad_check" CHECK (("cantidad" > (0)::numeric)),
    CONSTRAINT "material_withdrawals_check" CHECK ((("cantidad_devuelta" >= (0)::numeric) AND ("cantidad_devuelta" <= "cantidad")))
);


ALTER TABLE "public"."material_withdrawals" OWNER TO "postgres";

--
-- Name: materiales_usados; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."materiales_usados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "cantidad" numeric NOT NULL,
    "unidad" "text" DEFAULT 'un'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "precio_unitario" numeric,
    "material_id" "uuid",
    CONSTRAINT "materiales_usados_cantidad_check" CHECK (("cantidad" > (0)::numeric))
);


ALTER TABLE "public"."materiales_usados" OWNER TO "postgres";

--
-- Name: mediciones_ambientales; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."mediciones_ambientales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "fecha_medicion" timestamp with time zone NOT NULL,
    "ubicacion_id" "uuid",
    "lugar" "text",
    "valor" numeric NOT NULL,
    "unidad" "text" NOT NULL,
    "limite_legal" numeric,
    "cumple" boolean,
    "responsable_id" "uuid",
    "observaciones" "text",
    "medida_preventiva" "text",
    "archivo_url" "text",
    "archivo_nombre" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    CONSTRAINT "mediciones_ambientales_tipo_check" CHECK (("tipo" = ANY (ARRAY['temperatura'::"text", 'iluminacion'::"text", 'ruido'::"text", 'humedad'::"text", 'polvo'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."mediciones_ambientales" OWNER TO "postgres";

--
-- Name: modelos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."modelos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "fabricante_id" "uuid",
    "nombre" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    "created_by" "uuid"
);


ALTER TABLE "public"."modelos" OWNER TO "postgres";

--
-- Name: notificacion_preferencias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notificacion_preferencias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "push_activo" boolean DEFAULT true NOT NULL,
    "push_sonido" boolean DEFAULT true NOT NULL,
    "notif_asignada" boolean DEFAULT true NOT NULL,
    "notif_comentario" boolean DEFAULT true NOT NULL,
    "notif_estado_cambiado" boolean DEFAULT true NOT NULL,
    "notif_recordatorio_timer" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notificacion_preferencias" OWNER TO "postgres";

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "mensaje" "text",
    "url" "text",
    "leida" boolean DEFAULT false,
    "tipo" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."notifications" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" OWNER TO "postgres";

--
-- Name: notifications_alertas_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."notifications_alertas_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "work_order_id" "uuid",
    "type" "text" NOT NULL,
    "triggered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "workspace_id" "uuid" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid" NOT NULL
);


ALTER TABLE "public"."notifications_alertas_log" OWNER TO "postgres";

--
-- Name: oficios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."oficios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "nombre" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "icono" "text",
    "color" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."oficios" OWNER TO "postgres";

--
-- Name: orden_partes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."orden_partes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "parte_id" "uuid" NOT NULL,
    "cantidad" numeric(10,2) DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cantidad_utilizada" numeric(10,2),
    CONSTRAINT "orden_partes_cantidad_check" CHECK (("cantidad" > (0)::numeric))
);


ALTER TABLE "public"."orden_partes" OWNER TO "postgres";

--
-- Name: ordenes_marcadas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ordenes_marcadas" (
    "orden_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "marcada_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ordenes_marcadas" OWNER TO "postgres";

--
-- Name: ordenes_trabajo; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ordenes_trabajo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ubicacion_id" "uuid",
    "tipo" "text" NOT NULL,
    "descripcion" "text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "prioridad" "text" DEFAULT 'media'::"text" NOT NULL,
    "hora_inicio" timestamp with time zone,
    "hora_termino" timestamp with time zone,
    "duracion_min" integer,
    "observacion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "titulo" "text",
    "tipo_trabajo" "text",
    "tiempo_estimado" integer,
    "fecha_inicio" "date",
    "fecha_termino" "date",
    "recurrencia" "text" DEFAULT 'ninguna'::"text",
    "activo_id" "uuid",
    "categoria_id" "uuid",
    "partes_requeridas" "jsonb" DEFAULT '[]'::"jsonb",
    "creado_por" "uuid",
    "workspace_id" "uuid",
    "completado_en" timestamp with time zone,
    "asignados_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "numero_meconecta" "text",
    "solicitante" "text",
    "ubicacion_texto" "text",
    "lugar" "text",
    "costo_materiales" numeric DEFAULT 0,
    "costo_mano_obra" numeric DEFAULT 0,
    "costo_total" numeric DEFAULT 0,
    "estado_cobro" "text" DEFAULT 'no_cobrable'::"text",
    "numero_factura" "text",
    "fecha_cobro" timestamp with time zone,
    "iniciado_at" timestamp with time zone,
    "pausado_at" timestamp with time zone,
    "en_ejecucion" boolean DEFAULT false NOT NULL,
    "tiempo_total_segundos" integer,
    "imagen_url" "text",
    "fotos_urls" "text"[] DEFAULT '{}'::"text"[],
    "lugar_id" "uuid",
    "sociedad_id" "uuid",
    "proxima_ejecucion" timestamp with time zone,
    "parent_id" "uuid",
    "numero" integer,
    "links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "n_serie" "text",
    "hito" "text",
    "requiere_materiales" boolean DEFAULT false NOT NULL,
    "requiere_hoja" boolean DEFAULT false NOT NULL,
    "requiere_fotos" boolean DEFAULT false NOT NULL,
    "presupuesto" "text",
    "clasificacion" "text",
    "recurrencia_config" "jsonb",
    "inspection_route_id" "uuid",
    "inspection_route_item_id" "uuid",
    "cliente_firma_url" "text",
    "cliente_firma_nombre" "text",
    "cliente_firma_at" timestamp with time zone,
    "origen" "text",
    "origen_paso_id" "uuid",
    "origen_ejecucion_id" "uuid",
    "recurrencia_origen_id" "uuid",
    "recurrencia_iteracion" integer,
    "categoria_ids" "uuid"[],
    "completado_por" "uuid",
    "deleted_at" timestamp with time zone,
    "deleted_by" "uuid",
    "solicitante_telefono" "text",
    "solicitante_email" "text",
    CONSTRAINT "ordenes_trabajo_clasificacion_check" CHECK (("clasificacion" = ANY (ARRAY['levantamiento'::"text", 'ejecucion'::"text"]))),
    CONSTRAINT "ordenes_trabajo_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'en_espera'::"text", 'en_curso'::"text", 'en_revision'::"text", 'completado'::"text", 'cancelado'::"text"]))),
    CONSTRAINT "ordenes_trabajo_estado_cobro_check" CHECK (("estado_cobro" = ANY (ARRAY['no_cobrable'::"text", 'pendiente_cobro'::"text", 'cobrado'::"text"]))),
    CONSTRAINT "ordenes_trabajo_prioridad_check" CHECK (("prioridad" = ANY (ARRAY['ninguna'::"text", 'baja'::"text", 'media'::"text", 'alta'::"text", 'urgente'::"text"]))),
    CONSTRAINT "ordenes_trabajo_recurrencia_check" CHECK (("recurrencia" = ANY (ARRAY['ninguna'::"text", 'diaria'::"text", 'semanal'::"text", 'quincenal'::"text", 'mensual'::"text", 'anual'::"text", 'personalizada'::"text"]))),
    CONSTRAINT "ordenes_trabajo_tipo_check" CHECK (("tipo" = ANY (ARRAY['solicitud'::"text", 'emergencia'::"text"]))),
    CONSTRAINT "ot_tipo_trabajo_check" CHECK ((("tipo_trabajo" IS NULL) OR ("tipo_trabajo" = ANY (ARRAY['reactiva'::"text", 'preventiva'::"text", 'emergencia'::"text", 'inspeccion'::"text", 'mejora'::"text", 'levantamiento'::"text", 'presupuesto'::"text"]))))
);


ALTER TABLE "public"."ordenes_trabajo" OWNER TO "postgres";

--
-- Name: COLUMN "ordenes_trabajo"."titulo"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."titulo" IS 'Título corto de la OT (ej: "Cambio de luminarias pasillo 3")';


--
-- Name: COLUMN "ordenes_trabajo"."tipo_trabajo"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."tipo_trabajo" IS 'Tipo: reactiva, preventiva, inspeccion, mejora';


--
-- Name: COLUMN "ordenes_trabajo"."tiempo_estimado"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."tiempo_estimado" IS 'Duración estimada en minutos';


--
-- Name: COLUMN "ordenes_trabajo"."fecha_inicio"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."fecha_inicio" IS 'Fecha programada de inicio';


--
-- Name: COLUMN "ordenes_trabajo"."fecha_termino"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."fecha_termino" IS 'Fecha límite (plazo)';


--
-- Name: COLUMN "ordenes_trabajo"."recurrencia"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."recurrencia" IS 'Frecuencia si es recurrente';


--
-- Name: COLUMN "ordenes_trabajo"."partes_requeridas"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."partes_requeridas" IS 'Lista de repuestos/materiales necesarios antes de iniciar [{nombre, cantidad, unidad}]';


--
-- Name: COLUMN "ordenes_trabajo"."completado_en"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."completado_en" IS 'Timestamp exacto en que la OT fue cerrada como completada';


--
-- Name: COLUMN "ordenes_trabajo"."origen"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."origen" IS 'Provenance of this OT. Examples: manual | correctiva_procedimiento | inspeccion_ruta | recurrente.';


--
-- Name: COLUMN "ordenes_trabajo"."deleted_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."deleted_at" IS 'When the OT was sent to trash (soft delete). NULL = active.';


--
-- Name: COLUMN "ordenes_trabajo"."deleted_by"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ordenes_trabajo"."deleted_by" IS 'User who sent the OT to trash.';


--
-- Name: ot_alert_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ot_alert_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ot_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "last_sent_at" timestamp with time zone,
    "next_eligible_at" timestamp with time zone,
    "condition_first_met_at" timestamp with time zone,
    "escalation_level" integer DEFAULT 0 NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ot_alert_state" OWNER TO "postgres";

--
-- Name: ot_procedimientos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ot_procedimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "procedimiento_id" "uuid" NOT NULL,
    "adjuntado_por" "uuid",
    "adjuntado_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hereda_a_hijos" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."ot_procedimientos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."ot_procedimientos" OWNER TO "postgres";

--
-- Name: COLUMN "ot_procedimientos"."hereda_a_hijos"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ot_procedimientos"."hereda_a_hijos" IS 'When true, new sub-OTs created under this OT auto-receive a row referencing the same procedimiento_id.';


--
-- Name: paso_respuesta_historial; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."paso_respuesta_historial" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "respuesta_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "valor_anterior" "jsonb" NOT NULL,
    "valor_nuevo" "jsonb" NOT NULL,
    "editado_por" "uuid",
    "editado_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."paso_respuesta_historial" OWNER TO "postgres";

--
-- Name: paso_respuestas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."paso_respuestas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ejecucion_id" "uuid" NOT NULL,
    "paso_id" "uuid" NOT NULL,
    "respondido_por" "uuid",
    "aprobado" boolean,
    "valor_medido" numeric,
    "foto_url" "text",
    "firmado_por_id" "uuid",
    "firmado_nombre" "text",
    "firmado_at" timestamp with time zone,
    "notas" "text",
    "respondido_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "valor_texto" "text",
    "valor_json" "jsonb",
    "firma_svg" "text",
    "workspace_id" "uuid",
    "valor_fecha" timestamp with time zone,
    "archivo_url" "text",
    "archivo_nombre" "text",
    "archivo_mime" "text",
    "lectura_anterior" numeric,
    "lectura_delta" numeric,
    "geo_lat" numeric,
    "geo_lng" numeric,
    "device_id" "text",
    "revision_paso" integer,
    "editado_at" timestamp with time zone,
    "editado_por" "uuid",
    "correctiva_ot_id" "uuid"
);

ALTER TABLE ONLY "public"."paso_respuestas" REPLICA IDENTITY FULL;


ALTER TABLE "public"."paso_respuestas" OWNER TO "postgres";

--
-- Name: COLUMN "paso_respuestas"."revision_paso"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."paso_respuestas"."revision_paso" IS 'Snapshot of procedimiento_pasos.version at the moment this respuesta was first written (ISO 9001 traceability).';


--
-- Name: COLUMN "paso_respuestas"."correctiva_ot_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."paso_respuestas"."correctiva_ot_id" IS 'FK to the sub-OT auto-created by crear_correctiva_desde_paso(). Null if no corrective was triggered.';


--
-- Name: permisos_usuario; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."permisos_usuario" (
    "usuario_id" "uuid" NOT NULL,
    "modulo" "text" NOT NULL,
    "puede_ver" boolean DEFAULT true NOT NULL,
    CONSTRAINT "modulo_valido" CHECK (("modulo" = ANY (ARRAY['inventario'::"text", 'reportes'::"text", 'facturacion'::"text", 'calendario'::"text", 'preventivos'::"text", 'usuarios'::"text", 'clientes'::"text"])))
);


ALTER TABLE "public"."permisos_usuario" OWNER TO "postgres";

--
-- Name: presupuestos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."presupuestos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "año" integer NOT NULL,
    "mes" integer NOT NULL,
    "tipo" "text" NOT NULL,
    "monto" numeric DEFAULT 0 NOT NULL,
    "descripcion" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid",
    CONSTRAINT "presupuestos_mes_check" CHECK ((("mes" >= 1) AND ("mes" <= 12))),
    CONSTRAINT "presupuestos_tipo_check" CHECK (("tipo" = ANY (ARRAY['capex'::"text", 'opex'::"text"])))
);


ALTER TABLE "public"."presupuestos" OWNER TO "postgres";

--
-- Name: procedimiento_ejecuciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."procedimiento_ejecuciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "procedimiento_id" "uuid" NOT NULL,
    "orden_id" "uuid" NOT NULL,
    "iniciado_por" "uuid",
    "completado_por" "uuid",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "iniciado_at" timestamp with time zone,
    "completado_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workspace_id" "uuid",
    CONSTRAINT "procedimiento_ejecuciones_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'en_curso'::"text", 'completado'::"text", 'cancelado'::"text"])))
);

ALTER TABLE ONLY "public"."procedimiento_ejecuciones" REPLICA IDENTITY FULL;


ALTER TABLE "public"."procedimiento_ejecuciones" OWNER TO "postgres";

--
-- Name: procedimiento_pasos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."procedimiento_pasos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "procedimiento_id" "uuid" NOT NULL,
    "orden" integer NOT NULL,
    "tipo" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "requerido" boolean DEFAULT true NOT NULL,
    "unidad" "text",
    "valor_min" numeric,
    "valor_max" numeric,
    "cantidad" numeric,
    "rol_firmante" "text",
    "opciones" "text"[],
    "multilinea" boolean DEFAULT false NOT NULL,
    "moneda" "text" DEFAULT 'CLP'::"text" NOT NULL,
    "peso" integer DEFAULT 0 NOT NULL,
    "condicion_paso_id" "uuid",
    "condicion_operador" "text",
    "condicion_valor" "jsonb",
    "requiere_nota_si" "jsonb",
    "requiere_foto_si" "jsonb",
    "genera_correctiva" boolean DEFAULT false NOT NULL,
    "correctiva_plantilla" "jsonb",
    "medidor_id" "uuid",
    "sub_procedimiento_id" "uuid",
    "multimedia_url" "text",
    CONSTRAINT "procedimiento_pasos_tipo_check" CHECK (("tipo" = ANY (ARRAY['instruccion'::"text", 'advertencia'::"text", 'texto'::"text", 'numero'::"text", 'monto'::"text", 'si_no_na'::"text", 'opcion_multiple'::"text", 'lista_verificacion'::"text", 'inspeccion'::"text", 'imagen'::"text", 'firma'::"text", 'medidor'::"text", 'archivo'::"text", 'fecha'::"text", 'hora'::"text", 'fecha_hora'::"text", 'escaneo'::"text", 'falla_iso14224'::"text", 'sub_procedimiento'::"text", 'seccion'::"text", 'puntuacion'::"text"])))
);


ALTER TABLE "public"."procedimiento_pasos" OWNER TO "postgres";

--
-- Name: COLUMN "procedimiento_pasos"."peso"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimiento_pasos"."peso" IS 'Score weight (0 = not scored).';


--
-- Name: COLUMN "procedimiento_pasos"."condicion_paso_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimiento_pasos"."condicion_paso_id" IS 'If set, this step only renders when the referenced paso evaluates to condicion_valor under condicion_operador.';


--
-- Name: COLUMN "procedimiento_pasos"."condicion_operador"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimiento_pasos"."condicion_operador" IS 'eq | ne | in | gt | lt | gte | lte | contains';


--
-- Name: COLUMN "procedimiento_pasos"."requiere_nota_si"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimiento_pasos"."requiere_nota_si" IS 'jsonb shape: {"on":["fail","no","poor","replace"]} — values that force a note.';


--
-- Name: COLUMN "procedimiento_pasos"."requiere_foto_si"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimiento_pasos"."requiere_foto_si" IS 'Same shape as requiere_nota_si but for required photo evidence.';


--
-- Name: COLUMN "procedimiento_pasos"."correctiva_plantilla"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimiento_pasos"."correctiva_plantilla" IS 'jsonb: defaults for the auto-created corrective sub-OT (titulo, descripcion, prioridad, tipo, asignado_a).';


--
-- Name: COLUMN "procedimiento_pasos"."medidor_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimiento_pasos"."medidor_id" IS 'FK to a future medidores table. Left nullable + unconstrained for now.';


--
-- Name: procedimiento_plantillas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."procedimiento_plantillas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "iso_categoria" "text",
    "pasos_json" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."procedimiento_plantillas" OWNER TO "postgres";

--
-- Name: procedimiento_subprocedimientos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."procedimiento_subprocedimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_paso_id" "uuid" NOT NULL,
    "child_procedimiento_id" "uuid" NOT NULL,
    "orden" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."procedimiento_subprocedimientos" OWNER TO "postgres";

--
-- Name: procedimientos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."procedimientos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "categoria" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "bloquea_cierre_ot" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_adjuntar" boolean DEFAULT false NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "iso_categoria" "text",
    "hereda_a_hijos" boolean DEFAULT false NOT NULL,
    "bloquea_inicio" boolean DEFAULT false NOT NULL,
    "notificar_al_completar" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."procedimientos" OWNER TO "postgres";

--
-- Name: COLUMN "procedimientos"."version"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimientos"."version" IS 'Template revision counter (ISO 9001 cl. 7.5.3). Bumped on structural edits by the app.';


--
-- Name: COLUMN "procedimientos"."iso_categoria"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimientos"."iso_categoria" IS 'Suggested: inspeccion | mantenimiento | seguridad | calibracion | otro. Open-ended, validated via workspace_taxonomias.';


--
-- Name: COLUMN "procedimientos"."hereda_a_hijos"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."procedimientos"."hereda_a_hijos" IS 'When true, attaching this procedure to a parent OT also attaches it to any sub-OT created afterwards.';


--
-- Name: proveedores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."proveedores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "contacto" "text",
    "email" "text",
    "telefono" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "workspace_id" "uuid"
);


ALTER TABLE "public"."proveedores" OWNER TO "postgres";

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "device_info" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";

--
-- Name: reglas_alerta_usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."reglas_alerta_usuarios" (
    "regla_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reglas_alerta_usuarios" OWNER TO "postgres";

--
-- Name: reglas_alerta_workspace; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."reglas_alerta_workspace" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "tipo" "text" NOT NULL,
    "activa" boolean DEFAULT true NOT NULL,
    "umbral_minutos" integer DEFAULT 60 NOT NULL,
    "rol_destino" "text",
    "es_obligatoria" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reglas_alerta_workspace_umbral_minimo_hora" CHECK (("umbral_minutos" >= 60))
);


ALTER TABLE "public"."reglas_alerta_workspace" OWNER TO "postgres";

--
-- Name: sociedades; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."sociedades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "activa" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "imagen_url" "text",
    "rut" "text",
    "contacto_nombre" "text",
    "contacto_email" "text",
    "contacto_telefono" "text",
    "direccion" "text",
    "contrato_ref" "text",
    "contrato_inicio" "date",
    "contrato_termino" "date",
    "brand_color" "text",
    "notas" "text",
    "descripcion" "text",
    "grupo_cargo" "text",
    "qr_code" "text"
);


ALTER TABLE "public"."sociedades" OWNER TO "postgres";

--
-- Name: solicitantes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."solicitantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "telefono" "text",
    "email" "text"
);


ALTER TABLE "public"."solicitantes" OWNER TO "postgres";

--
-- Name: solicitudes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."solicitudes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "prioridad" "text" DEFAULT 'ninguna'::"text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "creado_por" "uuid",
    "ubicacion_id" "uuid",
    "lugar_id" "uuid",
    "imagen_url" "text",
    "revisado_por" "uuid",
    "revisado_at" timestamp with time zone,
    "nota_revision" "text",
    "orden_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tipo_trabajo" "text",
    "numero_serie" "text",
    "solicitante_texto" "text",
    "hito_id" "uuid",
    "asignados_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "sociedad_id" "uuid",
    "lugar_texto" "text",
    CONSTRAINT "solicitudes_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aprobada'::"text", 'rechazada'::"text", 'cancelada'::"text"]))),
    CONSTRAINT "solicitudes_prioridad_check" CHECK (("prioridad" = ANY (ARRAY['ninguna'::"text", 'baja'::"text", 'media'::"text", 'alta'::"text", 'urgente'::"text"]))),
    CONSTRAINT "solicitudes_tipo_trabajo_check" CHECK (("tipo_trabajo" = ANY (ARRAY['reactiva'::"text", 'preventiva'::"text", 'inspeccion'::"text", 'mejora'::"text"])))
);


ALTER TABLE "public"."solicitudes" OWNER TO "postgres";

--
-- Name: solicitudes_arco; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."solicitudes_arco" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "rut" "text" NOT NULL,
    "email" "text" NOT NULL,
    "detalle" "text",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."solicitudes_arco" OWNER TO "postgres";

--
-- Name: subscription_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."subscription_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid",
    "workspace_id" "uuid",
    "event_type" "text" NOT NULL,
    "flow_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."subscription_events" OWNER TO "postgres";

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "plan_key" "text" NOT NULL,
    "flow_subscription_id" "text",
    "flow_plan_id" "text",
    "price_per_user_clp" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "trial_end" timestamp with time zone,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_early_customer" boolean DEFAULT false NOT NULL,
    "custom_price_note" "text",
    "price_lock_until" timestamp with time zone,
    CONSTRAINT "subscriptions_plan_key_check" CHECK (("plan_key" = ANY (ARRAY['basic'::"text", 'esencial'::"text", 'pro'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'unpaid'::"text", 'basic_free'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";

--
-- Name: COLUMN "subscriptions"."is_early_customer"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."subscriptions"."is_early_customer" IS 'TRUE = price_per_user_clp es un precio negociado (founder/early customer). No sobrescribir desde catálogo.';


--
-- Name: COLUMN "subscriptions"."custom_price_note"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."subscriptions"."custom_price_note" IS 'Nota visible al owner explicando el precio especial.';


--
-- Name: COLUMN "subscriptions"."price_lock_until"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."subscriptions"."price_lock_until" IS 'NULL = lock permanente. Timestamp = hasta cuándo se respeta el precio.';


--
-- Name: tipos_parte; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."tipos_parte" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."tipos_parte" OWNER TO "postgres";

--
-- Name: ubicaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."ubicaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "edificio" "text" NOT NULL,
    "detalle" "text",
    "activa" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sociedad_id" "uuid",
    "imagen_url" "text",
    "direccion" "text",
    "grupo_cargo" "text",
    "creado_por" "uuid",
    "descripcion" "text",
    "qr_code" "text"
);


ALTER TABLE "public"."ubicaciones" OWNER TO "postgres";

--
-- Name: uni_solicitudes_vistas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."uni_solicitudes_vistas" (
    "id_externo" integer NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "folio" "text",
    "fecha" timestamp with time zone,
    "estado" "text",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."uni_solicitudes_vistas" OWNER TO "postgres";

--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "rol" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "plan" "text" DEFAULT 'gratis'::"text",
    "plan_status" "text" DEFAULT 'trial'::"text",
    "trial_end" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "cargo" "text",
    "oficio" "text",
    "last_active" timestamp with time zone,
    "workspace_id" "uuid",
    "onboarding_done" boolean DEFAULT false NOT NULL,
    "expo_push_token" "text",
    "solo_asignadas" boolean DEFAULT false NOT NULL,
    "cargo_id" "uuid",
    "oficio_id" "uuid",
    "telefono" "text",
    "guias_vistas" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "usuarios_guias_vistas_object" CHECK (("jsonb_typeof"("guias_vistas") = 'object'::"text")),
    CONSTRAINT "usuarios_rol_check" CHECK (("rol" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text", 'requester'::"text"])))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";

--
-- Name: COLUMN "usuarios"."plan"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."usuarios"."plan" IS 'Plan suscripcion: gratis, basic, pro, empresa';


--
-- Name: COLUMN "usuarios"."plan_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."usuarios"."plan_status" IS 'Estado suscripcion: trial, active, paused, cancelled, payment_failed';


--
-- Name: COLUMN "usuarios"."trial_end"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."usuarios"."trial_end" IS 'Fecha fin periodo de prueba (30 días desde registro)';


--
-- Name: COLUMN "usuarios"."cargo"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."usuarios"."cargo" IS 'Cargo del usuario: Jefe de Mantención, Supervisor, Ingeniero, etc.';


--
-- Name: COLUMN "usuarios"."guias_vistas"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."usuarios"."guias_vistas" IS 'Map of first-visit guide keys to the timestamp when each guide was dismissed.';


--
-- Name: workspace_taxonomias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."workspace_taxonomias" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid",
    "tipo" "text" NOT NULL,
    "valores" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_taxonomias" OWNER TO "postgres";

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "sector" "text",
    "region" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "requiere_materiales_global" boolean DEFAULT false NOT NULL,
    "requiere_hoja_global" boolean DEFAULT false NOT NULL,
    "requiere_fotos_global" boolean DEFAULT false NOT NULL,
    "fotos_obligatorias_todas" boolean DEFAULT false NOT NULL,
    "crear_ot_solo_admins" boolean DEFAULT false NOT NULL,
    "pedir_clasificacion" boolean DEFAULT false NOT NULL,
    "modo_registro" "text" DEFAULT 'ambos'::"text" NOT NULL,
    "logo_url" "text",
    "tipo" "text" DEFAULT 'subcontratista'::"text" NOT NULL,
    CONSTRAINT "workspaces_modo_registro_check" CHECK (("modo_registro" = ANY (ARRAY['ambos'::"text", 'materiales'::"text", 'hoja'::"text"]))),
    CONSTRAINT "workspaces_tipo_check" CHECK (("tipo" = ANY (ARRAY['propietario'::"text", 'subcontratista'::"text", 'hibrido'::"text"])))
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";

--
-- Name: levantamientos numero; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos" ALTER COLUMN "numero" SET DEFAULT "nextval"('"public"."levantamientos_numero_seq"'::"regclass");


--
-- Name: actividad_activo actividad_activo_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."actividad_activo"
    ADD CONSTRAINT "actividad_activo_pkey" PRIMARY KEY ("id");


--
-- Name: actividad_ot actividad_ot_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."actividad_ot"
    ADD CONSTRAINT "actividad_ot_pkey" PRIMARY KEY ("id");


--
-- Name: activo_materiales activo_materiales_activo_id_material_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activo_materiales"
    ADD CONSTRAINT "activo_materiales_activo_id_material_id_key" UNIQUE ("activo_id", "material_id");


--
-- Name: activo_materiales activo_materiales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activo_materiales"
    ADD CONSTRAINT "activo_materiales_pkey" PRIMARY KEY ("id");


--
-- Name: activos activos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_pkey" PRIMARY KEY ("id");


--
-- Name: alerta_enviada alerta_enviada_orden_id_tipo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alerta_enviada"
    ADD CONSTRAINT "alerta_enviada_orden_id_tipo_key" UNIQUE ("orden_id", "tipo");


--
-- Name: alerta_enviada alerta_enviada_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alerta_enviada"
    ADD CONSTRAINT "alerta_enviada_pkey" PRIMARY KEY ("id");


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."app_config"
    ADD CONSTRAINT "app_config_pkey" PRIMARY KEY ("key");


--
-- Name: archivos_orden archivos_orden_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."archivos_orden"
    ADD CONSTRAINT "archivos_orden_pkey" PRIMARY KEY ("id");


--
-- Name: auditoria_ot auditoria_ot_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."auditoria_ot"
    ADD CONSTRAINT "auditoria_ot_pkey" PRIMARY KEY ("id");


--
-- Name: capacitacion_asistentes capacitacion_asistentes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."capacitacion_asistentes"
    ADD CONSTRAINT "capacitacion_asistentes_pkey" PRIMARY KEY ("capacitacion_id", "usuario_id");


--
-- Name: capacitaciones capacitaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."capacitaciones"
    ADD CONSTRAINT "capacitaciones_pkey" PRIMARY KEY ("id");


--
-- Name: cargos cargos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cargos"
    ADD CONSTRAINT "cargos_pkey" PRIMARY KEY ("id");


--
-- Name: cargos cargos_slug_global_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cargos"
    ADD CONSTRAINT "cargos_slug_global_unique" UNIQUE NULLS NOT DISTINCT ("workspace_id", "slug");


--
-- Name: categorias_ot categorias_ot_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categorias_ot"
    ADD CONSTRAINT "categorias_ot_pkey" PRIMARY KEY ("id");


--
-- Name: comentarios_orden comentarios_orden_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comentarios_orden"
    ADD CONSTRAINT "comentarios_orden_pkey" PRIMARY KEY ("id");


--
-- Name: completion_messages completion_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."completion_messages"
    ADD CONSTRAINT "completion_messages_pkey" PRIMARY KEY ("id");


--
-- Name: cuadrilla_usuarios cuadrilla_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cuadrilla_usuarios"
    ADD CONSTRAINT "cuadrilla_usuarios_pkey" PRIMARY KEY ("cuadrilla_id", "usuario_id");


--
-- Name: cuadrillas cuadrillas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cuadrillas"
    ADD CONSTRAINT "cuadrillas_pkey" PRIMARY KEY ("id");


--
-- Name: export_runs export_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."export_runs"
    ADD CONSTRAINT "export_runs_pkey" PRIMARY KEY ("id");


--
-- Name: export_schedules export_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."export_schedules"
    ADD CONSTRAINT "export_schedules_pkey" PRIMARY KEY ("id");


--
-- Name: extension_version_cache extension_version_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."extension_version_cache"
    ADD CONSTRAINT "extension_version_cache_pkey" PRIMARY KEY ("extname", "version");


--
-- Name: fabricantes fabricantes_nombre_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fabricantes"
    ADD CONSTRAINT "fabricantes_nombre_key" UNIQUE ("nombre");


--
-- Name: fabricantes fabricantes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fabricantes"
    ADD CONSTRAINT "fabricantes_pkey" PRIMARY KEY ("id");


--
-- Name: feedback feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_pkey" PRIMARY KEY ("id");


--
-- Name: flow_customers flow_customers_flow_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flow_customers"
    ADD CONSTRAINT "flow_customers_flow_customer_id_key" UNIQUE ("flow_customer_id");


--
-- Name: flow_customers flow_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flow_customers"
    ADD CONSTRAINT "flow_customers_pkey" PRIMARY KEY ("workspace_id");


--
-- Name: foto_grupo_items foto_grupo_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."foto_grupo_items"
    ADD CONSTRAINT "foto_grupo_items_pkey" PRIMARY KEY ("id");


--
-- Name: foto_grupos foto_grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."foto_grupos"
    ADD CONSTRAINT "foto_grupos_pkey" PRIMARY KEY ("id");


--
-- Name: hitos hitos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hitos"
    ADD CONSTRAINT "hitos_pkey" PRIMARY KEY ("id");


--
-- Name: hojas_inventario_filas hojas_inventario_filas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario_filas"
    ADD CONSTRAINT "hojas_inventario_filas_pkey" PRIMARY KEY ("id");


--
-- Name: hojas_inventario hojas_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario"
    ADD CONSTRAINT "hojas_inventario_pkey" PRIMARY KEY ("id");


--
-- Name: import_templates import_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."import_templates"
    ADD CONSTRAINT "import_templates_pkey" PRIMARY KEY ("id");


--
-- Name: incidentes incidentes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_pkey" PRIMARY KEY ("id");


--
-- Name: inspection_route_items inspection_route_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inspection_route_items"
    ADD CONSTRAINT "inspection_route_items_pkey" PRIMARY KEY ("id");


--
-- Name: inspection_routes inspection_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inspection_routes"
    ADD CONSTRAINT "inspection_routes_pkey" PRIMARY KEY ("id");


--
-- Name: levantamiento_actividad levantamiento_actividad_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_actividad"
    ADD CONSTRAINT "levantamiento_actividad_pkey" PRIMARY KEY ("id");


--
-- Name: levantamiento_foto_grupos levantamiento_foto_grupos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_foto_grupos"
    ADD CONSTRAINT "levantamiento_foto_grupos_pkey" PRIMARY KEY ("id");


--
-- Name: levantamiento_foto_items levantamiento_foto_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_foto_items"
    ADD CONSTRAINT "levantamiento_foto_items_pkey" PRIMARY KEY ("id");


--
-- Name: levantamiento_items levantamiento_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_items"
    ADD CONSTRAINT "levantamiento_items_pkey" PRIMARY KEY ("id");


--
-- Name: levantamiento_materiales levantamiento_materiales_levantamiento_id_parte_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_materiales"
    ADD CONSTRAINT "levantamiento_materiales_levantamiento_id_parte_id_key" UNIQUE ("levantamiento_id", "parte_id");


--
-- Name: levantamiento_materiales levantamiento_materiales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_materiales"
    ADD CONSTRAINT "levantamiento_materiales_pkey" PRIMARY KEY ("id");


--
-- Name: levantamiento_secciones levantamiento_secciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_secciones"
    ADD CONSTRAINT "levantamiento_secciones_pkey" PRIMARY KEY ("id");


--
-- Name: levantamientos levantamientos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos"
    ADD CONSTRAINT "levantamientos_pkey" PRIMARY KEY ("id");


--
-- Name: lugares lugares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lugares"
    ADD CONSTRAINT "lugares_pkey" PRIMARY KEY ("id");


--
-- Name: material_proveedores material_proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_proveedores"
    ADD CONSTRAINT "material_proveedores_pkey" PRIMARY KEY ("parte_id", "proveedor_id");


--
-- Name: material_reservations material_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_reservations"
    ADD CONSTRAINT "material_reservations_pkey" PRIMARY KEY ("id");


--
-- Name: material_stock_entries material_stock_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_stock_entries"
    ADD CONSTRAINT "material_stock_entries_pkey" PRIMARY KEY ("id");


--
-- Name: material_withdrawal_returns material_withdrawal_returns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawal_returns"
    ADD CONSTRAINT "material_withdrawal_returns_pkey" PRIMARY KEY ("id");


--
-- Name: material_withdrawals material_withdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawals"
    ADD CONSTRAINT "material_withdrawals_pkey" PRIMARY KEY ("id");


--
-- Name: partes materiales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "materiales_pkey" PRIMARY KEY ("id");


--
-- Name: materiales_usados materiales_usados_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."materiales_usados"
    ADD CONSTRAINT "materiales_usados_pkey" PRIMARY KEY ("id");


--
-- Name: mediciones_ambientales mediciones_ambientales_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mediciones_ambientales"
    ADD CONSTRAINT "mediciones_ambientales_pkey" PRIMARY KEY ("id");


--
-- Name: modelos modelos_fabricante_id_nombre_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."modelos"
    ADD CONSTRAINT "modelos_fabricante_id_nombre_key" UNIQUE ("fabricante_id", "nombre");


--
-- Name: modelos modelos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."modelos"
    ADD CONSTRAINT "modelos_pkey" PRIMARY KEY ("id");


--
-- Name: notificacion_preferencias notificacion_preferencias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notificacion_preferencias"
    ADD CONSTRAINT "notificacion_preferencias_pkey" PRIMARY KEY ("id");


--
-- Name: notificacion_preferencias notificacion_preferencias_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notificacion_preferencias"
    ADD CONSTRAINT "notificacion_preferencias_usuario_id_key" UNIQUE ("usuario_id");


--
-- Name: notifications_alertas_log notifications_alertas_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications_alertas_log"
    ADD CONSTRAINT "notifications_alertas_log_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: oficios oficios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oficios"
    ADD CONSTRAINT "oficios_pkey" PRIMARY KEY ("id");


--
-- Name: oficios oficios_slug_global_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oficios"
    ADD CONSTRAINT "oficios_slug_global_unique" UNIQUE NULLS NOT DISTINCT ("workspace_id", "slug");


--
-- Name: orden_partes orden_partes_orden_id_parte_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orden_partes"
    ADD CONSTRAINT "orden_partes_orden_id_parte_id_key" UNIQUE ("orden_id", "parte_id");


--
-- Name: orden_partes orden_partes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orden_partes"
    ADD CONSTRAINT "orden_partes_pkey" PRIMARY KEY ("id");


--
-- Name: ordenes_marcadas ordenes_marcadas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_marcadas"
    ADD CONSTRAINT "ordenes_marcadas_pkey" PRIMARY KEY ("orden_id", "user_id");


--
-- Name: ordenes_trabajo ordenes_trabajo_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_pkey" PRIMARY KEY ("id");


--
-- Name: ot_alert_state ot_alert_state_ot_id_alert_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_alert_state"
    ADD CONSTRAINT "ot_alert_state_ot_id_alert_type_key" UNIQUE ("ot_id", "alert_type");


--
-- Name: ot_alert_state ot_alert_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_alert_state"
    ADD CONSTRAINT "ot_alert_state_pkey" PRIMARY KEY ("id");


--
-- Name: ot_procedimientos ot_procedimientos_orden_id_procedimiento_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_procedimientos"
    ADD CONSTRAINT "ot_procedimientos_orden_id_procedimiento_id_key" UNIQUE ("orden_id", "procedimiento_id");


--
-- Name: ot_procedimientos ot_procedimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_procedimientos"
    ADD CONSTRAINT "ot_procedimientos_pkey" PRIMARY KEY ("id");


--
-- Name: paso_respuesta_historial paso_respuesta_historial_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuesta_historial"
    ADD CONSTRAINT "paso_respuesta_historial_pkey" PRIMARY KEY ("id");


--
-- Name: paso_respuestas paso_respuestas_ejecucion_id_paso_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuestas"
    ADD CONSTRAINT "paso_respuestas_ejecucion_id_paso_id_key" UNIQUE ("ejecucion_id", "paso_id");


--
-- Name: paso_respuestas paso_respuestas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuestas"
    ADD CONSTRAINT "paso_respuestas_pkey" PRIMARY KEY ("id");


--
-- Name: permisos_usuario permisos_usuario_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."permisos_usuario"
    ADD CONSTRAINT "permisos_usuario_pkey" PRIMARY KEY ("usuario_id", "modulo");


--
-- Name: presupuestos presupuestos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_pkey" PRIMARY KEY ("id");


--
-- Name: procedimiento_subprocedimientos proc_subproc_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_subprocedimientos"
    ADD CONSTRAINT "proc_subproc_unique" UNIQUE ("parent_paso_id", "child_procedimiento_id");


--
-- Name: procedimiento_ejecuciones procedimiento_ejecuciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_ejecuciones"
    ADD CONSTRAINT "procedimiento_ejecuciones_pkey" PRIMARY KEY ("id");


--
-- Name: procedimiento_pasos procedimiento_pasos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_pasos"
    ADD CONSTRAINT "procedimiento_pasos_pkey" PRIMARY KEY ("id");


--
-- Name: procedimiento_pasos procedimiento_pasos_procedimiento_id_orden_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_pasos"
    ADD CONSTRAINT "procedimiento_pasos_procedimiento_id_orden_key" UNIQUE ("procedimiento_id", "orden");


--
-- Name: procedimiento_plantillas procedimiento_plantillas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_plantillas"
    ADD CONSTRAINT "procedimiento_plantillas_pkey" PRIMARY KEY ("id");


--
-- Name: procedimiento_subprocedimientos procedimiento_subprocedimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_subprocedimientos"
    ADD CONSTRAINT "procedimiento_subprocedimientos_pkey" PRIMARY KEY ("id");


--
-- Name: procedimientos procedimientos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimientos"
    ADD CONSTRAINT "procedimientos_pkey" PRIMARY KEY ("id");


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_usuario_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_usuario_id_key" UNIQUE ("usuario_id");


--
-- Name: reglas_alerta_usuarios reglas_alerta_usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reglas_alerta_usuarios"
    ADD CONSTRAINT "reglas_alerta_usuarios_pkey" PRIMARY KEY ("regla_id", "usuario_id");


--
-- Name: reglas_alerta_workspace reglas_alerta_workspace_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reglas_alerta_workspace"
    ADD CONSTRAINT "reglas_alerta_workspace_pkey" PRIMARY KEY ("id");


--
-- Name: reglas_alerta_workspace reglas_alerta_workspace_workspace_id_tipo_rol_destino_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reglas_alerta_workspace"
    ADD CONSTRAINT "reglas_alerta_workspace_workspace_id_tipo_rol_destino_key" UNIQUE ("workspace_id", "tipo", "rol_destino");


--
-- Name: sociedades sociedades_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sociedades"
    ADD CONSTRAINT "sociedades_pkey" PRIMARY KEY ("id");


--
-- Name: solicitantes solicitantes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitantes"
    ADD CONSTRAINT "solicitantes_pkey" PRIMARY KEY ("id");


--
-- Name: solicitudes_arco solicitudes_arco_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes_arco"
    ADD CONSTRAINT "solicitudes_arco_pkey" PRIMARY KEY ("id");


--
-- Name: solicitudes solicitudes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_pkey" PRIMARY KEY ("id");


--
-- Name: subscription_events subscription_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id");


--
-- Name: subscriptions subscriptions_flow_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_flow_subscription_id_key" UNIQUE ("flow_subscription_id");


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: tipos_parte tipos_parte_nombre_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tipos_parte"
    ADD CONSTRAINT "tipos_parte_nombre_key" UNIQUE ("nombre");


--
-- Name: tipos_parte tipos_parte_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."tipos_parte"
    ADD CONSTRAINT "tipos_parte_pkey" PRIMARY KEY ("id");


--
-- Name: ubicaciones ubicaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_pkey" PRIMARY KEY ("id");


--
-- Name: uni_solicitudes_vistas uni_solicitudes_vistas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."uni_solicitudes_vistas"
    ADD CONSTRAINT "uni_solicitudes_vistas_pkey" PRIMARY KEY ("id_externo");


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");


--
-- Name: workspace_taxonomias workspace_taxonomias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_taxonomias"
    ADD CONSTRAINT "workspace_taxonomias_pkey" PRIMARY KEY ("id");


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");


--
-- Name: workspace_taxonomias ws_tax_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_taxonomias"
    ADD CONSTRAINT "ws_tax_unique" UNIQUE NULLS NOT DISTINCT ("workspace_id", "tipo");


--
-- Name: actividad_ot_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "actividad_ot_created_at_idx" ON "public"."actividad_ot" USING "btree" ("created_at");


--
-- Name: actividad_ot_tipo_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "actividad_ot_tipo_idx" ON "public"."actividad_ot" USING "btree" ("tipo");


--
-- Name: cargos_nivel_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "cargos_nivel_idx" ON "public"."cargos" USING "btree" ("nivel");


--
-- Name: cargos_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "cargos_slug_idx" ON "public"."cargos" USING "btree" ("slug");


--
-- Name: cargos_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "cargos_workspace_idx" ON "public"."cargos" USING "btree" ("workspace_id");


--
-- Name: categorias_ot_nombre_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "categorias_ot_nombre_idx" ON "public"."categorias_ot" USING "btree" ("nombre");


--
-- Name: comentarios_orden_orden_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "comentarios_orden_orden_idx" ON "public"."comentarios_orden" USING "btree" ("orden_id", "created_at");


--
-- Name: completion_messages_cargo_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "completion_messages_cargo_idx" ON "public"."completion_messages" USING "btree" ("cargo_id");


--
-- Name: completion_messages_oficio_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "completion_messages_oficio_idx" ON "public"."completion_messages" USING "btree" ("oficio_id");


--
-- Name: completion_messages_rarity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "completion_messages_rarity_idx" ON "public"."completion_messages" USING "btree" ("rarity");


--
-- Name: completion_messages_rol_target_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "completion_messages_rol_target_idx" ON "public"."completion_messages" USING "btree" ("rol_target");


--
-- Name: completion_messages_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "completion_messages_workspace_idx" ON "public"."completion_messages" USING "btree" ("workspace_id");


--
-- Name: fabricantes_global_nombre_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "fabricantes_global_nombre_uniq" ON "public"."fabricantes" USING "btree" ("lower"("nombre")) WHERE ("workspace_id" IS NULL);


--
-- Name: fabricantes_ws_nombre_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "fabricantes_ws_nombre_uniq" ON "public"."fabricantes" USING "btree" ("workspace_id", "lower"("nombre")) WHERE ("workspace_id" IS NOT NULL);


--
-- Name: idx_actividad_activo_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_actividad_activo_activo" ON "public"."actividad_activo" USING "btree" ("activo_id", "created_at" DESC);


--
-- Name: idx_actividad_ot_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_actividad_ot_orden_id" ON "public"."actividad_ot" USING "btree" ("orden_id");


--
-- Name: idx_actividad_ot_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_actividad_ot_usuario_id" ON "public"."actividad_ot" USING "btree" ("usuario_id");


--
-- Name: idx_activos_activo_padre_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_activo_padre_id" ON "public"."activos" USING "btree" ("activo_padre_id");


--
-- Name: idx_activos_fabricante_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_fabricante_id" ON "public"."activos" USING "btree" ("fabricante_id");


--
-- Name: idx_activos_lugar_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_lugar_id" ON "public"."activos" USING "btree" ("lugar_id");


--
-- Name: idx_activos_modelo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_modelo_id" ON "public"."activos" USING "btree" ("modelo_id");


--
-- Name: idx_activos_proveedor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_proveedor_id" ON "public"."activos" USING "btree" ("proveedor_id");


--
-- Name: idx_activos_responsable_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_responsable_id" ON "public"."activos" USING "btree" ("responsable_id");


--
-- Name: idx_activos_sociedad; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_sociedad" ON "public"."activos" USING "btree" ("sociedad_id") WHERE ("activo" = true);


--
-- Name: idx_activos_ubicacion_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_ubicacion_id" ON "public"."activos" USING "btree" ("ubicacion_id");


--
-- Name: idx_activos_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_activos_workspace_id" ON "public"."activos" USING "btree" ("workspace_id");


--
-- Name: idx_auditoria_ot_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_auditoria_ot_orden_id" ON "public"."auditoria_ot" USING "btree" ("orden_id");


--
-- Name: idx_capacitaciones_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_capacitaciones_workspace" ON "public"."capacitaciones" USING "btree" ("workspace_id");


--
-- Name: idx_categorias_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_categorias_workspace" ON "public"."categorias_ot" USING "btree" ("workspace_id");


--
-- Name: idx_cuadrillas_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_cuadrillas_workspace" ON "public"."cuadrillas" USING "btree" ("workspace_id");


--
-- Name: idx_export_runs_schedule; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_export_runs_schedule" ON "public"."export_runs" USING "btree" ("schedule_id", "started_at" DESC);


--
-- Name: idx_export_runs_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_export_runs_workspace" ON "public"."export_runs" USING "btree" ("workspace_id", "started_at" DESC);


--
-- Name: idx_export_schedules_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_export_schedules_created_by" ON "public"."export_schedules" USING "btree" ("created_by");


--
-- Name: idx_export_schedules_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_export_schedules_due" ON "public"."export_schedules" USING "btree" ("next_run_at") WHERE ("active" = true);


--
-- Name: idx_export_schedules_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_export_schedules_workspace" ON "public"."export_schedules" USING "btree" ("workspace_id");


--
-- Name: idx_fk_activo_materiales_material_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_activo_materiales_material_id" ON "public"."activo_materiales" USING "btree" ("material_id");


--
-- Name: idx_fk_alerta_enviada_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_alerta_enviada_workspace_id" ON "public"."alerta_enviada" USING "btree" ("workspace_id");


--
-- Name: idx_fk_archivos_orden_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_archivos_orden_orden_id" ON "public"."archivos_orden" USING "btree" ("orden_id");


--
-- Name: idx_fk_cap_asistentes_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_cap_asistentes_usuario_id" ON "public"."capacitacion_asistentes" USING "btree" ("usuario_id");


--
-- Name: idx_fk_comentarios_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_comentarios_usuario_id" ON "public"."comentarios_orden" USING "btree" ("usuario_id");


--
-- Name: idx_fk_cuadrilla_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_cuadrilla_usuario_id" ON "public"."cuadrilla_usuarios" USING "btree" ("usuario_id");


--
-- Name: idx_fk_ejec_completado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_ejec_completado_por" ON "public"."procedimiento_ejecuciones" USING "btree" ("completado_por");


--
-- Name: idx_fk_ejec_iniciado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_ejec_iniciado_por" ON "public"."procedimiento_ejecuciones" USING "btree" ("iniciado_por");


--
-- Name: idx_fk_feedback_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_feedback_usuario_id" ON "public"."feedback" USING "btree" ("usuario_id");


--
-- Name: idx_fk_hitos_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_hitos_workspace_id" ON "public"."hitos" USING "btree" ("workspace_id");


--
-- Name: idx_fk_incidentes_trabajador_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_incidentes_trabajador_id" ON "public"."incidentes" USING "btree" ("trabajador_id");


--
-- Name: idx_fk_lev_actividad_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_lev_actividad_usuario_id" ON "public"."levantamiento_actividad" USING "btree" ("usuario_id");


--
-- Name: idx_fk_lev_foto_grupos_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_lev_foto_grupos_created_by" ON "public"."levantamiento_foto_grupos" USING "btree" ("created_by");


--
-- Name: idx_fk_lev_foto_grupos_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_lev_foto_grupos_workspace_id" ON "public"."levantamiento_foto_grupos" USING "btree" ("workspace_id");


--
-- Name: idx_fk_lev_materiales_parte_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_lev_materiales_parte_id" ON "public"."levantamiento_materiales" USING "btree" ("parte_id");


--
-- Name: idx_fk_mediciones_responsable_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_mediciones_responsable_id" ON "public"."mediciones_ambientales" USING "btree" ("responsable_id");


--
-- Name: idx_fk_ot_ubicacion_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_ot_ubicacion_id" ON "public"."ordenes_trabajo" USING "btree" ("ubicacion_id");


--
-- Name: idx_fk_otp_adjuntado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_otp_adjuntado_por" ON "public"."ot_procedimientos" USING "btree" ("adjuntado_por");


--
-- Name: idx_fk_otp_procedimiento_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_otp_procedimiento_id" ON "public"."ot_procedimientos" USING "btree" ("procedimiento_id");


--
-- Name: idx_fk_partes_activo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_partes_activo_id" ON "public"."partes" USING "btree" ("activo_id");


--
-- Name: idx_fk_partes_proveedor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_partes_proveedor_id" ON "public"."partes" USING "btree" ("proveedor_id");


--
-- Name: idx_fk_partes_tipo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_partes_tipo_id" ON "public"."partes" USING "btree" ("tipo_parte_id");


--
-- Name: idx_fk_partes_ubicacion_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_partes_ubicacion_id" ON "public"."partes" USING "btree" ("ubicacion_id");


--
-- Name: idx_fk_proc_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_proc_created_by" ON "public"."procedimientos" USING "btree" ("created_by");


--
-- Name: idx_fk_proveedores_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_proveedores_workspace_id" ON "public"."proveedores" USING "btree" ("workspace_id");


--
-- Name: idx_fk_resp_firmado_por_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_resp_firmado_por_id" ON "public"."paso_respuestas" USING "btree" ("firmado_por_id");


--
-- Name: idx_fk_resp_respondido_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_resp_respondido_por" ON "public"."paso_respuestas" USING "btree" ("respondido_por");


--
-- Name: idx_fk_sol_hito_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_sol_hito_id" ON "public"."solicitudes" USING "btree" ("hito_id");


--
-- Name: idx_fk_sol_lugar_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_sol_lugar_id" ON "public"."solicitudes" USING "btree" ("lugar_id");


--
-- Name: idx_fk_sol_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_sol_orden_id" ON "public"."solicitudes" USING "btree" ("orden_id");


--
-- Name: idx_fk_sol_revisado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_sol_revisado_por" ON "public"."solicitudes" USING "btree" ("revisado_por");


--
-- Name: idx_fk_sol_sociedad_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_sol_sociedad_id" ON "public"."solicitudes" USING "btree" ("sociedad_id");


--
-- Name: idx_fk_sol_ubicacion_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_fk_sol_ubicacion_id" ON "public"."solicitudes" USING "btree" ("ubicacion_id");


--
-- Name: idx_foto_grupo_items_grupo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_foto_grupo_items_grupo_id" ON "public"."foto_grupo_items" USING "btree" ("grupo_id");


--
-- Name: idx_foto_grupos_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_foto_grupos_orden_id" ON "public"."foto_grupos" USING "btree" ("orden_id");


--
-- Name: idx_foto_grupos_orden_tipo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_foto_grupos_orden_tipo" ON "public"."foto_grupos" USING "btree" ("orden_id", "tipo", "orden_display");


--
-- Name: idx_foto_grupos_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_foto_grupos_workspace_id" ON "public"."foto_grupos" USING "btree" ("workspace_id");


--
-- Name: idx_hojas_filas_hoja; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hojas_filas_hoja" ON "public"."hojas_inventario_filas" USING "btree" ("hoja_id", "orden");


--
-- Name: idx_hojas_inventario_filas_hoja_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hojas_inventario_filas_hoja_id" ON "public"."hojas_inventario_filas" USING "btree" ("hoja_id");


--
-- Name: idx_hojas_inventario_filas_ws; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hojas_inventario_filas_ws" ON "public"."hojas_inventario_filas" USING "btree" ("workspace_id");


--
-- Name: idx_hojas_inventario_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hojas_inventario_orden_id" ON "public"."hojas_inventario" USING "btree" ("orden_id");


--
-- Name: idx_hojas_inventario_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_hojas_inventario_workspace" ON "public"."hojas_inventario" USING "btree" ("workspace_id");


--
-- Name: idx_incidentes_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_incidentes_workspace" ON "public"."incidentes" USING "btree" ("workspace_id");


--
-- Name: idx_inspection_route_items_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inspection_route_items_activo" ON "public"."inspection_route_items" USING "btree" ("activo_id");


--
-- Name: idx_inspection_route_items_route; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inspection_route_items_route" ON "public"."inspection_route_items" USING "btree" ("route_id", "orden");


--
-- Name: idx_inspection_routes_due; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inspection_routes_due" ON "public"."inspection_routes" USING "btree" ("next_due_at") WHERE ("activo_flag" AND ("next_due_at" IS NOT NULL));


--
-- Name: idx_inspection_routes_ws_soc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_inspection_routes_ws_soc" ON "public"."inspection_routes" USING "btree" ("workspace_id", "sociedad_id") WHERE "activo_flag";


--
-- Name: idx_levantamientos_asignado_a; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_levantamientos_asignado_a" ON "public"."levantamientos" USING "btree" ("asignado_a");


--
-- Name: idx_levantamientos_creado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_levantamientos_creado_por" ON "public"."levantamientos" USING "btree" ("creado_por");


--
-- Name: idx_levantamientos_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_levantamientos_orden_id" ON "public"."levantamientos" USING "btree" ("orden_id");


--
-- Name: idx_levantamientos_sociedad_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_levantamientos_sociedad_id" ON "public"."levantamientos" USING "btree" ("sociedad_id");


--
-- Name: idx_levantamientos_ubicacion_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_levantamientos_ubicacion_id" ON "public"."levantamientos" USING "btree" ("ubicacion_id");


--
-- Name: idx_lugares_nombre; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lugares_nombre" ON "public"."lugares" USING "btree" ("nombre");


--
-- Name: idx_lugares_workspace_activo_nombre; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lugares_workspace_activo_nombre" ON "public"."lugares" USING "btree" ("workspace_id", "activo", "nombre");


--
-- Name: idx_mat_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_mat_orden_id" ON "public"."materiales_usados" USING "btree" ("orden_id");


--
-- Name: idx_materiales_usados_material_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_materiales_usados_material_id" ON "public"."materiales_usados" USING "btree" ("material_id");


--
-- Name: idx_mediciones_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_mediciones_workspace" ON "public"."mediciones_ambientales" USING "btree" ("workspace_id");


--
-- Name: idx_notifications_usuario_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_usuario_created" ON "public"."notifications" USING "btree" ("usuario_id", "created_at" DESC);


--
-- Name: idx_notifications_usuario_id_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_notifications_usuario_id_read" ON "public"."notifications" USING "btree" ("usuario_id", "leida", "created_at" DESC);


--
-- Name: idx_orden_partes_parte_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_orden_partes_parte_id" ON "public"."orden_partes" USING "btree" ("parte_id");


--
-- Name: idx_ordenes_trabajo_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ordenes_trabajo_active" ON "public"."ordenes_trabajo" USING "btree" ("workspace_id", "created_at" DESC) WHERE ("deleted_at" IS NULL);


--
-- Name: idx_ordenes_trabajo_parent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ordenes_trabajo_parent_id" ON "public"."ordenes_trabajo" USING "btree" ("parent_id");


--
-- Name: idx_ordenes_trabajo_sociedad_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ordenes_trabajo_sociedad_id" ON "public"."ordenes_trabajo" USING "btree" ("sociedad_id");


--
-- Name: idx_ordenes_trabajo_trash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ordenes_trabajo_trash" ON "public"."ordenes_trabajo" USING "btree" ("workspace_id", "deleted_at") WHERE ("deleted_at" IS NOT NULL);


--
-- Name: idx_ordenes_trabajo_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ordenes_trabajo_workspace_id" ON "public"."ordenes_trabajo" USING "btree" ("workspace_id");


--
-- Name: idx_ot_activo_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_activo_id" ON "public"."ordenes_trabajo" USING "btree" ("activo_id");


--
-- Name: idx_ot_categoria_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_categoria_id" ON "public"."ordenes_trabajo" USING "btree" ("categoria_id");


--
-- Name: idx_ot_creado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_creado_por" ON "public"."ordenes_trabajo" USING "btree" ("creado_por");


--
-- Name: idx_ot_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_created_at" ON "public"."ordenes_trabajo" USING "btree" ("created_at");


--
-- Name: idx_ot_inspection_route; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_inspection_route" ON "public"."ordenes_trabajo" USING "btree" ("inspection_route_id") WHERE ("inspection_route_id" IS NOT NULL);


--
-- Name: idx_ot_inspection_route_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_inspection_route_item_id" ON "public"."ordenes_trabajo" USING "btree" ("inspection_route_item_id");


--
-- Name: idx_ot_lugar_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_lugar_id" ON "public"."ordenes_trabajo" USING "btree" ("lugar_id");


--
-- Name: idx_ot_procedimientos_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_procedimientos_orden_id" ON "public"."ot_procedimientos" USING "btree" ("orden_id");


--
-- Name: idx_ot_recurrencia_serie_iter; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "idx_ot_recurrencia_serie_iter" ON "public"."ordenes_trabajo" USING "btree" ("recurrencia_origen_id", "recurrencia_iteracion") WHERE (("recurrencia_origen_id" IS NOT NULL) AND ("recurrencia_iteracion" IS NOT NULL));


--
-- Name: idx_ot_workspace_asignados_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_workspace_asignados_id" ON "public"."ordenes_trabajo" USING "btree" ("workspace_id", "id") WHERE ("asignados_ids" IS NOT NULL);


--
-- Name: idx_ot_workspace_parent_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ot_workspace_parent_created" ON "public"."ordenes_trabajo" USING "btree" ("workspace_id", "parent_id", "created_at" DESC);


--
-- Name: idx_partes_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_partes_activo" ON "public"."partes" USING "btree" ("activo");


--
-- Name: idx_partes_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_partes_workspace" ON "public"."partes" USING "btree" ("workspace_id");


--
-- Name: idx_partes_workspace_activo_nombre; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_partes_workspace_activo_nombre" ON "public"."partes" USING "btree" ("workspace_id", "activo", "nombre");


--
-- Name: idx_paso_respuestas_ejecucion_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_paso_respuestas_ejecucion_id" ON "public"."paso_respuestas" USING "btree" ("ejecucion_id");


--
-- Name: idx_paso_respuestas_paso_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_paso_respuestas_paso_id" ON "public"."paso_respuestas" USING "btree" ("paso_id");


--
-- Name: idx_paso_respuestas_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_paso_respuestas_workspace_id" ON "public"."paso_respuestas" USING "btree" ("workspace_id");


--
-- Name: idx_presupuestos_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_presupuestos_workspace" ON "public"."presupuestos" USING "btree" ("workspace_id");


--
-- Name: idx_proc_ejec_orden_proc; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_proc_ejec_orden_proc" ON "public"."procedimiento_ejecuciones" USING "btree" ("orden_id", "procedimiento_id");


--
-- Name: idx_proc_ejec_workspace_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_proc_ejec_workspace_id" ON "public"."procedimiento_ejecuciones" USING "btree" ("workspace_id");


--
-- Name: idx_procedimiento_ejecuciones_orden_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_procedimiento_ejecuciones_orden_id" ON "public"."procedimiento_ejecuciones" USING "btree" ("orden_id");


--
-- Name: idx_solicitudes_creado_por; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_solicitudes_creado_por" ON "public"."solicitudes" USING "btree" ("creado_por");


--
-- Name: idx_solicitudes_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_solicitudes_estado" ON "public"."solicitudes" USING "btree" ("workspace_id", "estado");


--
-- Name: idx_solicitudes_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_solicitudes_workspace" ON "public"."solicitudes" USING "btree" ("workspace_id");


--
-- Name: idx_sub_events_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sub_events_workspace" ON "public"."subscription_events" USING "btree" ("workspace_id");


--
-- Name: idx_subscription_events_subscription_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_subscription_events_subscription_id" ON "public"."subscription_events" USING "btree" ("subscription_id");


--
-- Name: idx_subscriptions_early_customer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_subscriptions_early_customer" ON "public"."subscriptions" USING "btree" ("is_early_customer") WHERE ("is_early_customer" = true);


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");


--
-- Name: idx_subscriptions_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_subscriptions_workspace" ON "public"."subscriptions" USING "btree" ("workspace_id");


--
-- Name: idx_ubicaciones_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ubicaciones_workspace" ON "public"."ubicaciones" USING "btree" ("workspace_id");


--
-- Name: idx_ubicaciones_workspace_activa_edificio; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ubicaciones_workspace_activa_edificio" ON "public"."ubicaciones" USING "btree" ("workspace_id", "activa", "edificio");


--
-- Name: idx_usuarios_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_usuarios_workspace" ON "public"."usuarios" USING "btree" ("workspace_id");


--
-- Name: import_templates_ws_tipo_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "import_templates_ws_tipo_idx" ON "public"."import_templates" USING "btree" ("workspace_id", "tipo");


--
-- Name: levantamiento_actividad_levantamiento_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "levantamiento_actividad_levantamiento_id_created_at_idx" ON "public"."levantamiento_actividad" USING "btree" ("levantamiento_id", "created_at" DESC);


--
-- Name: levantamiento_foto_grupos_levantamiento_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "levantamiento_foto_grupos_levantamiento_id_idx" ON "public"."levantamiento_foto_grupos" USING "btree" ("levantamiento_id");


--
-- Name: levantamiento_foto_items_grupo_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "levantamiento_foto_items_grupo_id_idx" ON "public"."levantamiento_foto_items" USING "btree" ("grupo_id");


--
-- Name: levantamiento_items_seccion_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "levantamiento_items_seccion_id_idx" ON "public"."levantamiento_items" USING "btree" ("seccion_id");


--
-- Name: levantamiento_materiales_levantamiento_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "levantamiento_materiales_levantamiento_id_idx" ON "public"."levantamiento_materiales" USING "btree" ("levantamiento_id");


--
-- Name: levantamiento_secciones_levantamiento_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "levantamiento_secciones_levantamiento_id_idx" ON "public"."levantamiento_secciones" USING "btree" ("levantamiento_id");


--
-- Name: levantamientos_workspace_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "levantamientos_workspace_id_created_at_idx" ON "public"."levantamientos" USING "btree" ("workspace_id", "created_at" DESC);


--
-- Name: lugares_qr_code_workspace_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "lugares_qr_code_workspace_unique" ON "public"."lugares" USING "btree" ("workspace_id", "qr_code") WHERE ("qr_code" IS NOT NULL);


--
-- Name: lugares_workspace_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "lugares_workspace_id_idx" ON "public"."lugares" USING "btree" ("workspace_id");


--
-- Name: material_proveedores_proveedor_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_proveedores_proveedor_idx" ON "public"."material_proveedores" USING "btree" ("proveedor_id");


--
-- Name: material_reservations_destination_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_reservations_destination_idx" ON "public"."material_reservations" USING "btree" ("parte_id", "ubicacion_id", "lugar_id", "created_at" DESC);


--
-- Name: material_reservations_ubicacion_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_reservations_ubicacion_idx" ON "public"."material_reservations" USING "btree" ("ubicacion_id");


--
-- Name: material_reservations_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_reservations_workspace_idx" ON "public"."material_reservations" USING "btree" ("workspace_id");


--
-- Name: material_stock_entries_parte_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_stock_entries_parte_idx" ON "public"."material_stock_entries" USING "btree" ("parte_id", "recibido_at" DESC);


--
-- Name: material_stock_entries_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_stock_entries_workspace_idx" ON "public"."material_stock_entries" USING "btree" ("workspace_id", "recibido_at" DESC);


--
-- Name: material_withdrawal_returns_location_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_withdrawal_returns_location_idx" ON "public"."material_withdrawal_returns" USING "btree" ("ubicacion_id", "devuelto_at" DESC);


--
-- Name: material_withdrawals_location_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_withdrawals_location_idx" ON "public"."material_withdrawals" USING "btree" ("ubicacion_id", "retirado_at" DESC);


--
-- Name: material_withdrawals_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "material_withdrawals_workspace_idx" ON "public"."material_withdrawals" USING "btree" ("workspace_id");


--
-- Name: modelos_global_nombre_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "modelos_global_nombre_uniq" ON "public"."modelos" USING "btree" ("fabricante_id", "lower"("nombre")) WHERE ("workspace_id" IS NULL);


--
-- Name: modelos_ws_nombre_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "modelos_ws_nombre_uniq" ON "public"."modelos" USING "btree" ("workspace_id", "fabricante_id", "lower"("nombre")) WHERE ("workspace_id" IS NOT NULL);


--
-- Name: oficios_slug_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "oficios_slug_idx" ON "public"."oficios" USING "btree" ("slug");


--
-- Name: oficios_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "oficios_workspace_idx" ON "public"."oficios" USING "btree" ("workspace_id");


--
-- Name: ordenes_marcadas_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ordenes_marcadas_user_idx" ON "public"."ordenes_marcadas" USING "btree" ("user_id");


--
-- Name: ordenes_n_serie_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ordenes_n_serie_workspace_idx" ON "public"."ordenes_trabajo" USING "btree" ("workspace_id", "n_serie") WHERE (("n_serie" IS NOT NULL) AND ("n_serie" <> ''::"text"));


--
-- Name: ordenes_numero_meconecta_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ordenes_numero_meconecta_unique" ON "public"."ordenes_trabajo" USING "btree" ("workspace_id", "numero_meconecta") WHERE (("numero_meconecta" IS NOT NULL) AND ("numero_meconecta" <> ''::"text"));


--
-- Name: ordenes_trabajo_estado_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ordenes_trabajo_estado_idx" ON "public"."ordenes_trabajo" USING "btree" ("estado");


--
-- Name: ordenes_trabajo_numero_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ordenes_trabajo_numero_idx" ON "public"."ordenes_trabajo" USING "btree" ("numero");


--
-- Name: ot_origen_paso_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ot_origen_paso_idx" ON "public"."ordenes_trabajo" USING "btree" ("origen_paso_id") WHERE ("origen_paso_id" IS NOT NULL);


--
-- Name: partes_qr_code_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "partes_qr_code_lookup" ON "public"."partes" USING "btree" ("qr_code") WHERE ("qr_code" IS NOT NULL);


--
-- Name: partes_qr_code_workspace_uniq; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "partes_qr_code_workspace_uniq" ON "public"."partes" USING "btree" ("workspace_id", "qr_code") WHERE (("qr_code" IS NOT NULL) AND ("activo" = true));


--
-- Name: pasos_condicion_paso_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pasos_condicion_paso_idx" ON "public"."procedimiento_pasos" USING "btree" ("condicion_paso_id") WHERE ("condicion_paso_id" IS NOT NULL);


--
-- Name: pasos_sub_procedimiento_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "pasos_sub_procedimiento_idx" ON "public"."procedimiento_pasos" USING "btree" ("sub_procedimiento_id") WHERE ("sub_procedimiento_id" IS NOT NULL);


--
-- Name: plantillas_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "plantillas_workspace_idx" ON "public"."procedimiento_plantillas" USING "btree" ("workspace_id");


--
-- Name: prh_respuesta_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "prh_respuesta_at_idx" ON "public"."paso_respuesta_historial" USING "btree" ("respuesta_id", "editado_at" DESC);


--
-- Name: prh_respuesta_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "prh_respuesta_idx" ON "public"."paso_respuesta_historial" USING "btree" ("respuesta_id", "editado_at");


--
-- Name: prh_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "prh_workspace_idx" ON "public"."paso_respuesta_historial" USING "btree" ("workspace_id");


--
-- Name: proc_subproc_parent_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "proc_subproc_parent_idx" ON "public"."procedimiento_subprocedimientos" USING "btree" ("parent_paso_id");


--
-- Name: procedimiento_ejecuciones_procedimiento_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "procedimiento_ejecuciones_procedimiento_id_idx" ON "public"."procedimiento_ejecuciones" USING "btree" ("procedimiento_id");


--
-- Name: procedimiento_pasos_procedimiento_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "procedimiento_pasos_procedimiento_id_idx" ON "public"."procedimiento_pasos" USING "btree" ("procedimiento_id");


--
-- Name: procedimientos_workspace_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "procedimientos_workspace_id_idx" ON "public"."procedimientos" USING "btree" ("workspace_id");


--
-- Name: reglas_alerta_usuarios_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reglas_alerta_usuarios_workspace_idx" ON "public"."reglas_alerta_usuarios" USING "btree" ("workspace_id");


--
-- Name: sociedades_qr_code_workspace_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "sociedades_qr_code_workspace_unique" ON "public"."sociedades" USING "btree" ("workspace_id", "qr_code") WHERE ("qr_code" IS NOT NULL);


--
-- Name: solicitantes_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "solicitantes_workspace_idx" ON "public"."solicitantes" USING "btree" ("workspace_id");


--
-- Name: ubicaciones_qr_code_workspace_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ubicaciones_qr_code_workspace_unique" ON "public"."ubicaciones" USING "btree" ("workspace_id", "qr_code") WHERE ("qr_code" IS NOT NULL);


--
-- Name: uni_solicitudes_vistas_ws_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "uni_solicitudes_vistas_ws_idx" ON "public"."uni_solicitudes_vistas" USING "btree" ("workspace_id");


--
-- Name: uniq_active_sub_per_workspace; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uniq_active_sub_per_workspace" ON "public"."subscriptions" USING "btree" ("workspace_id") WHERE ("status" <> 'canceled'::"text");


--
-- Name: uq_alert_log_resource_open; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "uq_alert_log_resource_open" ON "public"."notifications_alertas_log" USING "btree" ("workspace_id", "resource_type", "resource_id", "type") WHERE ("resolved_at" IS NULL);


--
-- Name: usuarios_cargo_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "usuarios_cargo_id_idx" ON "public"."usuarios" USING "btree" ("cargo_id");


--
-- Name: usuarios_nombre_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "usuarios_nombre_idx" ON "public"."usuarios" USING "btree" ("nombre");


--
-- Name: usuarios_oficio_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "usuarios_oficio_id_idx" ON "public"."usuarios" USING "btree" ("oficio_id");


--
-- Name: ws_tax_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ws_tax_workspace_idx" ON "public"."workspace_taxonomias" USING "btree" ("workspace_id");


--
-- Name: levantamientos levantamientos_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "levantamientos_updated_at" BEFORE UPDATE ON "public"."levantamientos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: lugares lugares_assign_qr_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "lugares_assign_qr_code" BEFORE INSERT OR UPDATE OF "qr_code" ON "public"."lugares" FOR EACH ROW EXECUTE FUNCTION "public"."assign_entity_qr_code"();


--
-- Name: notifications on_notification_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_notification_insert" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://yqwsryjbmlvcghnwnzik.supabase.co/functions/v1/send-push-notification', 'POST', '{"Content-type":"application/json"}', '{}', '5000');


--
-- Name: ordenes_trabajo on_orden_assignment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_orden_assignment" AFTER UPDATE OF "asignados_ids" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_notify_assignment"();


--
-- Name: ordenes_trabajo on_orden_assignment_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_orden_assignment_insert" AFTER INSERT ON "public"."ordenes_trabajo" FOR EACH ROW WHEN ((("new"."asignados_ids" IS NOT NULL) AND ("array_length"("new"."asignados_ids", 1) > 0))) EXECUTE FUNCTION "public"."trigger_notify_assignment"();


--
-- Name: actividad_ot on_orden_comment; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_orden_comment" AFTER INSERT ON "public"."actividad_ot" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_notify_comment"();


--
-- Name: ordenes_trabajo on_orden_completed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_orden_completed" AFTER UPDATE OF "estado" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_notify_completion"();


--
-- Name: sociedades sociedades_assign_qr_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sociedades_assign_qr_code" BEFORE INSERT OR UPDATE OF "qr_code" ON "public"."sociedades" FOR EACH ROW EXECUTE FUNCTION "public"."assign_entity_qr_code"();


--
-- Name: ordenes_trabajo trg_assign_orden_numero; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_assign_orden_numero" BEFORE INSERT ON "public"."ordenes_trabajo" FOR EACH ROW WHEN (("new"."numero" IS NULL)) EXECUTE FUNCTION "public"."fn_assign_orden_numero"();


--
-- Name: ordenes_trabajo trg_auto_adjuntar_procedimientos; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_auto_adjuntar_procedimientos" AFTER INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."auto_adjuntar_procedimientos"();


--
-- Name: materiales_usados trg_costo_materiales; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_costo_materiales" AFTER INSERT OR DELETE OR UPDATE ON "public"."materiales_usados" FOR EACH ROW EXECUTE FUNCTION "public"."recalcular_costo_materiales"();


--
-- Name: export_schedules trg_export_schedules_set_next_run; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_export_schedules_set_next_run" BEFORE INSERT OR UPDATE OF "frequency", "day_of_week", "day_of_month", "month_of_year", "hour_local", "timezone" ON "public"."export_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."export_schedules_set_next_run_at"();


--
-- Name: ordenes_trabajo trg_generar_siguiente_ot_recurrente; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_generar_siguiente_ot_recurrente" AFTER UPDATE OF "estado" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."generar_siguiente_ot_recurrente"();


--
-- Name: hojas_inventario_filas trg_hojas_filas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_hojas_filas_updated_at" BEFORE UPDATE ON "public"."hojas_inventario_filas" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();


--
-- Name: hojas_inventario trg_hojas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_hojas_updated_at" BEFORE UPDATE ON "public"."hojas_inventario" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();


--
-- Name: import_templates trg_import_templates_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_import_templates_touch" BEFORE UPDATE ON "public"."import_templates" FOR EACH ROW EXECUTE FUNCTION "public"."fn_import_templates_touch"();


--
-- Name: ordenes_trabajo trg_log_actividad_activo_from_ot_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_log_actividad_activo_from_ot_ins" AFTER INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_actividad_activo_from_ot"();


--
-- Name: ordenes_trabajo trg_log_actividad_activo_from_ot_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_log_actividad_activo_from_ot_upd" AFTER UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_actividad_activo_from_ot"();


--
-- Name: activos trg_log_actividad_activo_ins; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_log_actividad_activo_ins" AFTER INSERT ON "public"."activos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_actividad_activo"();


--
-- Name: activos trg_log_actividad_activo_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_log_actividad_activo_upd" AFTER UPDATE ON "public"."activos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_log_actividad_activo"();


--
-- Name: partes trg_materiales_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_materiales_updated_at" BEFORE UPDATE ON "public"."partes" FOR EACH ROW EXECUTE FUNCTION "public"."fn_materiales_updated_at"();


--
-- Name: reglas_alerta_workspace trg_normalize_alert_rule_minimum_interval; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_normalize_alert_rule_minimum_interval" BEFORE INSERT OR UPDATE OF "umbral_minutos" ON "public"."reglas_alerta_workspace" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_alert_rule_minimum_interval"();


--
-- Name: notificacion_preferencias trg_notif_prefs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_notif_prefs_updated_at" BEFORE UPDATE ON "public"."notificacion_preferencias" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: procedimiento_ejecuciones trg_notify_procedure_completed; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_notify_procedure_completed" AFTER UPDATE OF "estado" ON "public"."procedimiento_ejecuciones" FOR EACH ROW EXECUTE FUNCTION "public"."notify_procedure_completed"();


--
-- Name: ordenes_trabajo trg_ot_duracion; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_ot_duracion" BEFORE INSERT OR UPDATE OF "hora_termino", "hora_inicio" ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."fn_calc_duracion"();


--
-- Name: ordenes_trabajo trg_ot_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_ot_updated_at" BEFORE UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_updated_at"();


--
-- Name: paso_respuestas trg_paso_respuesta_historial; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_paso_respuesta_historial" AFTER UPDATE ON "public"."paso_respuestas" FOR EACH ROW WHEN (("old".* IS DISTINCT FROM "new".*)) EXECUTE FUNCTION "public"."fn_paso_respuesta_historial"();


--
-- Name: reglas_alerta_workspace trg_prevent_disabling_mandatory_alert_rule; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_prevent_disabling_mandatory_alert_rule" BEFORE UPDATE OF "activa" ON "public"."reglas_alerta_workspace" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_disabling_mandatory_alert_rule"();


--
-- Name: procedimientos trg_proc_created_by; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_proc_created_by" BEFORE INSERT ON "public"."procedimientos" FOR EACH ROW EXECUTE FUNCTION "public"."fn_set_procedimiento_created_by"();


--
-- Name: reglas_alerta_workspace trg_reglas_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_reglas_updated_at" BEFORE UPDATE ON "public"."reglas_alerta_workspace" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: ordenes_trabajo trg_sanitize_orden_activo_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_sanitize_orden_activo_id" BEFORE INSERT OR UPDATE ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_orden_activo_id"();


--
-- Name: usuarios trg_seed_notif_prefs; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_seed_notif_prefs" AFTER INSERT ON "public"."usuarios" FOR EACH ROW EXECUTE FUNCTION "public"."seed_notificacion_preferencias"();


--
-- Name: workspaces trg_seed_reglas_alerta; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_seed_reglas_alerta" AFTER INSERT ON "public"."workspaces" FOR EACH ROW EXECUTE FUNCTION "public"."seed_reglas_alerta"();


--
-- Name: ordenes_trabajo trg_set_requiere_materiales; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "trg_set_requiere_materiales" BEFORE INSERT ON "public"."ordenes_trabajo" FOR EACH ROW EXECUTE FUNCTION "public"."set_requiere_materiales_from_workspace"();


--
-- Name: ubicaciones ubicaciones_assign_qr_code; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "ubicaciones_assign_qr_code" BEFORE INSERT OR UPDATE OF "qr_code" ON "public"."ubicaciones" FOR EACH ROW EXECUTE FUNCTION "public"."assign_entity_qr_code"();


--
-- Name: actividad_activo actividad_activo_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."actividad_activo"
    ADD CONSTRAINT "actividad_activo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "public"."activos"("id") ON DELETE CASCADE;


--
-- Name: actividad_activo actividad_activo_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."actividad_activo"
    ADD CONSTRAINT "actividad_activo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: actividad_ot actividad_ot_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."actividad_ot"
    ADD CONSTRAINT "actividad_ot_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: actividad_ot actividad_ot_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."actividad_ot"
    ADD CONSTRAINT "actividad_ot_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");


--
-- Name: activo_materiales activo_materiales_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activo_materiales"
    ADD CONSTRAINT "activo_materiales_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "public"."activos"("id") ON DELETE CASCADE;


--
-- Name: activo_materiales activo_materiales_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activo_materiales"
    ADD CONSTRAINT "activo_materiales_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."partes"("id") ON DELETE CASCADE;


--
-- Name: activos activos_activo_padre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_activo_padre_id_fkey" FOREIGN KEY ("activo_padre_id") REFERENCES "public"."activos"("id") ON DELETE SET NULL;


--
-- Name: activos activos_fabricante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_fabricante_id_fkey" FOREIGN KEY ("fabricante_id") REFERENCES "public"."fabricantes"("id") ON DELETE SET NULL;


--
-- Name: activos activos_lugar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE SET NULL;


--
-- Name: activos activos_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE SET NULL;


--
-- Name: activos activos_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE SET NULL;


--
-- Name: activos activos_responsable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: activos activos_sociedad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_sociedad_id_fkey" FOREIGN KEY ("sociedad_id") REFERENCES "public"."sociedades"("id") ON DELETE SET NULL;


--
-- Name: activos activos_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE SET NULL;


--
-- Name: activos activos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."activos"
    ADD CONSTRAINT "activos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: alerta_enviada alerta_enviada_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alerta_enviada"
    ADD CONSTRAINT "alerta_enviada_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: alerta_enviada alerta_enviada_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alerta_enviada"
    ADD CONSTRAINT "alerta_enviada_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: archivos_orden archivos_orden_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."archivos_orden"
    ADD CONSTRAINT "archivos_orden_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: auditoria_ot auditoria_ot_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."auditoria_ot"
    ADD CONSTRAINT "auditoria_ot_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: auditoria_ot auditoria_ot_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."auditoria_ot"
    ADD CONSTRAINT "auditoria_ot_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: capacitacion_asistentes capacitacion_asistentes_capacitacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."capacitacion_asistentes"
    ADD CONSTRAINT "capacitacion_asistentes_capacitacion_id_fkey" FOREIGN KEY ("capacitacion_id") REFERENCES "public"."capacitaciones"("id") ON DELETE CASCADE;


--
-- Name: capacitacion_asistentes capacitacion_asistentes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."capacitacion_asistentes"
    ADD CONSTRAINT "capacitacion_asistentes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: capacitaciones capacitaciones_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."capacitaciones"
    ADD CONSTRAINT "capacitaciones_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: cargos cargos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cargos"
    ADD CONSTRAINT "cargos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: categorias_ot categorias_ot_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."categorias_ot"
    ADD CONSTRAINT "categorias_ot_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: comentarios_orden comentarios_orden_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comentarios_orden"
    ADD CONSTRAINT "comentarios_orden_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: comentarios_orden comentarios_orden_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."comentarios_orden"
    ADD CONSTRAINT "comentarios_orden_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: completion_messages completion_messages_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."completion_messages"
    ADD CONSTRAINT "completion_messages_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE SET NULL;


--
-- Name: completion_messages completion_messages_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."completion_messages"
    ADD CONSTRAINT "completion_messages_oficio_id_fkey" FOREIGN KEY ("oficio_id") REFERENCES "public"."oficios"("id") ON DELETE SET NULL;


--
-- Name: completion_messages completion_messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."completion_messages"
    ADD CONSTRAINT "completion_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: cuadrilla_usuarios cuadrilla_usuarios_cuadrilla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cuadrilla_usuarios"
    ADD CONSTRAINT "cuadrilla_usuarios_cuadrilla_id_fkey" FOREIGN KEY ("cuadrilla_id") REFERENCES "public"."cuadrillas"("id") ON DELETE CASCADE;


--
-- Name: cuadrilla_usuarios cuadrilla_usuarios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cuadrilla_usuarios"
    ADD CONSTRAINT "cuadrilla_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: cuadrillas cuadrillas_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cuadrillas"
    ADD CONSTRAINT "cuadrillas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: export_runs export_runs_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."export_runs"
    ADD CONSTRAINT "export_runs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."export_schedules"("id") ON DELETE CASCADE;


--
-- Name: export_runs export_runs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."export_runs"
    ADD CONSTRAINT "export_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: export_schedules export_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."export_schedules"
    ADD CONSTRAINT "export_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: export_schedules export_schedules_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."export_schedules"
    ADD CONSTRAINT "export_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: fabricantes fabricantes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fabricantes"
    ADD CONSTRAINT "fabricantes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: fabricantes fabricantes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fabricantes"
    ADD CONSTRAINT "fabricantes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: feedback feedback_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."feedback"
    ADD CONSTRAINT "feedback_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: flow_customers flow_customers_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."flow_customers"
    ADD CONSTRAINT "flow_customers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: foto_grupo_items foto_grupo_items_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."foto_grupo_items"
    ADD CONSTRAINT "foto_grupo_items_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."foto_grupos"("id") ON DELETE CASCADE;


--
-- Name: foto_grupos foto_grupos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."foto_grupos"
    ADD CONSTRAINT "foto_grupos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: foto_grupos foto_grupos_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."foto_grupos"
    ADD CONSTRAINT "foto_grupos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: foto_grupos foto_grupos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."foto_grupos"
    ADD CONSTRAINT "foto_grupos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: hitos hitos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hitos"
    ADD CONSTRAINT "hitos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: hojas_inventario hojas_inventario_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario"
    ADD CONSTRAINT "hojas_inventario_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: hojas_inventario_filas hojas_inventario_filas_hoja_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario_filas"
    ADD CONSTRAINT "hojas_inventario_filas_hoja_id_fkey" FOREIGN KEY ("hoja_id") REFERENCES "public"."hojas_inventario"("id") ON DELETE CASCADE;


--
-- Name: hojas_inventario_filas hojas_inventario_filas_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario_filas"
    ADD CONSTRAINT "hojas_inventario_filas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: hojas_inventario hojas_inventario_levantamiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario"
    ADD CONSTRAINT "hojas_inventario_levantamiento_id_fkey" FOREIGN KEY ("levantamiento_id") REFERENCES "public"."levantamientos"("id") ON DELETE CASCADE;


--
-- Name: hojas_inventario hojas_inventario_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario"
    ADD CONSTRAINT "hojas_inventario_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: hojas_inventario hojas_inventario_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hojas_inventario"
    ADD CONSTRAINT "hojas_inventario_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: import_templates import_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."import_templates"
    ADD CONSTRAINT "import_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: import_templates import_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."import_templates"
    ADD CONSTRAINT "import_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: incidentes incidentes_trabajador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_trabajador_id_fkey" FOREIGN KEY ("trabajador_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: incidentes incidentes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."incidentes"
    ADD CONSTRAINT "incidentes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: inspection_route_items inspection_route_items_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inspection_route_items"
    ADD CONSTRAINT "inspection_route_items_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "public"."activos"("id") ON DELETE CASCADE;


--
-- Name: inspection_route_items inspection_route_items_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inspection_route_items"
    ADD CONSTRAINT "inspection_route_items_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."inspection_routes"("id") ON DELETE CASCADE;


--
-- Name: inspection_routes inspection_routes_sociedad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inspection_routes"
    ADD CONSTRAINT "inspection_routes_sociedad_id_fkey" FOREIGN KEY ("sociedad_id") REFERENCES "public"."sociedades"("id") ON DELETE SET NULL;


--
-- Name: inspection_routes inspection_routes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inspection_routes"
    ADD CONSTRAINT "inspection_routes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_actividad levantamiento_actividad_levantamiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_actividad"
    ADD CONSTRAINT "levantamiento_actividad_levantamiento_id_fkey" FOREIGN KEY ("levantamiento_id") REFERENCES "public"."levantamientos"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_actividad levantamiento_actividad_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_actividad"
    ADD CONSTRAINT "levantamiento_actividad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: levantamiento_foto_grupos levantamiento_foto_grupos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_foto_grupos"
    ADD CONSTRAINT "levantamiento_foto_grupos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: levantamiento_foto_grupos levantamiento_foto_grupos_levantamiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_foto_grupos"
    ADD CONSTRAINT "levantamiento_foto_grupos_levantamiento_id_fkey" FOREIGN KEY ("levantamiento_id") REFERENCES "public"."levantamientos"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_foto_grupos levantamiento_foto_grupos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_foto_grupos"
    ADD CONSTRAINT "levantamiento_foto_grupos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_foto_items levantamiento_foto_items_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_foto_items"
    ADD CONSTRAINT "levantamiento_foto_items_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "public"."levantamiento_foto_grupos"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_items levantamiento_items_seccion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_items"
    ADD CONSTRAINT "levantamiento_items_seccion_id_fkey" FOREIGN KEY ("seccion_id") REFERENCES "public"."levantamiento_secciones"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_materiales levantamiento_materiales_levantamiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_materiales"
    ADD CONSTRAINT "levantamiento_materiales_levantamiento_id_fkey" FOREIGN KEY ("levantamiento_id") REFERENCES "public"."levantamientos"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_materiales levantamiento_materiales_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_materiales"
    ADD CONSTRAINT "levantamiento_materiales_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "public"."partes"("id") ON DELETE CASCADE;


--
-- Name: levantamiento_secciones levantamiento_secciones_levantamiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamiento_secciones"
    ADD CONSTRAINT "levantamiento_secciones_levantamiento_id_fkey" FOREIGN KEY ("levantamiento_id") REFERENCES "public"."levantamientos"("id") ON DELETE CASCADE;


--
-- Name: levantamientos levantamientos_asignado_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos"
    ADD CONSTRAINT "levantamientos_asignado_a_fkey" FOREIGN KEY ("asignado_a") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: levantamientos levantamientos_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos"
    ADD CONSTRAINT "levantamientos_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: levantamientos levantamientos_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos"
    ADD CONSTRAINT "levantamientos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE SET NULL;


--
-- Name: levantamientos levantamientos_sociedad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos"
    ADD CONSTRAINT "levantamientos_sociedad_id_fkey" FOREIGN KEY ("sociedad_id") REFERENCES "public"."sociedades"("id") ON DELETE SET NULL;


--
-- Name: levantamientos levantamientos_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos"
    ADD CONSTRAINT "levantamientos_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE SET NULL;


--
-- Name: levantamientos levantamientos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."levantamientos"
    ADD CONSTRAINT "levantamientos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: lugares lugares_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lugares"
    ADD CONSTRAINT "lugares_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id");


--
-- Name: material_proveedores material_proveedores_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_proveedores"
    ADD CONSTRAINT "material_proveedores_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "public"."partes"("id") ON DELETE CASCADE;


--
-- Name: material_proveedores material_proveedores_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_proveedores"
    ADD CONSTRAINT "material_proveedores_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE CASCADE;


--
-- Name: material_reservations material_reservations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_reservations"
    ADD CONSTRAINT "material_reservations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: material_reservations material_reservations_lugar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_reservations"
    ADD CONSTRAINT "material_reservations_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE CASCADE;


--
-- Name: material_reservations material_reservations_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_reservations"
    ADD CONSTRAINT "material_reservations_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "public"."partes"("id") ON DELETE CASCADE;


--
-- Name: material_reservations material_reservations_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_reservations"
    ADD CONSTRAINT "material_reservations_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE CASCADE;


--
-- Name: material_reservations material_reservations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_reservations"
    ADD CONSTRAINT "material_reservations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: material_stock_entries material_stock_entries_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_stock_entries"
    ADD CONSTRAINT "material_stock_entries_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "public"."partes"("id") ON DELETE RESTRICT;


--
-- Name: material_stock_entries material_stock_entries_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_stock_entries"
    ADD CONSTRAINT "material_stock_entries_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE SET NULL;


--
-- Name: material_stock_entries material_stock_entries_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_stock_entries"
    ADD CONSTRAINT "material_stock_entries_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: material_stock_entries material_stock_entries_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_stock_entries"
    ADD CONSTRAINT "material_stock_entries_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: material_withdrawal_returns material_withdrawal_returns_devuelto_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawal_returns"
    ADD CONSTRAINT "material_withdrawal_returns_devuelto_por_fkey" FOREIGN KEY ("devuelto_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: material_withdrawal_returns material_withdrawal_returns_lugar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawal_returns"
    ADD CONSTRAINT "material_withdrawal_returns_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE SET NULL;


--
-- Name: material_withdrawal_returns material_withdrawal_returns_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawal_returns"
    ADD CONSTRAINT "material_withdrawal_returns_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "public"."partes"("id") ON DELETE RESTRICT;


--
-- Name: material_withdrawal_returns material_withdrawal_returns_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawal_returns"
    ADD CONSTRAINT "material_withdrawal_returns_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE RESTRICT;


--
-- Name: material_withdrawal_returns material_withdrawal_returns_withdrawal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawal_returns"
    ADD CONSTRAINT "material_withdrawal_returns_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "public"."material_withdrawals"("id") ON DELETE RESTRICT;


--
-- Name: material_withdrawal_returns material_withdrawal_returns_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawal_returns"
    ADD CONSTRAINT "material_withdrawal_returns_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: material_withdrawals material_withdrawals_lugar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawals"
    ADD CONSTRAINT "material_withdrawals_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE SET NULL;


--
-- Name: material_withdrawals material_withdrawals_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawals"
    ADD CONSTRAINT "material_withdrawals_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "public"."partes"("id") ON DELETE RESTRICT;


--
-- Name: material_withdrawals material_withdrawals_retirado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawals"
    ADD CONSTRAINT "material_withdrawals_retirado_por_fkey" FOREIGN KEY ("retirado_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: material_withdrawals material_withdrawals_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawals"
    ADD CONSTRAINT "material_withdrawals_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE RESTRICT;


--
-- Name: material_withdrawals material_withdrawals_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."material_withdrawals"
    ADD CONSTRAINT "material_withdrawals_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: partes materiales_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "materiales_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "public"."activos"("id") ON DELETE SET NULL;


--
-- Name: partes materiales_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "materiales_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE SET NULL;


--
-- Name: partes materiales_tipo_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "materiales_tipo_parte_id_fkey" FOREIGN KEY ("tipo_parte_id") REFERENCES "public"."tipos_parte"("id") ON DELETE SET NULL;


--
-- Name: materiales_usados materiales_usados_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."materiales_usados"
    ADD CONSTRAINT "materiales_usados_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."partes"("id");


--
-- Name: materiales_usados materiales_usados_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."materiales_usados"
    ADD CONSTRAINT "materiales_usados_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: mediciones_ambientales mediciones_ambientales_responsable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mediciones_ambientales"
    ADD CONSTRAINT "mediciones_ambientales_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: mediciones_ambientales mediciones_ambientales_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."mediciones_ambientales"
    ADD CONSTRAINT "mediciones_ambientales_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: modelos modelos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."modelos"
    ADD CONSTRAINT "modelos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: modelos modelos_fabricante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."modelos"
    ADD CONSTRAINT "modelos_fabricante_id_fkey" FOREIGN KEY ("fabricante_id") REFERENCES "public"."fabricantes"("id") ON DELETE CASCADE;


--
-- Name: modelos modelos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."modelos"
    ADD CONSTRAINT "modelos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: notificacion_preferencias notificacion_preferencias_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notificacion_preferencias"
    ADD CONSTRAINT "notificacion_preferencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: notifications_alertas_log notifications_alertas_log_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications_alertas_log"
    ADD CONSTRAINT "notifications_alertas_log_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: oficios oficios_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."oficios"
    ADD CONSTRAINT "oficios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: orden_partes orden_partes_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orden_partes"
    ADD CONSTRAINT "orden_partes_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: orden_partes orden_partes_parte_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."orden_partes"
    ADD CONSTRAINT "orden_partes_parte_id_fkey" FOREIGN KEY ("parte_id") REFERENCES "public"."partes"("id") ON DELETE CASCADE;


--
-- Name: ordenes_marcadas ordenes_marcadas_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_marcadas"
    ADD CONSTRAINT "ordenes_marcadas_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: ordenes_marcadas ordenes_marcadas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_marcadas"
    ADD CONSTRAINT "ordenes_marcadas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: ordenes_trabajo ordenes_trabajo_activo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "public"."activos"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias_ot"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_completado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_completado_por_fkey" FOREIGN KEY ("completado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_inspection_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_inspection_route_id_fkey" FOREIGN KEY ("inspection_route_id") REFERENCES "public"."inspection_routes"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_inspection_route_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_inspection_route_item_id_fkey" FOREIGN KEY ("inspection_route_item_id") REFERENCES "public"."inspection_route_items"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_lugar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id");


--
-- Name: ordenes_trabajo ordenes_trabajo_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: ordenes_trabajo ordenes_trabajo_recurrencia_origen_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_recurrencia_origen_id_fkey" FOREIGN KEY ("recurrencia_origen_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_sociedad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_sociedad_id_fkey" FOREIGN KEY ("sociedad_id") REFERENCES "public"."sociedades"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE SET NULL;


--
-- Name: ordenes_trabajo ordenes_trabajo_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ordenes_trabajo"
    ADD CONSTRAINT "ordenes_trabajo_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: ot_alert_state ot_alert_state_ot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_alert_state"
    ADD CONSTRAINT "ot_alert_state_ot_id_fkey" FOREIGN KEY ("ot_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: ot_procedimientos ot_procedimientos_adjuntado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_procedimientos"
    ADD CONSTRAINT "ot_procedimientos_adjuntado_por_fkey" FOREIGN KEY ("adjuntado_por") REFERENCES "public"."usuarios"("id");


--
-- Name: ot_procedimientos ot_procedimientos_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_procedimientos"
    ADD CONSTRAINT "ot_procedimientos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: ot_procedimientos ot_procedimientos_procedimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ot_procedimientos"
    ADD CONSTRAINT "ot_procedimientos_procedimiento_id_fkey" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimientos"("id");


--
-- Name: partes partes_fabricante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "partes_fabricante_id_fkey" FOREIGN KEY ("fabricante_id") REFERENCES "public"."fabricantes"("id") ON DELETE SET NULL;


--
-- Name: partes partes_modelo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "partes_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "public"."modelos"("id") ON DELETE SET NULL;


--
-- Name: partes partes_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "partes_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE SET NULL;


--
-- Name: partes partes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."partes"
    ADD CONSTRAINT "partes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: paso_respuesta_historial paso_respuesta_historial_respuesta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuesta_historial"
    ADD CONSTRAINT "paso_respuesta_historial_respuesta_id_fkey" FOREIGN KEY ("respuesta_id") REFERENCES "public"."paso_respuestas"("id") ON DELETE CASCADE;


--
-- Name: paso_respuestas paso_respuestas_ejecucion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuestas"
    ADD CONSTRAINT "paso_respuestas_ejecucion_id_fkey" FOREIGN KEY ("ejecucion_id") REFERENCES "public"."procedimiento_ejecuciones"("id") ON DELETE CASCADE;


--
-- Name: paso_respuestas paso_respuestas_firmado_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuestas"
    ADD CONSTRAINT "paso_respuestas_firmado_por_id_fkey" FOREIGN KEY ("firmado_por_id") REFERENCES "public"."usuarios"("id");


--
-- Name: paso_respuestas paso_respuestas_paso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuestas"
    ADD CONSTRAINT "paso_respuestas_paso_id_fkey" FOREIGN KEY ("paso_id") REFERENCES "public"."procedimiento_pasos"("id") ON DELETE CASCADE;


--
-- Name: paso_respuestas paso_respuestas_respondido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuestas"
    ADD CONSTRAINT "paso_respuestas_respondido_por_fkey" FOREIGN KEY ("respondido_por") REFERENCES "public"."usuarios"("id");


--
-- Name: paso_respuestas paso_respuestas_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."paso_respuestas"
    ADD CONSTRAINT "paso_respuestas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");


--
-- Name: permisos_usuario permisos_usuario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."permisos_usuario"
    ADD CONSTRAINT "permisos_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: presupuestos presupuestos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."presupuestos"
    ADD CONSTRAINT "presupuestos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: procedimiento_ejecuciones procedimiento_ejecuciones_completado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_ejecuciones"
    ADD CONSTRAINT "procedimiento_ejecuciones_completado_por_fkey" FOREIGN KEY ("completado_por") REFERENCES "public"."usuarios"("id");


--
-- Name: procedimiento_ejecuciones procedimiento_ejecuciones_iniciado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_ejecuciones"
    ADD CONSTRAINT "procedimiento_ejecuciones_iniciado_por_fkey" FOREIGN KEY ("iniciado_por") REFERENCES "public"."usuarios"("id");


--
-- Name: procedimiento_ejecuciones procedimiento_ejecuciones_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_ejecuciones"
    ADD CONSTRAINT "procedimiento_ejecuciones_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE CASCADE;


--
-- Name: procedimiento_ejecuciones procedimiento_ejecuciones_procedimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_ejecuciones"
    ADD CONSTRAINT "procedimiento_ejecuciones_procedimiento_id_fkey" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimientos"("id");


--
-- Name: procedimiento_ejecuciones procedimiento_ejecuciones_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_ejecuciones"
    ADD CONSTRAINT "procedimiento_ejecuciones_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");


--
-- Name: procedimiento_pasos procedimiento_pasos_condicion_paso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_pasos"
    ADD CONSTRAINT "procedimiento_pasos_condicion_paso_id_fkey" FOREIGN KEY ("condicion_paso_id") REFERENCES "public"."procedimiento_pasos"("id") ON DELETE SET NULL;


--
-- Name: procedimiento_pasos procedimiento_pasos_procedimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_pasos"
    ADD CONSTRAINT "procedimiento_pasos_procedimiento_id_fkey" FOREIGN KEY ("procedimiento_id") REFERENCES "public"."procedimientos"("id") ON DELETE CASCADE;


--
-- Name: procedimiento_pasos procedimiento_pasos_sub_procedimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_pasos"
    ADD CONSTRAINT "procedimiento_pasos_sub_procedimiento_id_fkey" FOREIGN KEY ("sub_procedimiento_id") REFERENCES "public"."procedimientos"("id") ON DELETE SET NULL;


--
-- Name: procedimiento_plantillas procedimiento_plantillas_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_plantillas"
    ADD CONSTRAINT "procedimiento_plantillas_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: procedimiento_subprocedimientos procedimiento_subprocedimientos_child_procedimiento_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_subprocedimientos"
    ADD CONSTRAINT "procedimiento_subprocedimientos_child_procedimiento_id_fkey" FOREIGN KEY ("child_procedimiento_id") REFERENCES "public"."procedimientos"("id") ON DELETE CASCADE;


--
-- Name: procedimiento_subprocedimientos procedimiento_subprocedimientos_parent_paso_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimiento_subprocedimientos"
    ADD CONSTRAINT "procedimiento_subprocedimientos_parent_paso_id_fkey" FOREIGN KEY ("parent_paso_id") REFERENCES "public"."procedimiento_pasos"("id") ON DELETE CASCADE;


--
-- Name: procedimientos procedimientos_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimientos"
    ADD CONSTRAINT "procedimientos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."usuarios"("id");


--
-- Name: procedimientos procedimientos_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."procedimientos"
    ADD CONSTRAINT "procedimientos_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: proveedores proveedores_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."proveedores"
    ADD CONSTRAINT "proveedores_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: reglas_alerta_usuarios reglas_alerta_usuarios_regla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reglas_alerta_usuarios"
    ADD CONSTRAINT "reglas_alerta_usuarios_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "public"."reglas_alerta_workspace"("id") ON DELETE CASCADE;


--
-- Name: reglas_alerta_usuarios reglas_alerta_usuarios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reglas_alerta_usuarios"
    ADD CONSTRAINT "reglas_alerta_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;


--
-- Name: reglas_alerta_usuarios reglas_alerta_usuarios_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reglas_alerta_usuarios"
    ADD CONSTRAINT "reglas_alerta_usuarios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: reglas_alerta_workspace reglas_alerta_workspace_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reglas_alerta_workspace"
    ADD CONSTRAINT "reglas_alerta_workspace_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: solicitantes solicitantes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitantes"
    ADD CONSTRAINT "solicitantes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: solicitudes solicitudes_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_hito_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_hito_id_fkey" FOREIGN KEY ("hito_id") REFERENCES "public"."hitos"("id") ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_lugar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares"("id") ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_orden_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "public"."ordenes_trabajo"("id") ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_revisado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_sociedad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_sociedad_id_fkey" FOREIGN KEY ("sociedad_id") REFERENCES "public"."sociedades"("id") ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_ubicacion_id_fkey" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE SET NULL;


--
-- Name: solicitudes solicitudes_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."solicitudes"
    ADD CONSTRAINT "solicitudes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: subscription_events subscription_events_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;


--
-- Name: subscription_events subscription_events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscription_events"
    ADD CONSTRAINT "subscription_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: ubicaciones ubicaciones_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;


--
-- Name: ubicaciones ubicaciones_sociedad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_sociedad_id_fkey" FOREIGN KEY ("sociedad_id") REFERENCES "public"."sociedades"("id");


--
-- Name: ubicaciones ubicaciones_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ubicaciones"
    ADD CONSTRAINT "ubicaciones_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: usuarios usuarios_cargo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "public"."cargos"("id") ON DELETE SET NULL;


--
-- Name: usuarios usuarios_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: usuarios usuarios_oficio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_oficio_id_fkey" FOREIGN KEY ("oficio_id") REFERENCES "public"."oficios"("id") ON DELETE SET NULL;


--
-- Name: usuarios usuarios_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;


--
-- Name: workspace_taxonomias workspace_taxonomias_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_taxonomias"
    ADD CONSTRAINT "workspace_taxonomias_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: solicitudes Solicitante can delete own solicitudes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Solicitante can delete own solicitudes" ON "public"."solicitudes" FOR DELETE USING (("creado_por" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: notifications Users delete own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users delete own notifications" ON "public"."notifications" FOR DELETE USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: notifications Users read own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users read own notifications" ON "public"."notifications" FOR SELECT USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: notifications Users update own notifications; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users update own notifications" ON "public"."notifications" FOR UPDATE USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: actividad_activo; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."actividad_activo" ENABLE ROW LEVEL SECURITY;

--
-- Name: actividad_activo actividad_activo_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "actividad_activo_insert" ON "public"."actividad_activo" FOR INSERT WITH CHECK (("activo_id" IN ( SELECT "activos"."id"
   FROM "public"."activos"
  WHERE ("activos"."workspace_id" = "public"."my_workspace_id"()))));


--
-- Name: actividad_activo actividad_activo_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "actividad_activo_select" ON "public"."actividad_activo" FOR SELECT USING (("activo_id" IN ( SELECT "activos"."id"
   FROM "public"."activos"
  WHERE ("activos"."workspace_id" = "public"."my_workspace_id"()))));


--
-- Name: actividad_ot actividad_delete_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "actividad_delete_own" ON "public"."actividad_ot" FOR DELETE TO "authenticated" USING ((("tipo" = 'comentario'::"text") AND ("usuario_id" = "auth"."uid"()) AND ("orden_id" IN ( SELECT "ordenes_trabajo"."id"
   FROM "public"."ordenes_trabajo"
  WHERE ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: actividad_ot actividad_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "actividad_insert" ON "public"."actividad_ot" FOR INSERT TO "authenticated" WITH CHECK (("orden_id" IN ( SELECT "ordenes_trabajo"."id"
   FROM "public"."ordenes_trabajo"
  WHERE ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"()))));


--
-- Name: actividad_ot; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."actividad_ot" ENABLE ROW LEVEL SECURITY;

--
-- Name: actividad_ot actividad_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "actividad_select" ON "public"."actividad_ot" FOR SELECT TO "authenticated" USING (("orden_id" IN ( SELECT "ordenes_trabajo"."id"
   FROM "public"."ordenes_trabajo"
  WHERE ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"()))));


--
-- Name: actividad_ot actividad_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "actividad_update_own" ON "public"."actividad_ot" FOR UPDATE TO "authenticated" USING ((("tipo" = 'comentario'::"text") AND ("usuario_id" = "auth"."uid"()) AND ("orden_id" IN ( SELECT "ordenes_trabajo"."id"
   FROM "public"."ordenes_trabajo"
  WHERE ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"()))))) WITH CHECK ((("tipo" = 'comentario'::"text") AND ("usuario_id" = "auth"."uid"()) AND ("orden_id" IN ( SELECT "ordenes_trabajo"."id"
   FROM "public"."ordenes_trabajo"
  WHERE ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: activo_materiales activo_mat_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activo_mat_delete" ON "public"."activo_materiales" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."activos"
  WHERE (("activos"."id" = "activo_materiales"."activo_id") AND ("activos"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: activo_materiales activo_mat_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activo_mat_insert" ON "public"."activo_materiales" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."activos"
  WHERE (("activos"."id" = "activo_materiales"."activo_id") AND ("activos"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: activo_materiales activo_mat_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activo_mat_select" ON "public"."activo_materiales" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."activos"
  WHERE (("activos"."id" = "activo_materiales"."activo_id") AND ("activos"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: activo_materiales; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."activo_materiales" ENABLE ROW LEVEL SECURITY;

--
-- Name: activos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."activos" ENABLE ROW LEVEL SECURITY;

--
-- Name: activos activos_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activos_delete" ON "public"."activos" FOR DELETE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: activos activos_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activos_insert" ON "public"."activos" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: activos activos_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activos_select" ON "public"."activos" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: activos activos_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "activos_update" ON "public"."activos" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: reglas_alerta_workspace admins can delete rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can delete rules" ON "public"."reglas_alerta_workspace" FOR DELETE USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("usuarios"."rol" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));


--
-- Name: reglas_alerta_workspace admins can insert rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can insert rules" ON "public"."reglas_alerta_workspace" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("usuarios"."rol" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));


--
-- Name: usuarios admins can insert usuarios; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can insert usuarios" ON "public"."usuarios" FOR INSERT WITH CHECK ((("workspace_id" = ( SELECT "usuarios_1"."workspace_id"
   FROM "public"."usuarios" "usuarios_1"
  WHERE ("usuarios_1"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1)) AND (( SELECT "usuarios_1"."rol"
   FROM "public"."usuarios" "usuarios_1"
  WHERE ("usuarios_1"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['admin'::"text", 'supervisor'::"text"]))));


--
-- Name: alerta_enviada admins can read sent alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can read sent alerts" ON "public"."alerta_enviada" FOR SELECT USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("usuarios"."rol" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));


--
-- Name: reglas_alerta_workspace admins can update rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins can update rules" ON "public"."reglas_alerta_workspace" FOR UPDATE USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("usuarios"."rol" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));


--
-- Name: alerta_enviada; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."alerta_enviada" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."app_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: app_config app_config_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "app_config_select" ON "public"."app_config" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: archivos_orden; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."archivos_orden" ENABLE ROW LEVEL SECURITY;

--
-- Name: archivos_orden archivos_orden_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "archivos_orden_delete" ON "public"."archivos_orden" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo"
  WHERE (("ordenes_trabajo"."id" = "archivos_orden"."orden_id") AND ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: archivos_orden archivos_orden_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "archivos_orden_insert" ON "public"."archivos_orden" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo"
  WHERE (("ordenes_trabajo"."id" = "archivos_orden"."orden_id") AND ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: archivos_orden archivos_orden_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "archivos_orden_select" ON "public"."archivos_orden" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo"
  WHERE (("ordenes_trabajo"."id" = "archivos_orden"."orden_id") AND ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: solicitudes_arco arco_insert_public; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "arco_insert_public" ON "public"."solicitudes_arco" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);


--
-- Name: auditoria_ot auditoria_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auditoria_insert" ON "public"."auditoria_ot" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo"
  WHERE (("ordenes_trabajo"."id" = "auditoria_ot"."orden_id") AND ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: auditoria_ot; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."auditoria_ot" ENABLE ROW LEVEL SECURITY;

--
-- Name: auditoria_ot auditoria_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "auditoria_select" ON "public"."auditoria_ot" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo"
  WHERE (("ordenes_trabajo"."id" = "auditoria_ot"."orden_id") AND ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: capacitacion_asistentes cap_asist_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cap_asist_insert" ON "public"."capacitacion_asistentes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."capacitaciones"
  WHERE (("capacitaciones"."id" = "capacitacion_asistentes"."capacitacion_id") AND ("capacitaciones"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: capacitacion_asistentes cap_asist_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cap_asist_select" ON "public"."capacitacion_asistentes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."capacitaciones"
  WHERE (("capacitaciones"."id" = "capacitacion_asistentes"."capacitacion_id") AND ("capacitaciones"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: capacitacion_asistentes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."capacitacion_asistentes" ENABLE ROW LEVEL SECURITY;

--
-- Name: capacitaciones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."capacitaciones" ENABLE ROW LEVEL SECURITY;

--
-- Name: capacitaciones capacitaciones_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "capacitaciones_insert" ON "public"."capacitaciones" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: capacitaciones capacitaciones_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "capacitaciones_select" ON "public"."capacitaciones" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: capacitaciones capacitaciones_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "capacitaciones_update" ON "public"."capacitaciones" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: cargos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cargos" ENABLE ROW LEVEL SECURITY;

--
-- Name: cargos cargos_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cargos_delete" ON "public"."cargos" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: cargos cargos_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cargos_insert" ON "public"."cargos" FOR INSERT WITH CHECK ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: cargos cargos_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cargos_select" ON "public"."cargos" FOR SELECT TO "authenticated" USING ((("workspace_id" IS NULL) OR ("workspace_id" = "public"."my_workspace_id"())));


--
-- Name: cargos cargos_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cargos_update" ON "public"."cargos" FOR UPDATE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: categorias_ot categorias_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categorias_delete" ON "public"."categorias_ot" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: categorias_ot; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."categorias_ot" ENABLE ROW LEVEL SECURITY;

--
-- Name: categorias_ot categorias_ot_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categorias_ot_insert" ON "public"."categorias_ot" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: categorias_ot categorias_ot_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categorias_ot_update" ON "public"."categorias_ot" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: categorias_ot categorias_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "categorias_select" ON "public"."categorias_ot" FOR SELECT TO "authenticated" USING ((("workspace_id" = "public"."my_workspace_id"()) OR (("workspace_id" IS NULL) AND ("es_default" = true))));


--
-- Name: comentarios_orden comentarios_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "comentarios_delete" ON "public"."comentarios_orden" FOR DELETE USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: comentarios_orden comentarios_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "comentarios_insert" ON "public"."comentarios_orden" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo"
  WHERE (("ordenes_trabajo"."id" = "comentarios_orden"."orden_id") AND ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: comentarios_orden; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."comentarios_orden" ENABLE ROW LEVEL SECURITY;

--
-- Name: comentarios_orden comentarios_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "comentarios_select" ON "public"."comentarios_orden" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo"
  WHERE (("ordenes_trabajo"."id" = "comentarios_orden"."orden_id") AND ("ordenes_trabajo"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: completion_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."completion_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: completion_messages completion_messages_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "completion_messages_delete" ON "public"."completion_messages" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: completion_messages completion_messages_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "completion_messages_insert" ON "public"."completion_messages" FOR INSERT WITH CHECK ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: completion_messages completion_messages_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "completion_messages_select" ON "public"."completion_messages" FOR SELECT TO "authenticated" USING ((("workspace_id" IS NULL) OR ("workspace_id" = "public"."my_workspace_id"())));


--
-- Name: completion_messages completion_messages_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "completion_messages_update" ON "public"."completion_messages" FOR UPDATE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: cuadrilla_usuarios cuadrilla_usr_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cuadrilla_usr_delete" ON "public"."cuadrilla_usuarios" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."cuadrillas"
  WHERE (("cuadrillas"."id" = "cuadrilla_usuarios"."cuadrilla_id") AND ("cuadrillas"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: cuadrilla_usuarios cuadrilla_usr_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cuadrilla_usr_insert" ON "public"."cuadrilla_usuarios" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."cuadrillas"
  WHERE (("cuadrillas"."id" = "cuadrilla_usuarios"."cuadrilla_id") AND ("cuadrillas"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: cuadrilla_usuarios cuadrilla_usr_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cuadrilla_usr_select" ON "public"."cuadrilla_usuarios" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."cuadrillas"
  WHERE (("cuadrillas"."id" = "cuadrilla_usuarios"."cuadrilla_id") AND ("cuadrillas"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: cuadrilla_usuarios; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cuadrilla_usuarios" ENABLE ROW LEVEL SECURITY;

--
-- Name: cuadrillas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cuadrillas" ENABLE ROW LEVEL SECURITY;

--
-- Name: cuadrillas cuadrillas_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cuadrillas_delete" ON "public"."cuadrillas" FOR DELETE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: cuadrillas cuadrillas_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cuadrillas_insert" ON "public"."cuadrillas" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: cuadrillas cuadrillas_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cuadrillas_select" ON "public"."cuadrillas" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: cuadrillas cuadrillas_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "cuadrillas_update" ON "public"."cuadrillas" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: push_subscriptions delete own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "delete own" ON "public"."push_subscriptions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "usuario_id"));


--
-- Name: procedimiento_ejecuciones ejec_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ejec_insert" ON "public"."procedimiento_ejecuciones" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: procedimiento_ejecuciones ejec_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ejec_select" ON "public"."procedimiento_ejecuciones" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: procedimiento_ejecuciones ejec_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ejec_update" ON "public"."procedimiento_ejecuciones" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: export_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."export_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: export_schedules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."export_schedules" ENABLE ROW LEVEL SECURITY;

--
-- Name: extension_version_cache; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."extension_version_cache" ENABLE ROW LEVEL SECURITY;

--
-- Name: fabricantes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fabricantes" ENABLE ROW LEVEL SECURITY;

--
-- Name: fabricantes fabricantes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fabricantes_insert" ON "public"."fabricantes" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: fabricantes fabricantes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "fabricantes_select" ON "public"."fabricantes" FOR SELECT USING ((("workspace_id" IS NULL) OR ("workspace_id" = "public"."my_workspace_id"())));


--
-- Name: feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."feedback" ENABLE ROW LEVEL SECURITY;

--
-- Name: feedback feedback_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "feedback_insert" ON "public"."feedback" FOR INSERT WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: feedback feedback_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "feedback_select" ON "public"."feedback" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios"
  WHERE (("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("usuarios"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: hojas_inventario_filas filas_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filas_delete" ON "public"."hojas_inventario_filas" FOR DELETE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: hojas_inventario_filas filas_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filas_insert" ON "public"."hojas_inventario_filas" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: hojas_inventario_filas filas_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filas_select" ON "public"."hojas_inventario_filas" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: hojas_inventario_filas filas_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "filas_update" ON "public"."hojas_inventario_filas" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"())) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: flow_customers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."flow_customers" ENABLE ROW LEVEL SECURITY;

--
-- Name: flow_customers flow_customers: read own workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "flow_customers: read own workspace" ON "public"."flow_customers" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."fn_mi_workspace"()));


--
-- Name: foto_grupo_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."foto_grupo_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: foto_grupo_items foto_grupo_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "foto_grupo_items_delete" ON "public"."foto_grupo_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."foto_grupos" "g"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "g"."workspace_id")))
  WHERE (("g"."id" = "foto_grupo_items"."grupo_id") AND ("u"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."activo" = true) AND (("g"."locked" = false) OR ("u"."rol" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));


--
-- Name: foto_grupo_items foto_grupo_items_insert_workspace_member; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "foto_grupo_items_insert_workspace_member" ON "public"."foto_grupo_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."foto_grupos" "g"
  WHERE (("g"."id" = "foto_grupo_items"."grupo_id") AND ("g"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: foto_grupo_items foto_grupo_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "foto_grupo_items_select" ON "public"."foto_grupo_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."foto_grupos" "g"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "g"."workspace_id")))
  WHERE (("g"."id" = "foto_grupo_items"."grupo_id") AND ("u"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."activo" = true)))));


--
-- Name: foto_grupos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."foto_grupos" ENABLE ROW LEVEL SECURITY;

--
-- Name: foto_grupos foto_grupos_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "foto_grupos_delete" ON "public"."foto_grupos" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: foto_grupos foto_grupos_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "foto_grupos_insert" ON "public"."foto_grupos" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: foto_grupos foto_grupos_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "foto_grupos_select" ON "public"."foto_grupos" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: foto_grupos foto_grupos_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "foto_grupos_update" ON "public"."foto_grupos" FOR UPDATE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: hitos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hitos" ENABLE ROW LEVEL SECURITY;

--
-- Name: hojas_inventario hojas_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hojas_delete" ON "public"."hojas_inventario" FOR DELETE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: hojas_inventario hojas_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hojas_insert" ON "public"."hojas_inventario" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: hojas_inventario; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hojas_inventario" ENABLE ROW LEVEL SECURITY;

--
-- Name: hojas_inventario_filas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hojas_inventario_filas" ENABLE ROW LEVEL SECURITY;

--
-- Name: hojas_inventario hojas_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hojas_select" ON "public"."hojas_inventario" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: hojas_inventario hojas_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hojas_update" ON "public"."hojas_inventario" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"())) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: import_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."import_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: import_templates import_templates_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "import_templates_delete" ON "public"."import_templates" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "import_templates"."workspace_id") AND ("u"."activo" = true) AND ("u"."rol" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: import_templates import_templates_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "import_templates_insert" ON "public"."import_templates" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "import_templates"."workspace_id") AND ("u"."activo" = true) AND ("u"."rol" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: import_templates import_templates_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "import_templates_select" ON "public"."import_templates" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "import_templates"."workspace_id") AND ("u"."activo" = true)))));


--
-- Name: import_templates import_templates_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "import_templates_update" ON "public"."import_templates" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "import_templates"."workspace_id") AND ("u"."activo" = true) AND ("u"."rol" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: incidentes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."incidentes" ENABLE ROW LEVEL SECURITY;

--
-- Name: incidentes incidentes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "incidentes_insert" ON "public"."incidentes" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: incidentes incidentes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "incidentes_select" ON "public"."incidentes" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: incidentes incidentes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "incidentes_update" ON "public"."incidentes" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: push_subscriptions insert own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert own" ON "public"."push_subscriptions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "usuario_id"));


--
-- Name: inspection_route_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inspection_route_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: inspection_route_items inspection_route_items_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_route_items_delete" ON "public"."inspection_route_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspection_routes" "r"
  WHERE (("r"."id" = "inspection_route_items"."route_id") AND ("r"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: inspection_route_items inspection_route_items_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_route_items_insert" ON "public"."inspection_route_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."inspection_routes" "r"
  WHERE (("r"."id" = "inspection_route_items"."route_id") AND ("r"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: inspection_route_items inspection_route_items_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_route_items_select" ON "public"."inspection_route_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspection_routes" "r"
  WHERE (("r"."id" = "inspection_route_items"."route_id") AND ("r"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: inspection_route_items inspection_route_items_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_route_items_update" ON "public"."inspection_route_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inspection_routes" "r"
  WHERE (("r"."id" = "inspection_route_items"."route_id") AND ("r"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: inspection_routes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inspection_routes" ENABLE ROW LEVEL SECURITY;

--
-- Name: inspection_routes inspection_routes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_routes_delete" ON "public"."inspection_routes" FOR DELETE TO "authenticated" USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = "auth"."uid"())
 LIMIT 1) = ANY (ARRAY['admin'::"text", 'owner'::"text", 'supervisor'::"text"]))));


--
-- Name: inspection_routes inspection_routes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_routes_insert" ON "public"."inspection_routes" FOR INSERT TO "authenticated" WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: inspection_routes inspection_routes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_routes_select" ON "public"."inspection_routes" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: inspection_routes inspection_routes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inspection_routes_update" ON "public"."inspection_routes" FOR UPDATE TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"())) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: levantamiento_actividad; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."levantamiento_actividad" ENABLE ROW LEVEL SECURITY;

--
-- Name: levantamiento_foto_grupos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."levantamiento_foto_grupos" ENABLE ROW LEVEL SECURITY;

--
-- Name: levantamiento_foto_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."levantamiento_foto_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: levantamiento_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."levantamiento_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: levantamiento_materiales; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."levantamiento_materiales" ENABLE ROW LEVEL SECURITY;

--
-- Name: levantamiento_secciones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."levantamiento_secciones" ENABLE ROW LEVEL SECURITY;

--
-- Name: levantamientos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."levantamientos" ENABLE ROW LEVEL SECURITY;

--
-- Name: lugares; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lugares" ENABLE ROW LEVEL SECURITY;

--
-- Name: lugares lugares_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lugares_delete" ON "public"."lugares" FOR DELETE USING (((("workspace_id" = "public"."my_workspace_id"()) OR ("ubicacion_id" IN ( SELECT "ubicaciones"."id"
   FROM "public"."ubicaciones"
  WHERE ("ubicaciones"."workspace_id" = "public"."my_workspace_id"())))) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['admin'::"text", 'supervisor'::"text"]))));


--
-- Name: lugares lugares_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lugares_insert" ON "public"."lugares" FOR INSERT TO "authenticated" WITH CHECK ((("workspace_id" = "public"."my_workspace_id"()) OR ("ubicacion_id" IN ( SELECT "ubicaciones"."id"
   FROM "public"."ubicaciones"
  WHERE ("ubicaciones"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: lugares lugares_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lugares_select" ON "public"."lugares" FOR SELECT TO "authenticated" USING ((("workspace_id" = "public"."my_workspace_id"()) OR ("ubicacion_id" IN ( SELECT "ubicaciones"."id"
   FROM "public"."ubicaciones"
  WHERE ("ubicaciones"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: lugares lugares_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "lugares_update" ON "public"."lugares" FOR UPDATE TO "authenticated" USING ((("workspace_id" = "public"."my_workspace_id"()) OR ("ubicacion_id" IN ( SELECT "ubicaciones"."id"
   FROM "public"."ubicaciones"
  WHERE ("ubicaciones"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: materiales_usados mat_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mat_delete" ON "public"."materiales_usados" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "ot"
  WHERE (("ot"."id" = "materiales_usados"."orden_id") AND ("ot"."workspace_id" = ( SELECT "usuarios"."workspace_id"
           FROM "public"."usuarios"
          WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))))))));


--
-- Name: materiales_usados mat_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mat_insert" ON "public"."materiales_usados" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "ot"
  WHERE (("ot"."id" = "materiales_usados"."orden_id") AND ("ot"."workspace_id" = ( SELECT "usuarios"."workspace_id"
           FROM "public"."usuarios"
          WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))))))));


--
-- Name: materiales_usados mat_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mat_select" ON "public"."materiales_usados" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "ot"
  WHERE (("ot"."id" = "materiales_usados"."orden_id") AND ("ot"."workspace_id" = ( SELECT "usuarios"."workspace_id"
           FROM "public"."usuarios"
          WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))))))));


--
-- Name: materiales_usados mat_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mat_update" ON "public"."materiales_usados" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "ot"
  WHERE (("ot"."id" = "materiales_usados"."orden_id") AND ("ot"."workspace_id" = ( SELECT "usuarios"."workspace_id"
           FROM "public"."usuarios"
          WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))))))));


--
-- Name: material_proveedores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."material_proveedores" ENABLE ROW LEVEL SECURITY;

--
-- Name: material_reservations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."material_reservations" ENABLE ROW LEVEL SECURITY;

--
-- Name: material_stock_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."material_stock_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: material_withdrawal_returns; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."material_withdrawal_returns" ENABLE ROW LEVEL SECURITY;

--
-- Name: material_withdrawals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."material_withdrawals" ENABLE ROW LEVEL SECURITY;

--
-- Name: materiales_usados; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."materiales_usados" ENABLE ROW LEVEL SECURITY;

--
-- Name: mediciones_ambientales; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."mediciones_ambientales" ENABLE ROW LEVEL SECURITY;

--
-- Name: mediciones_ambientales mediciones_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mediciones_insert" ON "public"."mediciones_ambientales" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: mediciones_ambientales mediciones_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mediciones_select" ON "public"."mediciones_ambientales" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: mediciones_ambientales mediciones_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "mediciones_update" ON "public"."mediciones_ambientales" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: modelos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."modelos" ENABLE ROW LEVEL SECURITY;

--
-- Name: modelos modelos_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "modelos_insert" ON "public"."modelos" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: modelos modelos_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "modelos_select" ON "public"."modelos" FOR SELECT USING ((("workspace_id" IS NULL) OR ("workspace_id" = "public"."my_workspace_id"())));


--
-- Name: notificacion_preferencias; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notificacion_preferencias" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications_alertas_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."notifications_alertas_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: oficios; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."oficios" ENABLE ROW LEVEL SECURITY;

--
-- Name: oficios oficios_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "oficios_delete" ON "public"."oficios" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: oficios oficios_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "oficios_insert" ON "public"."oficios" FOR INSERT WITH CHECK ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: oficios oficios_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "oficios_select" ON "public"."oficios" FOR SELECT TO "authenticated" USING ((("workspace_id" IS NULL) OR ("workspace_id" = "public"."my_workspace_id"())));


--
-- Name: oficios oficios_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "oficios_update" ON "public"."oficios" FOR UPDATE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: orden_partes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."orden_partes" ENABLE ROW LEVEL SECURITY;

--
-- Name: ordenes_trabajo ordenes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ordenes_delete" ON "public"."ordenes_trabajo" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: ordenes_trabajo ordenes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ordenes_insert" ON "public"."ordenes_trabajo" FOR INSERT TO "authenticated" WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: ordenes_marcadas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ordenes_marcadas" ENABLE ROW LEVEL SECURITY;

--
-- Name: ordenes_marcadas ordenes_marcadas_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ordenes_marcadas_delete" ON "public"."ordenes_marcadas" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: ordenes_marcadas ordenes_marcadas_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ordenes_marcadas_insert" ON "public"."ordenes_marcadas" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: ordenes_marcadas ordenes_marcadas_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ordenes_marcadas_select" ON "public"."ordenes_marcadas" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: ordenes_trabajo ordenes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ordenes_select" ON "public"."ordenes_trabajo" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: ordenes_trabajo; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ordenes_trabajo" ENABLE ROW LEVEL SECURITY;

--
-- Name: ordenes_trabajo ordenes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ordenes_update" ON "public"."ordenes_trabajo" FOR UPDATE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: ot_alert_state; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ot_alert_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: ot_procedimientos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ot_procedimientos" ENABLE ROW LEVEL SECURITY;

--
-- Name: ot_procedimientos otproc_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "otproc_delete" ON "public"."ot_procedimientos" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "ot"
  WHERE (("ot"."id" = "ot_procedimientos"."orden_id") AND ("ot"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: ot_procedimientos otproc_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "otproc_insert" ON "public"."ot_procedimientos" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "ot"
  WHERE (("ot"."id" = "ot_procedimientos"."orden_id") AND ("ot"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: ot_procedimientos otproc_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "otproc_select" ON "public"."ot_procedimientos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."ordenes_trabajo" "ot"
  WHERE (("ot"."id" = "ot_procedimientos"."orden_id") AND ("ot"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: partes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."partes" ENABLE ROW LEVEL SECURITY;

--
-- Name: partes partes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "partes_delete" ON "public"."partes" FOR DELETE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: partes partes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "partes_insert" ON "public"."partes" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: partes partes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "partes_select" ON "public"."partes" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: partes partes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "partes_update" ON "public"."partes" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: paso_respuesta_historial; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."paso_respuesta_historial" ENABLE ROW LEVEL SECURITY;

--
-- Name: paso_respuestas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."paso_respuestas" ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimiento_pasos pasos_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pasos_delete" ON "public"."procedimiento_pasos" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."procedimientos" "p"
  WHERE (("p"."id" = "procedimiento_pasos"."procedimiento_id") AND ("p"."workspace_id" = "public"."my_workspace_id"()) AND (("public"."fn_mi_rol"() = ANY (ARRAY['admin'::"text", 'owner'::"text"])) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));


--
-- Name: procedimiento_pasos pasos_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pasos_insert" ON "public"."procedimiento_pasos" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."procedimientos" "p"
  WHERE (("p"."id" = "procedimiento_pasos"."procedimiento_id") AND ("p"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: procedimiento_pasos pasos_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pasos_select" ON "public"."procedimiento_pasos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."procedimientos" "p"
  WHERE (("p"."id" = "procedimiento_pasos"."procedimiento_id") AND ("p"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: procedimiento_pasos pasos_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "pasos_update" ON "public"."procedimiento_pasos" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."procedimientos" "p"
  WHERE (("p"."id" = "procedimiento_pasos"."procedimiento_id") AND ("p"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: permisos_usuario permisos_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "permisos_select_own" ON "public"."permisos_usuario" FOR SELECT USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: permisos_usuario; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."permisos_usuario" ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimiento_plantillas plantillas_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "plantillas_delete" ON "public"."procedimiento_plantillas" FOR DELETE TO "authenticated" USING ((("workspace_id" = "public"."my_workspace_id"()) AND ("public"."fn_mi_rol"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: procedimiento_plantillas plantillas_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "plantillas_insert" ON "public"."procedimiento_plantillas" FOR INSERT TO "authenticated" WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: procedimiento_plantillas plantillas_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "plantillas_select" ON "public"."procedimiento_plantillas" FOR SELECT TO "authenticated" USING ((("workspace_id" IS NULL) OR ("workspace_id" = "public"."my_workspace_id"())));


--
-- Name: procedimiento_plantillas plantillas_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "plantillas_update" ON "public"."procedimiento_plantillas" FOR UPDATE TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"())) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: presupuestos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."presupuestos" ENABLE ROW LEVEL SECURITY;

--
-- Name: presupuestos presupuestos_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "presupuestos_insert" ON "public"."presupuestos" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: presupuestos presupuestos_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "presupuestos_select" ON "public"."presupuestos" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: presupuestos presupuestos_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "presupuestos_update" ON "public"."presupuestos" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: paso_respuesta_historial prh_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "prh_insert" ON "public"."paso_respuesta_historial" FOR INSERT TO "authenticated" WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: paso_respuesta_historial prh_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "prh_select" ON "public"."paso_respuesta_historial" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: procedimientos proc_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proc_delete" ON "public"."procedimientos" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND ("public"."fn_mi_rol"() = ANY (ARRAY['admin'::"text", 'owner'::"text"]))));


--
-- Name: procedimientos proc_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proc_insert" ON "public"."procedimientos" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: procedimientos proc_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proc_select" ON "public"."procedimientos" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: procedimiento_subprocedimientos proc_subproc_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proc_subproc_select" ON "public"."procedimiento_subprocedimientos" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."procedimiento_pasos" "pp"
     JOIN "public"."procedimientos" "p" ON (("p"."id" = "pp"."procedimiento_id")))
  WHERE (("pp"."id" = "procedimiento_subprocedimientos"."parent_paso_id") AND ("p"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: procedimiento_subprocedimientos proc_subproc_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proc_subproc_write" ON "public"."procedimiento_subprocedimientos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."procedimiento_pasos" "pp"
     JOIN "public"."procedimientos" "p" ON (("p"."id" = "pp"."procedimiento_id")))
  WHERE (("pp"."id" = "procedimiento_subprocedimientos"."parent_paso_id") AND ("p"."workspace_id" = "public"."my_workspace_id"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."procedimiento_pasos" "pp"
     JOIN "public"."procedimientos" "p" ON (("p"."id" = "pp"."procedimiento_id")))
  WHERE (("pp"."id" = "procedimiento_subprocedimientos"."parent_paso_id") AND ("p"."workspace_id" = "public"."my_workspace_id"())))));


--
-- Name: procedimientos proc_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proc_update" ON "public"."procedimientos" FOR UPDATE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (("public"."fn_mi_rol"() = ANY (ARRAY['admin'::"text", 'owner'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("workspace_id" = "public"."my_workspace_id"()) AND (("public"."fn_mi_rol"() = ANY (ARRAY['admin'::"text", 'owner'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: procedimiento_ejecuciones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."procedimiento_ejecuciones" ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimiento_pasos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."procedimiento_pasos" ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimiento_plantillas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."procedimiento_plantillas" ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimiento_subprocedimientos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."procedimiento_subprocedimientos" ENABLE ROW LEVEL SECURITY;

--
-- Name: procedimientos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."procedimientos" ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."proveedores" ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores proveedores_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proveedores_delete" ON "public"."proveedores" FOR DELETE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: proveedores proveedores_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proveedores_insert" ON "public"."proveedores" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: proveedores proveedores_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proveedores_select" ON "public"."proveedores" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: proveedores proveedores_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "proveedores_update" ON "public"."proveedores" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: reglas_alerta_usuarios; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reglas_alerta_usuarios" ENABLE ROW LEVEL SECURITY;

--
-- Name: reglas_alerta_workspace; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reglas_alerta_workspace" ENABLE ROW LEVEL SECURITY;

--
-- Name: paso_respuestas resp_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "resp_insert" ON "public"."paso_respuestas" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: paso_respuestas resp_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "resp_select" ON "public"."paso_respuestas" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: paso_respuestas resp_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "resp_update" ON "public"."paso_respuestas" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: export_runs runs_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "runs_select" ON "public"."export_runs" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: export_schedules schedules_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "schedules_delete" ON "public"."export_schedules" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "u"."rol"
   FROM "public"."usuarios" "u"
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: export_schedules schedules_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "schedules_insert" ON "public"."export_schedules" FOR INSERT WITH CHECK ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "u"."rol"
   FROM "public"."usuarios" "u"
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: export_schedules schedules_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "schedules_select" ON "public"."export_schedules" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: export_schedules schedules_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "schedules_update" ON "public"."export_schedules" FOR UPDATE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "u"."rol"
   FROM "public"."usuarios" "u"
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: push_subscriptions select own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "select own" ON "public"."push_subscriptions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "usuario_id"));


--
-- Name: sociedades; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sociedades" ENABLE ROW LEVEL SECURITY;

--
-- Name: sociedades sociedades_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sociedades_delete" ON "public"."sociedades" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['admin'::"text", 'supervisor'::"text"]))));


--
-- Name: sociedades sociedades_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sociedades_insert" ON "public"."sociedades" FOR INSERT TO "authenticated" WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: sociedades sociedades_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sociedades_select" ON "public"."sociedades" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: sociedades sociedades_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "sociedades_update" ON "public"."sociedades" FOR UPDATE TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"())) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: solicitantes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."solicitantes" ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitantes solicitantes_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "solicitantes_delete" ON "public"."solicitantes" FOR DELETE USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: solicitantes solicitantes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "solicitantes_insert" ON "public"."solicitantes" FOR INSERT WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: solicitantes solicitantes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "solicitantes_select" ON "public"."solicitantes" FOR SELECT USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: solicitantes solicitantes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "solicitantes_update" ON "public"."solicitantes" FOR UPDATE USING (("workspace_id" = "public"."my_workspace_id"())) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: solicitudes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."solicitudes" ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitudes_arco; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."solicitudes_arco" ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitudes solicitudes_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "solicitudes_insert" ON "public"."solicitudes" FOR INSERT WITH CHECK ((("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("creado_por" = ( SELECT "auth"."uid"() AS "uid"))));


--
-- Name: solicitudes solicitudes_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "solicitudes_select" ON "public"."solicitudes" FOR SELECT USING ((("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))) AND (("creado_por" = ( SELECT "auth"."uid"() AS "uid")) OR (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))) = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))));


--
-- Name: solicitudes solicitudes_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "solicitudes_update" ON "public"."solicitudes" FOR UPDATE USING ((("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))) AND ((("creado_por" = ( SELECT "auth"."uid"() AS "uid")) AND ("estado" = 'pendiente'::"text")) OR (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))) = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))) WITH CHECK ((("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))) AND ((("creado_por" = ( SELECT "auth"."uid"() AS "uid")) AND ("estado" = ANY (ARRAY['pendiente'::"text", 'cancelada'::"text"]))) OR (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))) = ANY (ARRAY['owner'::"text", 'admin'::"text"])))));


--
-- Name: subscription_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."subscription_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscription_events subscription_events: read own workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "subscription_events: read own workspace" ON "public"."subscription_events" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."fn_mi_workspace"()));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions: read own workspace; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "subscriptions: read own workspace" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."fn_mi_workspace"()));


--
-- Name: tipos_parte; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."tipos_parte" ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_parte tipos_parte_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "tipos_parte_select" ON "public"."tipos_parte" FOR SELECT TO "authenticated" USING (true);


--
-- Name: ubicaciones; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ubicaciones" ENABLE ROW LEVEL SECURITY;

--
-- Name: ubicaciones ubicaciones_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ubicaciones_delete" ON "public"."ubicaciones" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND (( SELECT "usuarios"."rol"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = ANY (ARRAY['admin'::"text", 'supervisor'::"text"]))));


--
-- Name: ubicaciones ubicaciones_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ubicaciones_insert" ON "public"."ubicaciones" FOR INSERT TO "authenticated" WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: ubicaciones ubicaciones_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ubicaciones_select" ON "public"."ubicaciones" FOR SELECT TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: ubicaciones ubicaciones_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ubicaciones_update" ON "public"."ubicaciones" FOR UPDATE TO "authenticated" USING (("workspace_id" = "public"."my_workspace_id"())) WITH CHECK (("workspace_id" = "public"."my_workspace_id"()));


--
-- Name: uni_solicitudes_vistas; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."uni_solicitudes_vistas" ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacion_preferencias user owns their preferences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user owns their preferences" ON "public"."notificacion_preferencias" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));


--
-- Name: usuarios; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios usuarios_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "usuarios_delete" ON "public"."usuarios" FOR DELETE USING ((("workspace_id" = "public"."my_workspace_id"()) AND ("id" <> ( SELECT "auth"."uid"() AS "uid")) AND (( SELECT "usuarios_1"."rol"
   FROM "public"."usuarios" "usuarios_1"
  WHERE ("usuarios_1"."id" = ( SELECT "auth"."uid"() AS "uid"))
 LIMIT 1) = 'admin'::"text")));


--
-- Name: usuarios usuarios_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "usuarios_select" ON "public"."usuarios" FOR SELECT USING ((("workspace_id" = "public"."my_workspace_id"()) AND (("activo" = true) OR ("id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: usuarios usuarios_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "usuarios_update" ON "public"."usuarios" FOR UPDATE USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR (("workspace_id" = "public"."my_workspace_id"()) AND ("public"."fn_mi_rol"() = ANY (ARRAY['owner'::"text", 'admin'::"text", 'supervisor'::"text"]))))) WITH CHECK (((("id" = ( SELECT "auth"."uid"() AS "uid")) AND ("rol" = "public"."fn_mi_rol"()) AND ("workspace_id" = "public"."my_workspace_id"())) OR (("workspace_id" = "public"."my_workspace_id"()) AND ("public"."fn_mi_rol"() = ANY (ARRAY['owner'::"text", 'admin'::"text", 'supervisor'::"text"])))));


--
-- Name: reglas_alerta_usuarios workspace managers can manage alert recipients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace managers can manage alert recipients" ON "public"."reglas_alerta_usuarios" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "reglas_alerta_usuarios"."workspace_id") AND ("u"."rol" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."usuarios" "actor"
     JOIN "public"."reglas_alerta_workspace" "r" ON ((("r"."id" = "reglas_alerta_usuarios"."regla_id") AND ("r"."workspace_id" = "reglas_alerta_usuarios"."workspace_id"))))
     JOIN "public"."usuarios" "recipient" ON ((("recipient"."id" = "reglas_alerta_usuarios"."usuario_id") AND ("recipient"."workspace_id" = "reglas_alerta_usuarios"."workspace_id"))))
  WHERE (("actor"."id" = "auth"."uid"()) AND ("actor"."workspace_id" = "reglas_alerta_usuarios"."workspace_id") AND ("actor"."rol" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: levantamiento_actividad workspace members can access actividad; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can access actividad" ON "public"."levantamiento_actividad" USING (("levantamiento_id" IN ( SELECT "l"."id"
   FROM ("public"."levantamientos" "l"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "l"."workspace_id")))
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: levantamiento_foto_grupos workspace members can access foto_grupos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can access foto_grupos" ON "public"."levantamiento_foto_grupos" USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: levantamiento_foto_items workspace members can access foto_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can access foto_items" ON "public"."levantamiento_foto_items" USING (("grupo_id" IN ( SELECT "g"."id"
   FROM ("public"."levantamiento_foto_grupos" "g"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "g"."workspace_id")))
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: levantamiento_materiales workspace members can access materiales; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can access materiales" ON "public"."levantamiento_materiales" USING (("levantamiento_id" IN ( SELECT "l"."id"
   FROM ("public"."levantamientos" "l"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "l"."workspace_id")))
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: material_proveedores workspace members can add material providers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can add material providers" ON "public"."material_proveedores" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."partes" "p"
     JOIN "public"."proveedores" "pr" ON (("pr"."workspace_id" = "p"."workspace_id")))
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "p"."workspace_id")))
  WHERE (("p"."id" = "material_proveedores"."parte_id") AND ("pr"."id" = "material_proveedores"."proveedor_id") AND ("u"."id" = "auth"."uid"())))));


--
-- Name: levantamientos workspace members can insert levantamientos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can insert levantamientos" ON "public"."levantamientos" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: orden_partes workspace members can manage orden_partes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can manage orden_partes" ON "public"."orden_partes" USING ((EXISTS ( SELECT 1
   FROM ("public"."ordenes_trabajo" "o"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "o"."workspace_id")))
  WHERE (("o"."id" = "orden_partes"."orden_id") AND ("u"."id" = ( SELECT "auth"."uid"() AS "uid"))))));


--
-- Name: reglas_alerta_usuarios workspace members can read alert recipients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read alert recipients" ON "public"."reglas_alerta_usuarios" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "reglas_alerta_usuarios"."workspace_id")))));


--
-- Name: levantamiento_items workspace members can read items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read items" ON "public"."levantamiento_items" USING (("seccion_id" IN ( SELECT "s"."id"
   FROM (("public"."levantamiento_secciones" "s"
     JOIN "public"."levantamientos" "l" ON (("l"."id" = "s"."levantamiento_id")))
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "l"."workspace_id")))
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: levantamientos workspace members can read levantamientos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read levantamientos" ON "public"."levantamientos" FOR SELECT USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: material_proveedores workspace members can read material providers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read material providers" ON "public"."material_proveedores" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."partes" "p"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "p"."workspace_id")))
  WHERE (("p"."id" = "material_proveedores"."parte_id") AND ("u"."id" = "auth"."uid"())))));


--
-- Name: material_reservations workspace members can read material reservations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read material reservations" ON "public"."material_reservations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "material_reservations"."workspace_id")))));


--
-- Name: material_stock_entries workspace members can read material stock entries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read material stock entries" ON "public"."material_stock_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "material_stock_entries"."workspace_id")))));


--
-- Name: material_withdrawal_returns workspace members can read material withdrawal returns; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read material withdrawal returns" ON "public"."material_withdrawal_returns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "material_withdrawal_returns"."workspace_id")))));


--
-- Name: material_withdrawals workspace members can read material withdrawals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read material withdrawals" ON "public"."material_withdrawals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."workspace_id" = "material_withdrawals"."workspace_id")))));


--
-- Name: reglas_alerta_workspace workspace members can read rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read rules" ON "public"."reglas_alerta_workspace" FOR SELECT USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: levantamiento_secciones workspace members can read secciones; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can read secciones" ON "public"."levantamiento_secciones" USING (("levantamiento_id" IN ( SELECT "l"."id"
   FROM ("public"."levantamientos" "l"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "l"."workspace_id")))
  WHERE ("u"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: material_proveedores workspace members can remove material providers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can remove material providers" ON "public"."material_proveedores" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."partes" "p"
     JOIN "public"."usuarios" "u" ON (("u"."workspace_id" = "p"."workspace_id")))
  WHERE (("p"."id" = "material_proveedores"."parte_id") AND ("u"."id" = "auth"."uid"())))));


--
-- Name: levantamientos workspace members can update levantamientos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members can update levantamientos" ON "public"."levantamientos" FOR UPDATE USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: hitos workspace members delete hitos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members delete hitos" ON "public"."hitos" FOR DELETE USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: hitos workspace members insert hitos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members insert hitos" ON "public"."hitos" FOR INSERT WITH CHECK (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: hitos workspace members read hitos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspace members read hitos" ON "public"."hitos" FOR SELECT USING (("workspace_id" IN ( SELECT "usuarios"."workspace_id"
   FROM "public"."usuarios"
  WHERE ("usuarios"."id" = ( SELECT "auth"."uid"() AS "uid")))));


--
-- Name: workspace_taxonomias; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspace_taxonomias" ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces workspaces_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspaces_select" ON "public"."workspaces" FOR SELECT USING (("id" = "public"."my_workspace_id"()));


--
-- Name: workspaces workspaces_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "workspaces_update" ON "public"."workspaces" FOR UPDATE USING (("id" = "public"."my_workspace_id"()));


--
-- Name: workspace_taxonomias ws_tax_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ws_tax_select" ON "public"."workspace_taxonomias" FOR SELECT TO "authenticated" USING ((("workspace_id" IS NULL) OR ("workspace_id" = "public"."my_workspace_id"())));


--
-- Name: workspace_taxonomias ws_tax_write; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "ws_tax_write" ON "public"."workspace_taxonomias" TO "authenticated" USING ((("workspace_id" = "public"."my_workspace_id"()) AND ("public"."fn_mi_rol"() = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK ((("workspace_id" = "public"."my_workspace_id"()) AND ("public"."fn_mi_rol"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "assign_entity_qr_code"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."assign_entity_qr_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_entity_qr_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_entity_qr_code"() TO "service_role";


--
-- Name: FUNCTION "auto_adjuntar_procedimientos"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_adjuntar_procedimientos"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_adjuntar_procedimientos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_adjuntar_procedimientos"() TO "service_role";


--
-- Name: TABLE "partes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."partes" TO "anon";
GRANT ALL ON TABLE "public"."partes" TO "authenticated";
GRANT ALL ON TABLE "public"."partes" TO "service_role";


--
-- Name: FUNCTION "buscar_materiales"("planta" "uuid", "query" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."buscar_materiales"("planta" "uuid", "query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_materiales"("planta" "uuid", "query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_materiales"("planta" "uuid", "query" "text") TO "service_role";


--
-- Name: FUNCTION "calcular_costo_total"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calcular_costo_total"() TO "anon";
GRANT ALL ON FUNCTION "public"."calcular_costo_total"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calcular_costo_total"() TO "service_role";


--
-- Name: FUNCTION "consume_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."consume_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) TO "service_role";


--
-- Name: FUNCTION "crear_correctiva_desde_paso"("p_respuesta_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."crear_correctiva_desde_paso"("p_respuesta_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_correctiva_desde_paso"("p_respuesta_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."crear_correctiva_desde_paso"("p_respuesta_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_correctiva_desde_paso"("p_respuesta_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "deactivate_usuario"("target_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."deactivate_usuario"("target_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_usuario"("target_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_usuario"("target_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "export_schedules_next_run_at"("p_frequency" "public"."export_schedule_frequency", "p_day_of_week" smallint, "p_day_of_month" smallint, "p_month_of_year" smallint, "p_hour_local" smallint, "p_timezone" "text", "p_from" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."export_schedules_next_run_at"("p_frequency" "public"."export_schedule_frequency", "p_day_of_week" smallint, "p_day_of_month" smallint, "p_month_of_year" smallint, "p_hour_local" smallint, "p_timezone" "text", "p_from" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."export_schedules_next_run_at"("p_frequency" "public"."export_schedule_frequency", "p_day_of_week" smallint, "p_day_of_month" smallint, "p_month_of_year" smallint, "p_hour_local" smallint, "p_timezone" "text", "p_from" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_schedules_next_run_at"("p_frequency" "public"."export_schedule_frequency", "p_day_of_week" smallint, "p_day_of_month" smallint, "p_month_of_year" smallint, "p_hour_local" smallint, "p_timezone" "text", "p_from" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "export_schedules_set_next_run_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."export_schedules_set_next_run_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."export_schedules_set_next_run_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_schedules_set_next_run_at"() TO "service_role";


--
-- Name: FUNCTION "fn_assign_orden_numero"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_assign_orden_numero"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_assign_orden_numero"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_assign_orden_numero"() TO "service_role";


--
-- Name: FUNCTION "fn_calc_duracion"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_calc_duracion"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_calc_duracion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_calc_duracion"() TO "service_role";


--
-- Name: FUNCTION "fn_effective_plan"("p_workspace_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_effective_plan"("p_workspace_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_effective_plan"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_effective_plan"("p_workspace_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_import_templates_touch"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_import_templates_touch"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_import_templates_touch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_import_templates_touch"() TO "service_role";


--
-- Name: FUNCTION "fn_log_actividad_activo"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_log_actividad_activo"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_actividad_activo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_actividad_activo"() TO "service_role";


--
-- Name: FUNCTION "fn_log_actividad_activo_from_ot"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_log_actividad_activo_from_ot"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_log_actividad_activo_from_ot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_log_actividad_activo_from_ot"() TO "service_role";


--
-- Name: FUNCTION "fn_materiales_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_materiales_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_materiales_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_materiales_updated_at"() TO "service_role";


--
-- Name: FUNCTION "fn_mi_rol"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_mi_rol"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_mi_rol"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_mi_rol"() TO "service_role";


--
-- Name: FUNCTION "fn_mi_workspace"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_mi_workspace"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_mi_workspace"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_mi_workspace"() TO "service_role";


--
-- Name: FUNCTION "fn_movimientos_ajustar_stock"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_movimientos_ajustar_stock"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_movimientos_ajustar_stock"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_movimientos_ajustar_stock"() TO "service_role";


--
-- Name: FUNCTION "fn_paso_respuesta_historial"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_paso_respuesta_historial"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_paso_respuesta_historial"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_paso_respuesta_historial"() TO "service_role";


--
-- Name: FUNCTION "fn_puede_ver"("p_modulo" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_puede_ver"("p_modulo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_puede_ver"("p_modulo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_puede_ver"("p_modulo" "text") TO "service_role";


--
-- Name: FUNCTION "fn_set_procedimiento_created_by"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_set_procedimiento_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_set_procedimiento_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_procedimiento_created_by"() TO "service_role";


--
-- Name: FUNCTION "fn_set_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "generar_siguiente_ot_recurrente"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generar_siguiente_ot_recurrente"() TO "anon";
GRANT ALL ON FUNCTION "public"."generar_siguiente_ot_recurrente"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generar_siguiente_ot_recurrente"() TO "service_role";


--
-- Name: FUNCTION "get_completion_message"("p_workspace_id" "uuid", "p_oficio_id" "uuid", "p_cargo_id" "uuid", "p_rol" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_completion_message"("p_workspace_id" "uuid", "p_oficio_id" "uuid", "p_cargo_id" "uuid", "p_rol" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_completion_message"("p_workspace_id" "uuid", "p_oficio_id" "uuid", "p_cargo_id" "uuid", "p_rol" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_completion_message"("p_workspace_id" "uuid", "p_oficio_id" "uuid", "p_cargo_id" "uuid", "p_rol" "text") TO "service_role";


--
-- Name: FUNCTION "get_overview_stats"("p_workspace_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_overview_stats"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_overview_stats"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_overview_stats"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "mark_user_guide_seen"("p_screen_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mark_user_guide_seen"("p_screen_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_user_guide_seen"("p_screen_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_user_guide_seen"("p_screen_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_user_guide_seen"("p_screen_key" "text") TO "service_role";


--
-- Name: FUNCTION "my_workspace_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."my_workspace_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_workspace_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_workspace_id"() TO "service_role";


--
-- Name: FUNCTION "normalize_alert_rule_minimum_interval"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."normalize_alert_rule_minimum_interval"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_alert_rule_minimum_interval"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_alert_rule_minimum_interval"() TO "service_role";


--
-- Name: FUNCTION "notify_procedure_completed"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."notify_procedure_completed"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_procedure_completed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_procedure_completed"() TO "service_role";


--
-- Name: FUNCTION "notify_users"("p_usuario_ids" "uuid"[], "p_titulo" "text", "p_mensaje" "text", "p_tipo" "text", "p_url" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."notify_users"("p_usuario_ids" "uuid"[], "p_titulo" "text", "p_mensaje" "text", "p_tipo" "text", "p_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_users"("p_usuario_ids" "uuid"[], "p_titulo" "text", "p_mensaje" "text", "p_tipo" "text", "p_url" "text") TO "service_role";


--
-- Name: FUNCTION "prevent_disabling_mandatory_alert_rule"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."prevent_disabling_mandatory_alert_rule"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_disabling_mandatory_alert_rule"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_disabling_mandatory_alert_rule"() TO "service_role";


--
-- Name: FUNCTION "recalcular_costo_materiales"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."recalcular_costo_materiales"() TO "anon";
GRANT ALL ON FUNCTION "public"."recalcular_costo_materiales"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalcular_costo_materiales"() TO "service_role";


--
-- Name: FUNCTION "receive_material_stock"("p_parte_id" "uuid", "p_proveedor_id" "uuid", "p_cantidad" numeric, "p_recibido_at" timestamp with time zone, "p_notas" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."receive_material_stock"("p_parte_id" "uuid", "p_proveedor_id" "uuid", "p_cantidad" numeric, "p_recibido_at" timestamp with time zone, "p_notas" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."receive_material_stock"("p_parte_id" "uuid", "p_proveedor_id" "uuid", "p_cantidad" numeric, "p_recibido_at" timestamp with time zone, "p_notas" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."receive_material_stock"("p_parte_id" "uuid", "p_proveedor_id" "uuid", "p_cantidad" numeric, "p_recibido_at" timestamp with time zone, "p_notas" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."receive_material_stock"("p_parte_id" "uuid", "p_proveedor_id" "uuid", "p_cantidad" numeric, "p_recibido_at" timestamp with time zone, "p_notas" "text") TO "service_role";


--
-- Name: FUNCTION "recurrente_advance_date"("p_date" "date", "p_recurrencia" "text", "p_config" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."recurrente_advance_date"("p_date" "date", "p_recurrencia" "text", "p_config" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."recurrente_advance_date"("p_date" "date", "p_recurrencia" "text", "p_config" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recurrente_advance_date"("p_date" "date", "p_recurrencia" "text", "p_config" "jsonb") TO "service_role";


--
-- Name: FUNCTION "recurrente_base_title"("p_title" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."recurrente_base_title"("p_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."recurrente_base_title"("p_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recurrente_base_title"("p_title" "text") TO "service_role";


--
-- Name: FUNCTION "recurrente_format_date_es"("p_date" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."recurrente_format_date_es"("p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recurrente_format_date_es"("p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recurrente_format_date_es"("p_date" "date") TO "service_role";


--
-- Name: FUNCTION "recurrente_title"("p_title" "text", "p_iteracion" integer, "p_inicio" "date", "p_termino" "date"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."recurrente_title"("p_title" "text", "p_iteracion" integer, "p_inicio" "date", "p_termino" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."recurrente_title"("p_title" "text", "p_iteracion" integer, "p_inicio" "date", "p_termino" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recurrente_title"("p_title" "text", "p_iteracion" integer, "p_inicio" "date", "p_termino" "date") TO "service_role";


--
-- Name: FUNCTION "refresh_extension_version_cache"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."refresh_extension_version_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_extension_version_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_extension_version_cache"() TO "service_role";


--
-- Name: FUNCTION "release_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."release_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."release_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."release_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_material_reservation"("p_reservation_id" "uuid", "p_cantidad" numeric) TO "service_role";


--
-- Name: FUNCTION "reserve_material"("p_parte_id" "uuid", "p_ubicacion_id" "uuid", "p_lugar_id" "uuid", "p_cantidad" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reserve_material"("p_parte_id" "uuid", "p_ubicacion_id" "uuid", "p_lugar_id" "uuid", "p_cantidad" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_material"("p_parte_id" "uuid", "p_ubicacion_id" "uuid", "p_lugar_id" "uuid", "p_cantidad" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_material"("p_parte_id" "uuid", "p_ubicacion_id" "uuid", "p_lugar_id" "uuid", "p_cantidad" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_material"("p_parte_id" "uuid", "p_ubicacion_id" "uuid", "p_lugar_id" "uuid", "p_cantidad" numeric) TO "service_role";


--
-- Name: FUNCTION "return_material_withdrawal"("p_withdrawal_id" "uuid", "p_cantidad" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."return_material_withdrawal"("p_withdrawal_id" "uuid", "p_cantidad" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."return_material_withdrawal"("p_withdrawal_id" "uuid", "p_cantidad" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."return_material_withdrawal"("p_withdrawal_id" "uuid", "p_cantidad" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."return_material_withdrawal"("p_withdrawal_id" "uuid", "p_cantidad" numeric) TO "service_role";


--
-- Name: FUNCTION "sanitize_orden_activo_id"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sanitize_orden_activo_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_orden_activo_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_orden_activo_id"() TO "service_role";


--
-- Name: FUNCTION "seed_notificacion_preferencias"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."seed_notificacion_preferencias"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_notificacion_preferencias"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_notificacion_preferencias"() TO "service_role";


--
-- Name: FUNCTION "seed_reglas_alerta"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."seed_reglas_alerta"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_reglas_alerta"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_reglas_alerta"() TO "service_role";


--
-- Name: FUNCTION "set_requiere_materiales_from_workspace"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_requiere_materiales_from_workspace"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_requiere_materiales_from_workspace"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_requiere_materiales_from_workspace"() TO "service_role";


--
-- Name: FUNCTION "set_solo_asignadas"("target_id" "uuid", "value" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_solo_asignadas"("target_id" "uuid", "value" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_solo_asignadas"("target_id" "uuid", "value" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_solo_asignadas"("target_id" "uuid", "value" boolean) TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "spawn_route_run"("p_route_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."spawn_route_run"("p_route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."spawn_route_run"("p_route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spawn_route_run"("p_route_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "touch_clientes_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."touch_clientes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_clientes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_clientes_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trigger_notify_assignment"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."trigger_notify_assignment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_notify_assignment"() TO "service_role";


--
-- Name: FUNCTION "trigger_notify_comment"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."trigger_notify_comment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_notify_comment"() TO "service_role";


--
-- Name: FUNCTION "trigger_notify_completion"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."trigger_notify_completion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_notify_completion"() TO "service_role";


--
-- Name: TABLE "actividad_activo"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."actividad_activo" TO "anon";
GRANT ALL ON TABLE "public"."actividad_activo" TO "authenticated";
GRANT ALL ON TABLE "public"."actividad_activo" TO "service_role";


--
-- Name: TABLE "actividad_ot"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."actividad_ot" TO "anon";
GRANT ALL ON TABLE "public"."actividad_ot" TO "authenticated";
GRANT ALL ON TABLE "public"."actividad_ot" TO "service_role";


--
-- Name: TABLE "activo_materiales"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."activo_materiales" TO "anon";
GRANT ALL ON TABLE "public"."activo_materiales" TO "authenticated";
GRANT ALL ON TABLE "public"."activo_materiales" TO "service_role";


--
-- Name: TABLE "activos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."activos" TO "anon";
GRANT ALL ON TABLE "public"."activos" TO "authenticated";
GRANT ALL ON TABLE "public"."activos" TO "service_role";


--
-- Name: TABLE "alerta_enviada"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."alerta_enviada" TO "anon";
GRANT ALL ON TABLE "public"."alerta_enviada" TO "authenticated";
GRANT ALL ON TABLE "public"."alerta_enviada" TO "service_role";


--
-- Name: TABLE "app_config"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."app_config" TO "anon";
GRANT ALL ON TABLE "public"."app_config" TO "authenticated";
GRANT ALL ON TABLE "public"."app_config" TO "service_role";


--
-- Name: TABLE "archivos_orden"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."archivos_orden" TO "anon";
GRANT ALL ON TABLE "public"."archivos_orden" TO "authenticated";
GRANT ALL ON TABLE "public"."archivos_orden" TO "service_role";


--
-- Name: TABLE "auditoria_ot"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."auditoria_ot" TO "anon";
GRANT ALL ON TABLE "public"."auditoria_ot" TO "authenticated";
GRANT ALL ON TABLE "public"."auditoria_ot" TO "service_role";


--
-- Name: TABLE "capacitacion_asistentes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."capacitacion_asistentes" TO "anon";
GRANT ALL ON TABLE "public"."capacitacion_asistentes" TO "authenticated";
GRANT ALL ON TABLE "public"."capacitacion_asistentes" TO "service_role";


--
-- Name: TABLE "capacitaciones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."capacitaciones" TO "anon";
GRANT ALL ON TABLE "public"."capacitaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."capacitaciones" TO "service_role";


--
-- Name: TABLE "cargos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cargos" TO "anon";
GRANT ALL ON TABLE "public"."cargos" TO "authenticated";
GRANT ALL ON TABLE "public"."cargos" TO "service_role";


--
-- Name: TABLE "categorias_ot"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."categorias_ot" TO "anon";
GRANT ALL ON TABLE "public"."categorias_ot" TO "authenticated";
GRANT ALL ON TABLE "public"."categorias_ot" TO "service_role";


--
-- Name: TABLE "comentarios_orden"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."comentarios_orden" TO "anon";
GRANT ALL ON TABLE "public"."comentarios_orden" TO "authenticated";
GRANT ALL ON TABLE "public"."comentarios_orden" TO "service_role";


--
-- Name: TABLE "completion_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."completion_messages" TO "anon";
GRANT ALL ON TABLE "public"."completion_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."completion_messages" TO "service_role";


--
-- Name: TABLE "cuadrilla_usuarios"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cuadrilla_usuarios" TO "anon";
GRANT ALL ON TABLE "public"."cuadrilla_usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."cuadrilla_usuarios" TO "service_role";


--
-- Name: TABLE "cuadrillas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cuadrillas" TO "anon";
GRANT ALL ON TABLE "public"."cuadrillas" TO "authenticated";
GRANT ALL ON TABLE "public"."cuadrillas" TO "service_role";


--
-- Name: TABLE "export_runs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."export_runs" TO "anon";
GRANT ALL ON TABLE "public"."export_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."export_runs" TO "service_role";


--
-- Name: TABLE "export_schedules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."export_schedules" TO "anon";
GRANT ALL ON TABLE "public"."export_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."export_schedules" TO "service_role";


--
-- Name: TABLE "extension_version_cache"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."extension_version_cache" TO "anon";
GRANT ALL ON TABLE "public"."extension_version_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."extension_version_cache" TO "service_role";


--
-- Name: TABLE "fabricantes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fabricantes" TO "anon";
GRANT ALL ON TABLE "public"."fabricantes" TO "authenticated";
GRANT ALL ON TABLE "public"."fabricantes" TO "service_role";


--
-- Name: TABLE "feedback"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."feedback" TO "anon";
GRANT ALL ON TABLE "public"."feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback" TO "service_role";


--
-- Name: TABLE "flow_customers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."flow_customers" TO "anon";
GRANT ALL ON TABLE "public"."flow_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."flow_customers" TO "service_role";


--
-- Name: TABLE "foto_grupo_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."foto_grupo_items" TO "anon";
GRANT ALL ON TABLE "public"."foto_grupo_items" TO "authenticated";
GRANT ALL ON TABLE "public"."foto_grupo_items" TO "service_role";


--
-- Name: TABLE "foto_grupos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."foto_grupos" TO "anon";
GRANT ALL ON TABLE "public"."foto_grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."foto_grupos" TO "service_role";


--
-- Name: TABLE "hitos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hitos" TO "anon";
GRANT ALL ON TABLE "public"."hitos" TO "authenticated";
GRANT ALL ON TABLE "public"."hitos" TO "service_role";


--
-- Name: TABLE "hojas_inventario"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hojas_inventario" TO "anon";
GRANT ALL ON TABLE "public"."hojas_inventario" TO "authenticated";
GRANT ALL ON TABLE "public"."hojas_inventario" TO "service_role";


--
-- Name: TABLE "hojas_inventario_filas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hojas_inventario_filas" TO "anon";
GRANT ALL ON TABLE "public"."hojas_inventario_filas" TO "authenticated";
GRANT ALL ON TABLE "public"."hojas_inventario_filas" TO "service_role";


--
-- Name: TABLE "import_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."import_templates" TO "anon";
GRANT ALL ON TABLE "public"."import_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."import_templates" TO "service_role";


--
-- Name: TABLE "incidentes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."incidentes" TO "anon";
GRANT ALL ON TABLE "public"."incidentes" TO "authenticated";
GRANT ALL ON TABLE "public"."incidentes" TO "service_role";


--
-- Name: TABLE "inspection_route_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inspection_route_items" TO "anon";
GRANT ALL ON TABLE "public"."inspection_route_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_route_items" TO "service_role";


--
-- Name: TABLE "inspection_routes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inspection_routes" TO "anon";
GRANT ALL ON TABLE "public"."inspection_routes" TO "authenticated";
GRANT ALL ON TABLE "public"."inspection_routes" TO "service_role";


--
-- Name: TABLE "levantamiento_actividad"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."levantamiento_actividad" TO "anon";
GRANT ALL ON TABLE "public"."levantamiento_actividad" TO "authenticated";
GRANT ALL ON TABLE "public"."levantamiento_actividad" TO "service_role";


--
-- Name: TABLE "levantamiento_foto_grupos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."levantamiento_foto_grupos" TO "anon";
GRANT ALL ON TABLE "public"."levantamiento_foto_grupos" TO "authenticated";
GRANT ALL ON TABLE "public"."levantamiento_foto_grupos" TO "service_role";


--
-- Name: TABLE "levantamiento_foto_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."levantamiento_foto_items" TO "anon";
GRANT ALL ON TABLE "public"."levantamiento_foto_items" TO "authenticated";
GRANT ALL ON TABLE "public"."levantamiento_foto_items" TO "service_role";


--
-- Name: TABLE "levantamiento_items"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."levantamiento_items" TO "anon";
GRANT ALL ON TABLE "public"."levantamiento_items" TO "authenticated";
GRANT ALL ON TABLE "public"."levantamiento_items" TO "service_role";


--
-- Name: TABLE "levantamiento_materiales"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."levantamiento_materiales" TO "anon";
GRANT ALL ON TABLE "public"."levantamiento_materiales" TO "authenticated";
GRANT ALL ON TABLE "public"."levantamiento_materiales" TO "service_role";


--
-- Name: TABLE "levantamiento_secciones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."levantamiento_secciones" TO "anon";
GRANT ALL ON TABLE "public"."levantamiento_secciones" TO "authenticated";
GRANT ALL ON TABLE "public"."levantamiento_secciones" TO "service_role";


--
-- Name: TABLE "levantamientos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."levantamientos" TO "anon";
GRANT ALL ON TABLE "public"."levantamientos" TO "authenticated";
GRANT ALL ON TABLE "public"."levantamientos" TO "service_role";


--
-- Name: SEQUENCE "levantamientos_numero_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."levantamientos_numero_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."levantamientos_numero_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."levantamientos_numero_seq" TO "service_role";


--
-- Name: TABLE "lugares"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lugares" TO "anon";
GRANT ALL ON TABLE "public"."lugares" TO "authenticated";
GRANT ALL ON TABLE "public"."lugares" TO "service_role";


--
-- Name: TABLE "material_proveedores"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."material_proveedores" TO "anon";
GRANT ALL ON TABLE "public"."material_proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."material_proveedores" TO "service_role";


--
-- Name: TABLE "material_reservations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."material_reservations" TO "anon";
GRANT ALL ON TABLE "public"."material_reservations" TO "authenticated";
GRANT ALL ON TABLE "public"."material_reservations" TO "service_role";


--
-- Name: TABLE "material_stock_entries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."material_stock_entries" TO "anon";
GRANT ALL ON TABLE "public"."material_stock_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."material_stock_entries" TO "service_role";


--
-- Name: TABLE "material_withdrawal_returns"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."material_withdrawal_returns" TO "anon";
GRANT ALL ON TABLE "public"."material_withdrawal_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."material_withdrawal_returns" TO "service_role";


--
-- Name: TABLE "material_withdrawals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."material_withdrawals" TO "anon";
GRANT ALL ON TABLE "public"."material_withdrawals" TO "authenticated";
GRANT ALL ON TABLE "public"."material_withdrawals" TO "service_role";


--
-- Name: TABLE "materiales_usados"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."materiales_usados" TO "anon";
GRANT ALL ON TABLE "public"."materiales_usados" TO "authenticated";
GRANT ALL ON TABLE "public"."materiales_usados" TO "service_role";


--
-- Name: TABLE "mediciones_ambientales"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."mediciones_ambientales" TO "anon";
GRANT ALL ON TABLE "public"."mediciones_ambientales" TO "authenticated";
GRANT ALL ON TABLE "public"."mediciones_ambientales" TO "service_role";


--
-- Name: TABLE "modelos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."modelos" TO "anon";
GRANT ALL ON TABLE "public"."modelos" TO "authenticated";
GRANT ALL ON TABLE "public"."modelos" TO "service_role";


--
-- Name: TABLE "notificacion_preferencias"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notificacion_preferencias" TO "anon";
GRANT ALL ON TABLE "public"."notificacion_preferencias" TO "authenticated";
GRANT ALL ON TABLE "public"."notificacion_preferencias" TO "service_role";


--
-- Name: TABLE "notifications"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";


--
-- Name: TABLE "notifications_alertas_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."notifications_alertas_log" TO "anon";
GRANT ALL ON TABLE "public"."notifications_alertas_log" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications_alertas_log" TO "service_role";


--
-- Name: TABLE "oficios"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."oficios" TO "anon";
GRANT ALL ON TABLE "public"."oficios" TO "authenticated";
GRANT ALL ON TABLE "public"."oficios" TO "service_role";


--
-- Name: TABLE "orden_partes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."orden_partes" TO "anon";
GRANT ALL ON TABLE "public"."orden_partes" TO "authenticated";
GRANT ALL ON TABLE "public"."orden_partes" TO "service_role";


--
-- Name: TABLE "ordenes_marcadas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ordenes_marcadas" TO "anon";
GRANT ALL ON TABLE "public"."ordenes_marcadas" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_marcadas" TO "service_role";


--
-- Name: TABLE "ordenes_trabajo"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ordenes_trabajo" TO "anon";
GRANT ALL ON TABLE "public"."ordenes_trabajo" TO "authenticated";
GRANT ALL ON TABLE "public"."ordenes_trabajo" TO "service_role";


--
-- Name: TABLE "ot_alert_state"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ot_alert_state" TO "anon";
GRANT ALL ON TABLE "public"."ot_alert_state" TO "authenticated";
GRANT ALL ON TABLE "public"."ot_alert_state" TO "service_role";


--
-- Name: TABLE "ot_procedimientos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ot_procedimientos" TO "anon";
GRANT ALL ON TABLE "public"."ot_procedimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."ot_procedimientos" TO "service_role";


--
-- Name: TABLE "paso_respuesta_historial"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."paso_respuesta_historial" TO "anon";
GRANT ALL ON TABLE "public"."paso_respuesta_historial" TO "authenticated";
GRANT ALL ON TABLE "public"."paso_respuesta_historial" TO "service_role";


--
-- Name: TABLE "paso_respuestas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."paso_respuestas" TO "anon";
GRANT ALL ON TABLE "public"."paso_respuestas" TO "authenticated";
GRANT ALL ON TABLE "public"."paso_respuestas" TO "service_role";


--
-- Name: TABLE "permisos_usuario"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."permisos_usuario" TO "anon";
GRANT ALL ON TABLE "public"."permisos_usuario" TO "authenticated";
GRANT ALL ON TABLE "public"."permisos_usuario" TO "service_role";


--
-- Name: TABLE "presupuestos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."presupuestos" TO "anon";
GRANT ALL ON TABLE "public"."presupuestos" TO "authenticated";
GRANT ALL ON TABLE "public"."presupuestos" TO "service_role";


--
-- Name: TABLE "procedimiento_ejecuciones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."procedimiento_ejecuciones" TO "anon";
GRANT ALL ON TABLE "public"."procedimiento_ejecuciones" TO "authenticated";
GRANT ALL ON TABLE "public"."procedimiento_ejecuciones" TO "service_role";


--
-- Name: TABLE "procedimiento_pasos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."procedimiento_pasos" TO "anon";
GRANT ALL ON TABLE "public"."procedimiento_pasos" TO "authenticated";
GRANT ALL ON TABLE "public"."procedimiento_pasos" TO "service_role";


--
-- Name: TABLE "procedimiento_plantillas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."procedimiento_plantillas" TO "anon";
GRANT ALL ON TABLE "public"."procedimiento_plantillas" TO "authenticated";
GRANT ALL ON TABLE "public"."procedimiento_plantillas" TO "service_role";


--
-- Name: TABLE "procedimiento_subprocedimientos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."procedimiento_subprocedimientos" TO "anon";
GRANT ALL ON TABLE "public"."procedimiento_subprocedimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."procedimiento_subprocedimientos" TO "service_role";


--
-- Name: TABLE "procedimientos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."procedimientos" TO "anon";
GRANT ALL ON TABLE "public"."procedimientos" TO "authenticated";
GRANT ALL ON TABLE "public"."procedimientos" TO "service_role";


--
-- Name: TABLE "proveedores"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."proveedores" TO "anon";
GRANT ALL ON TABLE "public"."proveedores" TO "authenticated";
GRANT ALL ON TABLE "public"."proveedores" TO "service_role";


--
-- Name: TABLE "push_subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";


--
-- Name: TABLE "reglas_alerta_usuarios"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reglas_alerta_usuarios" TO "anon";
GRANT ALL ON TABLE "public"."reglas_alerta_usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."reglas_alerta_usuarios" TO "service_role";


--
-- Name: TABLE "reglas_alerta_workspace"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reglas_alerta_workspace" TO "anon";
GRANT ALL ON TABLE "public"."reglas_alerta_workspace" TO "authenticated";
GRANT ALL ON TABLE "public"."reglas_alerta_workspace" TO "service_role";


--
-- Name: TABLE "sociedades"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sociedades" TO "anon";
GRANT ALL ON TABLE "public"."sociedades" TO "authenticated";
GRANT ALL ON TABLE "public"."sociedades" TO "service_role";


--
-- Name: TABLE "solicitantes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."solicitantes" TO "anon";
GRANT ALL ON TABLE "public"."solicitantes" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitantes" TO "service_role";


--
-- Name: TABLE "solicitudes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."solicitudes" TO "anon";
GRANT ALL ON TABLE "public"."solicitudes" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitudes" TO "service_role";


--
-- Name: TABLE "solicitudes_arco"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."solicitudes_arco" TO "anon";
GRANT ALL ON TABLE "public"."solicitudes_arco" TO "authenticated";
GRANT ALL ON TABLE "public"."solicitudes_arco" TO "service_role";


--
-- Name: TABLE "subscription_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."subscription_events" TO "anon";
GRANT ALL ON TABLE "public"."subscription_events" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_events" TO "service_role";


--
-- Name: TABLE "subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";


--
-- Name: TABLE "tipos_parte"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."tipos_parte" TO "anon";
GRANT ALL ON TABLE "public"."tipos_parte" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_parte" TO "service_role";


--
-- Name: TABLE "ubicaciones"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ubicaciones" TO "anon";
GRANT ALL ON TABLE "public"."ubicaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."ubicaciones" TO "service_role";


--
-- Name: TABLE "uni_solicitudes_vistas"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."uni_solicitudes_vistas" TO "anon";
GRANT ALL ON TABLE "public"."uni_solicitudes_vistas" TO "authenticated";
GRANT ALL ON TABLE "public"."uni_solicitudes_vistas" TO "service_role";


--
-- Name: TABLE "usuarios"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."usuarios" TO "anon";
GRANT ALL ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";


--
-- Name: TABLE "workspace_taxonomias"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspace_taxonomias" TO "anon";
GRANT ALL ON TABLE "public"."workspace_taxonomias" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_taxonomias" TO "service_role";


--
-- Name: TABLE "workspaces"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict 5MOPAAeqmH7WNuPLkBwJyPAiMlq2ghmjsygu18L6AuNea1ucSseHgggXlUXIA1S

