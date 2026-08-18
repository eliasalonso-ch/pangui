/**
 * Lazy trial-expiry sweep. Called from /api/suscripcion/status (and could be
 * scheduled later). If a workspace's trial ended without a paid plan, drops it
 * to basic_free so the app gates accordingly.
 *
 * No-op when there is nothing to expire.
 *
 * Fast path: callers that have already read the subscription row (e.g.
 * /api/suscripcion/status, which runs on every page load) pass it in via
 * `known`, so the common "nothing to expire" case costs zero queries instead
 * of re-reading a row the caller is holding.
 */
import { adminSupabase } from "@/app/api/suscripcion/_helpers";

export interface KnownSubscription {
  id: string;
  status: string | null;
  trial_end: string | null;
}

export async function expireTrialsIfNeeded(
  workspaceId: string,
  known?: KnownSubscription | null,
): Promise<boolean> {
  const admin = adminSupabase();

  // Cheap rejects first. Only a trial that has actually elapsed needs any work,
  // and that is the rare case -- so when the caller already has the row we can
  // decide without touching the database at all.
  let sub: { id: string; status: string | null; trial_end: string | null } | null;
  if (known !== undefined) {
    sub = known;
  } else {
    const { data } = await admin
      .from("subscriptions")
      .select("id, status, trial_end, plan_key")
      .eq("workspace_id", workspaceId)
      .neq("status", "canceled")
      .maybeSingle();
    sub = data;
  }

  if (!sub) return false;
  if (sub.status !== "trialing") return false;
  if (!sub.trial_end) return false;
  if (new Date(sub.trial_end).getTime() > Date.now()) return false;

  // Trial ended without a card. Drop to basic_free.
  await admin.from("subscriptions").update({
    plan_key:   "basic",
    status:     "basic_free",
    trial_end:  null,
    updated_at: new Date().toISOString(),
  }).eq("id", sub.id);

  await admin.from("usuarios").update({
    plan:        "basic",
    plan_status: "active",
  }).eq("workspace_id", workspaceId);

  await admin.from("subscription_events").insert({
    subscription_id: sub.id,
    workspace_id:    workspaceId,
    event_type:      "trial.expired_to_basic_free",
    flow_payload:    {},
  });

  return true;
}
