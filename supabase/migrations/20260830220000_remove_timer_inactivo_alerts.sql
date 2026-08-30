-- Remove the three timer_inactivo_* alert rules and the preference column that
-- gated their push delivery.
--
-- Why: these rules fired for months (82 rows in notifications_alertas_log) but
-- never produced a single row in `notifications`, so no user ever saw one. The
-- delivery path was broken from the start and the feature was never missed.
-- Deleted rather than repaired, by product decision.
--
-- `notif_recordatorio_timer` gated push for timer_inactivo_* and
-- timer_sin_iniciar in send-push-notification. With the timer_inactivo_* rules
-- gone and timer_sin_iniciar having no rule rows, the column gates nothing.
--
-- NOT touched: `timer_sin_iniciar` remains a case in evaluar-alertas. It has no
-- reglas_alerta_workspace rows and has never fired, but it was out of scope.

-- 1. Stop seeding the rules into new workspaces.
CREATE OR REPLACE FUNCTION public.seed_reglas_alerta()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO reglas_alerta_workspace (workspace_id, tipo, umbral_minutos, es_obligatoria, rol_destino) VALUES
    (NEW.id, 'ot_vencida',                  0,    false, null),
    (NEW.id, 'ot_sin_asignar',              480,  false, null),
    (NEW.id, 'ot_urgente_sin_asignar',      60,   false, null),
    (NEW.id, 'ot_bloqueada',                1440, false, null),
    (NEW.id, 'ot_abierta_sin_progreso',     4320, false, null),
    (NEW.id, 'ot_en_curso_inactiva',        480,  false, null)
  ON CONFLICT (workspace_id, tipo, rol_destino) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 2. Remove per-user overrides first (FK to reglas_alerta_workspace).
DELETE FROM public.reglas_alerta_usuarios rau
WHERE EXISTS (
  SELECT 1 FROM public.reglas_alerta_workspace w
  WHERE w.id = rau.regla_id AND w.tipo LIKE 'timer_inactivo%'
);

-- 3. Remove the workspace rules themselves (14 rows across 5 workspaces).
DELETE FROM public.reglas_alerta_workspace WHERE tipo LIKE 'timer_inactivo%';

-- 4. Drop the now-dead preference column.
ALTER TABLE public.notificacion_preferencias
  DROP COLUMN IF EXISTS notif_recordatorio_timer;
