"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ROL_LABEL, esAdmin } from "@/lib/roles";
import {
  LogOut, KeyRound, Bell, User, Loader2, Check, Eye, EyeOff, ChevronRight,
  Pencil, Building2, Shield, MonitorSmartphone, X,
} from "lucide-react";

type Tab = "perfil" | "workspace" | "notificaciones";

const PLAN_LABEL: Record<string, string> = {
  basic:   "Basic",
  pro:     "Pro",
  empresa: "Empresa",
  trial:   "Trial",
};
const PLAN_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  basic:   { bg: "#F1F5F9", text: "#475569", border: "#CBD5E1" },
  pro:     { bg: "#EFF6FF", text: "#1E3A8A", border: "#BFDBFE" },
  empresa: { bg: "#F5F3FF", text: "#6D28D9", border: "#DDD6FE" },
  trial:   { bg: "#FFFBEB", text: "#92400E", border: "#FDE68A" },
};

const SECTORES = [
  "Manufactura", "Minería", "Construcción", "Energía", "Retail",
  "Salud", "Transporte", "Educación", "Agricultura", "Otro",
];

const OFICIOS = [
  "Electricista", "Mecánico", "Técnico HVAC", "Plomero", "Soldador",
  "Instrumentista", "Operador", "Supervisor", "Ingeniero", "Otro",
];

export default function ConfiguracionPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("perfil");
  const [myId, setMyId] = useState("");
  const [myRol, setMyRol] = useState("");

  // Profile
  const [nombre, setNombre]   = useState("");
  const [email, setEmail]     = useState("");
  const [oficio, setOficio]   = useState("");
  const [cargo, setCargo]     = useState("");
  const [plan, setPlan]       = useState("");
  const [planStatus, setPlanStatus] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Inline name edit
  const [editingNombre, setEditingNombre] = useState(false);
  const [nombreDraft, setNombreDraft]     = useState("");
  const [savingNombre, setSavingNombre]   = useState(false);
  const nombreInputRef = useRef<HTMLInputElement>(null);

  // Oficio / cargo edit
  const [savingOficio, setSavingOficio] = useState(false);
  const [oficioSaved, setOficioSaved]   = useState(false);

  // Password change
  const [pwOpen, setPwOpen]       = useState(false);
  const [pwNueva, setPwNueva]     = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwError, setPwError]     = useState<string | null>(null);
  const [pwOk, setPwOk]           = useState(false);

  // Sign out
  const [signingOut, setSigningOut]         = useState(false);
  const [signingOutAll, setSigningOutAll]   = useState(false);
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);

  // Workspace edit (admin/owner only)
  const [ws, setWs]               = useState({ nombre: "", sector: "", region: "" });
  const [wsDraft, setWsDraft]     = useState({ nombre: "", sector: "", region: "" });
  const [editingWs, setEditingWs] = useState(false);
  const [savingWs, setSavingWs]   = useState(false);
  const [wsSaved, setWsSaved]     = useState(false);
  const [loadingWs, setLoadingWs] = useState(false);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setEmail(user.email ?? "");

      const { data: perfil } = await sb
        .from("usuarios")
        .select("nombre, rol, oficio, cargo, plan, plan_status, workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      setMyId(user.id);
      setNombre(perfil?.nombre ?? "");
      setNombreDraft(perfil?.nombre ?? "");
      setMyRol(perfil?.rol ?? "");
      setOficio(perfil?.oficio ?? "");
      setCargo(perfil?.cargo ?? "");
      setPlan(perfil?.plan ?? "");
      setPlanStatus(perfil?.plan_status ?? "");
      setWorkspaceId(perfil?.workspace_id ?? "");
      setLoadingProfile(false);
    }
    load();
  }, [router]);

  useEffect(() => {
    if (tab !== "workspace" || !workspaceId) return;
    setLoadingWs(true);
    const sb = createClient();
    sb.from("workspaces").select("nombre, sector, region").eq("id", workspaceId).maybeSingle()
      .then(({ data }) => {
        const d = { nombre: data?.nombre ?? "", sector: data?.sector ?? "", region: data?.region ?? "" };
        setWs(d);
        setWsDraft(d);
        setLoadingWs(false);
      });
  }, [tab, workspaceId]);

  useEffect(() => {
    if (editingNombre) nombreInputRef.current?.focus();
  }, [editingNombre]);

  async function saveNombre() {
    if (!nombreDraft.trim() || nombreDraft === nombre) { setEditingNombre(false); return; }
    setSavingNombre(true);
    const sb = createClient();
    await sb.from("usuarios").update({ nombre: nombreDraft.trim() }).eq("id", myId);
    setNombre(nombreDraft.trim());
    setSavingNombre(false);
    setEditingNombre(false);
  }

  async function saveOficio() {
    setSavingOficio(true);
    const sb = createClient();
    await sb.from("usuarios").update({ oficio, cargo }).eq("id", myId);
    setSavingOficio(false);
    setOficioSaved(true);
    setTimeout(() => setOficioSaved(false), 2000);
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
      setPwNueva(""); setPwConfirm("");
      setTimeout(() => { setPwOk(false); setPwOpen(false); }, 2000);
    } finally {
      setPwSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    const sb = createClient();
    await sb.auth.signOut();
    router.replace("/login");
  }

  async function handleSignOutAll() {
    setSigningOutAll(true);
    const sb = createClient();
    await sb.auth.signOut({ scope: "global" });
    router.replace("/login");
  }

  async function saveWorkspace() {
    if (!workspaceId) return;
    setSavingWs(true);
    const sb = createClient();
    await sb.from("workspaces").update(wsDraft).eq("id", workspaceId);
    setWs(wsDraft);
    setSavingWs(false);
    setWsSaved(true);
    setEditingWs(false);
    setTimeout(() => setWsSaved(false), 2500);
  }

  const planInfo = PLAN_COLOR[plan] ?? PLAN_COLOR.basic;
  const initials = nombre
    ? nombre.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase()
    : null;

  if (loadingProfile) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 8, color: "#9CA3AF" }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando…</span>
      </div>
    );
  }

  const tabs: [Tab, string][] = [
    ["perfil", "Perfil"],
    ...(esAdmin(myRol) ? [["workspace", "Workspace"] as [Tab, string]] : []),
    ["notificaciones", "Notificaciones"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "#F8FAFC" }}>

      {/* Header */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", padding: "0 24px", height: 56, display: "flex", alignItems: "center", background: "#fff" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: 0, letterSpacing: "-0.3px" }}>Configuración</h1>
      </div>

      {/* Tabs */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", padding: "0 24px", display: "flex", gap: 0, background: "#fff" }}>
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              height: 40, padding: "0 16px",
              background: "none", border: "none",
              borderBottom: tab === key ? "2px solid #1E3A8A" : "2px solid transparent",
              color: tab === key ? "#1E3A8A" : "#9CA3AF",
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
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px" }}>

        {/* ── Perfil tab ── */}
        {tab === "perfil" && (
          <div style={{ maxWidth: 500, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Avatar + name card */}
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: "20px 20px 16px", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, #1E3A8A, #2563EB)",
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, fontWeight: 700,
                }}>
                  {initials ?? <User size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingNombre ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        ref={nombreInputRef}
                        value={nombreDraft}
                        onChange={e => setNombreDraft(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveNombre(); if (e.key === "Escape") { setEditingNombre(false); setNombreDraft(nombre); } }}
                        style={{
                          flex: 1, height: 34, padding: "0 10px",
                          border: "1px solid #2563EB", borderRadius: 6,
                          fontSize: 14, fontWeight: 600, color: "#111827",
                          outline: "none", fontFamily: "inherit",
                          boxShadow: "0 0 0 3px rgba(37,99,235,0.12)",
                        }}
                      />
                      <button type="button" onClick={saveNombre} disabled={savingNombre}
                        style={{ width: 32, height: 32, border: "none", borderRadius: 6, background: "#1E3A8A", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {savingNombre ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button type="button" onClick={() => { setEditingNombre(false); setNombreDraft(nombre); }}
                        style={{ width: 32, height: 32, border: "1px solid #E2E8F0", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#9CA3AF" }}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: 0 }}>{nombre || "—"}</p>
                      <button type="button" onClick={() => { setNombreDraft(nombre); setEditingNombre(true); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex", padding: 2 }}>
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: "#64748B", margin: "3px 0 0" }}>{email}</p>
                  {myRol && (
                    <span style={{
                      display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600,
                      padding: "2px 8px", borderRadius: 20,
                      background: "#EFF6FF", color: "#1E3A8A",
                    }}>
                      {(ROL_LABEL as Record<string, string>)[myRol] ?? myRol}
                    </span>
                  )}
                </div>
                {plan && (
                  <span style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 700,
                    padding: "3px 9px", borderRadius: 20,
                    background: planInfo.bg, color: planInfo.text,
                    border: `1px solid ${planInfo.border}`,
                  }}>
                    {PLAN_LABEL[plan] ?? plan}
                  </span>
                )}
              </div>
            </div>

            {/* Oficio / cargo card */}
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#64748B", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tu perfil profesional</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Oficio</label>
                  <select
                    value={oficio}
                    onChange={e => setOficio(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="">Sin especificar</option>
                    {OFICIOS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Cargo</label>
                  <input
                    value={cargo}
                    onChange={e => setCargo(e.target.value)}
                    placeholder="Ej. Jefe de mantención"
                    style={inputStyle}
                    onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>
                <button
                  type="button"
                  onClick={saveOficio}
                  disabled={savingOficio || oficioSaved}
                  style={{
                    height: 38, border: "none", borderRadius: 8,
                    background: oficioSaved ? "#10B981" : "#1E3A8A",
                    color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: savingOficio || oficioSaved ? "default" : "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    transition: "background 0.2s",
                  }}
                >
                  {savingOficio ? <Loader2 size={13} className="animate-spin" /> : oficioSaved ? <><Check size={13} /> Guardado</> : "Guardar cambios"}
                </button>
              </div>
            </div>

            {/* Security card */}
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
              <div style={{ padding: "14px 20px 0", borderBottom: "1px solid #F1F5F9" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#64748B", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Seguridad</p>
              </div>

              {/* Change password row */}
              <div style={{ borderBottom: "1px solid #F1F5F9" }}>
                <button
                  type="button"
                  onClick={() => { setPwOpen(v => !v); setPwError(null); setPwOk(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 20px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <KeyRound size={15} style={{ color: "#64748B" }} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>Cambiar contraseña</p>
                      <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>Actualiza tu contraseña de acceso</p>
                    </div>
                  </div>
                  <ChevronRight size={15} style={{ color: "#CBD5E1", transform: pwOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                </button>

                {pwOpen && (
                  <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {(["Nueva contraseña", "Confirmar contraseña"] as const).map((label, i) => (
                      <div key={label}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>{label}</label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showPw ? "text" : "password"}
                            placeholder="Mínimo 8 caracteres"
                            value={i === 0 ? pwNueva : pwConfirm}
                            onChange={e => i === 0 ? setPwNueva(e.target.value) : setPwConfirm(e.target.value)}
                            style={{ ...inputStyle, paddingRight: i === 0 ? 36 : 12 }}
                            onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)"; }}
                            onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
                          />
                          {i === 0 && (
                            <button type="button" onClick={() => setShowPw(v => !v)}
                              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex" }}>
                              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {pwError && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{pwError}</p>}
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      disabled={pwSaving || pwOk}
                      style={{
                        height: 38, border: "none", borderRadius: 8,
                        background: pwOk ? "#10B981" : "#1E3A8A",
                        color: "#fff", fontSize: 13, fontWeight: 600,
                        cursor: pwSaving || pwOk ? "default" : "pointer",
                        fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        transition: "background 0.2s",
                      }}
                    >
                      {pwSaving ? <Loader2 size={13} className="animate-spin" /> : pwOk ? <><Check size={13} /> Contraseña actualizada</> : "Actualizar contraseña"}
                    </button>
                  </div>
                )}
              </div>

              {/* Sign out all devices row */}
              <div style={{ borderBottom: "1px solid #F1F5F9" }}>
                {confirmSignOutAll ? (
                  <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>¿Cerrar sesión en todos los dispositivos? Tendrás que volver a iniciar sesión.</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={handleSignOutAll} disabled={signingOutAll}
                        style={{ flex: 1, height: 36, border: "none", borderRadius: 8, background: "#EF4444", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {signingOutAll ? <Loader2 size={13} className="animate-spin" /> : "Sí, cerrar todo"}
                      </button>
                      <button type="button" onClick={() => setConfirmSignOutAll(false)}
                        style={{ flex: 1, height: 36, border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmSignOutAll(true)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <MonitorSmartphone size={15} style={{ color: "#64748B" }} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>Cerrar en todos los dispositivos</p>
                      <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>Invalida todas las sesiones activas</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Sign out row */}
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", background: "none", border: "none", cursor: signingOut ? "default" : "pointer", fontFamily: "inherit" }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {signingOut ? <Loader2 size={15} style={{ color: "#EF4444" }} className="animate-spin" /> : <LogOut size={15} style={{ color: "#EF4444" }} />}
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#EF4444", margin: 0 }}>Cerrar sesión</p>
                  <p style={{ fontSize: 11, color: "#94A3B8", margin: 0 }}>Salir de esta sesión</p>
                </div>
              </button>
            </div>

          </div>
        )}

        {/* ── Workspace tab ── */}
        {tab === "workspace" && esAdmin(myRol) && (
          <div style={{ maxWidth: 500, display: "flex", flexDirection: "column", gap: 20 }}>
            {loadingWs ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#94A3B8", padding: "20px 0" }}>
                <Loader2 size={16} className="animate-spin" />
                <span style={{ fontSize: 13 }}>Cargando…</span>
              </div>
            ) : (
              <>
                {/* Workspace info card */}
                <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#64748B", margin: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Información del workspace</p>
                    {!editingWs && (
                      <button type="button" onClick={() => { setWsDraft(ws); setEditingWs(true); }}
                        style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 10px", border: "1px solid #E2E8F0", borderRadius: 6, background: "#fff", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", fontFamily: "inherit" }}>
                        <Pencil size={12} /> Editar
                      </button>
                    )}
                  </div>

                  {editingWs ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Nombre del workspace</label>
                        <input
                          value={wsDraft.nombre}
                          onChange={e => setWsDraft(d => ({ ...d, nombre: e.target.value }))}
                          placeholder="Ej. Planta Norte"
                          style={inputStyle}
                          onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Sector</label>
                        <select value={wsDraft.sector} onChange={e => setWsDraft(d => ({ ...d, sector: e.target.value }))} style={selectStyle}>
                          <option value="">Sin especificar</option>
                          {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 }}>Región / Ciudad</label>
                        <input
                          value={wsDraft.region}
                          onChange={e => setWsDraft(d => ({ ...d, region: e.target.value }))}
                          placeholder="Ej. Región de Antofagasta"
                          style={inputStyle}
                          onFocus={e => { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={saveWorkspace} disabled={savingWs}
                          style={{ flex: 1, height: 38, border: "none", borderRadius: 8, background: "#1E3A8A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                          {savingWs ? <Loader2 size={13} className="animate-spin" /> : "Guardar"}
                        </button>
                        <button type="button" onClick={() => { setEditingWs(false); setWsDraft(ws); }}
                          style={{ flex: 1, height: 38, border: "1px solid #E2E8F0", borderRadius: 8, background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {wsSaved && (
                        <div style={{ padding: "8px 12px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8, fontSize: 12, color: "#065F46", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          <Check size={13} /> Cambios guardados
                        </div>
                      )}
                      <InfoRow icon={<Building2 size={14} />} label="Nombre" value={ws.nombre || "—"} />
                      <InfoRow icon={<Shield size={14} />} label="Sector" value={ws.sector || "—"} />
                      <InfoRow label="Región" value={ws.region || "—"} />
                    </div>
                  )}
                </div>

                {/* Plan card */}
                {plan && (
                  <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#64748B", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Plan activo</p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: 0 }}>{PLAN_LABEL[plan] ?? plan}</p>
                        <p style={{ fontSize: 12, color: "#64748B", margin: "3px 0 0" }}>
                          {planStatus === "active" ? "Activo" : planStatus === "paused" ? "Pausado" : planStatus === "cancelled" ? "Cancelado" : planStatus || "—"}
                        </p>
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
                        background: planInfo.bg, color: planInfo.text, border: `1px solid ${planInfo.border}`,
                      }}>
                        {PLAN_LABEL[plan] ?? plan}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
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

// ── Shared sub-components ────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {icon && <span style={{ color: "#94A3B8", flexShrink: 0 }}>{icon}</span>}
      <span style={{ fontSize: 12, color: "#94A3B8", minWidth: 70 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ── Notifications tab ────────────────────────────────────────────────────────

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
    granted:     { label: "Activadas",       color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
    denied:      { label: "Bloqueadas",      color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
    default:     { label: "Sin configurar",  color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
    unsupported: { label: "No disponible",   color: "#6B7280", bg: "#F9FAFB", border: "#E2E8F0" },
  }[permission];

  return (
    <div style={{ maxWidth: 500, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
        <div style={{ padding: "16px 20px", background: stateInfo.bg, borderBottom: `1px solid ${stateInfo.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                background: "#1E3A8A", color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: subscribing ? "default" : "pointer",
                fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
              }}
            >
              {subscribing ? <Loader2 size={12} className="animate-spin" /> : null}
              Activar
            </button>
          )}
        </div>

        <div style={{ padding: "4px 0" }}>
          <div style={{ padding: "8px 20px 4px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
              Te notificamos cuando
            </p>
          </div>
          {[
            "Se te asigna una orden de trabajo",
            "Una orden que te asignaron cambia de estado",
            "Hay comentarios en tus órdenes",
            "Se crea una orden urgente en el workspace",
          ].map((label) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 20px", borderBottom: "1px solid #F8FAFC" }}>
              <p style={{ fontSize: 13, color: "#374151", margin: 0 }}>{label}</p>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <p style={{ fontSize: 12.5, color: permission === "granted" ? "#16A34A" : "#DC2626", margin: 0 }}>{msg}</p>
      )}
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: "1px solid #E2E8F0", borderRadius: 8,
  fontSize: 13, color: "#111827", outline: "none",
  fontFamily: "inherit", background: "#fff",
  boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 32,
};
