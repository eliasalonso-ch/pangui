-- Remove the ot_bloqueada alert rule. Active in 7/8 workspaces since April,
-- 0 notifications ever produced. Same never-delivered shape as the
-- timer_inactivo_* rules removed earlier the same day.

CREATE OR REPLACE FUNCTION public.seed_reglas_alerta()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO reglas_alerta_workspace (workspace_id, tipo, umbral_minutos, es_obligatoria, rol_destino) VALUES
    (NEW.id, 'ot_vencida',                  0,    false, null),
    (NEW.id, 'ot_sin_asignar',              480,  false, null),
    (NEW.id, 'ot_urgente_sin_asignar',      60,   false, null),
    (NEW.id, 'ot_abierta_sin_progreso',     4320, false, null),
    (NEW.id, 'ot_en_curso_inactiva',        480,  false, null)
  ON CONFLICT (workspace_id, tipo, rol_destino) DO NOTHING;
  RETURN NEW;
END;
$function$;

DELETE FROM public.reglas_alerta_usuarios rau
WHERE EXISTS (
  SELECT 1 FROM public.reglas_alerta_workspace w
  WHERE w.id = rau.regla_id AND w.tipo = 'ot_bloqueada'
);

DELETE FROM public.reglas_alerta_workspace WHERE tipo = 'ot_bloqueada';
