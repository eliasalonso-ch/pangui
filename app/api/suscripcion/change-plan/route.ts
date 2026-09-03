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
import { cuponClienteFundador } from "@/lib/flow-cupon";
import { estadoDesdeFlow } from "@/lib/flow-status";

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
    .select("id, flow_subscription_id, plan_key, status, canceled_at, is_early_customer, price_per_user_clp, current_period_end")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

  if (!sub) return NextResponse.json({ error: "No hay suscripción." }, { status: 404 });

  // Cliente fundador cambiando de tier.
  //
  // El descuento vive en un cupón de Flow de MONTO FIJO, calculado contra el
  // plan con que se pactó (verificado 2026-09-03: cupón 6747 = $6.000 sobre
  // Pro $9.990 → $3.990). Ese monto no se recalcula por tier: el mismo cupón
  // sobre Esencial ($6.990) dejaría el primer usuario en $990, y sobre Basic
  // ($4.990) el cobro quedaría bajo el descuento. Cambiar de tier por la vía
  // automática cobraría un precio que nadie pactó, en cualquiera de las dos
  // direcciones.
  //
  // Se bloquea en vez de "arreglarlo" acá: el precio de un fundador es un
  // acuerdo comercial, y decidirlo en código sería inventar el trato. Requiere
  // emitir un cupón nuevo para el tier de destino y actualizar la fila a mano.
  if (sub.is_early_customer && sub.plan_key !== planKey) {
    return NextResponse.json({
      error: "Tu plan tiene un precio especial de cliente fundador acordado para este tier. " +
             "Escríbenos a contacto@getpangui.com y lo cambiamos conservando tu precio.",
    }, { status: 409 });
  }

  // "Sin cambios" solo si Flow ya cobra ese plan. Un workspace activo por
  // cortesía (sin mandato en Flow, p.ej. un cliente fundador dado de alta a
  // mano) tiene que poder contratar el mismo plan que ya usa.
  if (sub.plan_key === planKey && sub.status === "active" && !sub.canceled_at && sub.flow_subscription_id) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  // Reactivación tras cancelar, o alta sin mandato previo.
  //
  // Una suscripción cancelada al final del período sigue con status "active"
  // (el usuario conserva acceso), pero su mandato en Flow ya no cobra: hay que
  // crear uno nuevo, no cambiarle el plan al viejo. El filtro por status no
  // basta para detectarlo — hay que mirar canceled_at.
  //
  // Si ya hay tarjeta registrada se crea la suscripción directo, sin mandar al
  // usuario a Flow: la tarjeta sobrevive a la cancelación y volver a pedirla
  // sería un viaje redundante. Sin tarjeta sí se pasa por /register.
  if (sub.canceled_at || !sub.flow_subscription_id) {
    const { data: customer } = await admin
      .from("flow_customers")
      .select("flow_customer_id, has_card")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    // Sin cliente en Flow, o sin tarjeta inscrita, hay que pasar por
    // /register: crear la suscripción acá para alguien sin medio de pago deja
    // un cobro que nunca va a entrar y el workspace en past_due sin que la UI
    // explique por qué. /register redirige al formulario de tarjeta de Flow.
    //
    // La condición dependía de FLOW_CARGO_AUTOMATICO. Se quitó: la variable no
    // estaba definida en producción, así que exigeTarjeta era false y esta
    // rama creaba suscripciones sin medio de pago.
    if (!customer?.flow_customer_id || !customer.has_card) {
      return NextResponse.json({ error: "needs_card", redirect: "/suscripcion?action=upgrade" }, { status: 402 });
    }
    try {
      const esFundador = sub.is_early_customer === true && (sub.price_per_user_clp ?? 0) > 0;
      const created = await flow.createSubscription({
        planId:     newFlowPlanId,
        customerId: customer.flow_customer_id,
        ...cuponClienteFundador(esFundador, workspaceId),
      });
      const refreshed = await flow.getSubscription(created.subscriptionId).catch(() => created);
      // El estado lo dicta Flow, no un "active" optimista: si la tarjeta
      // rechaza el cobro, Flow responde morose distinto de 0 y el workspace no
      // puede quedar con acceso pagado. Ver lib/flow-status.ts.
      const estado = estadoDesdeFlow({ status: refreshed.status, morose: refreshed.morose });
      await admin.from("subscriptions").update({
        plan_key: planKey,
        flow_subscription_id: created.subscriptionId,
        flow_plan_id: newFlowPlanId,
        price_per_user_clp: esFundador ? sub.price_per_user_clp : plan.pricePerUser,
        status: estado,
        canceled_at: null,
        trial_end: null,
        // Una bajada agendada pertenece al mandato anterior: al crear uno nuevo
        // deja de aplicar.
        scheduled_plan_key: null,
        scheduled_plan_at: null,
        current_period_start: refreshed.period_start ?? null,
        current_period_end: refreshed.period_end ?? refreshed.next_invoice_date ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", sub.id);
      // Igual que en register/callback: el plan pagado solo se escribe si el
      // cobro entró, porque `tieneAcceso` decide por `plan` y no por el estado.
      if (estado === "active") {
        await admin.from("usuarios").update({ plan: planKey, plan_status: "active" }).eq("workspace_id", workspaceId);
      } else {
        await admin.from("usuarios").update({ plan_status: "payment_failed" }).eq("workspace_id", workspaceId);
      }
      await syncSubscriptionToUserCount(workspaceId);
      return NextResponse.json({ ok: true, plan_key: planKey, status: estado });
    } catch (err) {
      const fe = err as FlowError;
      console.error("[suscripcion/change-plan] create with saved card", fe);
      return NextResponse.json({ error: fe.message ?? "No se pudo activar el plan con la tarjeta guardada." }, { status: 502 });
    }
  }

  // Sin cargo automático no hay tarjeta que verificar: el cobro va por link de
  // pago que Flow emite contra la suscripción, no contra un medio guardado.
  // Cuando se contrate cargo automático (ver /register) vuelve a exigirse
  // has_card antes de permitir el cambio.

  // Bajada de plan → se agenda para el fin del período en curso.
  //
  // El usuario ya pagó el plan caro por este ciclo, así que lo conserva hasta
  // que termine; el plan barato (y su precio) empiezan en el ciclo siguiente.
  // Sin esto, cambiar Pro→Basic el día 1 daba funciones Pro por precio Basic.
  //
  // No se toca Flow todavía: la suscripción sigue cobrando el plan actual hasta
  // la renovación, que es exactamente lo que queremos. El cambio se materializa
  // cuando llega el webhook del período siguiente.
  const currentPlanPrice = planByKey(sub.plan_key).pricePerUser;
  const isDowngrade = plan.pricePerUser < currentPlanPrice;

  if (isDowngrade) {
    await admin.from("subscriptions").update({
      scheduled_plan_key: planKey,
      scheduled_plan_at:  sub.current_period_end,
      updated_at:         new Date().toISOString(),
    }).eq("id", sub.id);

    return NextResponse.json({
      ok: true,
      scheduled: true,
      plan_key: planKey,
      effective_at: sub.current_period_end,
    });
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
    // Un cambio de plan efectivo reactiva la suscripción: dejar canceled_at
    // haría que la UI siguiera mostrándola como cancelada para siempre.
    canceled_at:          null,
    // Subir de plan cancela una bajada pendiente: manda el cambio más reciente.
    scheduled_plan_key:   null,
    scheduled_plan_at:    null,
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
