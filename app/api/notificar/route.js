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

export async function POST(req) {
  const { usuario_id, workspace_id_todos_tecnicos, workspace_id_jefe, titulo, mensaje, url, urgente } =
    await req.json();

  // Collect target user IDs
  let userIds = [];

  if (usuario_id) {
    userIds = [usuario_id];
  } else if (workspace_id_todos_tecnicos) {
    const { data } = await adminClient
      .from("usuarios")
      .select("id")
      .eq("workspace_id", workspace_id_todos_tecnicos)
      .eq("rol", "tecnico");
    userIds = (data ?? []).map((u) => u.id);
  } else if (workspace_id_jefe) {
    const { data } = await adminClient
      .from("usuarios")
      .select("id")
      .eq("workspace_id", workspace_id_jefe)
      .eq("rol", "jefe");
    userIds = (data ?? []).map((u) => u.id);
  }

  if (!userIds.length) {
    return NextResponse.json({ ok: true, enviados: 0 });
  }

  // Always create in-app notifications — regardless of push subscriptions
  // This ensures the bell works even if the user never accepted push permissions
  await adminClient.from("notifications").insert(
    userIds.map((uid) => ({
      usuario_id: uid,
      titulo,
      mensaje,
      url: url || "/",
      tipo: urgente ? "emergencia" : "orden",
    }))
  );

  // Then try push notifications (Android/desktop) — best effort
  const { data: subs } = await adminClient
    .from("push_subscriptions")
    .select("subscription")
    .in("usuario_id", userIds);

  if (!subs?.length) {
    return NextResponse.json({ ok: true, enviados: 0 });
  }

  const payload = JSON.stringify({ titulo, mensaje, url, urgente, tag: url });

  const results = await Promise.allSettled(
    subs.map((row) => webpush.sendNotification(row.subscription, payload))
  );

  const enviados = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ ok: true, enviados });
}
