/**
 * Web Push subscription helpers.
 *
 * Subscribing is done per browser, but `push_subscriptions` carries
 * UNIQUE (usuario_id), so only ONE browser subscription is stored per user:
 * activating push somewhere new replaces the previous one. The *event*
 * preferences it obeys (notif_asignada, …) live in `notificacion_preferencias`
 * and are shared with the mobile app, so users configure what they care about
 * once. Mobile push is unaffected — it uses expo_push_token on `usuarios` and
 * a different edge function entirely.
 *
 * This registers /sw.js, a push-only service worker. It is NOT a PWA — there is
 * no manifest and the site is intentionally not installable. Desktop
 * Chrome/Edge/Firefox deliver push to ordinary tabs; iOS Safari does not, and
 * those users are served by the native app instead.
 */
import { createClient } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * Explicitly backed by an ArrayBuffer: `Uint8Array.from` widens to
 * ArrayBufferLike, which no longer satisfies BufferSource under TS 5.7.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Whether this browser can do Web Push at all (iOS Safari in a tab, http://, …). */
export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function permissionState(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

/** Registers the worker. Safe to call repeatedly — the browser dedupes by URL. */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  // `ready` resolves once a worker is actually active, which is what
  // pushManager.subscribe() requires — `register()` alone can resolve earlier.
  await navigator.serviceWorker.ready;
  return registration;
}

/**
 * Persists the subscription for this user.
 *
 * The table carries UNIQUE (usuario_id) — one subscription per user, NOT one
 * per device — so this replaces whatever was stored before. Activating push on
 * a new browser therefore deactivates it on the previous one, which is a schema
 * constraint rather than a choice. Supporting several devices at once would
 * need that constraint dropped and a unique index on the endpoint instead.
 */
export async function savePushSubscription(sub: PushSubscription, userId: string) {
  const supabase = createClient();

  // upsert on usuario_id: the row may exist for a different (older) browser,
  // and inserting blindly trips push_subscriptions_usuario_id_key with a 409.
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        usuario_id: userId,
        subscription: sub.toJSON(),
        device_info: navigator.userAgent.slice(0, 200),
      },
      { onConflict: "usuario_id" },
    );
  return error;
}

/**
 * Full opt-in: permission prompt -> worker -> subscribe -> persist.
 * Returns a discriminated result so the UI can explain what went wrong.
 */
export async function enablePush(userId: string): Promise<
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "no-key" | "error"; message: string }
> {
  if (!pushSupported()) {
    return { ok: false, reason: "unsupported", message: "Este navegador no admite notificaciones push." };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: "no-key", message: "Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "denied",
      message: permission === "denied"
        ? "Bloqueaste las notificaciones. Habilítalas en los ajustes del navegador."
        : "No se concedió el permiso de notificaciones.",
    };
  }

  try {
    const registration = await ensureServiceWorker();

    // Reuse an existing subscription when present; resubscribing would
    // invalidate the endpoint the server already knows about.
    const existing = await registration.pushManager.getSubscription();
    const sub = existing ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const error = await savePushSubscription(sub, userId);
    if (error) return { ok: false, reason: "error", message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/** Unsubscribes this device and forgets its row. */
export async function disablePush(userId: string): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const sub = await registration?.pushManager.getSubscription();
  if (!sub) return;

  const supabase = createClient();
  // Only clear the stored row if it is THIS browser's subscription: with one
  // row per user, a stale row may belong to another device and deleting it
  // would silently unsubscribe that one too.
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("usuario_id", userId)
    .filter("subscription->>endpoint", "eq", sub.endpoint);
  await sub.unsubscribe();
}

/** Whether THIS device currently holds a push subscription. */
export async function isSubscribedOnThisDevice(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return Boolean(await registration?.pushManager.getSubscription());
}
