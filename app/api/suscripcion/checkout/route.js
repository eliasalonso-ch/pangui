/**
 * POST /api/suscripcion/checkout
 * Body: { plan, payer_email, card_token_id, user_id }
 * Creates a subscription with associated plan (requires card_token_id).
 * Returns: { ok: true, subscription_id } or { error }
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MP_API = "https://api.mercadopago.com";
const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

const PLAN_IDS = {
  pro: process.env.MP_PLAN_BASIC_ID, // Pro = $9.990/mes
};

const PLAN_AMOUNTS = {
  pro: 9990,
};

const PLAN_NAMES = {
  pro: "Pangui Pro",
};

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const { plan, payer_email, card_token_id, user_id } = await req.json();

  if (!plan || !payer_email || !card_token_id || !user_id) {
    return NextResponse.json({ error: "Faltan parámetros (plan, payer_email, card_token_id, user_id)" }, { status: 400 });
  }

  const preapproval_plan_id = PLAN_IDS[plan];
  if (!preapproval_plan_id) {
    return NextResponse.json({
      error: `Plan "${plan}" no configurado. Ejecuta GET /api/suscripcion/seed-planes primero.`,
    }, { status: 400 });
  }

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      preapproval_plan_id,
      reason: PLAN_NAMES[plan],
      external_reference: user_id,
      payer_email,
      card_token_id,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: PLAN_AMOUNTS[plan],
        currency_id: "CLP",
      },
      back_url: `${process.env.NEXT_PUBLIC_APP_URL}/configuracion/suscripcion`,
      status: "authorized",
    }),
  });

  const data = await res.json();

  if (data.status !== "authorized" || !data.id) {
    console.error("[MP checkout error]", data);
    return NextResponse.json({
      error: data.message ?? "MercadoPago rechazó la suscripción.",
      mp: data,
    }, { status: 502 });
  }

  // Actualizar Supabase: plan activo con mes de prueba gratuito
  await adminClient
    .from("usuarios")
    .update({
      plan,
      plan_status: "active",
      mp_subscription_id: data.id,
    })
    .eq("id", user_id);

  return NextResponse.json({ ok: true, subscription_id: data.id });
}
