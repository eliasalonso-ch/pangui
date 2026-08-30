/**
 * send-push-notification — fired by the `on_notification_insert` database
 * webhook for every row inserted into `notifications`.
 *
 * WHY THIS EXISTS ALONGSIDE `notificar`:
 *   - `notificar` is the front-door API. Callers that go through it (OT created,
 *     estado cambiado, solicitud de materiales, …) get in-app rows, Expo push
 *     AND web push in one request.
 *   - Everything that writes to `notifications` directly — evaluar-alertas and
 *     the eight DB functions (notify_users, trigger_notify_assignment, …) —
 *     never touches `notificar`. Their only fan-out is this webhook.
 *
 * Until now this function sent Expo push only, so those notifications reached
 * phones but never browsers: a supervisor watching the web app got an in-app
 * bell entry and no device alert. It now delivers BOTH, which makes this the
 * single chokepoint where any notification row becomes a push on any platform.
 *
 * NOTE: this file was reconstructed from deployed version 25, which had no
 * source in the repo. Redeploy after editing or the live version drifts again.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@pangui.cl";

// Web push is optional: if the VAPID keys are absent the function must still
// deliver Expo pushes rather than failing outright.
const webPushReady = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (webPushReady) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC!, VAPID_PRIVATE!);
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
    }

    const payload = await req.json();

    // Called via Supabase Database Webhook on notifications INSERT
    const webhookRecord = payload.record;
    if (!webhookRecord?.id || typeof webhookRecord.id !== "string") {
      console.log("No record in payload");
      return new Response("No record", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Database webhooks do not carry an end-user JWT. Since gateway JWT
    // verification is disabled for this function, never trust the submitted
    // notification body. Resolve the real row by id before doing anything.
    const { data: record, error: notificationError } = await supabase
      .from("notifications")
      .select("id, usuario_id, titulo, mensaje, tipo, url")
      .eq("id", webhookRecord.id)
      .maybeSingle();

    if (notificationError) {
      console.log("Error fetching notification:", notificationError.message);
      return new Response("Notification fetch error", { status: 500 });
    }
    if (!record || record.usuario_id !== webhookRecord.usuario_id) {
      return new Response("Notification not found", { status: 404 });
    }

    // Get the push token for this user
    const { data: usuario, error: userError } = await supabase
      .from("usuarios")
      .select("expo_push_token, nombre")
      .eq("id", record.usuario_id)
      .single();

    if (userError) {
      console.log("Error fetching user:", userError.message);
      return new Response("User fetch error: " + userError.message, { status: 500 });
    }

    const url = typeof record.url === "string" ? record.url : null;
    const ordenMatch = url?.match(/(?:^|\/)orden(?:es)?\/([^/?#]+)/i);
    const ordenId = ordenMatch?.[1] ? decodeURIComponent(ordenMatch[1]) : null;
    const parteMatch = url?.match(/(?:^|\/)parte(?:s)?\/([^/?#]+)/i);
    const parteId = parteMatch?.[1] ? decodeURIComponent(parteMatch[1]) : null;
    const otpMatch = url?.match(/(?:^|\/)orden(?:es)?\/[^/?#]+\/procedimiento\/([^/?#]+)/i);
    const otpId = otpMatch?.[1] ? decodeURIComponent(otpMatch[1]) : null;

    const { data: prefs } = await supabase
      .from("notificacion_preferencias")
      .select("push_activo, push_sonido, notif_asignada, notif_comentario, notif_estado_cambiado")
      .eq("usuario_id", record.usuario_id)
      .maybeSingle();

    // Preference gates apply to BOTH transports — a muted user should not get a
    // browser alert either, so these run before any delivery.
    if (prefs?.push_activo === false) return new Response("Push disabled", { status: 200 });
    if (record.tipo === "asignado" && prefs?.notif_asignada === false) return new Response("Assignment push disabled", { status: 200 });
    if (record.tipo === "comentario" && prefs?.notif_comentario === false) return new Response("Comment push disabled", { status: 200 });
    if (["estado_cambiado", "completado", "pausado", "reanudado"].includes(record.tipo) && prefs?.notif_estado_cambiado === false) return new Response("State push disabled", { status: 200 });

    // ─── Mobile (Expo) ───────────────────────────────────────────────────────
    const token = (usuario as any)?.expo_push_token;
    const hasExpoToken = typeof token === "string" &&
      (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));

    let expoResult: unknown = null;
    if (hasExpoToken) {
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify({
            to: token,
            title: record.titulo,
            body: record.mensaje ?? "",
            data: {
              notificationId: record.id,
              tipo: record.tipo,
              url,
              ordenId,
              parteId,
              otpId,
            },
            sound: prefs?.push_sonido === false ? null : "default",
            priority: "high",
            channelId: "default",
          }),
        });
        expoResult = await response.json();
        console.log("Expo push result:", JSON.stringify(expoResult));
      } catch (err) {
        // Best effort: a mobile failure must not prevent the web push below.
        console.log("Expo push failed:", String(err));
      }
    }

    // ─── Web (VAPID) ─────────────────────────────────────────────────────────
    // push_subscriptions carries UNIQUE (usuario_id), so this is at most one row
    // per user — the browser they most recently activated push on.
    let webSent = 0;
    if (webPushReady) {
      const { data: subs, error: subsError } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("usuario_id", record.usuario_id);

      if (subsError) {
        console.log("push_subscriptions fetch failed:", subsError.message);
      } else if (subs?.length) {
        // Payload shape must match what /sw.js reads. `tag` collapses repeat
        // alerts about the same OT into one browser notification instead of
        // stacking a new banner every hour.
        const body = JSON.stringify({
          titulo: record.titulo,
          mensaje: record.mensaje ?? "",
          url: url ?? "/",
          urgente: record.tipo === "emergencia",
          tag: url ?? record.id,
        });

        const results = await Promise.allSettled(
          subs.map((row: { subscription: webpush.PushSubscription }) =>
            webpush.sendNotification(row.subscription, body)
          )
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            webSent += 1;
            continue;
          }
          // 404/410 mean the browser dropped the subscription (cleared site
          // data, uninstalled). Forget it so it stops being retried forever.
          const statusCode = (result.reason as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("usuario_id", record.usuario_id);
            console.log("Removed expired web push subscription:", record.usuario_id);
          } else {
            console.log("Web push failed:", String(result.reason));
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, mobile: hasExpoToken ? 1 : 0, web: webSent, expo: expoResult }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.log("Unhandled error:", String(err));
    return new Response(String(err), { status: 500 });
  }
});
