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
import { flowPlanId, planByKey, type PlanKey } from "@/lib/flow-plans";
import { urlDeRedireccion } from "@/lib/flow-redirect";
import { cuponClienteFundador, precioEfectivo } from "@/lib/flow-cupon";

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

  // Clientes fundadores: precio especial vitalicio. `change-plan` ya respeta
  // `price_per_user_clp` cuando `is_early_customer`, pero acá se estaba
  // pisando con el precio de catálogo, así que suscribirse volvía a dejar la
  // fila en el precio de lista.
  const { data: prevSub } = await admin
    .from("subscriptions")
    .select("is_early_customer, price_per_user_clp")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { esFundador: isEarly, precio: effectivePrice } = precioEfectivo(prevSub, plan.pricePerUser);

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

    // ── Cargo automático vs. link de pago mensual ──────────────────────────
    //
    // El medio de pago "Cargo automático" (producto 148 de Flow) exige una
    // cuenta a nombre de un RUT de primera categoría. Mientras Pangui facturó
    // como persona natural de segunda categoría eso no se cumplía y
    // /customer/register respondía
    //   code 7001: "Commerce has not automatic charge contract"
    // así que el cobro se hacía por link de pago mensual: Flow crea el ciclo y
    // envía un link por email en cada renovación.
    //
    // Con la SpA constituida el requisito se cumple, pero el contrato de cargo
    // automático se habilita del lado de Flow, no del código. El flag permite
    // activarlo cuando Flow confirme y volver atrás sin desplegar si responde
    // 7001. Con el flag apagado el comportamiento es exactamente el anterior.
    if (process.env.FLOW_CARGO_AUTOMATICO === "true") {
      const urlReturn = `${appUrl}/api/suscripcion/register/callback?plan_key=${encodeURIComponent(planKey)}`;
      try {
        const registro = await flow.registerCard({
          customerId: flowCustomerId,
          url_return: urlReturn,
        });
        // Flow devuelve `url` y `token` POR SEPARADO y hay que concatenarlos;
        // ver lib/flow-redirect.ts. El resto del flujo (callback →
        // createSubscription → webhook) ya existe y está probado.
        return NextResponse.json({
          url: urlDeRedireccion(registro, "inscribir la tarjeta"),
          pending_payment: false,
        });
      } catch (err) {
        const fe = err as FlowError;
        // 7001 = el comercio no tiene contrato de cargo automático. Es un
        // problema de configuración en Flow, no del código: se avisa fuerte y
        // se cae al flujo de link de pago para no dejar al cliente sin
        // contratar.
        const sinContrato = (fe.message ?? "").toLowerCase().includes("automatic charge");
        console.error(
          sinContrato
            ? "[suscripcion/register] FLOW_CARGO_AUTOMATICO=true pero Flow no tiene el contrato habilitado (7001). Revisa el producto 148 en el panel de Flow."
            : "[suscripcion/register] registerCard falló, se cae a link de pago:",
          fe,
        );
      }
    }

    // El plan de Flow cobra el precio de lista por el usuario #1; los usuarios
    // extra se agregan como items al precio real (ver lib/flow-sync.ts). Para
    // un cliente fundador eso dejaría el primer usuario a precio de lista, así
    // que se adjunta un cupón de Flow que cubre la diferencia.
    //
    // El cupón se aplica solo si la suscripción ya está marcada
    // `is_early_customer` en la base: no hay workspaces hardcodeados, y un
    // cliente nuevo no puede recibirlo sin que alguien marque esa fila a mano.
    const created = await flow.createSubscription({
      planId:     flowPlanId(planKey),
      customerId: flowCustomerId,
      ...cuponClienteFundador(isEarly, workspaceId),
    });

    const refreshed = await flow.getSubscription(created.subscriptionId).catch(() => created);

    // La suscripción queda pendiente hasta que el webhook confirme el pago del
    // primer link: nadie usa funciones pagadas antes de pagarlas.
    const { error: upsertError } = await admin.from("subscriptions").upsert({
      workspace_id:         workspaceId,
      plan_key:             planKey,
      flow_subscription_id: created.subscriptionId,
      flow_plan_id:         flowPlanId(planKey),
      price_per_user_clp:   effectivePrice,
      is_early_customer:    isEarly,
      status:               "past_due",
      canceled_at:          null,
      scheduled_plan_key:   null,
      scheduled_plan_at:    null,
      current_period_start: refreshed.period_start ?? null,
      current_period_end:   refreshed.period_end ?? refreshed.next_invoice_date ?? null,
      updated_at:           new Date().toISOString(),
    }, { onConflict: "workspace_id" });

    // Si esto falla, la suscripción existe en Flow pero la base local no tiene
    // el flow_subscription_id — el webhook posterior no encuentra la fila y el
    // pago queda huérfano. Mejor fallar fuerte y que el usuario reintente.
    if (upsertError) {
      console.error("[suscripcion/register] upsert falló tras crear la suscripción en Flow:", upsertError, {
        workspaceId,
        subscriptionId: created.subscriptionId,
      });
      return NextResponse.json({
        error: "La suscripción se creó en Flow pero no se pudo registrar localmente. Contacta a soporte antes de reintentar.",
      }, { status: 500 });
    }

    // `email` es el de cobros: es el que Flow usa y el que el banner de
    // "esperando el pago" le muestra al usuario. Devolver el de la sesión
    // hacía que la UI dijera un correo distinto del que recibía el link.
    return NextResponse.json({
      ok: true,
      pending_payment: true,
      plan_key: planKey,
      email: billingEmail,
    });
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/register]", fe);
    return NextResponse.json(
      { error: fe.message ?? "Error creando la suscripción en Flow." },
      { status: 502 }
    );
  }
}
