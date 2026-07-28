/**
 * POST /api/suscripcion/register
 *
 * Body: { plan_key: "basic" | "esencial" | "pro" }
 *
 * Step 1 of the upgrade flow (used when leaving trial / Basic-free for a paid plan):
 *   1. Ensure a Flow customer exists for this workspace
 *   2. Call /customer/register → returns hosted URL for card capture
 *   3. Pass the chosen plan_key through Flow's url_return so the callback knows what to subscribe to
 *
 * Returns: { url } — front-end window.location.assign(url)
 */
import { NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";
import { flow, FlowError } from "@/lib/flow";
import { flowPlanId, planByKey, type PlanKey } from "@/lib/flow-plans";

export async function POST(req: Request) {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const { workspaceId, userId, email } = auth.ctx;

  const body = await req.json().catch(() => ({} as { plan_key?: string }));
  const planKey = body.plan_key as PlanKey | undefined;
  if (!planKey) return NextResponse.json({ error: "Falta plan_key." }, { status: 400 });

  let plan;
  try { plan = planByKey(planKey); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  if (!plan.selfServe) {
    return NextResponse.json({ error: "Enterprise requiere contactar a ventas." }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL no configurado." }, { status: 500 });

  const admin = adminSupabase();

  const { data: ws } = await admin
    .from("workspaces").select("nombre").eq("id", workspaceId).maybeSingle();
  const { data: perfil } = await admin
    .from("usuarios").select("nombre").eq("id", userId).maybeSingle();

  const customerName = ws?.nombre || perfil?.nombre || email;

  const { data: existing } = await admin
    .from("flow_customers")
    .select("flow_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let flowCustomerId = existing?.flow_customer_id;

  try {
    if (!flowCustomerId) {
      try {
        const customer = await flow.createCustomer({
          name:       customerName,
          email,
          externalId: workspaceId,
        });
        flowCustomerId = customer.customerId;
      } catch (err) {
        // Flow keeps customers permanently keyed by externalId. If a previous
        // run created one for this workspace_id and our local row was deleted,
        // Flow will reject createCustomer with code 501 + a message containing
        // "customer with this externalId". In that case we can't recover the
        // customerId from Flow's API (no get-by-externalId endpoint exists), so
        // we fail with a clear instruction. The DB row is the canonical link
        // between our workspace and the Flow customer — don't delete it manually.
        const fe = err as FlowError;
        const dup = (fe.message ?? "").toLowerCase().includes("externalid");
        if (dup) {
          console.error("[suscripcion/register] dup externalId without local row:", fe);
          return NextResponse.json({
            error: "Hay un cliente registrado en Flow para este workspace pero el vínculo local se perdió. Contacta a soporte.",
          }, { status: 409 });
        }
        throw err;
      }

      await admin.from("flow_customers").insert({
        workspace_id:     workspaceId,
        flow_customer_id: flowCustomerId,
        email,
        name:             customerName,
      });
    }

    // Cobro por link de pago mensual, no por cargo automático.
    //
    // El medio de pago "Cargo automático" (producto 148 de Flow) solo está
    // disponible para empresas con cuenta corriente a nombre de un RUT de
    // primera categoría. Pangui factura hoy como persona natural de segunda
    // categoría, así que /customer/register responde
    //   code 7001: "Commerce has not automatic charge contract"
    //
    // Flow soporta suscripciones igual en ese escenario: crea el ciclo y envía
    // un link de pago por email en cada renovación. Por eso acá se crea la
    // suscripción directamente en vez de inscribir una tarjeta.
    //
    // Si más adelante se contrata cargo automático, este bloque vuelve a
    // registerCard y el resto del flujo (callback, webhook) ya lo soporta.
    const created = await flow.createSubscription({
      planId:     flowPlanId(planKey),
      customerId: flowCustomerId,
    });

    const refreshed = await flow.getSubscription(created.subscriptionId).catch(() => created);

    // La suscripción queda pendiente hasta que el webhook confirme el pago del
    // primer link: nadie usa funciones pagadas antes de pagarlas.
    await admin.from("subscriptions").upsert({
      workspace_id:         workspaceId,
      plan_key:             planKey,
      flow_subscription_id: created.subscriptionId,
      flow_plan_id:         flowPlanId(planKey),
      price_per_user_clp:   plan.pricePerUser,
      status:               "past_due",
      canceled_at:          null,
      scheduled_plan_key:   null,
      scheduled_plan_at:    null,
      current_period_start: refreshed.period_start ?? null,
      current_period_end:   refreshed.period_end ?? refreshed.next_invoice_date ?? null,
      updated_at:           new Date().toISOString(),
    }, { onConflict: "workspace_id" });

    return NextResponse.json({
      ok: true,
      pending_payment: true,
      plan_key: planKey,
      email,
    });
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/register]", fe);
    return NextResponse.json(
      { error: fe.message ?? "Error creando la suscripción en Flow." },
      { status: 502 }
    );
  }
}
