"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  LogOut, KeyRound, Bell, User, Loader2, Check, Eye, EyeOff, ChevronRight,
} from "lucide-react";

type Tab = "perfil" | "notificaciones";

export default function ConfiguracionPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("perfil");

  // Profile
  const [nombre, setNombre] = useState("");
  const [email, setEmail]   = useState("");
  const [rol, setRol]       = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Password change
  const [pwOpen, setPwOpen]         = useState(false);
  const [pwActual, setPwActual]     = useState("");
  const [pwNueva, setPwNueva]       = useState("");
  const [pwConfirm, setPwConfirm]   = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [pwSaving, setPwSaving]     = useState(false);
  const [pwError, setPwError]       = useState<string | null>(null);
  const [pwOk, setPwOk]             = useState(false);

  // Sign out
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setEmail(user.email ?? "");
      const { data: perfil } = await sb
        .from("usuarios")
        .select("nombre, rol")
        .eq("id", user.id)
        .maybeSingle();
      setNombre(perfil?.nombre ?? "");
      setRol(perfil?.rol ?? "");
      setLoadingProfile(false);
    }
    load();
  }, [router]);

  async function handleSignOut() {
    setSigningOut(true);
    const sb = createClient();
    await sb.auth.signOut();
    router.replace("/login");
  }

  async function handleChangePassword() {
    setPwError(null);
    if (!pwNueva.trim()) { setPwError("Ingresa una nueva contraseña."); return; }
    if (pwNueva.length < 8) { setPwError("La contraseña debe tener al menos 8 caracteres."); return; }
    if (pwNueva !== pwConfirm) { setPwError("Las contraseñas no coinciden."); return; }
    setPwSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb.auth.updateUser({ password: pwNueva });
      if (error) { setPwError(error.message); return; }
      setPwOk(true);
      setPwActual(""); setPwNueva(""); setPwConfirm("");
      setTimeout(() => { setPwOk(false); setPwOpen(false); }, 2000);
    } finally {
      setPwSaving(false);
    }
  }

  const ROL_LABEL: Record<string, string> = {
    admin: "Administrador", jefe: "Jefe de Operaciones", tecnico: "Técnico",
  };

  if (loadingProfile) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 8, color: "#9CA3AF" }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando…</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "#fff" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #E5E7EB", padding: "0 24px", height: 56, display: "flex", alignItems: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1E2429", margin: 0, letterSpacing: "-0.3px" }}>Configuración</h1>
      </div>

      {/* Tabs */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #E5E7EB", padding: "0 24px", display: "flex", gap: 0 }}>
        {([["perfil", "Perfil"], ["notificaciones", "Notificaciones"]] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              height: 40, padding: "0 16px",
              background: "none", border: "none",
              borderBottom: tab === key ? "2px solid #273D88" : "2px solid transparent",
              color: tab === key ? "#273D88" : "#9CA3AF",
              fontSize: 13, fontWeight: tab === key ? 600 : 500,
              cursor: "pointer", fontFamily: "inherit",
              marginBottom: -1, transition: "color 0.1s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

        {/* ── Perfil tab ── */}
        {tab === "perfil" && (
          <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 0 }}>

            {/* User info card */}
            <div style={{ padding: "16px 20px", background: "#F8F9FF", border: "1px solid #E0E7FF", borderRadius: 10, marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "#273D88", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, fontWeight: 700, flexShrink: 0,
              }}>
                {nombre ? (nombre.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase()) : <User size={20} />}
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{nombre || "—"}</p>
                <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>{email}</p>
                {rol && (
                  <span style={{
                    display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 600,
                    padding: "2px 8px", borderRadius: 20,
                    background: "#EEF1FB", color: "#273D88",
                  }}>
                    {ROL_LABEL[rol] ?? rol}
                  </span>
                )}
              </div>
            </div>

            {/* Change password row */}
            <div style={{ borderTop: "1px solid #F1F3F5" }}>
              <button
                type="button"
                onClick={() => { setPwOpen(v => !v); setPwError(null); setPwOk(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <KeyRound size={16} style={{ color: "#6B7280" }} />
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>Cambiar contraseña</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Actualiza tu contraseña de acceso</p>
                  </div>
                </div>
                <ChevronRight size={16} style={{ color: "#D1D5DB", transform: pwOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
              </button>

              {/* Password form */}
              {pwOpen && (
                <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {(["Nueva contraseña", "Confirmar contraseña"] as const).map((label, i) => (
                    <div key={label}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5, marginTop: 0 }}>{label}</p>
                      <div style={{ position: "relative" }}>
                        <input
                          type={showPw ? "text" : "password"}
                          placeholder="Mínimo 8 caracteres"
                          value={i === 0 ? pwNueva : pwConfirm}
                          onChange={e => i === 0 ? setPwNueva(e.target.value) : setPwConfirm(e.target.value)}
                          style={{
                            width: "100%", height: 38, padding: "0 36px 0 12px",
                            border: "1px solid #E5E7EB", borderRadius: 6,
                            fontSize: 13, color: "#111827", outline: "none",
                            fontFamily: "inherit", background: "#fff", boxSizing: "border-box",
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = "#273D88"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "#E5E7EB"; }}
                        />
                        {i === 0 && (
                          <button type="button" onClick={() => setShowPw(v => !v)}
                            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex" }}>
                            {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {pwError && (
                    <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{pwError}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={pwSaving || pwOk}
                    style={{
                      height: 38, border: "none", borderRadius: 6,
                      background: pwOk ? "#16A34A" : "#273D88",
                      color: "#fff", fontSize: 13, fontWeight: 600,
                      cursor: pwSaving || pwOk ? "default" : "pointer",
                      fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      transition: "background 0.2s",
                    }}
                  >
                    {pwSaving ? <Loader2 size={14} className="animate-spin" /> : pwOk ? <><Check size={14} /> Contraseña actualizada</> : "Actualizar contraseña"}
                  </button>
                </div>
              )}
            </div>

            {/* Sign out row */}
            <div style={{ borderTop: "1px solid #F1F3F5" }}>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  padding: "16px 0", background: "none", border: "none", cursor: signingOut ? "default" : "pointer", fontFamily: "inherit",
                }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {signingOut ? <Loader2 size={16} style={{ color: "#EF4444" }} className="animate-spin" /> : <LogOut size={16} style={{ color: "#EF4444" }} />}
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#EF4444", margin: 0 }}>Cerrar sesión</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Salir de tu cuenta</p>
                </div>
              </button>
            </div>

          </div>
        )}

        {/* ── Notificaciones tab ── */}
        {tab === "notificaciones" && (
          <NotificacionesTab />
        )}

      </div>
    </div>
  );
}

// ── Notifications tab ─────────────────────────────────────────────────────────

function NotificacionesTab() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [subscribing, setSubscribing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("Notification" in window)) { setPermission("unsupported"); return; }
    setPermission(Notification.permission);
  }, []);

  async function requestPermission() {
    if (!("Notification" in window)) return;
    setSubscribing(true);
    setMsg(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        setMsg("Notificaciones activadas correctamente.");
      } else if (result === "denied") {
        setMsg("Bloqueaste las notificaciones. Cámbialas desde la configuración del navegador.");
      }
    } finally {
      setSubscribing(false);
    }
  }

  const stateInfo = {
    granted:     { label: "Activadas",  color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
    denied:      { label: "Bloqueadas", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
    default:     { label: "Sin configurar", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    unsupported: { label: "No disponible", color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
  }[permission];

  return (
    <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ padding: "16px 20px", background: stateInfo.bg, border: `1px solid ${stateInfo.border}`, borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={18} style={{ color: stateInfo.color }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>Notificaciones push</p>
              <p style={{ fontSize: 11, margin: "2px 0 0", color: stateInfo.color, fontWeight: 600 }}>{stateInfo.label}</p>
            </div>
          </div>
          {permission !== "granted" && permission !== "unsupported" && (
            <button
              type="button"
              onClick={requestPermission}
              disabled={subscribing}
              style={{
                height: 32, padding: "0 14px",
                border: "none", borderRadius: 6,
                background: "#273D88", color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: subscribing ? "default" : "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {subscribing ? <Loader2 size={12} className="animate-spin" /> : null}
              Activar
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p style={{ fontSize: 12.5, color: permission === "granted" ? "#16A34A" : "#DC2626", margin: 0 }}>{msg}</p>
      )}

      <div style={{ borderTop: "1px solid #F1F3F5", paddingTop: 20 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14, marginTop: 0 }}>
          Qué te notificamos
        </p>
        {[
          ["Nueva orden asignada a ti", true],
          ["Cambio de estado en tus órdenes", true],
          ["Comentarios en tus órdenes", true],
          ["Órdenes urgentes en el workspace", true],
        ].map(([label]) => (
          <div key={label as string} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F9FAFB" }}>
            <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>{label as string}</p>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16A34A", flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
