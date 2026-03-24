// supabase/functions/notificar/index.ts
// Deno Edge Function — replaces /api/notificar Next.js route.
// Runs on Supabase infrastructure, same region as the DB.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC     = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE    = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT    = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@pangui.cl";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Verify caller JWT (user or service role)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autenticado" }, 401);

  // Allow service-role key to bypass JWT check
  if (token !== SERVICE_ROLE_KEY) {
    const { error } = await admin.auth.getUser(token);
    if (error) return json({ error: "Token inválido" }, 401);
  }

  const {
    usuario_id,
    workspace_id_todos_tecnicos,
    workspace_id_jefe,
    titulo,
    mensaje,
    url,
    urgente,
  } = await req.json();

  // Collect target user IDs
  let userIds: string[] = [];

  if (usuario_id) {
    userIds = [usuario_id];
  } else if (workspace_id_todos_tecnicos) {
    const { data } = await admin
      .from("usuarios")
      .select("id")
      .eq("workspace_id", workspace_id_todos_tecnicos)
      .eq("rol", "tecnico");
    userIds = (data ?? []).map((u: { id: string }) => u.id);
  } else if (workspace_id_jefe) {
    const { data } = await admin
      .from("usuarios")
      .select("id")
      .eq("workspace_id", workspace_id_jefe)
      .eq("rol", "jefe");
    userIds = (data ?? []).map((u: { id: string }) => u.id);
  }

  if (!userIds.length) {
    return json({ ok: true, enviados: 0 });
  }

  // Always create in-app notifications
  await admin.from("notifications").insert(
    userIds.map((uid) => ({
      usuario_id: uid,
      titulo,
      mensaje,
      url: url || "/",
      tipo: urgente ? "emergencia" : "orden",
    }))
  );

  // Then try push notifications — best effort
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("subscription")
    .in("usuario_id", userIds);

  if (!subs?.length) {
    return json({ ok: true, enviados: 0 });
  }

  const payload = JSON.stringify({ titulo, mensaje, url, urgente, tag: url });

  const results = await Promise.allSettled(
    subs.map((row: { subscription: webpush.PushSubscription }) =>
      webpush.sendNotification(row.subscription, payload)
    )
  );

  const enviados = results.filter((r) => r.status === "fulfilled").length;
  return json({ ok: true, enviados });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
