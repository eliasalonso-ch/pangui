/**
 * POST /api/suscripcion/change-plan
 * Body: { plan_key: "basic" | "esencial" | "pro" }
 *
 * Moves between paid tiers. If the workspace is currently on a free state
 * (trialing / basic_free), they must go through /register first to capture a card.
 */
import { NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";
import { flow, FlowError } from "@/lib/flow";
import { flowPlanId, planByKey, type PlanKey } from "@/lib/flow-plans";
import { syncSubscriptionToUserCount } from "@/lib/flow-sync";

export async function POST(req: Request) {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const { workspaceId } = auth.ctx;

  const body = await req.json().catch(() => ({} as { plan_key?: string }));
  const planKey = body.plan_key as PlanKey | undefined;
  if (!planKey) return NextResponse.json({ error: "Falta plan_key." }, { status: 400 });

  let plan, newFlowPlanId;
  try {
    plan          = planByKey(planKey);
    newFlowPlanId = flowPlanId(planKey);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  if (!plan.selfServe) {
    return NextResponse.json({ error: "Enterprise requiere contactar a ventas." }, { status: 400 });
  }

  const admin = adminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, flow_subscription_id, plan_key, status, is_early_customer, price_per_user_clp")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

  if (!sub) return NextResponse.json({ error: "No hay suscripción." }, { status: 404 });

  if (sub.plan_key === planKey && sub.status === "active") {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // No Flow subscription yet → caller must go through /register to capture card.
  if (!sub.flow_subscription_id) {
    const { data: customer } = await admin
      .from("flow_customers")
      .select("flow_customer_id, has_card")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!customer?.flow_customer_id || !customer.has_card) {
      return NextResponse.json({ error: "needs_card", redirect: "/suscripcion?action=upgrade" }, { status: 402 });
    }
    try {
      const created = await flow.createSubscription({ planId: newFlowPlanId, customerId: customer.flow_customer_id });
      const refreshed = await flow.getSubscription(created.subscriptionId).catch(() => created);
      await admin.from("subscriptions").update({
        plan_key: planKey,
        flow_subscription_id: created.subscriptionId,
        flow_plan_id: newFlowPlanId,
        price_per_user_clp: sub.is_early_customer ? sub.price_per_user_clp : plan.pricePerUser,
        status: "active",
        trial_end: null,
        current_period_start: refreshed.period_start ?? null,
        current_period_end: refreshed.period_end ?? refreshed.next_invoice_date ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", sub.id);
      await admin.from("usuarios").update({ plan: planKey, plan_status: "active" }).eq("workspace_id", workspaceId);
      await syncSubscriptionToUserCount(workspaceId);
      return NextResponse.json({ ok: true, plan_key: planKey });
    } catch (err) {
      const fe = err as FlowError;
      console.error("[suscripcion/change-plan] create with saved card", fe);
      return NextResponse.json({ error: fe.message ?? "No se pudo activar el plan con la tarjeta guardada." }, { status: 502 });
    }
  }

  try {
    await flow.changePlan({
      subscriptionId: sub.flow_subscription_id,
      newPlanId:      newFlowPlanId,
    });
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/change-plan]", fe);
    return NextResponse.json({ error: fe.message ?? "Error cambiando plan." }, { status: 502 });
  }

  // Early customers keep their negotiated price even when switching tier.
  // Anyone else snaps to the current catalog price for the new tier.
  const newPrice = sub.is_early_customer ? sub.price_per_user_clp : plan.pricePerUser;

  // Refresh period dates from Flow. changePlan may shift the billing cycle.
  const refreshed = await flow.getSubscription(sub.flow_subscription_id).catch(() => null);

  await admin.from("subscriptions").update({
    plan_key:             planKey,
    flow_plan_id:         newFlowPlanId,
    price_per_user_clp:   newPrice,
    status:               "active",
    current_period_start: refreshed?.period_start ?? null,
    current_period_end:   refreshed?.period_end ?? refreshed?.next_invoice_date ?? null,
    updated_at:           new Date().toISOString(),
  }).eq("id", sub.id);

  await admin.from("usuarios").update({
    plan:        planKey,
    plan_status: "active",
  }).eq("workspace_id", workspaceId);

  // Reconcile items with current active user count at new price
  await syncSubscriptionToUserCount(workspaceId);

  return NextResponse.json({ ok: true, plan_key: planKey });
}
