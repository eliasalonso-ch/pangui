-- subscriptions.workspace_id necesita un UNIQUE para que el upsert con
-- onConflict: "workspace_id" funcione.
--
-- /api/suscripcion/register hace upsert({...}, { onConflict: "workspace_id" })
-- después de crear la suscripción en Flow. Sin esta restricción, Postgres
-- rechaza el ON CONFLICT (42P10) y el upsert falla SIEMPRE: la suscripción
-- queda creada en Flow pero la base local nunca recibe el flow_subscription_id,
-- por lo que el webhook posterior no encuentra la fila y el pago queda
-- huérfano. Detectado el 2026-08-10 probando el flujo de contratación en
-- sandbox; no hay duplicados existentes (una suscripción por workspace).

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_workspace_id_key UNIQUE (workspace_id);
