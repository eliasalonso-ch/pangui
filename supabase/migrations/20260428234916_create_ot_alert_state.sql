
CREATE TABLE IF NOT EXISTS ot_alert_state (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ot_id                 uuid NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE,
  alert_type            text NOT NULL,
  -- When we last sent a notification for this alert
  last_sent_at          timestamptz,
  -- When we're allowed to send the next notification
  next_eligible_at      timestamptz,
  -- When the condition first became true in the current active window
  condition_first_met_at timestamptz,
  -- Escalation: 1=day3, 2=day5, 3=day7+
  escalation_level      int NOT NULL DEFAULT 0,
  -- When this alert was resolved (condition cleared)
  resolved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  UNIQUE (ot_id, alert_type)
);

-- Index for the cron query (active, unresolved states)
CREATE INDEX idx_ot_alert_state_active
  ON ot_alert_state (ot_id, alert_type)
  WHERE resolved_at IS NULL;

-- Also clear old spam notifications from alerta_enviada (it's unused/broken)
-- Keep the table but truncate so the new system starts fresh
TRUNCATE alerta_enviada;
;
