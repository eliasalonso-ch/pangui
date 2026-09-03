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
import { urlDeRedireccion, urlPublica } from "@/lib/flow-redirect";

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

  // Ver lib/flow-redirect.ts: cae al origen de la petición si la variable no
  // llegó al build, en vez de dejar la contratación muerta.
  const appUrl = urlPublica(req);

  const admin = adminSupabase();

  const { data: ws } = await admin
    .from("workspaces").select("nombre").eq("id", workspaceId).maybeSingle();
  const { data: perfil } = await admin
    .from("usuarios").select("nombre").eq("id", userId).maybeSingle();

  // Flow manda TODO a este correo: comprobantes, avisos de cargo automático y
  // links de pago. Debe ser el email de cobros del workspace, no el de la
  // cuenta que está contratando — quien administra puede no ser quien recibe
  // la facturación, y la app le promete al cliente que los documentos llegan
  // al email de cobros (ver el resumen legal en /configuracion/suscripcion).
  const { data: billing } = await admin
    .from("billing_profiles")
    .select("billing_email, razon_social")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const billingEmail = billing?.billing_email?.trim() || email;

  // La razón social es lo que el cliente declaró como receptor de la factura,
  // así que identifica mejor al cliente en el panel de Flow que el nombre del
  // workspace.
  const customerName = billing?.razon_social || ws?.nombre || perfil?.nombre || billingEmail;

  const { data: existing } = await admin
    .from("flow_customers")
    .select("flow_customer_id, email")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  let flowCustomerId = existing?.flow_customer_id;

  try {
    if (!flowCustomerId) {
      try {
        const customer = await flow.createCustomer({
          name:       customerName,
          email:      billingEmail,
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
        email:            billingEmail,
        name:             customerName,
      });
    } else if (existing?.email && existing.email !== billingEmail) {
      // El cliente ya existía en Flow con otro correo. Sin esto, cambiar el
      // email de cobros no tenía efecto: Flow seguía mandando comprobantes y
      // avisos de cargo al correo con que se creó el cliente.
      try {
        await flow.editCustomer({
          customerId: flowCustomerId,
          email:      billingEmail,
          name:       customerName,
        });
        await admin.from("flow_customers")
          .update({ email: billingEmail, name: customerName, updated_at: new Date().toISOString() })
          .eq("workspace_id", workspaceId);
      } catch (err) {
        // No bloquea la contratación: el cobro funciona igual, solo que los
        // correos siguen yendo al destinatario anterior hasta que se resuelva.
        console.error("[suscripcion/register] no se pudo actualizar el email del cliente en Flow:", err);
      }
    }

    // ── Inscripción de tarjeta (cargo automático) ──────────────────────────
    //
    // Contratar siempre pasa por el formulario de tarjeta de Flow. El resto
    // del flujo vive en /register/callback: crea la suscripción, aplica el
    // cupón, agrega los ítems de usuarios extra y cobra.
    //
    // Esto estuvo detrás de un flag (FLOW_CARGO_AUTOMATICO) mientras Pangui
    // facturaba como persona natural y Flow respondía 7001 "Commerce has not
    // automatic charge contract"; el camino alternativo era un link de pago
    // mensual por email. El flag se eliminó porque su ausencia en el entorno
    // era indistinguible de apagarlo a propósito: en producción no estaba
    // definido, el bloque se saltaba en silencio y cada intento de contratar
    // creaba una suscripción por link de pago sin llevar al usuario a Flow —
    // el botón parecía "activar el plan" y dejaba un cobro que nadie iba a
    // pagar. Con el contrato ya habilitado, el link de pago no es un respaldo
    // sino un modo que nadie quiere.
    const urlReturn = `${appUrl}/api/suscripcion/register/callback?plan_key=${encodeURIComponent(planKey)}`;
    try {
      const registro = await flow.registerCard({
        customerId: flowCustomerId,
        url_return: urlReturn,
      });
      // Flow devuelve `url` y `token` POR SEPARADO y hay que concatenarlos;
      // ver lib/flow-redirect.ts.
      return NextResponse.json({
        url: urlDeRedireccion(registro, "inscribir la tarjeta"),
      });
    } catch (err) {
      const fe = err as FlowError;
      // 7001 = el comercio no tiene contrato de cargo automático. Es
      // configuración de Flow, no del código: se avisa fuerte y se falla, en
      // vez de dejar una suscripción impaga en Flow.
      const sinContrato = (fe.message ?? "").toLowerCase().includes("automatic charge");
      console.error(
        sinContrato
          ? "[suscripcion/register] Flow no tiene habilitado el cargo automático (7001). Revisa el producto 148 en el panel de Flow."
          : "[suscripcion/register] registerCard falló:",
        fe,
      );
      return NextResponse.json({
        error: sinContrato
          ? "Flow.cl no tiene habilitado el cargo automático para este comercio. Escríbenos a contacto@getpangui.com."
          : "No pudimos abrir el formulario de tarjeta de Flow.cl. Intenta de nuevo en unos minutos.",
      }, { status: 502 });
    }

  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/register]", fe);
    return NextResponse.json(
      { error: fe.message ?? "Error creando la suscripción en Flow." },
      { status: 502 }
    );
  }
}
