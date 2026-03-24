/**
 * POST /api/suscripcion/webhook
 * MercadoPago envía notificaciones aquí cuando:
 *  - Una suscripción cambia de estado (authorized, paused, cancelled)
 *  - Un pago se procesa (exitoso o fallido)
 *
 * Configurar en MercadoPago Dashboard > Notificaciones:
 *   URL: https://TU_DOMINIO/api/suscripcion/webhook
 *   Tópicos: subscription_preapproval, payment
 *
 * En sandbox: usar ngrok o similar para exponer localhost.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MP_API = "https://api.mercadopago.com";
const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mapeo MP plan_id → nombre interno
const PLAN_MAP = {
  [process.env.MP_PLAN_BASIC_ID]: "basic",
  [process.env.MP_PLAN_PRO_ID]: "pro",
  [process.env.MP_PLAN_EMPRESA_ID]: "empresa",
};

async function fetchMP(path) {
  const res = await fetch(`${MP_API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return res.json();
}

export async function POST(req) {
  const body = await req.json();
  const { type, data } = body;

  // MercadoPago a veces envía topic en lugar de type
  const topic = type || body.topic;

  try {
    if (topic === "subscription_preapproval") {
      const sub = await fetchMP(`/preapproval/${data.id}`);
      const userId = sub.external_reference;
      const planNombre = PLAN_MAP[sub.preapproval_plan_id] ?? "pro";

      const mpStatus = sub.status; // authorized | paused | cancelled | pending

      let plan = "basic";
      let plan_status = "inactive";

      if (mpStatus === "authorized") {
        plan = planNombre;
        plan_status = "active";
      } else if (mpStatus === "paused") {
        plan = planNombre;
        plan_status = "paused";
      } else if (mpStatus === "cancelled") {
        plan = "basic";
        plan_status = "cancelled";
      }

      await adminClient
        .from("usuarios")
        .update({
          plan,
          plan_status,
          mp_subscription_id: sub.id,
        })
        .eq("id", userId);
    }

    if (topic === "payment") {
      const pago = await fetchMP(`/v1/payments/${data.id}`);

      // Solo nos interesan pagos de suscripción
      if (pago.payment_type_id !== "recurring_payment") {
        return NextResponse.json({ ok: true });
      }

      const userId = pago.external_reference;

      if (pago.status === "approved") {
        // Renovación exitosa — asegurar que el plan sigue activo
        await adminClient
          .from("usuarios")
          .update({ plan_status: "active" })
          .eq("id", userId);
      } else if (pago.status === "rejected") {
        // Pago rechazado — MP reintentará automáticamente; solo marcamos
        await adminClient
          .from("usuarios")
          .update({ plan_status: "payment_failed" })
          .eq("id", userId);
      }
    }
  } catch (err) {
    console.error("[webhook MP]", err);
    // Devolver 200 siempre para que MP no reintente infinitamente
  }

  return NextResponse.json({ ok: true });
}
