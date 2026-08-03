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

/**
 * Maps a notification `tipo` to the preference column that gates its PUSH
 * delivery. Types absent from this map are always pushed — that is deliberate:
 *
 *   - Operational alerts (ot_vencida, ot_sin_asignar, ot_abierta_sin_progreso,
 *     ot_urgente_sin_asignar) are configured by admins in reglas-alerta and are
 *     not a personal preference.
 *   - `emergencia` must never be silenceable.
 *
 * In-app notification rows are ALWAYS created regardless of these preferences.
 * A toggle stops the device alert; it never hides the record from the bell.
 */
const PREF_BY_TIPO: Record<string, string> = {
  asignado: "notif_asignada",
  comentario: "notif_comentario",
  estado_cambiado: "notif_estado_cambiado",
  completado: "notif_estado_cambiado",
};

/**
 * Filters recipients down to those who actually want a push for this `tipo`.
 *
 * Users with no preferences row are treated as opted in — the seed trigger
 * creates one per user, but a missing row must not silently mute somebody.
 */
async function recipientsWantingPush(userIds: string[], tipo: string | null): Promise<string[]> {
  const prefColumn = tipo ? PREF_BY_TIPO[tipo] : undefined;

  const { data, error } = await admin
    .from("notificacion_preferencias")
    .select(`usuario_id, push_activo${prefColumn ? `, ${prefColumn}` : ""}`)
    .in("usuario_id", userIds);

  // Never drop notifications because the preferences lookup failed.
  if (error) return userIds;

  const byUser = new Map<string, Record<string, unknown>>(
    (data ?? []).map((row: Record<string, unknown>) => [row.usuario_id as string, row]),
  );

  return userIds.filter((uid) => {
    const prefs = byUser.get(uid);
    if (!prefs) return true;                       // no row => opted in
    if (prefs.push_activo === false) return false; // master switch
    if (prefColumn && prefs[prefColumn] === false) return false;
    return true;
  });
}

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
  const { data: insertedRows, error: insertError } = await insertQuery.select("usuario_id");
  if (insertError) return json({ error: insertError.message }, 500);

  // Only deliver pushes for rows actually inserted. A retried idempotent
  // request therefore cannot create a duplicate system notification either.
  const insertedUserIds = (insertedRows ?? []).map((row: { usuario_id: string }) => row.usuario_id);
  if (!insertedUserIds.length) {
    return json({ ok: true, enviados: 0, duplicada: true });
  }

  // In-app rows exist for everyone by now. Push is the only thing personal
  // preferences gate, so the filter applies from here down.
  const effectiveTipo = urgente ? "emergencia" : (tipo || "orden");
  const pushUserIds = await recipientsWantingPush(insertedUserIds, effectiveTipo);
  if (!pushUserIds.length) {
    return json({ ok: true, enviados: 0, silenciados: insertedUserIds.length });
  }

  // Then try push notifications — best effort
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("subscription")
    .in("usuario_id", pushUserIds);

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
