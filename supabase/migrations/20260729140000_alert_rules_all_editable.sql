-- Todas las reglas de alerta pasan a ser editables.
--
-- Hasta ahora `prevent_disabling_mandatory_alert_rule()` lanzaba P0001
-- ("Las reglas obligatorias no se pueden desactivar") al intentar apagar una
-- regla con `es_obligatoria = true`, y el seed marcaba tres tipos como
-- obligatorios (ot_vencida, ot_urgente_sin_asignar, ot_bloqueada). El resultado
-- era que 21 de 63 reglas en producción no se podían desactivar desde ninguno
-- de los dos clientes: el PATCH devolvía 400.
--
-- Cada workspace decide qué alertas necesita, así que ya no hay reglas que el
-- producto imponga.
--
-- Aditivo a propósito: no se hace DROP del trigger ni de la función (ver
-- ENGINEERING_STANDARDS.md). El cuerpo se reemplaza por un passthrough, de modo
-- que builds publicados que aún esperan el trigger siguen funcionando y la
-- migración se puede volver a aplicar sin efectos secundarios.

-- 1) El guard deja de bloquear. Se conserva la función para no romper el
--    trigger existente que la referencia.
CREATE OR REPLACE FUNCTION "public"."prevent_disabling_mandatory_alert_rule"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Sin bloqueo: todas las reglas de alerta son editables por el workspace.
  RETURN NEW;
END;
$$;

-- 2) Ningún registro queda marcado como obligatorio, para que la UI no muestre
--    el badge "Obligatoria" en reglas que sí se pueden desactivar.
UPDATE public.reglas_alerta_workspace
SET es_obligatoria = false
WHERE es_obligatoria;

-- 3) Los workspaces nuevos se siembran sin reglas obligatorias. Mismos tipos y
--    umbrales que antes; solo cambia la columna es_obligatoria.
CREATE OR REPLACE FUNCTION seed_reglas_alerta()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO reglas_alerta_workspace (workspace_id, tipo, umbral_minutos, es_obligatoria, rol_destino) VALUES
    (NEW.id, 'ot_vencida',                  0,    false, null),
    (NEW.id, 'ot_sin_asignar',              480,  false, null),
    (NEW.id, 'ot_urgente_sin_asignar',      60,   false, null),
    (NEW.id, 'ot_bloqueada',                1440, false, null),
    (NEW.id, 'ot_abierta_sin_progreso',     4320, false, null),
    (NEW.id, 'ot_en_curso_inactiva',        480,  false, null),
    (NEW.id, 'timer_inactivo_tecnico',      30,   false, 'member'),
    (NEW.id, 'timer_inactivo_supervisor',   120,  false, 'admin'),
    (NEW.id, 'timer_inactivo_manager',      1440, false, 'owner')
  ON CONFLICT (workspace_id, tipo, rol_destino) DO NOTHING;
  RETURN NEW;
END;
$$;
