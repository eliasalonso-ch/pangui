/**
 * POST /api/suscripcion/webhook
 *
 * Flow posts here when a subscription invoice is processed (paid / failed) or when
 * a subscription state changes. The body contains only a `token`; we have to call
 * Flow back to learn what actually happened.
 *
 * Configure in Flow Dashboard → Comercio → Notificaciones:
 *   URL: https://<tunnel>/api/suscripcion/webhook
 *
 * Always returns 200 so Flow does not retry indefinitely (we log errors instead).
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "../_helpers";
import { flow } from "@/lib/flow";
import { flowPlanId, planByKey } from "@/lib/flow-plans";
import { claveIdempotencia, esDuplicado } from "@/lib/webhook-idempotencia";
import { registrarPeriodoFacturado } from "@/lib/dte/registrar-periodo";
import { estadoDesdeFlow } from "@/lib/flow-status";

export async function POST(req: Request) {
  try {
    const form  = await req.formData();
    const token = form.get("token")?.toString();
    if (!token) {
      console.warn("[flow webhook] missing token");
      return NextResponse.json({ ok: true });
    }

    // Flow webhooks come in two flavors with the same shape (token in form body):
    //   1. payment.* events  → token is a payment token; resolve via /payment/getStatus
    //   2. subscription.*    → token IS the subscriptionId; resolve via /subscription/get
    //
    // We try (1) first and fall back to (2). If both fail, ack with 200 so Flow
    // doesn't retry — webhooks are best-effort here (the callback already wrote
    // the canonical state to DB during register).
    let subscriptionId: string | null = null;
    try {
      const payment = await flow.getPaymentStatus(token);
      subscriptionId = payment.subscriptionId ?? payment.pending_info?.subscriptionId ?? null;
      // Los cobros por link de pago de una suscripción no traen subscriptionId:
      // viene embebido en commerceOrder como "sus_xxx_<invoiceId>_<fecha>".
      if (!subscriptionId && typeof payment.commerceOrder === "string") {
        const match = payment.commerceOrder.match(/^(sus_[A-Za-z0-9]+)/);
        if (match) subscriptionId = match[1];
      }
    } catch {
      // Not a payment token — try subscription
    }

    if (!subscriptionId) {
      // Maybe the token itself is the subscriptionId
      try {
        const probe = await flow.getSubscription(token);
        if (probe?.subscriptionId) subscriptionId = probe.subscriptionId;
      } catch (err) {
        console.warn("[flow webhook] could not resolve token to subscription:", (err as Error).message);
        return NextResponse.json({ ok: true });
      }
    }

    if (!subscriptionId) return NextResponse.json({ ok: true });

    const sub = await flow.getSubscription(subscriptionId).catch(() => null);
    if (!sub?.subscriptionId) return NextResponse.json({ ok: true });

    const admin = adminSupabase();

    // Ver lib/flow-status.ts: `morose = 2` es "pendiente de pago", no activa.
    const newStatus = estadoDesdeFlow({ status: sub.status, morose: sub.morose });

    const { data: existing } = await admin
      .from("subscriptions")
      .select("id, workspace_id, status, plan_key, is_early_customer, price_per_user_clp, scheduled_plan_key, scheduled_plan_at")
      .eq("flow_subscription_id", sub.subscriptionId)
      .maybeSingle();

    if (!existing) {
      // We received a webhook for an unknown subscription — log & ack.
      console.warn("[flow webhook] subscription not found locally:", sub.subscriptionId);
      return NextResponse.json({ ok: true });
    }

    // Candado de idempotencia. Se inserta el evento ANTES de aplicar efectos:
    // si Flow reentrega la misma notificación, el índice único rechaza la
    // inserción y salimos sin reprocesar. Sin esto, una entrega duplicada con
    // un cambio de plan agendado y vencido llamaba a changePlan dos veces.
    const clave = claveIdempotencia({
      subscriptionId:  sub.subscriptionId,
      status:          newStatus,
      periodStart:     sub.period_start ?? sub.subscription_start ?? null,
      nextInvoiceDate: sub.next_invoice_date ?? null,
    });

    const { error: eventoError } = await admin.from("subscription_events").insert({
      subscription_id: existing.id,
      workspace_id:    existing.workspace_id,
      event_type:      `subscription.${newStatus}`,
      flow_payload:    sub as unknown as Record<string, unknown>,
      idempotency_key: clave,
    });

    if (eventoError) {
      if (esDuplicado(eventoError)) {
        console.info("[flow webhook] evento duplicado, ya procesado:", clave);
        return NextResponse.json({ ok: true, duplicate: true });
      }
      // Un fallo real de base: no se aplican efectos sin dejar rastro del
      // evento, porque el reintento de Flow no encontraría el candado y
      // volvería a procesar todo.
      console.error("[flow webhook] no se pudo registrar el evento:", eventoError);
      return NextResponse.json({ ok: true });
    }

    const updates: Record<string, unknown> = {
      status:               newStatus,
      updated_at:           new Date().toISOString(),
    };
    if (sub.next_invoice_date) updates.current_period_end   = sub.next_invoice_date;
    // period_start es el inicio del período vigente; subscription_start es la
    // fecha de alta y no cambia nunca, así que solo sirve de respaldo.
    const periodStart = sub.period_start ?? sub.subscription_start;
    if (periodStart) updates.current_period_start = periodStart;
    if (newStatus === "canceled") updates.canceled_at = new Date().toISOString();

    // Bajada de plan agendada que ya venció: este webhook marca el inicio de un
    // período nuevo, así que es el momento de materializarla. Hasta aquí el
    // usuario conservó el plan caro que ya había pagado.
    const scheduledAt = existing.scheduled_plan_key && existing.scheduled_plan_at
      ? new Date(existing.scheduled_plan_at).getTime()
      : null;

    if (existing.scheduled_plan_key && scheduledAt !== null && scheduledAt <= Date.now() && newStatus !== "canceled") {
      const scheduledPlan = planByKey(existing.scheduled_plan_key);
      try {
        await flow.changePlan({
          subscriptionId: sub.subscriptionId,
          newPlanId:      flowPlanId(scheduledPlan.key),
        });
        updates.plan_key           = scheduledPlan.key;
        updates.flow_plan_id       = flowPlanId(scheduledPlan.key);
        updates.price_per_user_clp = existing.is_early_customer
          ? existing.price_per_user_clp
          : scheduledPlan.pricePerUser;
        updates.scheduled_plan_key = null;
        updates.scheduled_plan_at  = null;

        await admin.from("usuarios")
          .update({ plan: scheduledPlan.key, plan_status: "active" })
          .eq("workspace_id", existing.workspace_id);
      } catch (err) {
        // No se limpia lo agendado: se reintenta en el próximo webhook.
        console.error("[flow webhook] no se pudo aplicar el cambio de plan agendado:", err);
      }
    }

    await admin.from("subscriptions").update(updates).eq("id", existing.id);

    // El audit trail ya quedó escrito arriba, al tomar el candado de
    // idempotencia — no se inserta de nuevo acá.

    // Documento tributario del período recién pagado. Solo registra cuando el
    // período quedó efectivamente pagado (ver lib/dte/periodo-facturable.ts);
    // trial, impago y cancelación no generan factura. No lanza: si falla, el
    // período aparece en scripts/facturas-pendientes.sql.
    const precioPorUsuario = (updates.price_per_user_clp as number | undefined)
      ?? existing.price_per_user_clp;

    await registrarPeriodoFacturado(admin, {
      workspaceId:      existing.workspace_id,
      subscriptionId:   existing.id,
      precioPorUsuario,
      status:           newStatus,
      periodStart:      sub.period_start ?? sub.subscription_start ?? null,
      periodEnd:        sub.period_end ?? null,
      nextInvoiceDate:  sub.next_invoice_date ?? null,
    });

    // Mirror status onto usuarios (used by lib/planes.js for gating)
    const planStatus =
      newStatus === "active"   ? "active"   :
      newStatus === "trialing" ? "trial"    :
      newStatus === "canceled" ? "cancelled":
      "payment_failed";

    if (newStatus === "canceled") {
      // Suscripción terminada en Flow (impago tras los reintentos, o
      // cancelación voluntaria que llegó al fin del período). El workspace
      // baja a Basic gratis — igual que al expirar el trial. Sin esto,
      // usuarios.plan quedaba en "pro" y tieneAcceso() seguía regalando
      // funciones pagadas para siempre.
      await admin
        .from("usuarios")
        .update({ plan: "basic", plan_status: "active" })
        .eq("workspace_id", existing.workspace_id);
    } else {
      // Look up current plan_key to mirror plan as well
      const { data: subRow } = await admin
        .from("subscriptions")
        .select("plan_key")
        .eq("id", existing.id)
        .maybeSingle();
      const planMirror = subRow?.plan_key ?? "basic";

      await admin
        .from("usuarios")
        .update({ plan: planMirror, plan_status: planStatus })
        .eq("workspace_id", existing.workspace_id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[flow webhook] unexpected:", err);
    return NextResponse.json({ ok: true }); // always 200
  }
}

// Flow sends application/x-www-form-urlencoded; do not let Next.js default-cache.
export const dynamic = "force-dynamic";
