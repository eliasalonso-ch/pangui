/**
 * Lazy trial-expiry sweep. Called from /api/suscripcion/status (and could be
 * scheduled later). If a workspace's trial ended without a paid plan, drops it
 * to basic_free so the app gates accordingly.
 *
 * No-op when there is nothing to expire.
 */
import { adminSupabase } from "@/app/api/suscripcion/_helpers";

export async function expireTrialsIfNeeded(workspaceId: string): Promise<boolean> {
  const admin = adminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, status, trial_end, plan_key")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

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
