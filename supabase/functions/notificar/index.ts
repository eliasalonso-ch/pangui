// supabase/functions/notificar/index.ts
// Deno Edge Function — replaces /api/notificar Next.js route.
// Runs on Supabase infrastructure, same region as the DB.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Push delivery (Expo + web, with preference gates) is NOT done here. Every row
// inserted into `notifications` fires the `on_notification_insert` webhook ->
// send-push-notification, the single push chokepoint. Pushing here as well sent
// every notificar notification twice.

async function deterministicNotificationId(userId: string, dedupeKey: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${dedupeKey}`)),
  );
  // RFC 4122-compatible UUID derived from the stable event identity.
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
    usuario_ids,
    workspace_id_todos_tecnicos,
    workspace_id_jefe,
    titulo,
    mensaje,
    url,
    urgente,
    tipo,
    dedupe_key,
  } = await req.json();

  // Collect target user IDs
  let userIds: string[] = [];

  if (usuario_ids && Array.isArray(usuario_ids) && usuario_ids.length) {
    userIds = usuario_ids;
  } else if (usuario_id) {
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

  userIds = [...new Set(userIds)];
  if (!userIds.length) {
    return json({ ok: true, enviados: 0 });
  }

  // Older mobile builds do not send an event key yet. Give material requests
  // a short server-side idempotency window so a repeated focus callback is
  // contained immediately, while a genuinely new request later still alerts.
  const effectiveDedupeKey = dedupe_key || (
    tipo === "solicitud_materiales"
      ? `legacy:${tipo}:${url || "/"}:${Math.floor(Date.now() / 30_000)}`
      : null
  );

  // Always create in-app notifications
  const notificationRows = await Promise.all(userIds.map(async (uid) => ({
      ...(effectiveDedupeKey ? { id: await deterministicNotificationId(uid, effectiveDedupeKey) } : {}),
      usuario_id: uid,
      titulo,
      mensaje,
      url: url || "/",
      tipo: urgente ? "emergencia" : (tipo || "orden"),
    })));

  const insertQuery = effectiveDedupeKey
    ? admin.from("notifications").upsert(notificationRows, {
        onConflict: "id",
        ignoreDuplicates: true,
      })
    : admin.from("notifications").insert(notificationRows);
  const { data: insertedRows, error: insertError } = await insertQuery.select("id, usuario_id");
  if (insertError) return json({ error: insertError.message }, 500);

  // A retried idempotent request inserts nothing, so the webhook pushes nothing.
  return json({ ok: true, insertadas: (insertedRows ?? []).length });
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
