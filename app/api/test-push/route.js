import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { NextResponse } from "next/server";

webpush.setVapidDetails(
  "mailto:admin@pangui.cl",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/test-push   body: { usuario_id: "uuid" }
export async function POST(req) {
  const { usuario_id } = await req.json();
  if (!usuario_id) {
    return NextResponse.json({ error: "usuario_id required" }, { status: 400 });
  }

  const { data: row, error } = await adminClient
    .from("push_subscriptions")
    .select("subscription, device_info")
    .eq("usuario_id", usuario_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "No subscription found for this user" }, { status: 404 });
  }

  const payload = JSON.stringify({
    titulo: "Prueba Pangui 🔔",
    mensaje: "Las notificaciones funcionan correctamente.",
    url: "/",
    tag: "test",
  });

  try {
    await webpush.sendNotification(row.subscription, payload);
    return NextResponse.json({ ok: true, device_info: row.device_info });
  } catch (err) {
    return NextResponse.json({ error: err.message, statusCode: err.statusCode }, { status: 500 });
  }
}
