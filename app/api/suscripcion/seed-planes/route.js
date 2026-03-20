/**
 * GET /api/suscripcion/seed-planes
 * Llama SOLO UNA VEZ para crear los 3 planes en MercadoPago.
 * Guarda los IDs devueltos en .env.local:
 *   MP_PLAN_BASIC_ID=...
 *   MP_PLAN_PRO_ID=...
 *   MP_PLAN_EMPRESA_ID=...
 */
import { NextResponse } from "next/server";

const MP_API = "https://api.mercadopago.com";
const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

const PLANES = [
  {
    key: "BASIC",
    reason: "Pangui Basic",
    amount: 9990,
  },
  {
    key: "PRO",
    reason: "Pangui Pro",
    amount: 19990,
  },
  {
    key: "EMPRESA",
    reason: "Pangui Empresa",
    amount: 39990,
  },
];

async function crearPlan({ reason, amount }) {
  const res = await fetch(`${MP_API}/preapproval_plan`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        billing_day: 1,
        billing_day_proportional: true,
        free_trial: {
          frequency: 1,
          frequency_type: "months",
        },
        transaction_amount: amount,
        currency_id: "CLP",
      },
      payment_methods_allowed: {
        payment_types: [{ id: "credit_card" }, { id: "debit_card" }],
        payment_methods: [],
      },
      back_url: "https://pangui.cl/jefe/suscripcion",
    }),
  });

  const data = await res.json();
  return data;
}

export async function GET() {
  if (!TOKEN) {
    return NextResponse.json({ error: "MERCADOPAGO_ACCESS_TOKEN no configurado" }, { status: 500 });
  }

  const resultados = {};

  for (const plan of PLANES) {
    const data = await crearPlan(plan);
    resultados[plan.key] = {
      id: data.id,
      reason: data.reason,
      amount: data.auto_recurring?.transaction_amount,
      status: data.status,
      error: data.error,
      message: data.message,
      cause: data.cause,
      raw: data,
    };
  }

  const envLines = Object.entries(resultados)
    .map(([k, v]) => `MP_PLAN_${k}_ID=${v.id ?? "ERROR"}`)
    .join("\n");

  return NextResponse.json({
    instruccion: "Copia estas líneas a tu .env.local y reinicia el servidor:",
    env: envLines,
    planes: resultados,
  });
}
