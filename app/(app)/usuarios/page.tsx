"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { ROL_LABEL, esAdmin, esOwner } from "@/lib/roles";
import { puedeDarDeBaja, puedeGestionarUsuario } from "@/lib/usuarios-baja";
import {
  Users, UserPlus, Shield, Wrench, Search, X, Loader2,
  ChevronRight, Zap, Settings2, HardHat, Sparkles, Wind,
  Cpu, Droplets, ShieldAlert, Flame, Paintbrush, Leaf, User,
  Lock, Check, MoreHorizontal,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Usuario {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
  oficio?: string;
  cargo?: string;
  /** Un `member` con esto en true solo ve las OTs que tiene asignadas. */
  solo_asignadas?: boolean | null;
  created_at?: string;
  last_active?: string;
  /** Baja definitiva: la fila queda para no romper el historial. */
  deleted_at?: string | null;
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

type PanelMode = null | "view-cuadrilla" | "create-cuadrilla";

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
  fontSize: 14, fontWeight: 400,
  color: "var(--fg-4)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 36, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 6,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};
/** Item de los menús ⋮ de cada fila de la tabla de miembros. */
const rowMenuItemStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "9px 10px",
  border: "none", borderRadius: 7, background: "transparent",
  color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit",
  textAlign: "left", cursor: "pointer",
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

  // Invite form. No password field: the member sets their own from the emailed
  // link, exactly like the mobile Equipo invite.
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Cuadrilla form
  const [cuadrillaForm, setCuadrillaForm] = useState({ nombre: "", descripcion: "", tipo: "", icono: "", color: "" });

  // Members table: sortable columns + per-row ⋮ menu.
  const [sortKey, setSortKey] = useState<"nombre" | "rol" | "cargo" | "oficio" | "estado">("nombre");
  const [sortAsc, setSortAsc] = useState(true);
  // The ⋮ menu renders in a portal on document.body, not inside the row: the
  // table sits in three nested clipping boxes (the rounded card's
  // `overflow:hidden`, the horizontal scroller's `overflowX:auto`, and the
  // scrolling content column), and an absolutely positioned menu is cropped by
  // all of them no matter how high its z-index goes — clipping ignores stacking
  // order. So it is positioned with `fixed` from the button's measured rect,
  // and flips above the button when it would run past the viewport bottom,
  // which is what the last row in the table always did.
  const [rowMenu, setRowMenu] = useState<{ id: string; top: number; right: number; flipUp: boolean } | null>(null);
  // Reposition on scroll/resize would fight the fixed anchor, so the menu just
  // closes instead — the same thing a click outside does.
  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [rowMenu]);

  /** Measures the ⋮ button and opens (or closes) the menu anchored to it. */
  function toggleRowMenu(id: string, btn: HTMLElement) {
    if (rowMenu?.id === id) { setRowMenu(null); return; }
    const r = btn.getBoundingClientRect();
    const MENU_H = 96;
    const flipUp = window.innerHeight - r.bottom < MENU_H + 16;
    setRowMenu({
      id,
      top: flipUp ? r.top - 4 : r.bottom + 4,
      right: Math.max(12, window.innerWidth - r.right),
      flipUp,
    });
  }

  // Permissions
  const [permisosOpen, setPermisosOpen] = useState(false);
  const [permMatrix, setPermMatrix] = useState<Record<string, Record<string, boolean>>>({});
  const [permLoaded, setPermLoaded] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permMsg, setPermMsg] = useState<string | null>(null);

  // ── Baja de usuario ───────────────────────────────────────────────────────
  // El flujo es: reasignar el trabajo abierto -> recien ahi dar de baja. La
  // funcion `dar_de_baja_usuario` rechaza la baja si quedan OTs abiertas, asi
  // que la UI no puede dejar una OT sin responsable.
  const [bajaUser, setBajaUser] = useState<Usuario | null>(null);
  const [bajaOpen, setBajaOpen] = useState(false);
  const [bajaAbiertas, setBajaAbiertas] = useState<number | null>(null);
  const [bajaDestino, setBajaDestino] = useState<string>("");
  const [bajaBusy, setBajaBusy] = useState(false);
  const [bajaErr, setBajaErr] = useState<string | null>(null);

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
        .select("id,nombre,rol,activo,oficio,cargo,solo_asignadas,created_at,last_active,deleted_at")
        .eq("workspace_id", pId).is("deleted_at", null).order("nombre");
      setUsuarios(u1 ?? []);

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
    // Flow cobra por usuario activo: hay que reflejar el cambio en la
    // suscripción o el cobro sigue contando al desactivado.
    void fetch("/api/suscripcion/sync-usuarios", { method: "POST" });
    setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, activo: newVal } : u));
    if (panelData && (panelData as Usuario).id === usuario.id) {
      setPanelData({ ...usuario, activo: newVal });
    }
  }

  // ── Baja de usuario ───────────────────────────────────────────────────────
  async function openBaja(usuario: Usuario) {
    setBajaUser(usuario);
    setBajaOpen(true);
    setBajaErr(null);
    setBajaDestino("");
    setBajaAbiertas(null);
    const sb = createClient();
    const { count } = await sb
      .from("ordenes_trabajo")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", plantaId)
      .is("deleted_at", null)
      .in("estado", ["pendiente", "en_espera", "en_curso", "en_revision"])
      .contains("asignados_ids", [usuario.id]);
    setBajaAbiertas(count ?? 0);
  }

  async function reasignarTrabajo() {
    if (!bajaUser || !bajaDestino) return;
    setBajaBusy(true);
    setBajaErr(null);
    const sb = createClient();
    const { data, error } = await sb.rpc("reasignar_trabajo_usuario", {
      p_desde: bajaUser.id,
      p_hacia: bajaDestino,
    });
    setBajaBusy(false);
    if (error) { setBajaErr(error.message); return; }
    setBajaAbiertas(0);
    setBajaErr(null);
    setPermMsg(`${data ?? 0} OT(s) reasignadas`);
    setTimeout(() => setPermMsg(null), 2500);
  }

  async function darDeBaja() {
    if (!bajaUser || !myId) return;
    setBajaBusy(true);
    setBajaErr(null);
    const sb = createClient();
    const { error } = await sb.rpc("dar_de_baja_usuario", {
      p_usuario: bajaUser.id,
      p_actor: myId,
    });
    setBajaBusy(false);
    if (error) { setBajaErr(error.message); return; }
    void fetch("/api/suscripcion/sync-usuarios", { method: "POST" });
    setUsuarios(prev => prev.filter(u => u.id !== bajaUser.id));
    setBajaOpen(false);
    setBajaUser(null);
    if (panelData && (panelData as Usuario).id === bajaUser.id) setPanelMode(null);
  }

  // ── Open panels ────────────────────────────────────────────────────────────
  /**
   * Members open in their own page (/usuarios/[id]) rather than the old side
   * panel: that screen carries the full mobile parity set — name, cargo, oficio,
   * role and the `solo_asignadas` visibility switch.
   */
  function openUser(u: Usuario) {
    router.push(`/usuarios/${u.id}`);
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
    u.oficio?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.cargo?.toLowerCase().includes(busqueda.toLowerCase())
  ).sort((a, b) => {
    const value = (u: Usuario) => {
      switch (sortKey) {
        case "rol":    return (ROL_LABEL as Record<string, string>)[u.rol] ?? u.rol ?? "";
        case "cargo":  return u.cargo ?? "";
        case "oficio": return u.oficio ?? "";
        case "estado": return u.activo === false ? "Inactivo" : "Activo";
        default:       return u.nombre ?? "";
      }
    };
    // localeCompare so accented names (Andrés, Matías) sort where a Chilean
    // reader expects, not after Z.
    const cmp = value(a).localeCompare(value(b), "es", { sensitivity: "base" });
    return sortAsc ? cmp : -cmp;
  });
  const filteredCuadrillas = cuadrillas.filter(c =>
    !busqueda || c.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 8, color: "var(--fg-4)" }}>
        <Loader2 size={18} className="animate-spin" />
        <span style={{ fontSize: 14 }}>Cargando equipo…</span>
      </div>
    );
  }

  const showPanel = panelMode !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--surface-canvas)" }}>

      {/* Toolbar: search and actions both right-aligned, matching the Órdenes
          bandeja. Control heights are 38px there, so they are 38px here too —
          they used to be 36 and read as a different size class between the two
          screens. Cuadrillas was removed — the table had no rows in production
          and nothing else in the app referenced it, so the tab strip is gone
          with it. */}
      <div style={{
        flexShrink: 0, borderBottom: "1px solid var(--border)",
        padding: "9px 24px", minHeight: 56, display: "flex", alignItems: "center",
        justifyContent: "flex-end", gap: 8, flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 280, minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--fg-4)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Buscar miembro…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ ...inputStyle, paddingLeft: 34, paddingRight: busqueda ? 28 : 10, height: 38, borderRadius: 8 }}
            onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              aria-label="Limpiar búsqueda"
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {(esAdmin(myRol) || myRol === "jefe") && (
          <button
            type="button"
            onClick={() => router.push("/usuarios/invitar")}
            style={{
              flexShrink: 0, height: 38, padding: "0 16px",
              display: "inline-flex", alignItems: "center", gap: 7,
              background: "var(--brand)", border: "none", borderRadius: 8,
              fontSize: 14, fontWeight: 400, color: "var(--fg-on-brand)",
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            <UserPlus size={15} />
            Agregar miembro
          </button>
        )}
      </div>

      {/* Main area */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
          {/* Equipo table. Columns are sortable and each row carries a menu;
              clicking the row opens /usuarios/[id]. */}
          {activeTab === "equipo" && (
            filteredUsers.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>
                {busqueda ? "Sin resultados." : "No hay miembros aun."}
              </div>
            ) : (
              <div style={{ padding: "14px 24px 32px" }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface-1)" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                      <thead>
                        <tr style={{ background: "var(--surface-2)" }}>
                          {([
                            ["nombre", "Nombre"],
                            ["rol",    "Rol"],
                            ["cargo",  "Cargo"],
                            ["oficio", "Oficio"],
                            ["estado", "Estado"],
                          ] as const).map(([key, label]) => (
                            <th key={key} style={{ padding: "10px 16px", textAlign: "left" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (sortKey === key) setSortAsc(v => !v);
                                  else { setSortKey(key); setSortAsc(true); }
                                }}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  background: "none", border: "none", padding: 0, cursor: "pointer",
                                  fontFamily: "inherit", fontSize: 14, fontWeight: 400,
                                  color: sortKey === key ? "var(--fg-2)" : "var(--fg-4)",
                                }}
                              >
                                {label}
                                {sortKey === key && <span aria-hidden="true">{sortAsc ? "\u2191" : "\u2193"}</span>}
                              </button>
                            </th>
                          ))}
                          <th style={{ width: 48 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map(u => {
                          const isActive = u.activo !== false;
                          const puedeGestionar = puedeGestionarUsuario({ id: myId ?? "", rol: myRol ?? "" }, { id: u.id, rol: u.rol });
                          return (
                            <tr
                              key={u.id}
                              onClick={() => openUser(u)}
                              style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                            >
                              <td style={{ padding: "12px 16px" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <span style={{
                                    width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                                    display: "grid", placeItems: "center",
                                    background: isActive ? "var(--brand)" : "var(--border)",
                                    color: isActive ? "var(--fg-on-brand)" : "var(--fg-4)",
                                    fontSize: 14, fontWeight: 400,
                                  }}>
                                    {u.nombre?.charAt(0)?.toUpperCase() ?? "?"}
                                  </span>
                                  <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{u.nombre}</span>
                                </span>
                              </td>
                              <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--fg-2)" }}>
                                {(ROL_LABEL as Record<string, string>)[u.rol] ?? u.rol}
                              </td>
                              <td style={{ padding: "12px 16px", fontSize: 14, color: u.cargo ? "var(--fg-2)" : "var(--fg-4)" }}>
                                {u.cargo || "\u2014"}
                              </td>
                              <td style={{ padding: "12px 16px", fontSize: 14, color: u.oficio ? "var(--fg-2)" : "var(--fg-4)" }}>
                                {u.oficio || "\u2014"}
                              </td>
                              <td style={{ padding: "12px 16px" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  padding: "3px 10px", borderRadius: 999,
                                  border: "1px solid var(--border)", background: "var(--surface-1)",
                                  fontSize: 14, fontWeight: 400, color: "var(--fg-2)",
                                }}>
                                  <span style={{
                                    width: 6, height: 6, borderRadius: "50%",
                                    background: isActive ? "var(--brand)" : "var(--fg-4)",
                                  }} />
                                  {isActive ? "Activo" : "Inactivo"}
                                </span>
                              </td>
                              <td style={{ padding: "12px 16px", textAlign: "right", position: "relative" }}>
                                <button
                                  type="button"
                                  aria-label={`Acciones para ${u.nombre}`}
                                  onClick={e => { e.stopPropagation(); toggleRowMenu(u.id, e.currentTarget); }}
                                  style={{
                                    width: 28, height: 28, display: "grid", placeItems: "center",
                                    border: "none", borderRadius: 6,
                                    background: rowMenu?.id === u.id ? "var(--surface-hover)" : "transparent",
                                    color: "var(--fg-3)", cursor: "pointer",
                                  }}
                                >
                                  <MoreHorizontal size={15} />
                                </button>

                                {rowMenu?.id === u.id && typeof document !== "undefined" && createPortal(
                                  <>
                                    <div
                                      onClick={e => { e.stopPropagation(); setRowMenu(null); }}
                                      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
                                    />
                                    <div
                                      onClick={e => e.stopPropagation()}
                                      style={{
                                        position: "fixed", top: rowMenu.top, right: rowMenu.right, zIndex: 9999,
                                        width: 230, padding: 6, textAlign: "left",
                                        background: "var(--surface-1)", border: "1px solid var(--border-strong)",
                                        borderRadius: 10, boxShadow: "var(--shadow-lg)",
                                        transform: rowMenu.flipUp ? "translateY(-100%)" : "none",
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => { setRowMenu(null); openUser(u); }}
                                        style={rowMenuItemStyle}
                                      >
                                        Ver y editar miembro
                                      </button>
                                      {puedeGestionar && (
                                        <button
                                          type="button"
                                          onClick={() => { setRowMenu(null); openBaja(u); }}
                                          style={{ ...rowMenuItemStyle, color: "var(--danger)" }}
                                        >
                                          Dar de baja
                                        </button>
                                      )}
                                    </div>
                                  </>,
                                  document.body
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          )}

        </div>

        {/* Panel */}
        {showPanel && (
          <div style={{
            width: 360, flexShrink: 0,
            borderLeft: "1px solid var(--border)",
            display: "flex", flexDirection: "column",
            overflowY: "auto",
            // Canvas, so the white form inputs read as elements on the panel
            // instead of the whole panel being one flat white sheet.
            background: "var(--surface-canvas)",
          }}>
            {/* Panel header */}
            <div style={{
              flexShrink: 0, padding: "0 20px", height: 48,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
                {panelMode === "create-cuadrilla" ? "Nueva cuadrilla" :
                 (panelData as Cuadrilla)?.nombre}
              </span>
              <button type="button" onClick={closePanel}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-4)", display: "flex" }}>
                <X size={16} />
              </button>
            </div>

            {/* User panels */}

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
                    onFocus={e => { e.currentTarget.style.borderColor = "var(--brand)"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; }}
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
                            border: sel ? `1.5px solid ${t.color}` : "1.5px solid var(--border)",
                            background: sel ? "var(--surface-hover)" : "var(--surface-1)",
                            cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          <DynamicIcon name={t.icono} size={13} style={{ color: t.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 14, fontWeight: 400, color: sel ? t.color : "var(--fg-2)" }}>{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Miembros</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 0" }}>
                    {usuarios.filter(u => u.activo !== false && u.id !== myId).map(u => {
                      const sel = panelMembers.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "6px 12px", cursor: "pointer",
                            background: sel ? "var(--brand-tint)" : "none",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => setPanelMembers(prev =>
                              sel ? prev.filter(id => id !== u.id) : [...prev, u.id]
                            )}
                            style={{ accentColor: "var(--brand)" }}
                          />
                          <span style={{ fontSize: 14, color: "var(--fg-2)" }}>{u.nombre}</span>
                          <span style={{ fontSize: 14, color: "var(--fg-4)", marginLeft: "auto" }}>{(ROL_LABEL as Record<string, string>)[u.rol] ?? u.rol}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {saveErr && <p style={{ fontSize: 14, color: "var(--danger)", margin: 0 }}>{saveErr}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  {panelMode === "view-cuadrilla" && esAdmin(myRol) && (
                    <button
                      type="button"
                      onClick={() => deleteCuadrilla((panelData as Cuadrilla).id)}
                      style={{
                        height: 36, padding: "0 14px", border: "1px solid var(--danger-bg)", borderRadius: 6,
                        background: "none", fontSize: 14, fontWeight: 400, color: "var(--danger)",
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
                      background: "var(--brand)", color: "var(--fg-on-brand)",
                      fontSize: 14, fontWeight: 400,
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
      {/* ── Baja de usuario ────────────────────────────────────────────────── */}
      {/* Baja modal. The overlay is zIndex 500, not 60: the global topbar is
          zIndex 100, so a lower overlay leaves the header lit above the dimmed
          page. Same value and overlay tone as ConfirmDeleteModal, which hit
          this exact bug. */}
      {bajaOpen && bajaUser && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500,
          background: "rgba(15,23,42,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24,
        }}>
          <div style={{
            background: "var(--surface-1)", borderRadius: "var(--r-lg)",
            width: "100%", maxWidth: 480,
            display: "flex", flexDirection: "column", overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
                Dar de baja a {bajaUser.nombre}
              </h2>
            </div>

            <div style={{ padding: 20, display: "grid", gap: 16 }}>
              {bajaAbiertas === null ? (
                <p style={{ margin: 0, fontSize: 14, color: "var(--fg-3)" }}>Revisando trabajo asignado…</p>
              ) : bajaAbiertas > 0 ? (
                <>
                  <p style={{ margin: 0, fontSize: 14, color: "var(--fg-1)", lineHeight: 1.55 }}>
                    Tiene <strong>{bajaAbiertas} OT{bajaAbiertas === 1 ? "" : "s"} abierta{bajaAbiertas === 1 ? "" : "s"}</strong>.
                    Elige a quién pasarle ese trabajo antes de darlo de baja.
                  </p>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-2)" }}>Reasignar a</label>
                    <select
                      value={bajaDestino}
                      onChange={e => setBajaDestino(e.target.value)}
                      style={{
                        height: 36, padding: "0 10px", fontSize: 14, fontFamily: "inherit",
                        border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                        background: "var(--surface-1)", color: "var(--fg-1)",
                      }}
                    >
                      <option value="">Elegir usuario…</option>
                      {usuarios
                        .filter(u => u.id !== bajaUser.id && (u.activo ?? true))
                        .map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={reasignarTrabajo}
                    disabled={!bajaDestino || bajaBusy}
                    style={{
                      height: 36, borderRadius: "var(--r-sm)",
                      border: `1px solid ${(!bajaDestino || bajaBusy) ? "var(--border)" : "var(--brand)"}`,
                      background: (!bajaDestino || bajaBusy) ? "var(--surface-2)" : "var(--brand)",
                      color: (!bajaDestino || bajaBusy) ? "var(--fg-4)" : "var(--fg-on-brand)",
                      fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                      cursor: (!bajaDestino || bajaBusy) ? "default" : "pointer",
                    }}
                  >
                    {bajaBusy ? "Reasignando…" : "Reasignar trabajo"}
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: "var(--fg-1)", lineHeight: 1.55 }}>
                  No le queda trabajo abierto. Al darlo de baja no podrá entrar ni aparecer
                  en los selectores, y deja de contar para la facturación. Su historial —
                  comentarios, fotos y firmas — se conserva tal cual.
                </p>
              )}

              {bajaErr && (
                <p style={{ margin: 0, fontSize: 14, color: "var(--danger)", lineHeight: 1.5 }}>{bajaErr}</p>
              )}
            </div>

            <div style={{
              padding: "14px 20px", borderTop: "1px solid var(--border)",
              display: "flex", justifyContent: "flex-end", gap: 8,
            }}>
              <button
                type="button"
                onClick={() => { setBajaOpen(false); setBajaUser(null); setBajaErr(null); }}
                disabled={bajaBusy}
                style={{
                  height: 34, padding: "0 14px", fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                  border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                  background: "var(--surface-1)", color: "var(--fg-2)", cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={darDeBaja}
                disabled={bajaBusy || !puedeDarDeBaja(bajaAbiertas)}
                title={bajaAbiertas ? "Reasigna el trabajo abierto primero" : undefined}
                style={{
                  height: 34, padding: "0 14px", fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                  border: "1px solid var(--danger)", borderRadius: "var(--r-sm)",
                  background: "var(--danger)", color: "#FFFFFF",
                  cursor: (bajaBusy || !!bajaAbiertas) ? "default" : "pointer",
                  opacity: (bajaBusy || !puedeDarDeBaja(bajaAbiertas)) ? 0.5 : 1,
                }}
              >
                {bajaBusy ? "Dando de baja…" : "Dar de baja"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
