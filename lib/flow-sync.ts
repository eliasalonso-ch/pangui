/**
 * Sync the number of active users in a workspace to its Flow subscription.
 *
 * Strategy:
 *   - The Flow plan amount = price_per_user (covers user #1).
 *   - Each additional active user = one Flow subscription_item at the same amount.
 *   - On invite / deactivation, this function reconciles the items so the
 *     monthly charge always equals price_per_user × active_user_count.
 *
 * Idempotent: safe to call repeatedly. No-ops for trialing / basic_free / canceled
 * subscriptions and for the enterprise tier (billed off-platform).
 */
import { adminSupabase } from "@/app/api/suscripcion/_helpers";
import { flow } from "@/lib/flow";

export async function syncSubscriptionToUserCount(workspaceId: string): Promise<void> {
  const admin = adminSupabase();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, flow_subscription_id, status, plan_key, price_per_user_clp")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

  // Nothing to sync if the workspace isn't on a billed plan
  if (!sub) return;
  if (!sub.flow_subscription_id)               return; // trialing / basic_free
  if (!["active", "past_due"].includes(sub.status)) return;
  if (sub.plan_key === "enterprise")           return; // off-platform billing
  if (!sub.price_per_user_clp || sub.price_per_user_clp <= 0) return;

  const { count: activeUsers } = await admin
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("activo", true);

  const extras = Math.max(0, (activeUsers ?? 0) - 1); // plan covers user #1

  try {
    const items = await flow.listSubscriptionItems(sub.flow_subscription_id);
    const existing = items.data?.filter(i => i.name?.startsWith("Usuario extra")) ?? [];

    // Add missing
    while (existing.length < extras) {
      await flow.addSubscriptionItem({
        subscriptionId: sub.flow_subscription_id,
        name:           `Usuario extra #${existing.length + 1}`,
        amount:         sub.price_per_user_clp,
        currency:       "CLP",
        interval:       3,
        interval_count: 1,
      });
      existing.push({ subscription_item_id: "placeholder", name: "x", amount: 0 });
    }

    // Remove surplus
    while (existing.length > extras) {
      const last = existing.pop();
      if (last?.subscription_item_id) {
        await flow.removeSubscriptionItem({
          subscriptionId:       sub.flow_subscription_id,
          subscription_item_id: last.subscription_item_id,
        });
      }
    }
  } catch (err) {
    // Don't block user invitations on a Flow sync failure — log and move on.
    // Next webhook or manual reconcile will catch up.
    console.error("[flow-sync] error syncing items:", err);
  }
}
