"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ROL_LABEL, esAdmin } from "@/lib/roles";
import {
  LogOut, KeyRound, Bell, User, Loader2, Check, Eye, EyeOff, ChevronRight,
  Pencil, MonitorSmartphone, X, ImagePlus, Trash2,
} from "lucide-react";

export type ConfiguracionSection = "perfil" | "workspace" | "notificaciones" | "apariencia";
type Tab = ConfiguracionSection;
type ThemePref = "light" | "auto" | "dark";

function setTheme(pref: ThemePref) {
  localStorage.setItem("pangui_theme", pref);
  const resolved = pref === "auto"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : pref;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-pref", pref);
  root.style.colorScheme = resolved;
  root.style.backgroundColor = resolved === "dark" ? "#0B1220" : "#F7F8FA";
}

const PLAN_LABEL: Record<string, string> = {
  basic:   "Basic",
  pro:     "Pro",
  empresa: "Empresa",
  trial:   "Trial",
};

// Debe coincidir con app/registro/page.js: el registro guarda el slug
// ("facilities"), no la etiqueta. Con dos listas distintas el select aparecía
// vacío para workspaces existentes y al editar cualquier campo se pisaba el
// slug con un texto que el resto del sistema no reconoce.
const SECTORES = [
  { value: "mineria",      label: "Minería" },
  { value: "facilities",   label: "Facilities / Universidades / Hospitales" },
  { value: "industria",    label: "Industria manufacturera" },
  { value: "construccion", label: "Construcción" },
  { value: "puertos",      label: "Puertos y logística" },
  { value: "agro",         label: "Agricultura" },
  { value: "otro",         label: "Otro" },
];

const SECTION_TITLES: Record<ConfiguracionSection, string> = {
  perfil: "Mi cuenta",
  workspace: "Espacio de trabajo",
  notificaciones: "Preferencias de notificaciones",
  apariencia: "Apariencia",
};


export default function ConfiguracionPage({ section }: { section?: ConfiguracionSection }) {
  const router = useRouter();
  const tab: Tab = section ?? "perfil";
  const [themePref, setThemePref] = useState<ThemePref>("auto");
  const [myId, setMyId] = useState("");
  const [myRol, setMyRol] = useState("");

  // Profile
  const [nombre, setNombre]   = useState("");
  const [email, setEmail]     = useState("");
  // Oficio/cargo are normalised catalog rows (`oficios` / `cargos`), selected by
  // id — the same model the mobile app writes. The legacy free-text
  // usuarios.oficio / usuarios.cargo columns are intentionally NOT written here:
  // web used to save strings into them, which is how some users ended up with a
  // cargo text that disagreed with their cargo_id.
  const [oficioId, setOficioId] = useState<string | null>(null);
  const [cargoId, setCargoId]   = useState<string | null>(null);
  const [oficios, setOficios]   = useState<{ id: string; nombre: string }[]>([]);
  const [cargos, setCargos]     = useState<{ id: string; nombre: string }[]>([]);
  const [plan, setPlan]       = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Inline name edit
  const [editingNombre, setEditingNombre] = useState(false);
  const [nombreDraft, setNombreDraft]     = useState("");
  const [savingNombre, setSavingNombre]   = useState(false);
  const nombreInputRef = useRef<HTMLInputElement>(null);

  // Which profile field is currently being saved (cards save on change).
  const [savingField, setSavingField] = useState<"oficio" | "cargo" | null>(null);

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

  // Workspace logo
  const [logoUrl, setLogoUrl]       = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoSaved, setLogoSaved]   = useState(false);
  const [logoError, setLogoError]   = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Workspace edit (admin/owner only)
  const [ws, setWs]               = useState({ nombre: "", sector: "", region: "" });
  // Per-field editing (mirrors the Mi Cuenta cards): text fields open an
  // inline input; the sector select saves on change.
  const [wsEditField, setWsEditField]   = useState<"nombre" | "region" | null>(null);
  const [wsFieldDraft, setWsFieldDraft] = useState("");
  const [savingWsField, setSavingWsField] = useState<string | null>(null);
  const [loadingWs, setLoadingWs] = useState(false);

  useEffect(() => {
    if (!section) router.replace("/mi-cuenta");
  }, [router, section]);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setEmail(user.email ?? "");

      const { data: perfil } = await sb
        .from("usuarios")
        .select("nombre, rol, oficio_id, cargo_id, plan, plan_status, workspace_id, created_at")
        .eq("id", user.id)
        .maybeSingle();

      setMyId(user.id);
      setNombre(perfil?.nombre ?? "");
      setNombreDraft(perfil?.nombre ?? "");
      setMyRol(perfil?.rol ?? "");
      setOficioId(perfil?.oficio_id ?? null);
      setCargoId(perfil?.cargo_id ?? null);
      setPlan(perfil?.plan ?? "");
      setWorkspaceId(perfil?.workspace_id ?? "");
      setMemberSince(
        perfil?.created_at
          ? new Date(perfil.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })
          : "",
      );
      setLoadingProfile(false);

      // Catalogs: global rows (workspace_id null) plus any this workspace added.
      // Mirrors fetchOficios/fetchCargos in the mobile app so both clients offer
      // exactly the same options.
      const ws = perfil?.workspace_id;
      if (ws) {
        const [{ data: ofs }, { data: cgs }] = await Promise.all([
          sb.from("oficios")
            .select("id, nombre")
            .or(`workspace_id.is.null,workspace_id.eq.${ws}`)
            .eq("activo", true)
            .order("nombre"),
          sb.from("cargos")
            .select("id, nombre")
            .or(`workspace_id.is.null,workspace_id.eq.${ws}`)
            .eq("activo", true)
            .order("nivel")
            .order("nombre"),
        ]);
        setOficios(ofs ?? []);
        setCargos(cgs ?? []);
      }
    }
    load();
  }, [router]);

  useEffect(() => {
    if (tab !== "workspace" || !workspaceId) return;
    setLoadingWs(true);
    const sb = createClient();
    sb.from("workspaces").select("nombre, sector, region, logo_url").eq("id", workspaceId).maybeSingle()
      .then(({ data }) => {
        const d = { nombre: data?.nombre ?? "", sector: data?.sector ?? "", region: data?.region ?? "" };
        setWs(d);
        setLogoUrl((data as any)?.logo_url ?? null);
        setLoadingWs(false);
      });
  }, [tab, workspaceId]);

  useEffect(() => {
    if (editingNombre) nombreInputRef.current?.focus();
  }, [editingNombre]);

  useEffect(() => {
    const stored = (localStorage.getItem("pangui_theme") as ThemePref | null) ?? "auto";
    setThemePref(stored);
  }, []);

  async function saveNombre() {
    if (!nombreDraft.trim() || nombreDraft === nombre) { setEditingNombre(false); return; }
    setSavingNombre(true);
    const sb = createClient();
    await sb.from("usuarios").update({ nombre: nombreDraft.trim() }).eq("id", myId);
    setNombre(nombreDraft.trim());
    setSavingNombre(false);
    setEditingNombre(false);
  }

  /**
   * Saves a single profile column immediately, so each card stands on its own
   * without a shared "Guardar cambios" step.
   *
   * IDs only — same as updateUsuarioOficio/updateUsuarioCargo on mobile. The
   * legacy text columns are deliberately not dual-written; that is what let the
   * two representations drift apart in the first place.
   */
  async function saveProfileField(column: "oficio_id" | "cargo_id", value: string | null) {
    const isOficio = column === "oficio_id";
    setSavingField(isOficio ? "oficio" : "cargo");

    // Dual-write id + legacy text, matching the mobile member screen
    // (app/(stack)/usuario/[id].tsx) and /usuarios/[id] on web. Writing only the
    // id would leave usuarios.cargo / usuarios.oficio stale for anything still
    // reading those columns.
    const list = isOficio ? oficios : cargos;
    const nombre = list.find(item => item.id === value)?.nombre ?? null;
    const textColumn = isOficio ? "oficio" : "cargo";

    const sb = createClient();
    await sb.from("usuarios")
      .update({ [column]: value, [textColumn]: nombre })
      .eq("id", myId);
    setSavingField(null);
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

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    if (file.size > 2 * 1024 * 1024) { setLogoError("El archivo no puede superar 2 MB."); return; }
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const sb = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${workspaceId}/logo.${ext}`;
      const { error: upErr } = await sb.storage.from("workspace-logos").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = sb.storage.from("workspace-logos").getPublicUrl(path);
      const urlWithBust = `${publicUrl}?t=${Date.now()}`;
      await sb.from("workspaces").update({ logo_url: urlWithBust }).eq("id", workspaceId);
      setLogoUrl(urlWithBust);
      setLogoSaved(true);
      setTimeout(() => setLogoSaved(false), 2500);
    } catch (err: unknown) {
      setLogoError(err instanceof Error ? err.message : "Error al subir el logo.");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }

  async function handleLogoDelete() {
    if (!workspaceId) return;
    setUploadingLogo(true);
    try {
      const sb = createClient();
      await sb.from("workspaces").update({ logo_url: null }).eq("id", workspaceId);
      setLogoUrl(null);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveWsField(field: "nombre" | "sector" | "region", value: string) {
    if (!workspaceId) return;
    setSavingWsField(field);
    const sb = createClient();
    await sb.from("workspaces").update({ [field]: value }).eq("id", workspaceId);
    setWs(w => ({ ...w, [field]: value }));
    setSavingWsField(null);
    setWsEditField(null);
  }

  const initials = nombre
    ? nombre.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase()
    : null;

  if (loadingProfile) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 8, color: "var(--fg-4)" }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando…</span>
      </div>
    );
  }

  if (!section) return null;

  return (
    // No height/overflow here: the app shell already owns the scroll container.
    // Pinning 100dvh + overflowY:auto created a second scrollbar nested inside
    // the layout's own.
    <div style={{ background: "var(--surface-canvas)" }}>

      {/* Body */}
      <div style={{ padding: "32px 24px 64px" }}>

        {/* ── Page header: title, identity line, section tabs ── */}
        <div style={{ maxWidth: 720, margin: "0 auto 26px" }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, color: "var(--fg-1)", margin: 0, letterSpacing: "-0.02em" }}>
            {SECTION_TITLES[tab]}
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--fg-3)", margin: "6px 0 0" }}>
            {email}{memberSince ? ` · Miembro desde ${memberSince}` : ""}
          </p>
        </div>

        {/* ── Perfil tab ── */}
        {tab === "perfil" && (
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Nombre — same card shape as every other setting. Inline edit
                saves on confirm; the avatar/plan/role chips live here too. */}
            <SettingCard
              label="Nombre"
              hint={`${(ROL_LABEL as Record<string, string>)[myRol] ?? myRol ?? ""}${plan ? ` · Plan ${PLAN_LABEL[plan] ?? plan}` : ""}`}
            >
              {editingNombre ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    ref={nombreInputRef}
                    value={nombreDraft}
                    onChange={e => setNombreDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveNombre(); if (e.key === "Escape") { setEditingNombre(false); setNombreDraft(nombre); } }}
                    style={{ ...inputStyle, width: 200 }}
                  />
                  <button type="button" onClick={saveNombre} disabled={savingNombre}
                    style={{ width: 34, height: 34, border: "none", borderRadius: "var(--r-sm)", background: "var(--brand)", color: "var(--fg-on-brand)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {savingNombre ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button type="button" onClick={() => { setEditingNombre(false); setNombreDraft(nombre); }}
                    style={{ width: 34, height: 34, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--fg-4)" }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{
                    width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                    color: "var(--fg-on-brand)", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                  }}>
                    {initials ?? <User size={16} />}
                  </span>
                  <span style={{ fontSize: 13.5, color: "var(--fg-2)" }}>{nombre || "—"}</span>
                  <button type="button" onClick={() => { setNombreDraft(nombre); setEditingNombre(true); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 4 }}>
                    <Pencil size={14} />
                  </button>
                </div>
              )}
            </SettingCard>

            {/* One card per setting. Each control saves on change, so there is
                no "Guardar cambios" step. */}

            <SettingCard label="Correo" hint="Tu correo de acceso, no se puede cambiar aquí">
              <span style={{ fontSize: 13.5, color: "var(--fg-2)" }}>{email}</span>
            </SettingCard>

            <SettingCard label="Apariencia" hint="Cómo se ve Pangui en este dispositivo">
              <select
                value={themePref}
                onChange={e => { const p = e.target.value as ThemePref; setTheme(p); setThemePref(p); }}
                style={{ ...selectStyle, width: 200 }}
              >
                {THEME_OPTIONS.map(({ pref, label }) => (
                  <option key={pref} value={pref}>{label}</option>
                ))}
              </select>
            </SettingCard>

            <SettingCard label="Oficio" hint="La especialidad con la que trabajas" saving={savingField === "oficio"}>
              <select
                value={oficioId ?? ""}
                onChange={e => { const v = e.target.value || null; setOficioId(v); void saveProfileField("oficio_id", v); }}
                style={{ ...selectStyle, width: 200 }}
              >
                <option value="">Sin especificar</option>
                {oficios.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
              </select>
            </SettingCard>

            <SettingCard label="Cargo" hint="Tu rol dentro del equipo" saving={savingField === "cargo"}>
              <select
                value={cargoId ?? ""}
                onChange={e => { const v = e.target.value || null; setCargoId(v); void saveProfileField("cargo_id", v); }}
                style={{ ...selectStyle, width: 200 }}
              >
                <option value="">Sin especificar</option>
                {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </SettingCard>

            {/* Security card */}
            <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
              <div style={{ padding: "14px 20px 0", borderBottom: "1px solid #F1F5F9" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-2)", margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Seguridad</p>
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
                    <div style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <KeyRound size={15} style={{ color: "var(--fg-2)" }} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", margin: 0 }}>Cambiar contraseña</p>
                      <p style={{ fontSize: 11, color: "var(--fg-4)", margin: 0 }}>Actualiza tu contraseña de acceso</p>
                    </div>
                  </div>
                  <ChevronRight size={15} style={{ color: "var(--border-strong)", transform: pwOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                </button>

                {pwOpen && (
                  <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {(["Nueva contraseña", "Confirmar contraseña"] as const).map((label, i) => (
                      <div key={label}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-1)", display: "block", marginBottom: 5 }}>{label}</label>
                        <div style={{ position: "relative" }}>
                          <input
                            type={showPw ? "text" : "password"}
                            placeholder="Mínimo 8 caracteres"
                            value={i === 0 ? pwNueva : pwConfirm}
                            onChange={e => i === 0 ? setPwNueva(e.target.value) : setPwConfirm(e.target.value)}
                            style={{ ...inputStyle, paddingRight: i === 0 ? 36 : 12 }}
                            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37,99,235,0.12)"; }}
                            onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                          />
                          {i === 0 && (
                            <button type="button" onClick={() => setShowPw(v => !v)}
                              style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}>
                              {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {pwError && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{pwError}</p>}
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      disabled={pwSaving || pwOk}
                      style={{
                        height: 38, border: "none", borderRadius: "var(--r-md)",
                        background: pwOk ? "var(--success)" : "var(--brand)",
                        color: "var(--surface-1)", fontSize: 13, fontWeight: 600,
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
                    <p style={{ fontSize: 13, color: "var(--fg-1)", margin: 0 }}>¿Cerrar sesión en todos los dispositivos? Tendrás que volver a iniciar sesión.</p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={handleSignOutAll} disabled={signingOutAll}
                        style={{ flex: 1, height: 36, border: "none", borderRadius: "var(--r-md)", background: "var(--danger)", color: "var(--surface-1)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        {signingOutAll ? <Loader2 size={13} className="animate-spin" /> : "Sí, cerrar todo"}
                      </button>
                      <button type="button" onClick={() => setConfirmSignOutAll(false)}
                        style={{ flex: 1, height: 36, border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmSignOutAll(true)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                    <div style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <MonitorSmartphone size={15} style={{ color: "var(--fg-2)" }} />
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", margin: 0 }}>Cerrar en todos los dispositivos</p>
                      <p style={{ fontSize: 11, color: "var(--fg-4)", margin: 0 }}>Invalida todas las sesiones activas</p>
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
                <div style={{ width: 34, height: 34, borderRadius: "var(--r-md)", background: "var(--danger-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {signingOut ? <Loader2 size={15} style={{ color: "var(--danger)" }} className="animate-spin" /> : <LogOut size={15} style={{ color: "var(--danger)" }} />}
                </div>
                <div style={{ textAlign: "left" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)", margin: 0 }}>Cerrar sesión</p>
                  <p style={{ fontSize: 11, color: "var(--fg-4)", margin: 0 }}>Salir de esta sesión</p>
                </div>
              </button>
            </div>

          </div>
        )}

        {/* ── Workspace tab ── */}
        {tab === "workspace" && esAdmin(myRol) && (
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
            {loadingWs ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--fg-4)", padding: "20px 0" }}>
                <Loader2 size={16} className="animate-spin" />
                <span style={{ fontSize: 13 }}>Cargando…</span>
              </div>
            ) : (
              <>
                {/* One card per setting, mirroring the Mi Cuenta tab. Text
                    fields edit inline; the sector select saves on change. */}
                {(["nombre", "region"] as const).map(field => {
                  const meta = field === "nombre"
                    ? { label: "Nombre del workspace", hint: "Cómo se identifica tu empresa en Pangui", placeholder: "Ej. Planta Norte" }
                    : { label: "Región / Ciudad", hint: "Dónde opera tu equipo", placeholder: "Ej. Región de Antofagasta" };
                  return (
                    <SettingCard key={field} label={meta.label} hint={meta.hint} saving={savingWsField === field}>
                      {wsEditField === field ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            autoFocus
                            value={wsFieldDraft}
                            placeholder={meta.placeholder}
                            onChange={e => setWsFieldDraft(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") void saveWsField(field, wsFieldDraft.trim());
                              if (e.key === "Escape") setWsEditField(null);
                            }}
                            style={{ ...inputStyle, width: 220 }}
                          />
                          <button type="button" onClick={() => void saveWsField(field, wsFieldDraft.trim())} disabled={savingWsField === field}
                            style={{ width: 34, height: 34, border: "none", borderRadius: "var(--r-sm)", background: "var(--brand)", color: "var(--fg-on-brand)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {savingWsField === field ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                          <button type="button" onClick={() => setWsEditField(null)}
                            style={{ width: 34, height: 34, border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface-1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--fg-4)" }}>
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13.5, color: "var(--fg-2)" }}>{ws[field] || "—"}</span>
                          <button type="button" onClick={() => { setWsFieldDraft(ws[field]); setWsEditField(field); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex", padding: 4 }}>
                            <Pencil size={14} />
                          </button>
                        </div>
                      )}
                    </SettingCard>
                  );
                })}

                <SettingCard label="Sector" hint="Rubro principal de tu operación" saving={savingWsField === "sector"}>
                  <select
                    value={ws.sector}
                    onChange={e => void saveWsField("sector", e.target.value)}
                    style={{ ...selectStyle, width: 200 }}
                  >
                    <option value="">Sin especificar</option>
                    {SECTORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    {/* Valor heredado que no está en el catálogo actual: sin
                        esto el select se ve vacío y el primer cambio lo pisa. */}
                    {ws.sector && !SECTORES.some(s => s.value === ws.sector) && (
                      <option value={ws.sector}>{ws.sector}</option>
                    )}
                  </select>
                </SettingCard>

                {/* Logo card */}
                <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--fg-2)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Logo del workspace</p>
                  <p style={{ fontSize: 12, color: "var(--fg-4)", margin: "0 0 16px" }}>Aparecerá en los PDFs generados. Recomendado: PNG o SVG cuadrado, máx. 2 MB.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{
                      width: 72, height: 72, border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                      background: "var(--surface-0)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden",
                    }}>
                      {logoUrl
                        ? <img src={logoUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <ImagePlus size={24} style={{ color: "var(--border-strong)" }} />
                      }
                    </div>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        style={{ display: "none" }}
                        onChange={handleLogoUpload}
                      />
                      <button
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                        style={{
                          height: 36, padding: "0 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
                          background: "var(--surface-1)", fontSize: 12, fontWeight: 600, color: "var(--fg-1)",
                          cursor: uploadingLogo ? "default" : "pointer", fontFamily: "inherit",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        {uploadingLogo
                          ? <><Loader2 size={13} className="animate-spin" /> Subiendo…</>
                          : logoSaved
                          ? <><Check size={13} style={{ color: "var(--success)" }} /> Logo guardado</>
                          : <><ImagePlus size={13} /> {logoUrl ? "Reemplazar logo" : "Subir logo"}</>
                        }
                      </button>
                      {logoUrl && !uploadingLogo && (
                        <button
                          type="button"
                          onClick={handleLogoDelete}
                          style={{
                            height: 32, padding: "0 12px", border: "1px solid #FECACA", borderRadius: "var(--r-md)",
                            background: "var(--danger-bg)", fontSize: 12, fontWeight: 600, color: "var(--danger)",
                            cursor: "pointer", fontFamily: "inherit",
                            display: "flex", alignItems: "center", gap: 5,
                          }}
                        >
                          <Trash2 size={12} /> Eliminar logo
                        </button>
                      )}
                    </div>
                  </div>
                  {logoError && <p style={{ fontSize: 12, color: "var(--danger)", margin: "10px 0 0" }}>{logoError}</p>}
                </div>

              </>
            )}
          </div>
        )}

        {/* ── Notificaciones tab ── */}
        {tab === "notificaciones" && (
          <NotificacionesTab />
        )}

        {/* ── Apariencia tab ── */}
        {tab === "apariencia" && (
          <AparienciaTab
            themePref={themePref}
            onSelect={(pref) => { setTheme(pref); setThemePref(pref); }}
          />
        )}

      </div>
    </div>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

/**
 * One setting per card: bold label (and optional hint) on the left, its control
 * right-aligned. Cards stack with a gap rather than sharing a bordered box.
 */
function SettingCard({
  label, hint, children, saving,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  saving?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
      background: "var(--surface-1)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "20px 24px",
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--fg-1)", margin: 0 }}>{label}</p>
        {hint && <p style={{ fontSize: 13, color: "var(--fg-3)", margin: "4px 0 0" }}>{hint}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {saving && <Loader2 size={14} className="animate-spin" style={{ color: "var(--fg-4)" }} />}
        {children}
      </div>
    </div>
  );
}

// ── Notifications tab ────────────────────────────────────────────────────────

function NotificacionesTab() {
  const stateInfo = {
    label: "Activas dentro de Pangui",
    color: "var(--success)",
    bg: "var(--success-bg)",
    border: "var(--success)",
  };

  return (
    <div style={{ maxWidth: 500, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
        <div style={{ padding: "16px 20px", background: stateInfo.bg, borderBottom: `1px solid ${stateInfo.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={18} style={{ color: stateInfo.color }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", margin: 0 }}>Notificaciones web</p>
              <p style={{ fontSize: 11, margin: "2px 0 0", color: stateInfo.color, fontWeight: 600 }}>{stateInfo.label}</p>
            </div>
          </div>
        </div>

        <div style={{ padding: "4px 0" }}>
          <div style={{ padding: "8px 20px 4px" }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
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
              <p style={{ fontSize: 13, color: "var(--fg-1)", margin: 0 }}>{label}</p>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--fg-3)", margin: 0 }}>
        Las alertas del navegador fueron retiradas. En web verás notificaciones dentro de Pangui; la app móvil usa push nativo.
      </p>
    </div>
  );
}

// ── Apariencia tab ───────────────────────────────────────────────────────────

const THEME_OPTIONS: { pref: ThemePref; label: string; desc: string }[] = [
  { pref: "light", label: "Claro",   desc: "Siempre tema claro" },
  { pref: "auto",  label: "Auto",    desc: "Sigue el sistema" },
  { pref: "dark",  label: "Oscuro",  desc: "Siempre tema oscuro" },
];

function ThemePreviewTile({ pref }: { pref: ThemePref }) {
  const isDark = pref === "dark";
  const isAuto = pref === "auto";
  const bg      = isDark ? "#0f172a" : isAuto ? "linear-gradient(135deg, #fff 50%, #0f172a 50%)" : "#f8fafc";
  const sidebar = isDark ? "#1e293b" : isAuto ? "#e2e8f0" : "#f1f5f9";
  const card    = isDark ? "#1e293b" : "#fff";
  const line1   = isDark ? "#334155" : "#e2e8f0";
  const line2   = isDark ? "#1e3a8a" : "#273d88";
  return (
    <div style={{
      width: "100%", height: 72, borderRadius: "var(--r-sm)", overflow: "hidden",
      background: bg, display: "flex", position: "relative",
    }}>
      {/* mini sidebar */}
      <div style={{ width: 22, background: sidebar, flexShrink: 0, borderRight: `1px solid ${isDark ? "#334155" : "#e2e8f0"}` }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ height: 4, margin: "6px 4px 0", borderRadius: 2, background: i === 0 ? line2 : line1 }} />
        ))}
      </div>
      {/* content area */}
      <div style={{ flex: 1, padding: "6px 6px 0" }}>
        <div style={{ height: 4, borderRadius: 2, background: line2, marginBottom: 5, width: "60%" }} />
        <div style={{ background: card, borderRadius: 3, padding: "4px 5px", display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ height: 3, borderRadius: 2, background: line1, width: "80%" }} />
          <div style={{ height: 3, borderRadius: 2, background: line1, width: "55%" }} />
        </div>
      </div>
    </div>
  );
}

function AparienciaTab({ themePref, onSelect }: { themePref: ThemePref; onSelect: (p: ThemePref) => void }) {
  return (
    <div style={{ maxWidth: 500, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--fg-1)", margin: "0 0 4px" }}>Apariencia</h2>
        <p style={{ fontSize: 13, color: "var(--fg-4)", margin: 0 }}>Elige cómo se ve Pangui en este dispositivo.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {THEME_OPTIONS.map(({ pref, label, desc }) => {
          const selected = themePref === pref;
          return (
            <button
              key={pref}
              type="button"
              onClick={() => onSelect(pref)}
              style={{
                display: "flex", flexDirection: "column", gap: 8,
                padding: 10, borderRadius: "var(--r-md)",
                background: selected ? "var(--brand-tint)" : "var(--surface-1)",
                border: selected ? "2px solid var(--brand)" : "2px solid var(--border)",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <ThemePreviewTile pref={pref} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 11, color: "var(--fg-4)", margin: "2px 0 0" }}>{desc}</p>
                </div>
                {selected && (
                  <span style={{
                    width: 18, height: 18, borderRadius: "50%",
                    background: "var(--brand)", color: "var(--fg-on-brand)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: "var(--r-md)",
  fontSize: 13, color: "var(--fg-1)", outline: "none",
  fontFamily: "inherit", background: "var(--surface-1)",
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
