"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import styles from "./NotificationPermission.module.css";

const ASKED_KEY = "pangui_notif_asked";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function NotificationPermission() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (
      typeof Notification === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    )
      return;

    if (Notification.permission !== "default") return;
    if (localStorage.getItem(ASKED_KEY)) return;

    // Small delay so the user is settled in the app
    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, []);

  async function activar() {
    setShow(false);
    localStorage.setItem(ASKED_KEY, "true");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        ),
      });

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("push_subscriptions").insert({
        usuario_id: user.id,
        subscription: sub.toJSON(),
        device_info: navigator.userAgent.slice(0, 200),
      });
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  function rechazar() {
    localStorage.setItem(ASKED_KEY, "true");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className={styles.banner}>
      <div className={styles.icon}>🔔</div>
      <div className={styles.body}>
        <div className={styles.title}>Activa las notificaciones</div>
        <div className={styles.sub}>Para no perderte trabajos nuevos</div>
      </div>
      <div className={styles.actions}>
        <button className={styles.btnGhost} onClick={rechazar}>
          Ahora no
        </button>
        <button className={styles.btnPrimary} onClick={activar}>
          Activar
        </button>
      </div>
    </div>
  );
}
