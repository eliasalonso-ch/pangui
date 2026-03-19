"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { subscribeToPush, savePushSubscription } from "@/lib/push-subscribe";
import styles from "./NotificationPermission.module.css";

const ASKED_KEY = "pangui_notif_asked";
const DENIED_DISMISSED_KEY = "pangui_notif_denied_dismissed";

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
