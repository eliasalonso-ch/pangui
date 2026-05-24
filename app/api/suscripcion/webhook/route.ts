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

    // Flow subscription status: 0 inactive, 1 active, 2 trial, 4 canceled.
    // Morose lives in a separate field: 1 = overdue, 2 = pending but not overdue.
    const statusMap: Record<number, "trialing" | "active" | "canceled" | "unpaid" | "past_due"> = {
      0: "unpaid",
      1: sub.morose === 1 ? "past_due" : "active",
      2: "trialing",
      4: "canceled",
    };
    const newStatus = statusMap[sub.status] ?? "active";

    const { data: existing } = await admin
      .from("subscriptions")
      .select("id, workspace_id, status")
      .eq("flow_subscription_id", sub.subscriptionId)
      .maybeSingle();

    if (!existing) {
      // We received a webhook for an unknown subscription — log & ack.
      console.warn("[flow webhook] subscription not found locally:", sub.subscriptionId);
      return NextResponse.json({ ok: true });
    }

    const updates: Record<string, unknown> = {
      status:               newStatus,
      updated_at:           new Date().toISOString(),
    };
    if (sub.next_invoice_date) updates.current_period_end   = sub.next_invoice_date;
    if (sub.subscription_start) updates.current_period_start = sub.subscription_start;
    if (newStatus === "canceled") updates.canceled_at = new Date().toISOString();

    await admin.from("subscriptions").update(updates).eq("id", existing.id);

    // Audit trail
    await admin.from("subscription_events").insert({
      subscription_id: existing.id,
      workspace_id:    existing.workspace_id,
      event_type:      `subscription.${newStatus}`,
      flow_payload:    sub as unknown as Record<string, unknown>,
    });

    // Mirror status onto usuarios (used by lib/planes.js for gating)
    const planStatus =
      newStatus === "active"   ? "active"   :
      newStatus === "trialing" ? "trial"    :
      newStatus === "canceled" ? "cancelled":
      "payment_failed";

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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[flow webhook] unexpected:", err);
    return NextResponse.json({ ok: true }); // always 200
  }
}

// Flow sends application/x-www-form-urlencoded; do not let Next.js default-cache.
export const dynamic = "force-dynamic";
