/**
 * POST /api/suscripcion/card/remove
 *
 * Unregisters the workspace's card from Flow (/customer/unRegister) and clears
 * the card metadata locally. Owner-only.
 *
 * The Flow subscription itself is NOT canceled — it just loses its payment
 * method. The next scheduled charge will fail and the webhook will move the
 * subscription to past_due / unpaid. If the user wants to fully cancel they
 * should use /api/suscripcion/cancel instead.
 */
import { NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../../_helpers";
import { flow, FlowError } from "@/lib/flow";

export async function POST() {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const { workspaceId } = auth.ctx;

  const admin = adminSupabase();
  const { data: customer } = await admin
    .from("flow_customers")
    .select("flow_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!customer?.flow_customer_id) {
    return NextResponse.json({ error: "No hay tarjeta registrada." }, { status: 404 });
  }

  try {
    const flowCustomer = await flow.getCustomer(customer.flow_customer_id);
    if (flowCustomer.pay_mode === "manual" && !flowCustomer.creditCardType && !flowCustomer.last4CardDigits) {
      await admin.from("flow_customers").update({
        has_card:   false,
        card_brand: null,
        card_last4: null,
        updated_at: new Date().toISOString(),
      }).eq("workspace_id", workspaceId);

      return NextResponse.json(
        { error: "Este cliente está configurado con pago manual en Flow.cl; no hay una tarjeta automática para quitar." },
        { status: 409 }
      );
    }

    await flow.unregisterCard(customer.flow_customer_id);
  } catch (err) {
    const fe = err as FlowError;
    // If Flow reports "card not registered" treat it as success (idempotent).
    const msg = fe.message?.toLowerCase() ?? "";
    if (msg.includes("pay_mode is manual")) {
      await admin.from("flow_customers").update({
        has_card:   false,
        card_brand: null,
        card_last4: null,
        updated_at: new Date().toISOString(),
      }).eq("workspace_id", workspaceId);

      return NextResponse.json(
        { error: "Este cliente está configurado con pago manual en Flow.cl; no hay una tarjeta automática para quitar." },
        { status: 409 }
      );
    }
    if (!msg.includes("not registered") && !msg.includes("no encontrado")) {
      console.error("[suscripcion/card/remove]", fe);
      return NextResponse.json({ error: "No se pudo quitar la tarjeta en Flow.cl." }, { status: 502 });
    }
  }

  await admin.from("flow_customers").update({
    has_card:   false,
    card_brand: null,
    card_last4: null,
    updated_at: new Date().toISOString(),
  }).eq("workspace_id", workspaceId);

  return NextResponse.json({ ok: true });
}
