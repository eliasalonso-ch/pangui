-- Per-workspace subscriptions billed through Flow.cl.
ALTER TABLE usuarios DROP COLUMN IF EXISTS mp_subscription_id;

CREATE TABLE IF NOT EXISTS flow_customers (
  workspace_id    uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  flow_customer_id text NOT NULL UNIQUE,
  email           text NOT NULL,
  name            text,
  has_card        boolean NOT NULL DEFAULT false,
  card_last4      text,
  card_brand      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  flow_subscription_id text UNIQUE,
  flow_customer_id     text NOT NULL,
  flow_plan_id         text NOT NULL,
  plan_key             text NOT NULL CHECK (plan_key IN ('seats_1','seats_5','seats_10','seats_25')),
  seats                int  NOT NULL CHECK (seats > 0),
  amount_clp           int  NOT NULL,
  status               text NOT NULL DEFAULT 'trialing'
                       CHECK (status IN ('trialing','active','past_due','canceled','unpaid')),
  trial_end            timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  canceled_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status    ON subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_sub_per_workspace
  ON subscriptions(workspace_id)
  WHERE status <> 'canceled';

CREATE TABLE IF NOT EXISTS subscription_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  flow_payload    jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_workspace ON subscription_events(workspace_id);

ALTER TABLE flow_customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION fn_mi_workspace()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT workspace_id FROM usuarios WHERE id = auth.uid()
$$;

CREATE POLICY "flow_customers: read own workspace"
  ON flow_customers FOR SELECT TO authenticated
  USING (workspace_id = fn_mi_workspace());

CREATE POLICY "subscriptions: read own workspace"
  ON subscriptions FOR SELECT TO authenticated
  USING (workspace_id = fn_mi_workspace());

CREATE POLICY "subscription_events: read own workspace"
  ON subscription_events FOR SELECT TO authenticated
  USING (workspace_id = fn_mi_workspace());;
