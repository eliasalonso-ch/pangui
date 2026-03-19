import { createClient } from "@/lib/supabase";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function savePushSubscription(sub, userId) {
  const supabase = createClient();
  await supabase.from("push_subscriptions").delete().eq("usuario_id", userId);
  const { error } = await supabase.from("push_subscriptions").insert({
    usuario_id: userId,
    subscription: sub.toJSON(),
    device_info: navigator.userAgent.slice(0, 200),
  });
  return error;
}

export async function subscribeToPush() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ),
  });
}
