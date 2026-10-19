"use client";

/**
 * One-time nudge to turn on browser notifications, shown at the top of the app
 * after login.
 *
 * WHY IT EXISTS: enablePush() was reachable only from
 * /notificaciones/preferencias, a page nobody visits, so in practice no web
 * user had push at all. Alerts reached phones and never browsers.
 *
 * WHY OUR OWN TOAST AND NOT THE BROWSER PROMPT DIRECTLY: Chrome only shows the
 * permission dialog in response to a user gesture, and a prompt fired on page
 * load is both dismissed by reflex and counted against the origin — after a few
 * dismissals Chrome silently suppresses it ("quieter messaging") and the user
 * can never be asked again. Asking in-app first means the browser dialog only
 * appears once someone has said yes to the idea.
 *
 * It is deliberately quiet: shown once, dismissible, never shown again on this
 * browser once dismissed or once push is on.
 */

import { useEffect } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { IconoToast } from "@/components/ui/sonner";
import {
  enablePush,
  isSubscribedOnThisDevice,
  permissionState,
  pushSupported,
} from "@/lib/push-subscribe";
import { getAuthUser } from "@/lib/auth-user";

/**
 * Dismissal is per-browser, which is the right scope: the subscription is
 * per-browser too (push_subscriptions is UNIQUE on usuario_id — activating on a
 * new browser replaces the old one). Storing this server-side would hide the
 * prompt on a device that has no subscription.
 */
const DISMISSED_KEY = "pangui_push_prompt_dismissed";

function marcarDescartado() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Nothing to do — it reappears next session, which is acceptable.
  }
}

/** "Activar" is a click, so the browser permission dialog is allowed to open. */
async function activar(userId: string) {
  const result = await enablePush(userId);
  if (result.ok) {
    // Don't ask again on this browser even if the subscription is later
    // dropped: they have answered the question.
    marcarDescartado();
    return;
  }
  toast.error(result.message);
  // A hard "no" from the browser cannot be undone from here; stop asking.
  if (result.reason === "denied") marcarDescartado();
}

export default function PushActivationPrompt() {
  useEffect(() => {
    let active = true;

    void (async () => {
      // Every reason NOT to ask, cheapest first.
      if (!pushSupported()) return;

      // "denied" means the browser is blocking us; only the user can undo that
      // in site settings, so a prompt offering to enable it would be a lie.
      // "granted" without a subscription is handled below — that is the case
      // after the move to app.getpangui.com, where permission carried over but
      // the subscription (origin-scoped) did not.
      if (permissionState() === "denied") return;

      try {
        if (localStorage.getItem(DISMISSED_KEY) === "1") return;
      } catch {
        // Private mode / storage blocked — fall through and show it. Better to
        // ask a second time than never.
      }

      if (await isSubscribedOnThisDevice()) return;

      const user = await getAuthUser();
      if (!active || !user) return;

      // Toast info sin vencimiento. "Ahora no" y deslizarlo para cerrar
      // cuentan como respuesta: no se vuelve a preguntar en este navegador.
      toast.info("Activa las notificaciones", {
        id: "activar-push",
        description: "Recibe avisos de tus OTs aunque tengas Pangui en otra pestaña.",
        duration: Infinity,
        className: "toast-vertical",
        icon: <IconoToast><Bell size={16} /></IconoToast>,
        action: { label: "Activar", onClick: () => void activar(user.id) },
        cancel: { label: "Ahora no", onClick: marcarDescartado },
        onDismiss: marcarDescartado,
      });
    })();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
