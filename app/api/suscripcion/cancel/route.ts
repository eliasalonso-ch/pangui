/**
 * POST /api/suscripcion/cancel
 * Body: { at_period_end?: boolean }  (default true — cancels at period end, keeps access)
 */
import { NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";
import { flow, FlowError } from "@/lib/flow";

export async function POST(req: Request) {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const { workspaceId } = auth.ctx;

  const body = await req.json().catch(() => ({} as { at_period_end?: boolean }));
  const atPeriodEnd = body.at_period_end !== false; // default true

  const admin = adminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, flow_subscription_id, status")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

  if (!sub?.flow_subscription_id) {
    return NextResponse.json({ error: "No hay suscripción activa." }, { status: 404 });
  }

  try {
    await flow.cancelSubscription({
      subscriptionId: sub.flow_subscription_id,
      at_period_end:  atPeriodEnd ? 1 : 0,
    });
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/cancel]", fe);
    return NextResponse.json({ error: fe.message ?? "Error al cancelar." }, { status: 502 });
  }

  // We mark canceled_at locally; final status flip happens via webhook when Flow stops charging.
  await admin
    .from("subscriptions")
    .update({
      canceled_at: new Date().toISOString(),
      status:      atPeriodEnd ? sub.status : "canceled",
      updated_at:  new Date().toISOString(),
    })
    .eq("id", sub.id);

  return NextResponse.json({ ok: true });
}
