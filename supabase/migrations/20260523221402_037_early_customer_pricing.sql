ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS is_early_customer  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_price_note  text,
  ADD COLUMN IF NOT EXISTS price_lock_until   timestamptz;

COMMENT ON COLUMN subscriptions.is_early_customer IS
  'TRUE = price_per_user_clp es un precio negociado (founder/early customer). No sobrescribir desde catálogo.';
COMMENT ON COLUMN subscriptions.custom_price_note IS
  'Nota visible al owner explicando el precio especial.';
COMMENT ON COLUMN subscriptions.price_lock_until IS
  'NULL = lock permanente. Timestamp = hasta cuándo se respeta el precio.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_early_customer
  ON subscriptions(is_early_customer) WHERE is_early_customer = true;;
