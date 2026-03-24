/**
 * POST /api/suscripcion/verify
 * Called when user returns from MP checkout with ?preapproval_id=...
 * Fetches the subscription from MP and updates Supabase
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const MP_API = "https://api.mercadopago.com";
const TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

const PLAN_MAP = {
  [process.env.MP_PLAN_BASIC_ID]:   "basic",
  [process.env.MP_PLAN_PRO_ID]:     "pro",
  [process.env.MP_PLAN_EMPRESA_ID]: "empresa",
};

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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

  const { preapproval_id } = await req.json();
  if (!preapproval_id) return NextResponse.json({ error: "Falta preapproval_id" }, { status: 400 });

  const res = await fetch(`${MP_API}/preapproval/${preapproval_id}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const sub = await res.json();

  if (!sub.id) return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });

  const planNombre = PLAN_MAP[sub.preapproval_plan_id] ?? "basic";
  const isActive = sub.status === "authorized";

  if (isActive) {
    await admin.from("usuarios").update({
      plan: planNombre,
      plan_status: "active",
      mp_subscription_id: sub.id,
    }).eq("id", user.id);
  }

  return NextResponse.json({ ok: true, plan: planNombre, status: sub.status, active: isActive });
}
