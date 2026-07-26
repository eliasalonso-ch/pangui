-- Drop old seat-tier subscriptions
DROP TABLE IF EXISTS subscription_events;
DROP TABLE IF EXISTS subscriptions;

CREATE TABLE subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_key             text NOT NULL CHECK (plan_key IN ('basic','esencial','pro','enterprise')),
  flow_subscription_id text UNIQUE,
  flow_plan_id         text,
  price_per_user_clp   int  NOT NULL DEFAULT 0,
  status               text NOT NULL DEFAULT 'trialing'
                       CHECK (status IN ('trialing','active','past_due','canceled','unpaid','basic_free')),
  trial_end            timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  canceled_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_active_sub_per_workspace
  ON subscriptions(workspace_id) WHERE status <> 'canceled';
CREATE INDEX idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX idx_subscriptions_status    ON subscriptions(status);

CREATE TABLE subscription_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  workspace_id    uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  event_type      text NOT NULL,
  flow_payload    jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sub_events_workspace ON subscription_events(workspace_id);

ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: read own workspace"
  ON subscriptions FOR SELECT TO authenticated
  USING (workspace_id = fn_mi_workspace());

CREATE POLICY "subscription_events: read own workspace"
  ON subscription_events FOR SELECT TO authenticated
  USING (workspace_id = fn_mi_workspace());

UPDATE usuarios
   SET plan = CASE
                WHEN plan IN ('basic','esencial','pro','enterprise') THEN plan
                ELSE 'basic'
              END;

INSERT INTO subscriptions (workspace_id, plan_key, status, trial_end, price_per_user_clp)
SELECT id, 'pro', 'trialing', now() + interval '14 days', 0
  FROM workspaces
 WHERE NOT EXISTS (
   SELECT 1 FROM subscriptions s WHERE s.workspace_id = workspaces.id
 );

UPDATE usuarios
   SET plan        = 'pro',
       plan_status = 'trial',
       trial_end   = (now() + interval '14 days');

CREATE OR REPLACE FUNCTION fn_effective_plan(p_workspace_id uuid)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN s.status IN ('trialing') THEN 'pro'
    ELSE s.plan_key
  END
  FROM subscriptions s
  WHERE s.workspace_id = p_workspace_id
    AND s.status <> 'canceled'
  ORDER BY s.created_at DESC
  LIMIT 1
$$;;
