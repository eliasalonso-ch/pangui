/**
 * GET /api/suscripcion/status
 * Returns the workspace's subscription state plus computed billing preview.
 */
import { NextResponse } from "next/server";
import { adminSupabase, serverSupabase } from "../_helpers";
import { planByKey } from "@/lib/flow-plans";
import { expireTrialsIfNeeded } from "@/lib/trial-expiry";
import { cuotasOtsWorkspace, cuotaProcedimientos, cuotaActivos } from "@/lib/cuotas-mensuales";
import { flow } from "@/lib/flow";

export async function GET() {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) {
    return NextResponse.json({ workspace_id: null, subscription: null, customer: null });
  }

  // Lazy: if trial just expired, downgrade to basic_free before reading state.
  await expireTrialsIfNeeded(perfil.workspace_id);

  const admin = adminSupabase();
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, plan_key, price_per_user_clp, status, trial_end, current_period_end, canceled_at, flow_subscription_id, is_early_customer, custom_price_note")
    .eq("workspace_id", perfil.workspace_id)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: customerRow } = await admin
    .from("flow_customers")
    .select("flow_customer_id, has_card, card_last4, card_brand, email")
    .eq("workspace_id", perfil.workspace_id)
    .maybeSingle();

  let customer = customerRow;
  let flowPayMode: string | null = null;
  const shouldRefreshCard =
    customer?.flow_customer_id &&
    subscription?.flow_subscription_id &&
    (subscription.status === "active" || subscription.status === "past_due") &&
    (!customer.has_card || !customer.card_last4 || !customer.card_brand);

  if (shouldRefreshCard && customer) {
    try {
      const flowCustomer = await flow.getCustomer(customer.flow_customer_id as string);
      const cardBrand = flowCustomer.creditCardType ?? null;
      const cardLast4 = flowCustomer.last4CardDigits ?? null;
      flowPayMode = flowCustomer.pay_mode ?? null;
      const hasCard = Boolean(cardBrand || cardLast4);

      if (hasCard || flowPayMode === "manual") {
        const patch = {
          has_card: hasCard,
          card_brand: cardBrand,
          card_last4: cardLast4,
          updated_at: new Date().toISOString(),
        };
        await admin
          .from("flow_customers")
          .update(patch)
          .eq("workspace_id", perfil.workspace_id);
        customer = {
          flow_customer_id: customer.flow_customer_id,
          email: customer.email,
          ...patch,
        };
      }
    } catch (err) {
      console.warn("[suscripcion/status] no se pudo refrescar tarjeta Flow:", (err as Error).message);
    }
  }

  const { count: usersActivos } = await admin
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", perfil.workspace_id)
    .eq("activo", true);

  const activeUsers = usersActivos ?? 0;

  // Compute next charge for the UI
  let monthlyCost = 0;
  let effectivePlan = "basic";
  if (subscription) {
    effectivePlan = subscription.status === "trialing" ? "pro" : subscription.plan_key;
    if (subscription.status === "active" || subscription.status === "past_due") {
      monthlyCost = (subscription.price_per_user_clp ?? 0) * activeUsers;
    }
  }

  const plan = planByKey(effectivePlan);
  const planStatus = subscription?.status ?? null;

  // Quota usage (rolling 30d for OT sub-categories + total catalog counts)
  const [otsQuotas, procQuota, activosQuota] = await Promise.all([
    cuotasOtsWorkspace(perfil.workspace_id, subscription?.plan_key ?? null, planStatus),
    cuotaProcedimientos(perfil.workspace_id, subscription?.plan_key ?? null, planStatus),
    cuotaActivos(perfil.workspace_id, subscription?.plan_key ?? null, planStatus),
  ]);

  return NextResponse.json({
    rol:             perfil.rol,
    workspace_id:    perfil.workspace_id,
    subscription,
    customer: customer
      ? {
          has_card: customer.has_card,
          card_last4: customer.card_last4,
          card_brand: customer.card_brand,
          email: customer.email,
          pay_mode: flowPayMode,
        }
      : null,
    active_users:    activeUsers,
    monthly_cost:    monthlyCost,
    effective_plan:  effectivePlan,
    plan_limits:     plan.limits,
    plan_features:   plan.features,
    cuotas_uso: {
      ots_con_procedimientos: otsQuotas.con_procedimientos,
      ots_con_fotos:          otsQuotas.con_fotos,
      ots_repetitivas:        otsQuotas.repetitivas,
      procedimientos:         procQuota,
      activos:                activosQuota,
    },
  });
}
