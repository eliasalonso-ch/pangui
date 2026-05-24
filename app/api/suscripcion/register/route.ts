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
import { planByKey, type PlanKey } from "@/lib/flow-plans";

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

    const urlReturn = `${appUrl}/api/suscripcion/register/callback?plan_key=${encodeURIComponent(planKey)}`;
    const reg = await flow.registerCard({
      customerId: flowCustomerId,
      url_return: urlReturn,
    });

    return NextResponse.json({ url: `${reg.url}?token=${reg.token}` });
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/register]", fe);
    return NextResponse.json(
      { error: fe.message ?? "Error registrando tarjeta en Flow." },
      { status: 502 }
    );
  }
}
