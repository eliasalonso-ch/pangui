/**
 * POST /api/suscripcion/card/change
 *
 * Starts a new card-registration flow for the workspace's existing Flow customer.
 * Flow's /customer/register returns a hosted URL where the user enters card data;
 * once submitted, Flow replaces the previously-registered card automatically.
 *
 * Owner-only. Returns { url } — front-end navigates the user there.
 *
 * The url_return points to /api/suscripcion/card/change/callback to differentiate
 * from initial-signup card capture (which subscribes the user; we don't want to
 * re-subscribe here).
 */
import { NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../../_helpers";
import { flow, FlowError } from "@/lib/flow";

export async function POST() {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const { workspaceId } = auth.ctx;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL no configurado." }, { status: 500 });

  const admin = adminSupabase();
  const { data: customer } = await admin
    .from("flow_customers")
    .select("flow_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!customer?.flow_customer_id) {
    return NextResponse.json({ error: "No hay un cliente de pago para este workspace." }, { status: 404 });
  }

  try {
    const reg = await flow.registerCard({
      customerId: customer.flow_customer_id,
      url_return: `${appUrl}/api/suscripcion/card/change/callback`,
    });
    return NextResponse.json({ url: `${reg.url}?token=${reg.token}` });
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/card/change]", fe);
    return NextResponse.json({ error: fe.message ?? "Error iniciando cambio de tarjeta." }, { status: 502 });
  }
}
