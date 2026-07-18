/**
 * POST /api/suscripcion/card/change
 *
 * Starts a Flow-hosted card-registration flow. If the workspace has not yet
 * become a Flow customer, this endpoint creates and persists that relationship
 * before redirecting to Flow. Pangui never receives card number or CVC data.
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
  const { workspaceId, userId, email } = auth.ctx;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL no configurado." }, { status: 500 });

  const admin = adminSupabase();
  const { data: customer } = await admin
    .from("flow_customers")
    .select("flow_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  try {
    let flowCustomerId = customer?.flow_customer_id as string | undefined;
    if (!flowCustomerId) {
      const [{ data: workspace }, { data: profile }, { data: billing }] = await Promise.all([
        admin.from("workspaces").select("nombre").eq("id", workspaceId).maybeSingle(),
        admin.from("usuarios").select("nombre").eq("id", userId).maybeSingle(),
        admin.from("billing_profiles").select("razon_social, billing_email").eq("workspace_id", workspaceId).maybeSingle(),
      ]);
      const customerName = billing?.razon_social || workspace?.nombre || profile?.nombre || email;
      const customerEmail = billing?.billing_email || email;
      try {
        const created = await flow.createCustomer({ name: customerName, email: customerEmail, externalId: workspaceId });
        flowCustomerId = created.customerId;
      } catch (error) {
        const flowError = error as FlowError;
        if ((flowError.message ?? "").toLowerCase().includes("externalid")) {
          return NextResponse.json({ error: "Ya existe un cliente Flow para este workspace, pero se perdió el vínculo local. Contacta a soporte para recuperarlo." }, { status: 409 });
        }
        throw error;
      }
      const { error: insertError } = await admin.from("flow_customers").insert({
        workspace_id: workspaceId,
        flow_customer_id: flowCustomerId,
        email: customerEmail,
        name: customerName,
        has_card: false,
      });
      if (insertError) throw insertError;
    }

    const reg = await flow.registerCard({
      customerId: flowCustomerId,
      url_return: `${appUrl}/api/suscripcion/card/change/callback`,
    });
    return NextResponse.json({ url: `${reg.url}?token=${reg.token}` });
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/card/change]", fe);
    return NextResponse.json({ error: fe.message ?? "Error iniciando cambio de tarjeta." }, { status: 502 });
  }
}
