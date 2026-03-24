"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, ChevronRight, Users,
  UserPlus, UserX, UserCheck, User,
  Pencil, Trash2, Check, Shield, Wrench,
  Search, AlertCircle,
  Zap, Settings2, HardHat, Sparkles, Wind, Cpu,
  Droplets, ShieldAlert, Flame, Paintbrush, Leaf,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
import { ROL_LABEL, esAdmin, esElevado } from "@/lib/roles";
import styles from "./page.module.css";

// ── Constants ─────────────────────────────────────────────────

const ROL_ICON  = { admin: Shield, jefe: Shield, tecnico: Wrench };

const OFICIOS = [
  "Electricista", "Mecánico", "Gasfíter", "Soldador",
  "Instrumentista", "Automatizador", "Pintor", "Albañil",
  "Jardinero / Aseo", "Otro",
];

const TIPOS_CUADRILLA = [
  { id: "electrica",       label: "Eléctrica",       icono: "Zap",         color: "#F59E0B" },
  { id: "mecanica",        label: "Mecánica",         icono: "Wrench",      color: "#3B82F6" },
  { id: "instrumentacion", label: "Instrumentación",  icono: "Settings2",   color: "#8B5CF6" },
  { id: "obra_civil",      label: "Obra civil",       icono: "HardHat",     color: "#F97316" },
  { id: "aseo",            label: "Aseo y ornato",    icono: "Sparkles",    color: "#22C55E" },
  { id: "climatizacion",   label: "Climatización",    icono: "Wind",        color: "#06B6D4" },
  { id: "automatizacion",  label: "Automatización",   icono: "Cpu",         color: "#14B8A6" },
  { id: "gasfiteria",      label: "Gasfitería",       icono: "Droplets",    color: "#60A5FA" },
  { id: "seguridad",       label: "Seguridad",        icono: "ShieldAlert", color: "#EF4444" },
  { id: "soldadura",       label: "Soldadura",        icono: "Flame",       color: "#F43F5E" },
  { id: "pintura",         label: "Pintura",          icono: "Paintbrush",  color: "#EC4899" },
  { id: "paisajismo",      label: "Paisajismo",       icono: "Leaf",        color: "#16A34A" },
];

const ICON_MAP = {
  Zap, Wrench, Settings2, HardHat, Sparkles, Wind, Cpu,
  Droplets, ShieldAlert, Flame, Paintbrush, Leaf,
  Users, User, Shield,
};

function DynamicIcon({ name, size = 16, ...props }) {
  const Icon = ICON_MAP[name] ?? Users;
  return <Icon size={size} {...props} />;
}

const MODULOS = [
  { id: "inventario",  label: "Partes" },
  { id: "reportes",    label: "Reportes" },
  { id: "facturacion", label: "Facturación" },
  { id: "calendario",  label: "Calendario" },
  { id: "preventivos", label: "Preventivos" },
  { id: "usuarios",    label: "Equipo" },
  { id: "activos",     label: "Activos" },
  { id: "normativa",   label: "Normativa" },
];

// ── Main ─────────────────────────────────────────────────────

export default function UsuariosPage() {
  const router = useRouter();

  const [plantaId,  setPlantaId]  = useState(null);
  const [myId,      setMyId]      = useState(null);
  const [myRol,     setMyRol]     = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);

  const [activeTab, setActiveTab] = useState("equipo");

  const [usuarios,   setUsuarios]   = useState([]);
  const [cuadrillas, setCuadrillas] = useState([]);

  const [selected,     setSelected]     = useState(null);
  const [panelMode,    setPanelMode]    = useState(null);
  const [panelData,    setPanelData]    = useState(null);
  const [panelMembers, setPanelMembers] = useState([]);
  const [loadingPanel, setLoadingPanel] = useState(false);

  const [userForm, setUserForm] = useState({ nombre: "", email: "", password: "", rol: "tecnico", oficio: "" });
  const [cuadrillaForm, setCuadrillaForm] = useState({ nombre: "", descripcion: "", tipo: "", icono: "", color: "" });
  const [memberSel, setMemberSel] = useState(new Set());

  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState(null);
  const [inviteOk, setInviteOk] = useState(null);

  const [confirm, setConfirm] = useState(null);

  const [permisosOpen, setPermisosOpen] = useState(false);
  const [permMatrix,   setPermMatrix]   = useState({});
  const [permLoaded,   setPermLoaded]   = useState(false);
  const [permSaving,   setPermSaving]   = useState(false);
  const [permMsg,      setPermMsg]      = useState(null);

  const [busqueda, setBusqueda] = useState("");

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  async function cargarUsuarios(sb, pId) {
    const r1 = await sb.from("usuarios").select("id,nombre,rol,activo,oficio,created_at,last_active").eq("workspace_id", pId).order("nombre");
    if (!r1.error) { setUsuarios(r1.data ?? []); return; }
    const r2 = await sb.from("usuarios").select("id,nombre,rol,activo").eq("workspace_id", pId).order("nombre");
    setUsuarios(r2.data ?? []);
  }

  async function cargarCuadrillas(sb, pId) {
    const { data, error } = await sb.from("cuadrillas").select("*").eq("workspace_id", pId).eq("activo", true).order("nombre");
    if (!error) setCuadrillas(data ?? []);
  }

  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setMyId(user.id);
      const { data: perfil } = await sb.from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();
      const pId = perfil?.workspace_id;
      if (!pId) return;
      setPlantaId(pId);
      setMyRol(perfil.rol);
      await Promise.all([cargarUsuarios(sb, pId), cargarCuadrillas(sb, pId)]);
      setLoading(false);
    }
    init();
  }, []);

  // ── User actions ──────────────────────────────────────────
  async function toggleActivo(usuario) {
    const newVal = !(usuario.activo ?? true);
    const res = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: newVal }),
    });
    if (res.ok) {
      setUsuarios((p) => p.map((u) => u.id === usuario.id ? { ...u, activo: newVal } : u));
      if (panelData?.id === usuario.id) setPanelData((p) => ({ ...p, activo: newVal }));
    }
    setConfirm(null);
  }

  async function eliminarUsuario(usuario) {
    const res = await fetch(`/api/usuarios/${usuario.id}`, { method: "DELETE" });
    if (res.ok) {
      setUsuarios((p) => p.filter((u) => u.id !== usuario.id));
      setPanelMode(null); setSelected(null); setPanelData(null);
    }
    setConfirm(null);
  }

  async function cambiarRol(usuario, rol) {
    const res = await fetch(`/api/usuarios/${usuario.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol }),
    });
    if (res.ok) {
      setUsuarios((p) => p.map((u) => u.id === usuario.id ? { ...u, rol } : u));
      if (panelData?.id === usuario.id) setPanelData((p) => ({ ...p, rol }));
    }
  }

  // ── Invite ────────────────────────────────────────────────
  async function enviarInvitacion() {
    if (!userForm.nombre.trim()) { setSaveErr("El nombre es obligatorio."); return; }
    if (!userForm.email.trim())  { setSaveErr("El email es obligatorio."); return; }
    if (userForm.password.length < 8) { setSaveErr("La contraseña debe tener al menos 8 caracteres."); return; }
    setSaving(true); setSaveErr(null);
    const res = await callEdge("invitar", {
      nombre: userForm.nombre.trim(), email: userForm.email.trim(),
      password: userForm.password, rol: userForm.rol, workspace_id: plantaId,
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) { setSaveErr(body.error ?? "Error al crear el usuario."); return; }
    setInviteOk({ nombre: userForm.nombre.trim(), email: userForm.email.trim(), password: userForm.password });
    const sb = createClient();
    await cargarUsuarios(sb, plantaId);
  }

  // ── Cuadrillas CRUD ───────────────────────────────────────
  async function abrirCuadrilla(c) {
    setSelected(c.id);
    setPanelMode("view");
    setPanelData(c);
    setLoadingPanel(true);
    const sb = createClient();
    const { data, error } = await sb.from("cuadrilla_usuarios").select("usuario_id").eq("cuadrilla_id", c.id);
    setPanelMembers(!error ? (data ?? []).map((r) => r.usuario_id) : []);
    setLoadingPanel(false);
  }

  async function guardarCuadrilla() {
    if (!cuadrillaForm.nombre.trim()) { setSaveErr("El nombre es obligatorio."); return; }
    if (!cuadrillaForm.tipo) { setSaveErr("Selecciona un tipo de cuadrilla."); return; }
    setSaving(true); setSaveErr(null);
    const sb = createClient();
    const payload = {
      nombre:      cuadrillaForm.nombre.trim(),
      descripcion: cuadrillaForm.descripcion.trim() || null,
      tipo:        cuadrillaForm.tipo,
      icono:       cuadrillaForm.icono,
      color:       cuadrillaForm.color,
      workspace_id: plantaId,
    };
    let cuadrillaId = panelData?.id;
    if (panelMode === "create") {
      const { data, error } = await sb.from("cuadrillas").insert(payload).select("id").maybeSingle();
      if (error) { setSaveErr("Error al guardar."); setSaving(false); return; }
      cuadrillaId = data.id;
    } else {
      const { error } = await sb.from("cuadrillas").update(payload).eq("id", cuadrillaId);
      if (error) { setSaveErr("Error al guardar."); setSaving(false); return; }
    }
    // Update members
    await sb.from("cuadrilla_usuarios").delete().eq("cuadrilla_id", cuadrillaId);
    if (memberSel.size > 0) {
      await sb.from("cuadrilla_usuarios").insert(
        [...memberSel].map((uid) => ({ cuadrilla_id: cuadrillaId, usuario_id: uid }))
      );
    }
    setSaving(false);
    await cargarCuadrillas(sb, plantaId);
    setPanelMode(null); setSelected(null); setPanelData(null);
  }

  async function eliminarCuadrilla(c) {
    const sb = createClient();
    await sb.from("cuadrillas").update({ activo: false }).eq("id", c.id);
    setConfirm(null);
    setPanelMode(null); setSelected(null); setPanelData(null);
    await cargarCuadrillas(sb, plantaId);
  }

  // ── Permisos ──────────────────────────────────────────────
  async function loadPermissions() {
    if (permLoaded) return;
    const targets = usuarios.filter((u) => u.activo !== false && u.id !== myId);
    const matrix = {};
    await Promise.all(
      targets.map(async (u) => {
        const res = await fetch(`/api/usuarios/permisos?usuario_id=${u.id}`);
        const data = await res.json();
        matrix[u.id] = data;
      })
    );
    setPermMatrix(matrix);
    setPermLoaded(true);
  }

  function togglePerm(uid, mod) {
    setPermMatrix((p) => ({ ...p, [uid]: { ...p[uid], [mod]: !(p[uid]?.[mod] !== false) } }));
  }

  async function guardarPermisos() {
    setPermSaving(true); setPermMsg(null);
    const targets = usuarios.filter((u) => u.activo !== false && u.id !== myId);
    let anyError = false;
    await Promise.all(
      targets.map(async (u) => {
        const res = await fetch("/api/usuarios/permisos", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usuario_id: u.id, permisos: permMatrix[u.id] ?? {} }),
        });
        if (!res.ok) anyError = true;
      })
    );
    setPermSaving(false);
    setPermMsg(anyError ? "error" : "ok");
    setTimeout(() => setPermMsg(null), 3000);
  }

  // ── Panel helpers ─────────────────────────────────────────
  function abrirUsuario(u) {
    setSelected(u.id); setPanelMode("view"); setPanelData(u); setPanelMembers([]);
  }

  function abrirInvitar() {
    setSelected(null); setPanelData(null);
    setUserForm({ nombre: "", email: "", password: "", rol: "tecnico", oficio: "" });
    setSaveErr(null); setInviteOk(null);
    setPanelMode("invite");
  }

  function abrirCrearCuadrilla() {
    setSelected(null); setPanelData(null);
    setCuadrillaForm({ nombre: "", descripcion: "", tipo: "", icono: "", color: "" });
    setMemberSel(new Set()); setSaveErr(null);
    setPanelMode("create");
  }

  function abrirEditarCuadrilla(c) {
    setCuadrillaForm({
      nombre:      c.nombre ?? "",
      descripcion: c.descripcion ?? "",
      tipo:        c.tipo ?? "",
      icono:       c.icono ?? "",
      color:       c.color ?? "",
    });
    setMemberSel(new Set(panelMembers));
    setSaveErr(null);
    setPanelMode("edit");
  }

  function switchTab(tab) {
    setActiveTab(tab);
    setSelected(null); setPanelMode(null); setPanelData(null); setBusqueda("");
  }

  // ── Filtered lists ────────────────────────────────────────
  const filteredUsers = usuarios.filter((u) =>
    !busqueda || u.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );
  const filteredCuadrillas = cuadrillas.filter((c) =>
    !busqueda || c.nombre?.toLowerCase().includes(busqueda.toLowerCase())
  );
  const showPanel = panelMode !== null;

  if (loading) return <div className={styles.loadingScreen}>Cargando equipo…</div>;

  return (
    <div className={styles.root}>
      <div className={styles.splitLayout}>

        {/* Left: list */}
        <div className={`${styles.listPanel} ${showPanel && !isDesktop ? styles.listPanelHidden : ""}`}>
          <div className={styles.listHeader}>
            <div className={styles.listHeaderTop}>
              <h1 className={styles.listTitle}>{activeTab === "equipo" ? "Equipo" : "Cuadrillas"}</h1>
              <div className={styles.listHeaderActions}>
                {esAdmin(myRol) && activeTab === "equipo" && (
                  <button className={styles.iconBtn} onClick={() => { setPermisosOpen(true); loadPermissions(); }} title="Gestionar permisos">
                    <Shield size={15} />
                  </button>
                )}
                <button className={styles.btnNuevo} onClick={activeTab === "equipo" ? abrirInvitar : abrirCrearCuadrilla}>
                  <Plus size={14} />
                  {activeTab === "equipo" ? "Agregar" : "Nueva"}
                </button>
              </div>
            </div>
            <div className={styles.tabBar}>
              <button className={`${styles.tab} ${activeTab === "equipo" ? styles.tabActive : ""}`} onClick={() => switchTab("equipo")}>
                Equipo
              </button>
              <button className={`${styles.tab} ${activeTab === "cuadrillas" ? styles.tabActive : ""}`} onClick={() => switchTab("cuadrillas")}>
                Cuadrillas
              </button>
            </div>
          </div>

          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder={activeTab === "equipo" ? "Buscar miembro…" : "Buscar cuadrilla…"}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && <button className={styles.searchClear} onClick={() => setBusqueda("")}><X size={13} /></button>}
          </div>

          <div className={styles.itemList}>
            {activeTab === "equipo" && (
              filteredUsers.length === 0 ? (
                <div className={styles.emptyState}><Users size={40} style={{ opacity: 0.12 }} /><p>Sin miembros</p></div>
              ) : filteredUsers.map((u) => {
                const isActive = u.activo !== false;
                const RolIcon = ROL_ICON[u.rol] ?? Wrench;
                return (
                  <button
                    key={u.id}
                    className={`${styles.itemCard} ${selected === u.id ? styles.itemCardActive : ""} ${!isActive ? styles.itemCardInactive : ""}`}
                    onClick={() => abrirUsuario(u)}
                  >
                    <div className={styles.userAvatar}>{u.nombre?.[0]?.toUpperCase() ?? "?"}</div>
                    <div className={styles.itemInfo}>
                      <div className={styles.itemTop}>
                        <span className={styles.itemName}>{u.nombre}</span>
                        {u.id === myId && <span className={styles.meBadge}>Tú</span>}
                        {!isActive && <span className={styles.inactivoBadge}>Inactivo</span>}
                      </div>
                      <span className={styles.itemSub}>
                        <RolIcon size={11} />
                        {ROL_LABEL[u.rol] ?? u.rol}
                        {u.oficio ? ` · ${u.oficio}` : ""}
                      </span>
                    </div>
                    {!isDesktop && <ChevronRight size={15} className={styles.itemChevron} />}
                  </button>
                );
              })
            )}

            {activeTab === "cuadrillas" && (
              filteredCuadrillas.length === 0 ? (
                <div className={styles.emptyState}>
                  <Users size={40} style={{ opacity: 0.12 }} />
                  <p>{busqueda ? "Sin resultados." : "No hay cuadrillas.\nCrea la primera."}</p>
                </div>
              ) : filteredCuadrillas.map((c) => {
                const tipo = TIPOS_CUADRILLA.find((t) => t.id === c.tipo);
                return (
                  <button
                    key={c.id}
                    className={`${styles.itemCard} ${selected === c.id ? styles.itemCardActive : ""}`}
                    onClick={() => abrirCuadrilla(c)}
                  >
                    <div className={styles.cuadrillaIcon} style={{ background: (c.color ?? "#6B7280") + "20", color: c.color ?? "#6B7280" }}>
                      <DynamicIcon name={c.icono} size={20} />
                    </div>
                    <div className={styles.itemInfo}>
                      <div className={styles.itemTop}>
                        <span className={styles.itemName}>{c.nombre}</span>
                      </div>
                      {tipo && (
                        <span className={styles.tipoBadge} style={{ background: c.color + "20", color: c.color }}>
                          {tipo.label}
                        </span>
                      )}
                      {c.descripcion && <span className={styles.itemSub2}>{c.descripcion}</span>}
                    </div>
                    {!isDesktop && <ChevronRight size={15} className={styles.itemChevron} />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: panel */}
        {(isDesktop || showPanel) && (
          <div className={showPanel && !isDesktop ? styles.mobileOverlay : styles.detailPanel}>

            {panelMode === null && (
              <div className={styles.emptyPanel}>
                <Users size={48} style={{ opacity: 0.12 }} />
                <p>{activeTab === "equipo" ? "Selecciona un miembro o agrega uno nuevo" : "Selecciona una cuadrilla o crea una nueva"}</p>
              </div>
            )}

            {activeTab === "equipo" && panelMode === "view" && panelData && (
              <PanelVerUsuario
                usuario={panelData}
                isMe={panelData.id === myId}
                myRol={myRol}
                onToggleActivo={() => setConfirm({ tipo: panelData.activo !== false ? "desactivar" : "activar", usuario: panelData })}
                onCambiarRol={(rol) => cambiarRol(panelData, rol)}
                onEliminar={() => setConfirm({ tipo: "eliminar", usuario: panelData })}
                onCerrar={() => { setPanelMode(null); setSelected(null); }}
              />
            )}

            {activeTab === "equipo" && panelMode === "invite" && (
              <PanelFormUsuario
                form={userForm} setForm={setUserForm}
                saving={saving} saveErr={saveErr} inviteOk={inviteOk}
                onGuardar={enviarInvitacion}
                onCerrar={() => { setPanelMode(null); setInviteOk(null); }}
              />
            )}

            {activeTab === "cuadrillas" && panelMode === "view" && panelData && (
              <PanelVerCuadrilla
                cuadrilla={panelData}
                members={panelMembers}
                loadingMembers={loadingPanel}
                usuarios={usuarios}
                onEditar={() => abrirEditarCuadrilla(panelData)}
                onEliminar={() => setConfirm({ tipo: "eliminarCuadrilla", cuadrilla: panelData })}
                onCerrar={() => { setPanelMode(null); setSelected(null); }}
              />
            )}

            {activeTab === "cuadrillas" && (panelMode === "create" || panelMode === "edit") && (
              <PanelFormCuadrilla
                mode={panelMode}
                form={cuadrillaForm} setForm={setCuadrillaForm}
                memberSel={memberSel} setMemberSel={setMemberSel}
                usuarios={usuarios}
                saving={saving} saveErr={saveErr}
                onGuardar={guardarCuadrilla}
                onCerrar={() => { setPanelMode(panelData ? "view" : null); }}
              />
            )}
          </div>
        )}
      </div>

      {/* Confirm */}
      {confirm && (
        <>
          <div className={styles.overlay} onClick={() => setConfirm(null)} />
          <div className={styles.confirmModal}>
            <AlertCircle size={32} style={{ color: confirm.tipo === "activar" ? "#F97316" : "#EF4444", marginBottom: 8 }} />
            <p className={styles.confirmText}>
              {confirm.tipo === "eliminar"          ? `¿Eliminar a ${confirm.usuario.nombre}?` :
               confirm.tipo === "desactivar"        ? `¿Desactivar a ${confirm.usuario.nombre}?` :
               confirm.tipo === "activar"           ? `¿Activar a ${confirm.usuario.nombre}?` :
               `¿Eliminar cuadrilla "${confirm.cuadrilla?.nombre}"?`}
            </p>
            <p className={styles.confirmSub}>
              {confirm.tipo === "eliminar"          ? "Esta acción no se puede deshacer." :
               confirm.tipo === "desactivar"        ? "No podrá iniciar sesión hasta que lo reactives." :
               confirm.tipo === "activar"           ? "Podrá volver a iniciar sesión." :
               "La cuadrilla se archivará pero no se eliminará."}
            </p>
            <div className={styles.confirmBtns}>
              <button className={styles.btnSecundario} onClick={() => setConfirm(null)}>Cancelar</button>
              <button
                className={confirm.tipo === "activar" ? styles.btnPrimario : styles.btnDanger}
                onClick={() => {
                  if (confirm.tipo === "eliminar")           eliminarUsuario(confirm.usuario);
                  else if (confirm.tipo === "desactivar" || confirm.tipo === "activar") toggleActivo(confirm.usuario);
                  else if (confirm.tipo === "eliminarCuadrilla") eliminarCuadrilla(confirm.cuadrilla);
                }}
              >
                {confirm.tipo === "activar" ? "Activar" :
                 confirm.tipo === "eliminar" || confirm.tipo === "eliminarCuadrilla" ? "Eliminar" : "Desactivar"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Permisos modal */}
      {permisosOpen && (
        <PermisosModal
          usuarios={usuarios.filter((u) => u.activo !== false && u.id !== myId)}
          permMatrix={permMatrix} permLoaded={permLoaded}
          permSaving={permSaving} permMsg={permMsg}
          togglePerm={togglePerm} guardarPermisos={guardarPermisos}
          onClose={() => setPermisosOpen(false)}
        />
      )}
    </div>
  );
}

// ── Panel Ver Usuario ─────────────────────────────────────────

function formatRelative(iso) {
  if (!iso) return "Sin actividad";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Justo ahora";
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `Hace ${days}d`;
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function formatJoined(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}

function PanelVerUsuario({ usuario, isMe, myRol, onToggleActivo, onCambiarRol, onEliminar, onCerrar }) {
  const isActive = usuario.activo !== false;
  const RolIcon  = ROL_ICON[usuario.rol] ?? Wrench;

  // Role options based on caller's role
  const roleOptions = esAdmin(myRol)
    ? [{ value: "tecnico", label: ROL_LABEL.tecnico }, { value: "jefe", label: ROL_LABEL.jefe }, { value: "admin", label: ROL_LABEL.admin }]
    : [{ value: "tecnico", label: ROL_LABEL.tecnico }, { value: "jefe", label: ROL_LABEL.jefe }];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <span className={styles.panelTitle}>{usuario.nombre}</span>
        </div>
        <div className={styles.panelHeaderActions}>
          {!isMe && esAdmin(myRol) && (
            <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onEliminar}><Trash2 size={15} /></button>
          )}
          <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
        </div>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.avatarCenter}>
          <div className={styles.userAvatarLg} style={{ opacity: isActive ? 1 : 0.5 }}>
            {usuario.nombre?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className={styles.avatarBadges}>
            <span className={styles.rolBadge}>
              <RolIcon size={12} />
              {ROL_LABEL[usuario.rol] ?? usuario.rol}
            </span>
            {!isActive && <span className={styles.inactivoBadgeLg}>Inactivo</span>}
            {isMe && <span className={styles.meBadgeLg}>Tú</span>}
          </div>
        </div>

        {/* Joined + last active */}
        <div className={styles.detSection}>
          {usuario.created_at && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Miembro desde</span>
              <span className={styles.metaValue}>{formatJoined(usuario.created_at)}</span>
            </div>
          )}
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>Última actividad</span>
            <span className={styles.metaValue}>{formatRelative(usuario.last_active)}</span>
          </div>
        </div>

        {usuario.oficio && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Oficio</p>
            <p className={styles.detText}>{usuario.oficio}</p>
          </div>
        )}

        {!isMe && esElevado(myRol) && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Rol</p>
            <select
              className={styles.formSelect}
              value={usuario.rol}
              onChange={(e) => onCambiarRol(e.target.value)}
            >
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {!isMe && esElevado(myRol) && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Acciones</p>
            <div className={styles.actionBtns}>
              <button className={styles.actionBtn} onClick={onToggleActivo}>
                {isActive ? <><UserX size={14} /> Desactivar</> : <><UserCheck size={14} /> Activar</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Panel Form Usuario (invite) ───────────────────────────────

function PanelFormUsuario({ form, setForm, saving, saveErr, inviteOk, onGuardar, onCerrar }) {
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  if (inviteOk) {
    return (
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.panelTitle}>¡Usuario creado!</span>
          <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.successBox}>
            <UserCheck size={48} style={{ color: "#22C55E", marginBottom: 12 }} />
            <p className={styles.successTitle}>¡Usuario creado!</p>
            <p className={styles.successSub}>Comparte estas credenciales con <strong>{inviteOk.nombre}</strong>:</p>
            <div className={styles.credBox}>
              <div className={styles.credRow}><span className={styles.credLabel}>Email</span><span className={styles.credVal}>{inviteOk.email}</span></div>
              <div className={styles.credRow}><span className={styles.credLabel}>Contraseña</span><span className={styles.credVal}>{inviteOk.password}</span></div>
            </div>
          </div>
        </div>
        <div className={styles.panelFooter}>
          <button className={styles.btnPrimario} onClick={onCerrar}>Listo</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Agregar miembro</span>
        <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Nombre completo *</label>
          <input className={styles.formInput} placeholder="Ej. Juan Pérez" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Email *</label>
          <input className={styles.formInput} type="email" placeholder="usuario@empresa.cl" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Contraseña temporal *</label>
          <input className={styles.formInput} type="text" placeholder="Mínimo 8 caracteres" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </div>
        <div className={styles.fieldRow2}>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Rol</label>
            <select className={styles.formSelect} value={form.rol} onChange={(e) => set("rol", e.target.value)}>
              <option value="tecnico">{ROL_LABEL.tecnico}</option>
              <option value="jefe">{ROL_LABEL.jefe}</option>
              <option value="admin">{ROL_LABEL.admin}</option>
            </select>
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel}>Oficio</label>
            <select className={styles.formSelect} value={form.oficio} onChange={(e) => set("oficio", e.target.value)}>
              <option value="">— Sin especificar —</option>
              {OFICIOS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
        {saveErr && <p className={styles.formError}>{saveErr}</p>}
      </div>
      <div className={styles.panelFooter}>
        <button className={styles.btnSecundario} onClick={onCerrar} disabled={saving}>Cancelar</button>
        <button className={styles.btnPrimario} onClick={onGuardar} disabled={saving}>
          {saving ? "Creando…" : "Agregar miembro"}
        </button>
      </div>
    </div>
  );
}

// ── Panel Ver Cuadrilla ───────────────────────────────────────

function PanelVerCuadrilla({ cuadrilla, members, loadingMembers, usuarios, onEditar, onEliminar, onCerrar }) {
  const tipo = TIPOS_CUADRILLA.find((t) => t.id === cuadrilla.tipo);
  const memberUsers = usuarios.filter((u) => members.includes(u.id));

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <span className={styles.panelTitle}>{cuadrilla.nombre}</span>
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onEditar}><Pencil size={15} /></button>
          <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onEliminar}><Trash2 size={15} /></button>
          <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
        </div>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.cuadrillaHeaderBox} style={{ background: (cuadrilla.color ?? "#6B7280") + "12" }}>
          <div className={styles.cuadrillaIconLg} style={{ background: (cuadrilla.color ?? "#6B7280") + "25", color: cuadrilla.color ?? "#6B7280" }}>
            <DynamicIcon name={cuadrilla.icono} size={36} />
          </div>
          {tipo && (
            <span className={styles.tipoBadgeLg} style={{ background: cuadrilla.color + "20", color: cuadrilla.color }}>
              {tipo.label}
            </span>
          )}
        </div>

        {cuadrilla.descripcion && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Descripción</p>
            <p className={styles.detText}>{cuadrilla.descripcion}</p>
          </div>
        )}

        <div className={styles.detSection}>
          <p className={styles.detLabel}>Integrantes · {loadingMembers ? "…" : memberUsers.length}</p>
          {loadingMembers ? (
            <p className={styles.partesVacias}>Cargando…</p>
          ) : memberUsers.length === 0 ? (
            <p className={styles.partesVacias}>Sin integrantes asignados</p>
          ) : (
            <div className={styles.memberList}>
              {memberUsers.map((u) => (
                <div key={u.id} className={styles.memberRow}>
                  <div className={styles.memberAvatar}>{u.nombre?.[0]?.toUpperCase() ?? "?"}</div>
                  <div className={styles.memberMeta}>
                    <span className={styles.memberName}>{u.nombre}</span>
                    {u.oficio && <span className={styles.memberOficio}>{u.oficio}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Panel Form Cuadrilla ──────────────────────────────────────

function PanelFormCuadrilla({ mode, form, setForm, memberSel, setMemberSel, usuarios, saving, saveErr, onGuardar, onCerrar }) {
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function seleccionarTipo(tipo) {
    set("tipo",  tipo.id);
    set("icono", tipo.icono);
    set("color", tipo.color);
  }

  function toggleMember(uid) {
    setMemberSel((p) => {
      const next = new Set(p);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  const activeUsers = usuarios.filter((u) => u.activo !== false);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>{mode === "create" ? "Nueva cuadrilla" : "Editar cuadrilla"}</span>
        <button className={styles.iconBtn} onClick={onCerrar}><X size={16} /></button>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Nombre *</label>
          <input className={styles.formInput} placeholder="Ej. Cuadrilla Eléctrica A" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Descripción</label>
          <textarea className={styles.formTextarea} placeholder="Descripción breve de la cuadrilla…" value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Tipo de cuadrilla *</label>
          <div className={styles.tipoGrid}>
            {TIPOS_CUADRILLA.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${styles.tipoBtn} ${form.tipo === t.id ? styles.tipoBtnActive : ""}`}
                style={form.tipo === t.id ? { borderColor: t.color, background: t.color + "15" } : {}}
                onClick={() => seleccionarTipo(t)}
              >
                <DynamicIcon name={t.icono} size={16} style={{ color: form.tipo === t.id ? t.color : undefined }} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Integrantes ({memberSel.size})</label>
          <div className={styles.memberPickerList}>
            {activeUsers.length === 0 ? (
              <p className={styles.partesVacias}>No hay miembros activos en el equipo.</p>
            ) : activeUsers.map((u) => {
              const sel = memberSel.has(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  className={`${styles.memberPickerItem} ${sel ? styles.memberPickerItemSel : ""}`}
                  onClick={() => toggleMember(u.id)}
                >
                  <div className={styles.memberAvatar}>{u.nombre?.[0]?.toUpperCase() ?? "?"}</div>
                  <div className={styles.memberMeta}>
                    <span className={styles.memberName}>{u.nombre}</span>
                    {u.oficio && <span className={styles.memberOficio}>{u.oficio}</span>}
                  </div>
                  <div className={`${styles.memberCheck} ${sel ? styles.memberCheckSel : ""}`}>
                    {sel && <Check size={12} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {saveErr && <p className={styles.formError}>{saveErr}</p>}
      </div>
      <div className={styles.panelFooter}>
        <button className={styles.btnSecundario} onClick={onCerrar} disabled={saving}>Cancelar</button>
        <button className={styles.btnPrimario} onClick={onGuardar} disabled={saving}>
          {saving ? "Guardando…" : mode === "create" ? "Crear cuadrilla" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// ── Permisos Modal ────────────────────────────────────────────

function PermisosModal({ usuarios, permMatrix, permLoaded, permSaving, permMsg, togglePerm, guardarPermisos, onClose }) {
  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.permModal}>
        <div className={styles.permModalHeader}>
          <h2 className={styles.permModalTitle}>Permisos del equipo</h2>
          <button className={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
        {!permLoaded ? (
          <div className={styles.permLoading}>Cargando permisos…</div>
        ) : (
          <>
            <div className={styles.permTableWrap}>
              <table className={styles.permTable}>
                <thead>
                  <tr>
                    <th className={styles.permTh}>Usuario</th>
                    {MODULOS.map((m) => <th key={m.id} className={styles.permTh}>{m.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((u) => (
                    <tr key={u.id} className={styles.permRow}>
                      <td className={styles.permUserCell}>
                        <span className={styles.permUserName}>{u.nombre}</span>
                        <span className={styles.permUserRol}>{ROL_LABEL[u.rol] ?? u.rol}</span>
                      </td>
                      {MODULOS.map((m) => {
                        const val = permMatrix[u.id]?.[m.id] !== false;
                        return (
                          <td key={m.id} className={styles.permCell}>
                            <button
                              className={`${styles.permToggle} ${val ? styles.permToggleOn : styles.permToggleOff}`}
                              onClick={() => togglePerm(u.id, m.id)}
                              title={val ? "Visible — clic para ocultar" : "Oculto — clic para mostrar"}
                            >
                              {val ? <Check size={13} /> : <span className={styles.permDash}>—</span>}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {usuarios.length === 0 && (
                    <tr><td colSpan={MODULOS.length + 1} className={styles.permEmpty}>No hay otros usuarios activos para configurar.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.permFooter}>
              {permMsg === "ok"    && <span className={styles.permOk}>Permisos guardados</span>}
              {permMsg === "error" && <span className={styles.permErr}>Error al guardar</span>}
              <button className={styles.btnPrimario} style={{ maxWidth: 200 }} onClick={guardarPermisos} disabled={permSaving}>
                {permSaving ? "Guardando…" : "Guardar permisos"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
