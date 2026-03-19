"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import styles from "./NotificationPermission.module.css";

const ASKED_KEY = "pangui_notif_asked";
const DENIED_DISMISSED_KEY = "pangui_notif_denied_dismissed";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function NotificationPermission() {
  const [show, setShow] = useState(false);
  const [permission, setPermission] = useState(null);

  useEffect(() => {
    if (typeof Notification === "undefined") return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isIOS && !isStandalone) return;

    const perm = Notification.permission;
    setPermission(perm);

    if (perm === "granted") return;

    if (perm === "denied") {
      // Show Settings reminder once per session (not stored, so it reappears on reload)
      if (!sessionStorage.getItem(DENIED_DISMISSED_KEY)) {
        const t = setTimeout(() => setShow(true), 2000);
        return () => clearTimeout(t);
      }
      return;
    }

    // "default" — show the Activar banner
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      localStorage.getItem(ASKED_KEY)
    ) return;

    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, []);

  async function activar() {
    setShow(false);
    localStorage.setItem(ASKED_KEY, "true");

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        ),
      });

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("push_subscriptions").upsert({
        usuario_id: user.id,
        subscription: sub.toJSON(),
        device_info: navigator.userAgent.slice(0, 200),
      }, { onConflict: "usuario_id" });
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  function rechazar() {
    localStorage.setItem(ASKED_KEY, "true");
    setShow(false);
  }

  function dismissDenied() {
    sessionStorage.setItem(DENIED_DISMISSED_KEY, "true");
    setShow(false);
  }

  if (!show) return null;

  if (permission === "denied") {
    return (
      <div className={styles.banner}>
        <div className={styles.icon}>🔕</div>
        <div className={styles.body}>
          <div className={styles.title}>Activa las notificaciones</div>
          <div className={styles.sub}>
            Ajustes → Pangui → Notificaciones → Permitir
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.btnPrimary} onClick={dismissDenied}>
            Entendido
          </button>
        </div>
      </div>
    );
  }

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
