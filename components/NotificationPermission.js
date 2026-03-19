"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { subscribeToPush, savePushSubscription } from "@/lib/push-subscribe";
import styles from "./NotificationPermission.module.css";

const SESSION_DISMISSED_KEY = "pangui_notif_dismissed";

export default function NotificationPermission() {
  const [show, setShow] = useState(false);
  const [permission, setPermission] = useState(null);

  useEffect(() => {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isIOS && !isStandalone) return;

    const perm = Notification.permission;
    setPermission(perm);

    if (perm === "granted") {
      // Silently ensure subscription is saved — covers reinstalls / lost subs
      navigator.serviceWorker.ready.then(async (reg) => {
        const existing = await reg.pushManager.getSubscription();
        if (!existing) return;
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await savePushSubscription(existing, user.id);
      }).catch(() => {});
      return;
    }

    // Don't show if user dismissed this session
    if (sessionStorage.getItem(SESSION_DISMISSED_KEY)) return;

    const t = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(t);
  }, []);

  async function activar() {
    setShow(false);

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return;

    try {
      const sub = await subscribeToPush();
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await savePushSubscription(sub, user.id);
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  }

  function rechazar() {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, "true");
    setShow(false);
  }

  function dismissDenied() {
    sessionStorage.setItem(SESSION_DISMISSED_KEY, "true");
    setShow(false);
  }

  if (!show) return null;

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (permission === "denied") {
    return (
      <div className={styles.banner}>
        <div className={styles.icon}>🔕</div>
        <div className={styles.body}>
          <div className={styles.title}>Notificaciones bloqueadas</div>
          <div className={styles.sub}>
            {isIOS
              ? "Ajustes → Pangui → Notificaciones → Permitir"
              : "Configuración del sitio → Notificaciones → Permitir"}
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
