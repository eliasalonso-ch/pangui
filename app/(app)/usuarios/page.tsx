"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
import { ROL_LABEL, esAdmin } from "@/lib/roles";
import {
  Users, UserPlus, Shield, Wrench, Search, X, Loader2,
  ChevronRight, Zap, Settings2, HardHat, Sparkles, Wind,
  Cpu, Droplets, ShieldAlert, Flame, Paintbrush, Leaf, User,
  Lock, Check,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Usuario {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
  oficio?: string;
  created_at?: string;
  last_active?: string;
}

interface Cuadrilla {
  id: string;
  nombre: string;
  descripcion?: string;
  tipo?: string;
  icono?: string;
  color?: string;
  activo?: boolean;
}

type PanelMode = null | "view-user" | "create-user" | "view-cuadrilla" | "create-cuadrilla";

// ── Constants ──────────────────────────────────────────────────────────────────
const ROL_ICON: Record<string, React.ElementType> = {
  admin: Shield, jefe: Shield, tecnico: Wrench,
};

const OFICIOS = [
  "Electricista", "Mecánico", "Gasfíter", "Soldador",
  "Instrumentista", "Automatizador", "Pintor", "Albañil", "Jardinero / Aseo", "Otro",
];

const TIPOS_CUADRILLA = [
  { id: "electrica",       label: "Eléctrica",       icono: "Zap",        color: "#F59E0B" },
  { id: "mecanica",        label: "Mecánica",         icono: "Wrench",     color: "#3B82F6" },
  { id: "instrumentacion", label: "Instrumentación",  icono: "Settings2",  color: "#8B5CF6" },
  { id: "obra_civil",      label: "Obra civil",       icono: "HardHat",    color: "#F97316" },
  { id: "aseo",            label: "Aseo y ornato",    icono: "Sparkles",   color: "#22C55E" },
  { id: "climatizacion",   label: "Climatización",    icono: "Wind",       color: "#06B6D4" },
  { id: "automatizacion",  label: "Automatización",   icono: "Cpu",        color: "#14B8A6" },
  { id: "gasfiteria",      label: "Gasfitería",       icono: "Droplets",   color: "#60A5FA" },
  { id: "seguridad",       label: "Seguridad",        icono: "ShieldAlert",color: "#EF4444" },
  { id: "soldadura",       label: "Soldadura",        icono: "Flame",      color: "#F43F5E" },
  { id: "pintura",         label: "Pintura",          icono: "Paintbrush", color: "#EC4899" },
  { id: "paisajismo",      label: "Paisajismo",       icono: "Leaf",       color: "#16A34A" },
];

const ICON_MAP: Record<string, React.ElementType> = {
  Zap, Wrench, Settings2, HardHat, Sparkles, Wind, Cpu,
  Droplets, ShieldAlert, Flame, Paintbrush, Leaf, Users, User, Shield,
};

const MODULOS = [
  { id: "inventario", label: "Partes" },
  { id: "reportes",   label: "Reportes" },
  { id: "calendario", label: "Calendario" },
  { id: "preventivos",label: "Preventivos" },
  { id: "usuarios",   label: "Equipo" },
  { id: "activos",    label: "Activos" },
  { id: "normativa",  label: "Normativa" },
];

function DynamicIcon({ name, size = 16, ...props }: { name?: string; size?: number; [k: string]: unknown }) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Users;
  return <Icon size={size} {...props} />;
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function timeAgo(iso?: string) {
  if (!iso) return null;
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 2) return "Ahora";
  if (diff < 60) return `Hace ${diff} min`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `Hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `Hace ${d}d`;
  return formatDate(iso);
}

// ── Inline form field helpers ──────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "#9CA3AF", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 12px",
  border: "1px solid #E2E8F0", borderRadius: 6,
  fontSize: 13, fontFamily: "inherit", color: "#111827",
  background: "#fff", outline: "none", boxSizing: "border-box",
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsuariosPage() {
  const router = useRouter();
  const [plantaId, setPlantaId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myRol, setMyRol] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cuadrillas, setCuadrillas] = useState<Cuadrilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [activeTab, setActiveTab] = useState<"equipo" | "cuadrillas">("equipo");

  // Panel state
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [panelData, setPanelData] = useState<Usuario | Cuadrilla | null>(null);
  const [panelMembers, setPanelMembers] = useState<string[]>([]);

  // User form
  const [userForm, setUserForm] = useState({ nombre: "", email: "", password: "", rol: "tecnico", oficio: "" });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<{ nombre: string; email: string; password: string } | null>(null);

  // Cuadrilla form
  const [cuadrillaForm, setCuadrillaForm] = useState({ nombre: "", descripcion: "", tipo: "", icono: "", color: "" });

  // Permissions
  const [permisosOpen, setPermisosOpen] = useState(false);
  const [permMatrix, setPermMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [permLoaded, setPermLoaded] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permMsg, setPermMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setMyId(user.id);

      const { data: perfil } = await sb.from("usuarios")
        .select("workspace_id, rol").eq("id", user.id).maybeSingle();
      if (!perfil?.workspace_id) { setLoading(false); return; }
      const pId = perfil.workspace_id;
      setPlantaId(pId);
      setMyRol(perfil.rol);

      const { data: u1 } = await sb.from("usuarios")
        .select("id,nombre,rol,activo,oficio,created_at,last_active")
        .eq("workspace_id", pId).order("nombre");
      setUsuarios(u1 ?? []);

      const { data: cData } = await sb.from("cuadrillas")
        .select("*").eq("workspace_id", pId).eq("activo", true).order("nombre");
      setCuadrillas(cData ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  // ── Permissions ───────────────────────────────────────────────────────────
  async function loadPermisos() {
    if (permLoaded) { setPermisosOpen(true); return; }
    const targets = usuarios.filter(u => u.activo !== false && u.id !== myId);
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const u of targets) {
      const res = await fetch(`/api/usuarios/permisos?usuario_id=${u.id}`);
      if (res.ok) matrix[u.id] = await res.json();
      else matrix[u.id] = {};
    }
    setPermMatrix(matrix);
    setPermLoaded(true);
    setPermisosOpen(true);
  }

  async function savePermisos() {
    setPermSaving(true);
    setPermMsg(null);
    const targets = usuarios.filter(u => u.activo !== false && u.id !== myId);
    for (const u of targets) {
      await fetch("/api/usuarios/permisos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: u.id, permisos: permMatrix[u.id] ?? {} }),
      });
    }
    setPermSaving(false);
    setPermMsg("Permisos guardados.");
    setTimeout(() => setPermMsg(null), 2000);
  }

  // ── Toggle user active ────────────────────────────────────────────────────
  async function toggleActivo(usuario: Usuario) {
    const newVal = !(usuario.activo ?? true);
    const sb = createClient();
    await sb.from("usuarios").update({ activo: newVal }).eq("id", usuario.id);
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, activo: newVal } : u));
    if (panelData && (panelData as Usuario).id === usuario.id) {
      setPanelData({ ...usuario, activo: newVal });
    }
  }

  // ── Invite user ────────────────────────────────────────────────────────────
  async function inviteUser() {
    setSaveErr(null);
    if (!userForm.nombre.trim()) { setSaveErr("Ingresa el nombre."); return; }
    if (!userForm.email.trim()) { setSaveErr("Ingresa el email."); return; }
    if (userForm.password.length < 8) { setSaveErr("La contraseña debe tener al menos 8 caracteres."); return; }
    setSaving(true);
    const res = await callEdge("invitar", {
      nombre: userForm.nombre.trim(),
      email: userForm.email.trim(),
      password: userForm.password,
      rol: userForm.rol,
      workspace_id: plantaId,
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveErr(body.error ?? "Error al crear el usuario."); return; }
    setInviteOk({ nombre: userForm.nombre.trim(), email: userForm.email.trim(), password: userForm.password });
    const sb = createClient();
    const { data: u1 } = await sb.from("usuarios")
      .select("id,nombre,rol,activo,oficio,created_at,last_active")
      .eq("workspace_id", plantaId).order("nombre");
    setUsuarios(u1 ?? []);
  }

  // ── Open panels ────────────────────────────────────────────────────────────
  function openUser(u: Usuario) {
    setPanelData(u);
    setPanelMode("view-user");
    setSaveErr(null);
    setInviteOk(null);
  }

  function openCreateUser() {
    setUserForm({ nombre: "", email: "", password: "", rol: "tecnico", oficio: "" });
    setPanelData(null);
    setPanelMode("create-user");
    setSaveErr(null);
    setInviteOk(null);
  }

  async function openCuadrilla(c: Cuadrilla) {
    setPanelData(c);
    setCuadrillaForm({
      nombre: c.nombre ?? "",
      descripcion: c.descripcion ?? "",
      tipo: c.tipo ?? "",
      icono: c.icono ?? "",
      color: c.color ?? "",
    });
    setSaveErr(null);
    const sb = createClient();
    const { data } = await sb.from("cuadrilla_usuarios").select("usuario_id").eq("cuadrilla_id", c.id);
    setPanelMembers((data ?? []).map((r: { usuario_id: string }) => r.usuario_id));
    setPanelMode("view-cuadrilla");
  }

  function openCreateCuadrilla() {
    setPanelData(null);
    setCuadrillaForm({ nombre: "", descripcion: "", tipo: "", icono: "", color: "" });
    setPanelMembers([]);
    setSaveErr(null);
    setPanelMode("create-cuadrilla");
  }

  function closePanel() {
    setPanelMode(null);
    setPanelData(null);
    setInviteOk(null);
    setSaveErr(null);
  }

  // ── Save cuadrilla ─────────────────────────────────────────────────────────
  async function saveCuadrilla() {
    setSaveErr(null);
    if (!cuadrillaForm.nombre.trim()) { setSaveErr("Ingresa el nombre."); return; }
    if (!cuadrillaForm.tipo) { setSaveErr("Selecciona un tipo."); return; }
    setSaving(true);
    const sb = createClient();
    const payload = {
      workspace_id: plantaId,
      nombre: cuadrillaForm.nombre.trim(),
      descripcion: cuadrillaForm.descripcion.trim() || null,
      tipo: cuadrillaForm.tipo,
      icono: cuadrillaForm.icono,
      color: cuadrillaForm.color,
      activo: true,
    };
    let cuadrillaId = (panelData as Cuadrilla)?.id;
    if (panelMode === "create-cuadrilla") {
      const { data, error } = await sb.from("cuadrillas").insert(payload).select("id").maybeSingle();
      if (error || !data) { setSaveErr("Error al crear cuadrilla."); setSaving(false); return; }
      cuadrillaId = data.id;
    } else {
      const { error } = await sb.from("cuadrillas").update(payload).eq("id", cuadrillaId);
      if (error) { setSaveErr("Error al actualizar cuadrilla."); setSaving(false); return; }
    }
    await sb.from("cuadrilla_usuarios").delete().eq("cuadrilla_id", cuadrillaId);
    if (panelMembers.length > 0) {
      await sb.from("cuadrilla_usuarios").insert(
        panelMembers.map(uid => ({ cuadrilla_id: cuadrillaId, usuario_id: uid }))
      );
    }
    const { data: cData } = await sb.from("cuadrillas")
      .select("*").eq("workspace_id", plantaId).eq("activo", true).order("nombre");
    setCuadrillas(cData ?? []);
    setSaving(false);
    closePanel();
  }

  async function deleteCuadrilla(id: string) {
    const sb = createClient();
    await sb.from("cuadrillas").update({ activo: false }).eq("id", id);
    setCuadrillas(prev => prev.filter(c => c.id !== id));
    closePanel();
  }

  function switchTab(t: "equipo" | "cuadrillas") {
    setActiveTab(t);
    closePanel();
    setBusqueda("");
  }

  const filteredUsers = usuarios.filter(u =>
    !busqueda || u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.oficio?.toLowerCase().includes(busqueda.toLowerCase())
  );
  const filteredCuadrillas = cuadrillas.filter(c =>
    !busqueda || c.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 8, color: "#9CA3AF" }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: 13 }}>Cargando equipo…</span>
      </div>
    );
  }

  const showPanel = panelMode !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "#fff" }}>

      {/* Header */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid #E2E8F0",
        padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: 0, letterSpacing: "-0.3px" }}>
            {activeTab === "equipo" ? "Equipo" : "Cuadrillas"}
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {esAdmin(myRol) && activeTab === "equipo" && (
            <button
              type="button"
              onClick={loadPermisos}
              title="Gestionar permisos"
              style={{
                height: 32, width: 32,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "none", border: "1px solid #E2E8F0", borderRadius: 6,
                cursor: "pointer", color: "#6B7280",
              }}
            >
              <Lock size={14} />
            </button>
          )}
          {(esAdmin(myRol) || myRol === "jefe") && (
            <button
              type="button"
              onClick={activeTab === "equipo" ? openCreateUser : openCreateCuadrilla}
              style={{
                height: 32, padding: "0 14px",
                display: "flex", alignItems: "center", gap: 6,
                background: "#1E3A8A", border: "none", borderRadius: 6,
                fontSize: 13, fontWeight: 600, color: "#fff",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <UserPlus size={14} />
              {activeTab === "equipo" ? "Agregar" : "Nueva"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #E2E8F0", padding: "0 24px", display: "flex" }}>
        {(["equipo", "cuadrillas"] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            style={{
              height: 40, padding: "0 16px",
              background: "none", border: "none",
              borderBottom: activeTab === t ? "2px solid #1E3A8A" : "2px solid transparent",
              color: activeTab === t ? "#1E3A8A" : "#9CA3AF",
              fontSize: 13, fontWeight: activeTab === t ? 600 : 500,
              cursor: "pointer", fontFamily: "inherit",
              marginBottom: -1, transition: "color 0.1s", textTransform: "capitalize",
            }}
          >
            {t === "equipo" ? "Equipo" : "Cuadrillas"}
          </button>
        ))}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          {/* Search */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid #F3F4F6" }}>
            <div style={{ position: "relative", maxWidth: 320 }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
              <input
                type="text"
                placeholder={activeTab === "equipo" ? "Buscar miembro…" : "Buscar cuadrilla…"}
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                style={{ ...inputStyle, paddingLeft: 32, height: 34 }}
              />
            </div>
          </div>

          {/* Equipo list */}
          {activeTab === "equipo" && (
            filteredUsers.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                {busqueda ? "Sin resultados." : "No hay miembros aún."}
              </div>
            ) : (
              <div>
                {filteredUsers.map(u => {
                  const RolIcon = ROL_ICON[u.rol] ?? User;
                  const isActive = u.activo !== false;
                  const isSelected = panelMode !== null && (panelData as Usuario)?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => openUser(u)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 24px", background: isSelected ? "#F8F9FF" : "none",
                        border: "none", borderBottom: "1px solid #F3F4F6",
                        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: isActive ? "#1E3A8A" : "#E2E8F0",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700,
                        color: isActive ? "#fff" : "#9CA3AF",
                      }}>
                        {u.nombre?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{u.nombre}</span>
                          {!isActive && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10, background: "#F3F4F6", color: "#9CA3AF" }}>
                              Inactivo
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                          <RolIcon size={11} style={{ color: "#6B7280" }} />
                          <span style={{ fontSize: 11, color: "#6B7280" }}>{(ROL_LABEL as Record<string, string>)[u.rol] ?? u.rol}</span>
                          {u.oficio && <span style={{ fontSize: 11, color: "#9CA3AF" }}>· {u.oficio}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {u.last_active && (
                          <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{timeAgo(u.last_active)}</p>
                        )}
                      </div>
                      <ChevronRight size={14} style={{ color: "#D1D5DB", flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            )
          )}

          {/* Cuadrillas list */}
          {activeTab === "cuadrillas" && (
            filteredCuadrillas.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                {busqueda ? "Sin resultados." : "No hay cuadrillas aún."}
              </div>
            ) : (
              <div>
                {filteredCuadrillas.map(c => {
                  const tipo = TIPOS_CUADRILLA.find(t => t.id === c.tipo);
                  const color = c.color || tipo?.color || "#6B7280";
                  const icono = c.icono || tipo?.icono || "Users";
                  const isSelected = panelMode !== null && (panelData as Cuadrilla)?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openCuadrilla(c)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 24px", background: isSelected ? "#F8F9FF" : "none",
                        border: "none", borderBottom: "1px solid #F3F4F6",
                        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                        background: `${color}18`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <DynamicIcon name={icono} size={16} style={{ color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>{c.nombre}</p>
                        {c.descripcion && (
                          <p style={{ fontSize: 11, color: "#6B7280", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.descripcion}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={14} style={{ color: "#D1D5DB", flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* Panel */}
        {showPanel && (
          <div style={{
            width: 360, flexShrink: 0,
            borderLeft: "1px solid #E2E8F0",
            display: "flex", flexDirection: "column",
            overflowY: "auto",
          }}>
            {/* Panel header */}
            <div style={{
              flexShrink: 0, padding: "0 20px", height: 48,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid #F3F4F6",
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                {panelMode === "create-user" ? "Nuevo miembro" :
                 panelMode === "create-cuadrilla" ? "Nueva cuadrilla" :
                 panelMode === "view-user" ? (panelData as Usuario)?.nombre :
                 (panelData as Cuadrilla)?.nombre}
              </span>
              <button type="button" onClick={closePanel}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex" }}>
                <X size={16} />
              </button>
            </div>

            {/* User panels */}
            {(panelMode === "create-user" || panelMode === "view-user") && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                {inviteOk ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ padding: "12px 16px", background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#16A34A", margin: "0 0 8px" }}>
                        ¡Usuario creado!
                      </p>
                      <p style={{ fontSize: 12, color: "#374151", margin: "0 0 4px" }}>
                        Comparte estas credenciales con <strong>{inviteOk.nombre}</strong>:
                      </p>
                      <div style={{ fontSize: 12, color: "#374151", marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        <div><strong>Email:</strong> {inviteOk.email}</div>
                        <div><strong>Contraseña:</strong> {inviteOk.password}</div>
                      </div>
                    </div>
                    <button type="button" onClick={closePanel}
                      style={{ height: 36, border: "none", borderRadius: 6, background: "#1E3A8A", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Listo
                    </button>
                  </div>
                ) : panelMode === "view-user" ? (
                  // View user
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#F8F9FF", borderRadius: 8 }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                        background: (panelData as Usuario).activo !== false ? "#1E3A8A" : "#E2E8F0",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 18, fontWeight: 700,
                        color: (panelData as Usuario).activo !== false ? "#fff" : "#9CA3AF",
                      }}>
                        {(panelData as Usuario).nombre?.charAt(0)?.toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>{(panelData as Usuario).nombre}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#1E3A8A" }}>
                            {(ROL_LABEL as Record<string, string>)[(panelData as Usuario).rol] ?? (panelData as Usuario).rol}
                          </span>
                          {(panelData as Usuario).activo === false && (
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#F3F4F6", color: "#9CA3AF" }}>
                              Inactivo
                            </span>
                          )}
                        </div>
                        {(panelData as Usuario).oficio && (
                          <p style={{ fontSize: 11, color: "#6B7280", margin: "3px 0 0" }}>{(panelData as Usuario).oficio}</p>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", display: "flex", flexDirection: "column", gap: 4 }}>
                      {(panelData as Usuario).created_at && (
                        <div><strong>Desde:</strong> {formatDate((panelData as Usuario).created_at)}</div>
                      )}
                      {(panelData as Usuario).last_active && (
                        <div><strong>Última actividad:</strong> {timeAgo((panelData as Usuario).last_active)}</div>
                      )}
                    </div>
                    {(panelData as Usuario).id !== myId && esAdmin(myRol) && (
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button
                          type="button"
                          onClick={() => toggleActivo(panelData as Usuario)}
                          style={{
                            flex: 1, height: 34, border: "1px solid #E2E8F0", borderRadius: 6,
                            background: "none", fontSize: 12, fontWeight: 600,
                            color: (panelData as Usuario).activo !== false ? "#DC2626" : "#16A34A",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          {(panelData as Usuario).activo !== false ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  // Create user form
                  <>
                    {(["nombre", "email", "password"] as const).map(field => (
                      <div key={field}>
                        <label style={labelStyle}>
                          {field === "nombre" ? "Nombre completo" : field === "email" ? "Email" : "Contraseña temporal"}
                        </label>
                        <input
                          style={inputStyle}
                          type={field === "email" ? "email" : "text"}
                          placeholder={field === "nombre" ? "Ej. Juan Pérez" : field === "email" ? "usuario@empresa.cl" : "Mínimo 8 caracteres"}
                          value={userForm[field]}
                          onChange={e => setUserForm(f => ({ ...f, [field]: e.target.value }))}
                          onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                        />
                      </div>
                    ))}
                    <div>
                      <label style={labelStyle}>Rol</label>
                      <select
                        style={inputStyle}
                        value={userForm.rol}
                        onChange={e => setUserForm(f => ({ ...f, rol: e.target.value }))}
                      >
                        <option value="tecnico">{ROL_LABEL.tecnico}</option>
                        <option value="jefe">{ROL_LABEL.jefe}</option>
                        {myRol === "admin" && <option value="admin">{ROL_LABEL.admin}</option>}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Oficio</label>
                      <select
                        style={inputStyle}
                        value={userForm.oficio}
                        onChange={e => setUserForm(f => ({ ...f, oficio: e.target.value }))}
                      >
                        <option value="">Sin especificar</option>
                        {OFICIOS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    {saveErr && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{saveErr}</p>}
                    <button
                      type="button"
                      onClick={inviteUser}
                      disabled={saving}
                      style={{
                        height: 36, border: "none", borderRadius: 6,
                        background: "#1E3A8A", color: "#fff",
                        fontSize: 13, fontWeight: 600,
                        cursor: saving ? "default" : "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                      {saving ? "Creando…" : "Crear usuario"}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Cuadrilla panels */}
            {(panelMode === "create-cuadrilla" || panelMode === "view-cuadrilla") && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nombre</label>
                  <input
                    style={inputStyle}
                    placeholder="Ej. Cuadrilla Eléctrica"
                    value={cuadrillaForm.nombre}
                    onChange={e => setCuadrillaForm(f => ({ ...f, nombre: e.target.value }))}
                    onFocus={e => { e.currentTarget.style.borderColor = "#1E3A8A"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <textarea
                    placeholder="Descripción opcional"
                    value={cuadrillaForm.descripcion}
                    onChange={e => setCuadrillaForm(f => ({ ...f, descripcion: e.target.value }))}
                    rows={2}
                    style={{ ...inputStyle, height: "auto", padding: "8px 12px", resize: "vertical" }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Tipo</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    {TIPOS_CUADRILLA.map(t => {
                      const sel = cuadrillaForm.tipo === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setCuadrillaForm(f => ({ ...f, tipo: t.id, icono: t.icono, color: t.color }))}
                          style={{
                            display: "flex", alignItems: "center", gap: 7,
                            padding: "7px 10px", borderRadius: 6,
                            border: sel ? `1.5px solid ${t.color}` : "1.5px solid #E2E8F0",
                            background: sel ? `${t.color}12` : "#fff",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          <DynamicIcon name={t.icono} size={13} style={{ color: t.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: sel ? t.color : "#374151" }}>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Miembros</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 6, padding: "4px 0" }}>
                    {usuarios.filter(u => u.activo !== false && u.id !== myId).map(u => {
                      const sel = panelMembers.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 12px", cursor: "pointer",
                            background: sel ? "#F8F9FF" : "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => setPanelMembers(prev =>
                              sel ? prev.filter(id => id !== u.id) : [...prev, u.id]
                            )}
                            style={{ accentColor: "#1E3A8A" }}
                          />
                          <span style={{ fontSize: 12, color: "#374151" }}>{u.nombre}</span>
                          <span style={{ fontSize: 11, color: "#9CA3AF", marginLeft: "auto" }}>{(ROL_LABEL as Record<string, string>)[u.rol] ?? u.rol}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {saveErr && <p style={{ fontSize: 12, color: "#DC2626", margin: 0 }}>{saveErr}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  {panelMode === "view-cuadrilla" && esAdmin(myRol) && (
                    <button
                      type="button"
                      onClick={() => deleteCuadrilla((panelData as Cuadrilla).id)}
                      style={{
                        height: 36, padding: "0 14px", border: "1px solid #FECACA", borderRadius: 6,
                        background: "none", fontSize: 12, fontWeight: 600, color: "#DC2626",
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      Eliminar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={saveCuadrilla}
                    disabled={saving}
                    style={{
                      flex: 1, height: 36, border: "none", borderRadius: 6,
                      background: "#1E3A8A", color: "#fff",
                      fontSize: 13, fontWeight: 600,
                      cursor: saving ? "default" : "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                    {saving ? "Guardando…" : "Guardar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permissions modal */}
      {permisosOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            background: "#fff", borderRadius: 12,
            width: "100%", maxWidth: 720, maxHeight: "80dvh",
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Gestión de permisos</span>
              <button type="button" onClick={() => setPermisosOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", display: "flex" }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 12px", color: "#9CA3AF", fontWeight: 600, fontSize: 11 }}>Usuario</th>
                    {MODULOS.map(m => (
                      <th key={m.id} style={{ textAlign: "center", padding: "6px 8px", color: "#9CA3AF", fontWeight: 600, fontSize: 11 }}>
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.filter(u => u.activo !== false && u.id !== myId).map(u => (
                    <tr key={u.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#111827", margin: 0 }}>{u.nombre}</p>
                        <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{(ROL_LABEL as Record<string, string>)[u.rol] ?? u.rol}</p>
                      </td>
                      {MODULOS.map(m => {
                        const checked = permMatrix[u.id]?.[m.id] !== false;
                        return (
                          <td key={m.id} style={{ textAlign: "center", padding: "8px" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setPermMatrix(prev => ({
                                ...prev,
                                [u.id]: { ...(prev[u.id] ?? {}), [m.id]: !checked },
                              }))}
                              style={{ accentColor: "#1E3A8A" }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
              {permMsg && (
                <span style={{ fontSize: 12, color: "#16A34A", display: "flex", alignItems: "center", gap: 4 }}>
                  <Check size={12} /> {permMsg}
                </span>
              )}
              <button
                type="button"
                onClick={savePermisos}
                disabled={permSaving}
                style={{
                  height: 34, padding: "0 16px", border: "none", borderRadius: 6,
                  background: "#1E3A8A", color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: permSaving ? "default" : "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 6, opacity: permSaving ? 0.7 : 1,
                }}
              >
                {permSaving ? <Loader2 size={13} className="animate-spin" /> : null}
                {permSaving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
