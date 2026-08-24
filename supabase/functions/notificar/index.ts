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
async function recipientsWantingPush(
  userIds: string[],
  tipo: string | null,
): Promise<{ userIds: string[]; sonidoByUser: Map<string, boolean> }> {
  const prefColumn = tipo ? PREF_BY_TIPO[tipo] : undefined;

  // Built as a plain string so the client's select-parser does not try to infer
  // a literal shape from the conditional preference column.
  const selectColumns: string = prefColumn
    ? `usuario_id, push_activo, push_sonido, ${prefColumn}`
    : "usuario_id, push_activo, push_sonido";

  const { data, error } = await admin
    .from("notificacion_preferencias")
    .select(selectColumns)
    .in("usuario_id", userIds);

  // Never drop notifications because the preferences lookup failed.
  if (error) return { userIds, sonidoByUser: new Map() };

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const byUser = new Map<string, Record<string, unknown>>(
    rows.map((row) => [row.usuario_id as string, row]),
  );

  const sonidoByUser = new Map<string, boolean>();
  for (const [uid, prefs] of byUser) {
    sonidoByUser.set(uid, prefs.push_sonido !== false);
  }

  return {
    userIds: userIds.filter((uid) => {
      const prefs = byUser.get(uid);
      if (!prefs) return true;                       // no row => opted in
      if (prefs.push_activo === false) return false; // master switch
      if (prefColumn && prefs[prefColumn] === false) return false;
      return true;
    }),
    sonidoByUser,
  };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100; // Expo accepts up to 100 messages per request.

function isExpoToken(token: unknown): token is string {
  return typeof token === "string" &&
    (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
}

/** Deep-link ids the mobile app reads off the push payload. */
function deepLinkIds(url: string | null) {
  const ordenMatch = url?.match(/(?:^|\/)orden(?:es)?\/([^/?#]+)/i);
  const parteMatch = url?.match(/(?:^|\/)parte(?:s)?\/([^/?#]+)/i);
  const otpMatch = url?.match(/(?:^|\/)orden(?:es)?\/[^/?#]+\/procedimiento\/([^/?#]+)/i);
  return {
    ordenId: ordenMatch?.[1] ? decodeURIComponent(ordenMatch[1]) : null,
    parteId: parteMatch?.[1] ? decodeURIComponent(parteMatch[1]) : null,
    otpId: otpMatch?.[1] ? decodeURIComponent(otpMatch[1]) : null,
  };
}

/**
 * Sends every mobile push for this notification batch in as few Expo calls as
 * possible. Replaces the per-row `on_notification_insert` webhook, which fanned
 * out to one function invocation plus three PostgREST round trips per recipient.
 *
 * Best effort: a push failure must never fail the request, because the in-app
 * notification rows are already committed by the time we get here.
 */
async function sendExpoPushes(
  userIds: string[],
  sonidoByUser: Map<string, boolean>,
  notification: { titulo: string; mensaje: string; url: string | null; tipo: string },
  idByUser: Map<string, string>,
): Promise<number> {
  const { data: usuarios } = await admin
    .from("usuarios")
    .select("id, expo_push_token")
    .in("id", userIds);

  const targets = (usuarios ?? []).filter((u: { expo_push_token: unknown }) =>
    isExpoToken(u.expo_push_token)
  ) as Array<{ id: string; expo_push_token: string }>;

  if (!targets.length) return 0;

  const { ordenId, parteId, otpId } = deepLinkIds(notification.url);

  const messages = targets.map((u) => ({
    to: u.expo_push_token,
    title: notification.titulo,
    body: notification.mensaje ?? "",
    data: {
      notificationId: idByUser.get(u.id) ?? null,
      tipo: notification.tipo,
      url: notification.url,
      ordenId,
      parteId,
      otpId,
    },
    sound: sonidoByUser.get(u.id) === false ? null : "default",
    priority: "high",
    channelId: "default",
  }));

  let enviados = 0;
  const deadTokens: Array<{ id: string; token: string }> = [];

  for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
    const chunk = messages.slice(i, i + EXPO_BATCH_SIZE);
    const chunkTargets = targets.slice(i, i + EXPO_BATCH_SIZE);

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });

      const result = await response.json();
      const tickets = Array.isArray(result?.data) ? result.data : [];

      tickets.forEach((ticket: Record<string, any>, index: number) => {
        if (ticket?.status === "error") {
          // A dead installation token should not be retried forever.
          if (ticket?.details?.error === "DeviceNotRegistered" && chunkTargets[index]) {
            deadTokens.push({
              id: chunkTargets[index].id,
              token: chunkTargets[index].expo_push_token,
            });
          }
          console.log("Expo rejected push:", ticket?.details?.error, ticket?.message ?? "");
          return;
        }
        enviados += 1;
      });
    } catch (err) {
      console.log("Expo batch failed:", String(err));
    }
  }

  // Clear each dead token only if it is still the one that produced the error.
  for (const { id, token } of deadTokens) {
    await admin
      .from("usuarios")
      .update({ expo_push_token: null })
      .eq("id", id)
      .eq("expo_push_token", token);
  }

  return enviados;
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
  const { data: insertedRows, error: insertError } = await insertQuery.select("id, usuario_id");
  if (insertError) return json({ error: insertError.message }, 500);

  // Only deliver pushes for rows actually inserted. A retried idempotent
  // request therefore cannot create a duplicate system notification either.
  const insertedUserIds = (insertedRows ?? []).map((row: { usuario_id: string }) => row.usuario_id);
  if (!insertedUserIds.length) {
    return json({ ok: true, enviados: 0, duplicada: true });
  }

  const idByUser = new Map<string, string>(
    (insertedRows ?? []).map((row: { id: string; usuario_id: string }) => [row.usuario_id, row.id]),
  );

  // In-app rows exist for everyone by now. Push is the only thing personal
  // preferences gate, so the filter applies from here down.
  const effectiveTipo = urgente ? "emergencia" : (tipo || "orden");
  const { userIds: pushUserIds, sonidoByUser } = await recipientsWantingPush(
    insertedUserIds,
    effectiveTipo,
  );
  if (!pushUserIds.length) {
    return json({ ok: true, enviados: 0, silenciados: insertedUserIds.length });
  }

  // Mobile (Expo) pushes — batched here so the per-row notifications webhook
  // can be retired. Best effort: never fail the request on a push error.
  const enviadosMobile = await sendExpoPushes(
    pushUserIds,
    sonidoByUser,
    {
      titulo,
      mensaje,
      url: typeof url === "string" ? url : null,
      tipo: effectiveTipo,
    },
    idByUser,
  ).catch((err) => {
    console.log("Expo push stage failed:", String(err));
    return 0;
  });

  // Then try push notifications — best effort
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("subscription")
    .in("usuario_id", pushUserIds);

  if (!subs?.length) {
    return json({ ok: true, enviados: enviadosMobile, mobile: enviadosMobile, web: 0 });
  }

  const payload = JSON.stringify({ titulo, mensaje, url, urgente, tag: url });

  const results = await Promise.allSettled(
    subs.map((row: { subscription: webpush.PushSubscription }) =>
      webpush.sendNotification(row.subscription, payload)
    )
  );

  const enviadosWeb = results.filter((r) => r.status === "fulfilled").length;
  return json({
    ok: true,
    enviados: enviadosWeb + enviadosMobile,
    mobile: enviadosMobile,
    web: enviadosWeb,
  });
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
