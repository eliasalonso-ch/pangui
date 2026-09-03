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
import { syncSubscriptionToUserCount, usuariosExtra, asociarUsuariosExtra, manana } from "@/lib/flow-sync";
import { montoParaFlow } from "@/lib/tributario";
import { estadoDesdeFlow } from "@/lib/flow-status";
import { registrarPeriodoFacturado } from "@/lib/dte/registrar-periodo";
import { cuponClienteFundador, precioEfectivo } from "@/lib/flow-cupon";

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
      .select("id, status, flow_subscription_id, plan_key, canceled_at, is_early_customer, price_per_user_clp")
      .eq("workspace_id", workspaceId)
      .neq("status", "canceled")
      .maybeSingle();

    // Un cliente fundador conserva su precio negociado. Este callback es el
    // camino real con cargo automático, y escribía el precio de catálogo
    // (y no adjuntaba el cupón), dejando al fundador a precio de lista.
    const { esFundador, precio } = precioEfectivo(existingSub, plan.pricePerUser);

    // Una suscripción cancelada al fin del período sigue "active" localmente
    // pero su mandato en Flow ya no cobra: hay que crear uno nuevo, no
    // cambiarle el plan al viejo (ver change-plan).
    let flowSubId = existingSub?.canceled_at ? null : (existingSub?.flow_subscription_id ?? null);

    if (flowSubId) {
      // Already had a Flow subscription (rare — re-registering card). Just change plan.
      try {
        await flow.changePlan({ subscriptionId: flowSubId, newPlanId: flowPlan });
      } catch (err) {
        console.error("[register/callback] changePlan failed, will create fresh:", err);
        flowSubId = null;
      }
    }

    // Usuarios extra que hay que reflejar en el cobro. Se cuentan ANTES de
    // crear la suscripción porque determinan cómo se crea (ver abajo).
    const extras = await usuariosExtra(admin, workspaceId);

    if (!flowSubId) {
      // El primer cobro tiene que incluir a los usuarios extra, y Flow emite
      // la factura en el mismo instante en que se crea la suscripción: los
      // ítems agregados después solo alcanzan al ciclo siguiente. Verificado
      // en sandbox — una suscripción creada hoy factura $9.990 y sigue en
      // $9.990 aunque después se le asocie un ítem con quantity 9.
      //
      // Por eso, cuando hay usuarios extra, la suscripción se crea con
      // `subscription_start` mañana: nace sin factura (status 0, invoices
      // vacío), se le asocian los ítems, y Flow factura el total correcto al
      // arrancar el período. El costo es que el primer cobro entra un día
      // después; a cambio, nunca se cobra de menos.
      //
      // Con un solo usuario cobrable no hay ítems que esperar, así que se
      // crea de inmediato y el cobro es al instante.
      const inicioDiferido = extras > 0 ? manana() : undefined;

      const created = await flow.createSubscription({
        planId:     flowPlan,
        customerId: reg.customerId,
        // No trial — they already finished theirs (or skipped it).
        ...(inicioDiferido ? { subscription_start: inicioDiferido } : {}),
        ...cuponClienteFundador(esFundador, workspaceId),
      });
      flowSubId = created.subscriptionId;

      // Los ítems van antes de que Flow emita la primera factura. Si esto
      // falla, el cobro saldría corto: se registra y el barrido de
      // /api/suscripcion/reconciliar lo corrige antes del ciclo siguiente.
      if (extras > 0) {
        await asociarUsuariosExtra(flowSubId, extras, montoParaFlow(precio))
          .catch(err => console.error("[register/callback] no se pudieron asociar los usuarios extra:", err));
      }
    }

    // Fetch the canonical subscription detail so we can persist period dates.
    // The /create response sometimes omits period_end; /get always has it.
    const flowSub = await flow.getSubscription(flowSubId).catch(() => null);

    // El estado sale de lo que Flow reporta, no de un "active" fijo: con cargo
    // automático el cobro es inmediato, pero si la tarjeta lo rechaza Flow
    // devuelve morose distinto de 0 y el workspace no debe quedar con acceso
    // pagado. Ver lib/flow-status.ts.
    //
    // Excepción: una suscripción con inicio diferido (la que se crea cuando
    // hay usuarios extra) reporta status 0 hasta que arranca su período, y
    // `estadoDesdeFlow` lo traduce a "unpaid" — que la UI pinta en rojo como
    // "Sin pagar". No es impago: es un cobro agendado para mañana. Se trata
    // como past_due, que es el estado de "esperando el primer cobro" y ya
    // tiene su propio aviso en la pantalla.
    const flowEstado = flowSub
      ? estadoDesdeFlow({ status: flowSub.status, morose: flowSub.morose })
      : "past_due";
    const estado = flowEstado === "unpaid" && extras > 0 ? "past_due" : flowEstado;

    const subUpdate: Record<string, unknown> = {
      plan_key:             planKey,
      flow_subscription_id: flowSubId,
      flow_plan_id:         flowPlan,
      price_per_user_clp:   precio,
      status:               estado,
      trial_end:            null,
      // Volver a contratar reactiva: sin esto la UI seguía mostrando la
      // suscripción como cancelada, y una bajada agendada del mandato
      // anterior se aplicaría sobre el nuevo.
      canceled_at:          null,
      scheduled_plan_key:   null,
      scheduled_plan_at:    null,
      // Con inicio diferido `period_start` viene null hasta que el período
      // arranca; `subscription_start` sí trae la fecha, y es la que la UI
      // necesita para decir cuándo entra el primer cobro.
      current_period_start: flowSub?.period_start ?? flowSub?.subscription_start ?? null,
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
    //
    // El plan solo se escribe si el cobro entró. `tieneAcceso` decide por
    // `plan` y prácticamente ignora `plan_status`, así que escribir el plan
    // pagado con la tarjeta rechazada regalaba las funciones del tier: el
    // cliente quedaba en Pro con plan_status "payment_failed" y acceso
    // completo. Si el cobro no entró, se conserva el plan que ya tenían.
    if (estado === "active") {
      await admin.from("usuarios").update({
        plan:        planKey,
        plan_status: "active",
      }).eq("workspace_id", workspaceId);
    } else {
      await admin.from("usuarios").update({
        plan_status: "payment_failed",
      }).eq("workspace_id", workspaceId);
    }

    // 6. Reconcile subscription items with current user count
    await syncSubscriptionToUserCount(workspaceId);

    // 7. Documento tributario del primer período.
    //
    // Con cargo automático el cobro ocurre acá mismo, así que este callback es
    // el primer momento en que el período está pagado. Sin esto el documento
    // dependía de que llegara el webhook, y si Flow no notifica (o notifica
    // tarde) el período quedaba cobrado y sin factura.
    //
    // Es idempotente: si el webhook llega después, el índice único por período
    // impide el duplicado y registrarPeriodoFacturado lo trata como caso
    // normal. Tampoco lanza — un fallo acá no debe dejar al cliente sin el
    // acceso que ya pagó.
    const { data: subRow } = await admin
      .from("subscriptions")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("flow_subscription_id", flowSubId)
      .maybeSingle();

    if (subRow?.id) {
      await registrarPeriodoFacturado(admin, {
        workspaceId,
        subscriptionId:   subRow.id,
        precioPorUsuario: precio,
        status:           estado,
        periodStart:      flowSub?.period_start ?? null,
        periodEnd:        flowSub?.period_end ?? null,
        nextInvoiceDate:  flowSub?.next_invoice_date ?? null,
      });
    }

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
