"use client";

/**
 * One-time nudge to turn on browser notifications, shown at the top of the app
 * after login.
 *
 * WHY IT EXISTS: enablePush() was reachable only from
 * /notificaciones/preferencias, a page nobody visits, so in practice no web
 * user had push at all. Alerts reached phones and never browsers.
 *
 * WHY A BANNER AND NOT THE BROWSER PROMPT DIRECTLY: Chrome only shows the
 * permission dialog in response to a user gesture, and a prompt fired on page
 * load is both dismissed by reflex and counted against the origin — after a few
 * dismissals Chrome silently suppresses it ("quieter messaging") and the user
 * can never be asked again. Asking in-app first means the browser dialog only
 * appears once someone has said yes to the idea.
 *
 * It is deliberately quiet: shown once, dismissible, never shown again on this
 * browser once dismissed or once push is on.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
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

export default function PushActivationPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      // Every reason NOT to ask, cheapest first.
      if (!pushSupported()) return;

      // "denied" means the browser is blocking us; only the user can undo that
      // in site settings, so a banner offering to enable it would be a lie.
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

      setUserId(user.id);
      setVisible(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do — it reappears next session, which is acceptable.
    }
    setVisible(false);
  }, []);

  const activate = useCallback(async () => {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);

    const result = await enablePush(userId);

    if (result.ok) {
      // Don't ask again on this browser even if the subscription is later
      // dropped: they have answered the question.
      try {
        localStorage.setItem(DISMISSED_KEY, "1");
      } catch {}
      setVisible(false);
      return;
    }

    setBusy(false);
    setError(result.message);
    // A hard "no" from the browser cannot be undone from here; stop asking.
    if (result.reason === "denied") {
      try {
        localStorage.setItem(DISMISSED_KEY, "1");
      } catch {}
    }
  }, [busy, userId]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Activar notificaciones"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--brand-tint)",
        color: "var(--fg-1)",
        fontSize: 13.5,
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          background: "var(--surface-1)",
          color: "var(--brand)",
        }}
      >
        <Bell size={15} />
      </span>

      <div style={{ minWidth: 0, flex: 1 }}>
        <strong style={{ fontWeight: 600 }}>Activa las notificaciones</strong>{" "}
        <span style={{ color: "var(--fg-3)" }}>
          {error
            ? error
            : "Recibe avisos de tus OTs aunque tengas Pangui en otra pestaña."}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void activate()}
        disabled={busy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
          height: 32,
          padding: "0 14px",
          border: "none",
          borderRadius: 7,
          background: "var(--brand)",
          color: "var(--fg-on-brand)",
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          cursor: busy ? "default" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {busy && <Loader2 size={13} className="animate-spin" />}
        Activar
      </button>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Ahora no"
        style={{
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          width: 28,
          height: 28,
          border: "none",
          borderRadius: 6,
          background: "transparent",
          color: "var(--fg-4)",
          cursor: "pointer",
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
