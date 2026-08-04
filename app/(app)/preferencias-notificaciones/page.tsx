"use client";

/**
 * /preferencias-notificaciones
 *
 * Personal notification preferences, stored in `notificacion_preferencias` —
 * the same table the mobile app writes, so a change here applies on both.
 *
 * Model: shared events, per-device delivery. The event toggles below say WHAT
 * you want to hear about and apply to every platform; enabling push on a given
 * browser says WHERE it arrives and is specific to that device. Users therefore
 * configure the same thing once, not once per platform.
 *
 * These gate PUSH ONLY. The in-app notification row is always created, so
 * turning something off means "don't interrupt me", never "hide it from me" —
 * the bell keeps every record. Enforcement lives in recipientsWantingPush() in
 * the `notificar` edge function, which every notification passes through.
 *
 * Browser push uses /sw.js, a push-only service worker. This is NOT a PWA —
 * there is no manifest and the site is not installable. Desktop
 * Chrome/Edge/Firefox deliver push to ordinary tabs; iOS Safari does not, and
 * those users are covered by the native apps.
 *
 * Also deliberately absent: a "Sonido" toggle (sound is hardcoded in the push
 * payload) and "Recordatorio de timer" (no such feature exists). Both were
 * present but non-functional in the mobile UI.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  Loader2,
  MessageSquare,
  Monitor,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import AppLoadingState from "@/components/AppLoadingState";
import {
  disablePush,
  enablePush,
  isSubscribedOnThisDevice,
  permissionState,
  pushSupported,
} from "@/lib/push-subscribe";

interface Prefs {
  push_activo: boolean;
  notif_asignada: boolean;
  notif_comentario: boolean;
  notif_estado_cambiado: boolean;
}

const DEFAULT_PREFS: Prefs = {
  push_activo: true,
  notif_asignada: true,
  notif_comentario: true,
  notif_estado_cambiado: true,
};

/** Rows of the events table. `key` maps to a column in notificacion_preferencias. */
const EVENTOS: {
  key: keyof Omit<Prefs, "push_activo">;
  nombre: string;
  evento: string;
  detalle: string;
  icon: React.ElementType;
}[] = [
  {
    key: "notif_asignada",
    nombre: "Asignación de OT",
    evento: "Me asignan una orden",
    detalle: "Cuando alguien te asigna a una orden de trabajo",
    icon: UserPlus,
  },
  {
    key: "notif_comentario",
    nombre: "Comentarios",
    evento: "Nuevo comentario",
    detalle: "En órdenes donde estás asignado",
    icon: MessageSquare,
  },
  {
    key: "notif_estado_cambiado",
    nombre: "Cambio de estado",
    evento: "Una OT cambia de estado",
    detalle: "Incluye órdenes completadas",
    icon: RefreshCw,
  },
];

export default function PreferenciasNotificacionesPage() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delivery state for THIS browser, independent of the shared preferences.
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!active) return;
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await sb
        .from("notificacion_preferencias")
        .select("push_activo, notif_asignada, notif_comentario, notif_estado_cambiado")
        .eq("usuario_id", user.id)
        .maybeSingle();
      if (!active) return;

      if (data) setPrefs(data as Prefs);
      setSupported(pushSupported());
      setPermission(permissionState());
      setSubscribed(await isSubscribedOnThisDevice());
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const update = useCallback(async (key: keyof Prefs, value: boolean) => {
    if (!userId) return;
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);           // optimistic
    setSaving(true);
    setError(null);

    const { error: saveError } = await createClient()
      .from("notificacion_preferencias")
      .upsert({ usuario_id: userId, ...next }, { onConflict: "usuario_id" });

    setSaving(false);
    if (saveError) {
      setPrefs(previous);     // roll back so the UI never claims a save that failed
      setError("No se pudieron guardar las preferencias.");
    }
  }, [prefs, userId]);

  async function toggleDevicePush() {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    if (subscribed) {
      await disablePush(userId);
      setSubscribed(false);
    } else {
      const result = await enablePush(userId);
      if (result.ok) {
        setSubscribed(true);
        // Enabling on a device implies wanting push; lift the master switch so
        // the user isn't left with a subscription that delivers nothing.
        if (!prefs.push_activo) await update("push_activo", true);
      } else {
        setError(result.message);
      }
      setPermission(permissionState());
    }
    setBusy(false);
  }

  const blocked = permission === "denied";

  if (loading) {
    return <AppLoadingState label="Cargando preferencias…" />;
  }

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1280, margin: "0 auto" }}>
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, padding: "11px 14px", borderRadius: 9, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* ── Preferences card ── */}
      <section style={{ marginTop: 24, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}>
        {/* Delivery on THIS browser — separate from the shared event prefs. */}
        <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border)" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", minWidth: 0 }}>
            <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}>
              <Monitor size={17} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 17, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>
                Este navegador
                <span style={{
                  padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: subscribed ? "var(--brand-tint)" : "var(--surface-hover)",
                  color: subscribed ? "var(--brand)" : "var(--fg-3)",
                }}>
                  {subscribed ? "Activo" : "Inactivo"}
                </span>
              </h2>
              <p style={{ fontSize: 13.5, color: "var(--fg-3)", margin: "3px 0 0" }}>
                {!supported
                  ? "Este navegador no admite push. En iPhone usa la app; seguirás viendo los avisos en la campana."
                  : blocked
                    ? "Bloqueaste las notificaciones para este sitio. Habilítalas en los ajustes del navegador."
                    : "Recibe avisos aunque Pangui esté en otra pestaña. Debes activarlo en cada navegador que uses."}
              </p>
            </div>
          </div>
          <div style={{ display: "grid", placeItems: "center", padding: "0 22px", background: "var(--surface-2)", borderLeft: "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => void toggleDevicePush()}
              disabled={!supported || blocked || busy}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "0 18px", height: 38, borderRadius: 8, border: "none",
                background: subscribed ? "var(--surface-hover)" : "var(--brand)",
                color: subscribed ? "var(--fg-2)" : "var(--fg-on-brand)",
                fontSize: 14, fontWeight: 500, whiteSpace: "nowrap",
                cursor: (!supported || blocked || busy) ? "not-allowed" : "pointer",
                opacity: (!supported || blocked) ? 0.55 : 1,
                fontFamily: "inherit",
              }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : subscribed ? <BellOff size={15} /> : <Bell size={15} />}
              {busy ? "…" : subscribed ? "Desactivar" : "Activar"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: "1px solid var(--border)" }}>
          <Switch
            checked={prefs.push_activo}
            onChange={(v) => void update("push_activo", v)}
            label="Recibir notificaciones push"
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)" }}>Recibir push</span>
            <span style={{ display: "block", fontSize: 12.5, color: "var(--fg-4)", marginTop: 1 }}>
              Interruptor general para todos tus dispositivos. Al desactivarlo no recibirás push, pero los avisos
              seguirán apareciendo en la campana.
            </span>
          </div>
          {saving && <Loader2 size={14} className="animate-spin" style={{ color: "var(--fg-4)", flexShrink: 0 }} />}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <Th>Nombre</Th>
                <Th>Evento</Th>
                <Th>Método</Th>
                <Th align="right">Activo</Th>
              </tr>
            </thead>
            <tbody>
              {EVENTOS.map(({ key, nombre, evento, detalle, icon: Icon }) => (
                <tr key={key} style={{ borderTop: "1px solid var(--border)", opacity: prefs.push_activo ? 1 : 0.5 }}>
                  <td style={{ padding: "13px 22px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 30, height: 30, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "50%", background: "var(--brand-tint)", color: "var(--brand)" }}>
                        <Icon size={15} />
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-1)" }}>{nombre}</span>
                    </span>
                  </td>
                  <td style={{ padding: "13px 12px" }}>
                    <span style={{ display: "block", fontSize: 13, color: "var(--fg-2)" }}>{evento}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--fg-4)", marginTop: 1 }}>{detalle}</span>
                  </td>
                  <td style={{ padding: "13px 12px", fontSize: 12.5, color: "var(--fg-3)" }}>Push + en la app</td>
                  <td style={{ padding: "13px 22px", textAlign: "right" }}>
                    <Switch
                      checked={prefs[key] && prefs.push_activo}
                      disabled={!prefs.push_activo}
                      onChange={(v) => void update(key, v)}
                      label={`Push para ${nombre}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Notes ── */}
      <div style={{ display: "flex", gap: 10, marginTop: 18, padding: "13px 16px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" }}>
        <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1, color: "var(--fg-4)" }} />
        <p style={{ fontSize: 12.5, color: "var(--fg-3)", margin: 0, lineHeight: 1.55 }}>
          Estas preferencias se comparten con la app móvil: eliges una vez qué te interesa y decides en cada dispositivo
          dónde llega. Los avisos siempre quedan en la campana. Las alertas operacionales (vencimientos, órdenes sin
          asignar, escalaciones) y las emergencias las configura tu administrador en{" "}
          <Link href="/notificaciones/reglas-alerta" style={{ color: "var(--brand)" }}>reglas de alerta</Link> y no pueden desactivarse
          desde aquí.
        </p>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ padding: "10px 22px", textAlign: align, fontSize: 11.5, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {children}
    </th>
  );
}

/** Pill switch. Sized and coloured to match the notification dropdown's toggle. */
function Switch({
  checked, onChange, disabled, label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 23, padding: 2, flexShrink: 0,
        border: `1px solid ${checked ? "var(--brand)" : "var(--border-strong)"}`,
        borderRadius: 999,
        background: checked ? "var(--brand)" : "var(--surface-hover)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background .15s, border-color .15s",
        display: "flex", alignItems: "center",
      }}
    >
      <span style={{
        display: "grid", placeItems: "center",
        width: 17, height: 17, borderRadius: "50%",
        background: checked ? "#fff" : "var(--fg-4)",
        color: checked ? "var(--brand)" : "transparent",
        boxShadow: "0 1px 2px rgba(0,0,0,.2)",
        transform: checked ? "translateX(17px)" : "translateX(0)",
        transition: "transform .15s, background .15s",
      }}>
        {checked && <Check size={11} strokeWidth={3.5} />}
      </span>
    </button>
  );
}
