/**
 * POST /api/suscripcion/initiate
 * Creates a pending preapproval with external_reference = user_id
 * Returns { init_point } — redirect the user there to pay
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const MP_API = "https://api.mercadopago.com";
const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

const PLAN_IDS = {
  basic:   process.env.MP_PLAN_BASIC_ID,
  pro:     process.env.MP_PLAN_PRO_ID,
  empresa: process.env.MP_PLAN_EMPRESA_ID,
};

const PLAN_NAMES = {
  basic:   "Pangui Basic",
  pro:     "Pangui Pro",
  empresa: "Pangui Empresa",
};

export async function POST(req) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { plan } = await req.json();
  const preapproval_plan_id = PLAN_IDS[plan];
  if (!preapproval_plan_id) return NextResponse.json({ error: "Plan inválido" }, { status: 400 });

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      preapproval_plan_id,
      reason: PLAN_NAMES[plan],
      external_reference: user.id,       // ← links webhook back to this user
      payer_email: user.email,
      back_url: `${process.env.NEXT_PUBLIC_APP_URL}/configuracion/suscripcion`,
      status: "pending",
    }),
  });

  const data = await res.json();
  if (!data.init_point) {
    console.error("[MP initiate error]", data);
    return NextResponse.json({ error: data.message ?? "Error creando suscripción" }, { status: 502 });
  }

  return NextResponse.json({ init_point: data.init_point });
}
