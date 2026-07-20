/**
 * GET /api/suscripcion/register/callback?token=...&plan_key=...
 *
 * Step 2 of the upgrade flow. Flow redirects the user here after the hosted card form.
 *
 *   1. Verify card via /customer/getRegisterStatus
 *   2. Persist card metadata on flow_customers
 *   3. Create the Flow subscription with planId + customerId
 *   4. Upsert the workspace's subscriptions row
 *   5. Add subscription_items to match current active user count
 *   6. Mirror plan to usuarios.plan / plan_status (legacy gating)
 *   7. Redirect back to /suscripcion
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "../../_helpers";
import { flow, FlowError } from "@/lib/flow";
import { flowPlanId, planByKey, type PlanKey } from "@/lib/flow-plans";
import { syncSubscriptionToUserCount } from "@/lib/flow-sync";

const PLAN_KEYS: PlanKey[] = ["basic", "esencial", "pro"];

/**
 * Flow returns the user via POST x-www-form-urlencoded with a `token` field,
 * NOT via GET. The `plan_key` query param survives the redirect (we put it in
 * the url_return when calling /customer/register), so we read it from the URL.
 *
 * We accept both methods just in case Flow ever changes.
 */
async function readCallback(req: Request): Promise<{ token: string | null; planKey: PlanKey | null }> {
  const url     = new URL(req.url);
  const planKey = url.searchParams.get("plan_key") as PlanKey | null;
  let token: string | null = url.searchParams.get("token");
  if (!token && req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await req.formData();
      token = form.get("token")?.toString() ?? null;
    } else if (ct.includes("application/json")) {
      const json = await req.json().catch(() => ({} as { token?: string }));
      token = json.token ?? null;
    }
  }
  return { token, planKey };
}

export async function GET(req: Request)  { return handle(req); }
export async function POST(req: Request) { return handle(req); }

async function handle(req: Request) {
  const { token, planKey } = await readCallback(req);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const fail = (reason: string) =>
    NextResponse.redirect(`${appUrl}/suscripcion?status=error&reason=${encodeURIComponent(reason)}`, 303);

  if (!token)                                   return fail("missing_token");
  if (!planKey || !PLAN_KEYS.includes(planKey)) return fail("invalid_plan");

  try {
    // 1. Confirm card. Flow returns:
    //   status "0" = pending, "1" = success, "2" = card rejected by bank, "3" = canceled by user
    //
    // Flow occasionally returns status="0" right after the Webpay redirect
    // because the asynchronous association tbkUser → customer is still in
    // their queue. We retry briefly to give it time to settle before failing.
    let reg = await flow.getRegisterStatus(token);
    let attempts = 1;
    while (reg.status === "0" && attempts < 4) {
      await new Promise(r => setTimeout(r, 800));
      reg = await flow.getRegisterStatus(token);
      attempts++;
    }
    if (reg.status !== "1" || !reg.customerId) {
      console.warn("[suscripcion/register/callback] card_not_registered:", {
        token: token.slice(0, 12) + "...",
        status: reg.status,
        attempts,
        customerId: reg.customerId ?? null,
        creditCardType: reg.creditCardType ?? null,
        rawResponse: reg,
      });
      // Distinguish the user-facing reason so the UI banner is useful.
      const reason =
        reg.status === "0" ? "card_pending" :
        reg.status === "2" ? "card_rejected_by_bank" :
        reg.status === "3" ? "user_canceled" :
        "card_not_registered";
      return fail(reason);
    }

    const admin = adminSupabase();

    // 2. Find workspace via customerId
    const { data: customerRow } = await admin
      .from("flow_customers")
      .select("workspace_id")
      .eq("flow_customer_id", reg.customerId)
      .maybeSingle();
    if (!customerRow?.workspace_id) return fail("customer_not_found");
    const workspaceId = customerRow.workspace_id;

    // Flow returns card metadata as top-level fields (creditCardType, last4CardDigits).
    // Older docs hint at a nested `card` object — we accept both shapes for safety.
    const cardBrand = reg.creditCardType ?? reg.card?.type ?? null;
    const cardLast4 = reg.last4CardDigits ?? reg.card?.last4Digits ?? null;

    // Fallback: if the registerStatus response doesn't include the card data,
    // fetch it from the customer record directly (Flow stores it on the customer).
    let finalBrand = cardBrand;
    let finalLast4 = cardLast4;
    if (!finalBrand || !finalLast4) {
      const customer = await flow.getCustomer(reg.customerId).catch(() => null);
      finalBrand = finalBrand ?? customer?.creditCardType ?? null;
      finalLast4 = finalLast4 ?? customer?.last4CardDigits ?? null;
    }

    await admin.from("flow_customers").update({
      has_card:   true,
      card_brand: finalBrand,
      card_last4: finalLast4,
      updated_at: new Date().toISOString(),
    }).eq("workspace_id", workspaceId);

    const plan     = planByKey(planKey);
    const flowPlan = flowPlanId(planKey);

    // 3. Check existing subscription state
    const { data: existingSub } = await admin
      .from("subscriptions")
      .select("id, status, flow_subscription_id, plan_key")
      .eq("workspace_id", workspaceId)
      .neq("status", "canceled")
      .maybeSingle();

    let flowSubId = existingSub?.flow_subscription_id ?? null;

    if (flowSubId) {
      // Already had a Flow subscription (rare — re-registering card). Just change plan.
      try {
        await flow.changePlan({ subscriptionId: flowSubId, newPlanId: flowPlan });
      } catch (err) {
        console.error("[register/callback] changePlan failed, will create fresh:", err);
        flowSubId = null;
      }
    }

    if (!flowSubId) {
      const created = await flow.createSubscription({
        planId:     flowPlan,
        customerId: reg.customerId,
        // No trial — they already finished theirs (or skipped it).
      });
      flowSubId = created.subscriptionId;
    }

    // Fetch the canonical subscription detail so we can persist period dates.
    // The /create response sometimes omits period_end; /get always has it.
    const flowSub = await flow.getSubscription(flowSubId).catch(() => null);
    const subUpdate: Record<string, unknown> = {
      plan_key:             planKey,
      flow_subscription_id: flowSubId,
      flow_plan_id:         flowPlan,
      price_per_user_clp:   plan.pricePerUser,
      status:               "active",
      trial_end:            null,
      current_period_start: flowSub?.period_start ?? null,
      current_period_end:   flowSub?.period_end ?? flowSub?.next_invoice_date ?? null,
      updated_at:           new Date().toISOString(),
    };

    // 4. Upsert subscription row
    if (existingSub) {
      await admin.from("subscriptions").update(subUpdate).eq("id", existingSub.id);
    } else {
      await admin.from("subscriptions").insert({
        workspace_id: workspaceId,
        ...subUpdate,
      });
    }

    // 5. Mirror to usuarios.plan / plan_status (legacy gating)
    await admin.from("usuarios").update({
      plan:        planKey,
      plan_status: "active",
    }).eq("workspace_id", workspaceId);

    // 6. Reconcile subscription items with current user count
    await syncSubscriptionToUserCount(workspaceId);

    // Redirect to the dashboard with a welcome flag so /inicio can render a
    // celebration toast. Going back to /suscripcion would dump
    // the user on a billing screen — not the productive landing post-upgrade.
    return NextResponse.redirect(`${appUrl}/inicio?welcome=${encodeURIComponent(planKey)}`, 303);
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/register/callback]", fe);
    return fail(fe.message ?? "flow_error");
  }
}
