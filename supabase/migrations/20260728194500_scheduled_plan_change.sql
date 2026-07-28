-- Cambio de plan diferido al final del período.
--
-- Problema: change-plan aplicaba la bajada de inmediato y escribía el precio
-- nuevo. Alguien con Pro ($9.990) podía cambiar a Basic ($4.990) el día 1,
-- conservar las funciones Pro hasta el fin del período y pagar solo Basic.
--
-- Regla nueva:
--   Subida  (Basic → Pro): se aplica de inmediato.
--   Bajada  (Pro → Basic): se agenda para el fin del período. El usuario
--                          conserva lo que ya pagó y el precio nuevo rige
--                          desde el ciclo siguiente.
--
-- En ninguno de los dos casos se cobra al momento del cambio: el cobro ocurre
-- en la renovación normal del ciclo.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan_key text,
  ADD COLUMN IF NOT EXISTS scheduled_plan_at  timestamptz;

COMMENT ON COLUMN subscriptions.scheduled_plan_key IS
  'Plan al que baja el workspace cuando termine el período vigente. NULL = sin cambio pendiente.';
COMMENT ON COLUMN subscriptions.scheduled_plan_at IS
  'Momento en que debe aplicarse scheduled_plan_key (normalmente current_period_end).';
