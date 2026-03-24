"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, ChevronRight, AlertTriangle, Thermometer, Volume2,
  Sun, Droplets, Wind, Gauge, GraduationCap, BookOpen,
  Check, Trash2, Pencil, Search, Paperclip, User,
  MapPin, Calendar, Clock, Shield, Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import styles from "./page.module.css";
import PlanGate from "@/components/PlanGate";

// ── DS 594 defaults ───────────────────────────────────────────
const DS594 = {
  temperatura: { unidad: "°C",    limite: 27,   hint: "Art. 98 DS 594 — máx. 27°C en trabajo sedentario" },
  iluminacion: { unidad: "lux",   limite: 300,  hint: "Mínimo 300 lux — áreas trabajo general (DS 594 Art.103)" },
  ruido:       { unidad: "dB(A)", limite: 85,   hint: "Máx. 85 dB(A) en 8h (DS 594 Art.74)" },
  humedad:     { unidad: "%",     limite: 65,   hint: "Máx. 65% humedad relativa (DS 594 Art.97)" },
  polvo:       { unidad: "mg/m³", limite: 3,    hint: "Fracción respirable — DS 594 / D.S. 4" },
  otro:        { unidad: "",      limite: null,  hint: "" },
};

function calcCumple(tipo, valor, limite) {
  if (limite == null || valor === "" || valor == null) return null;
  if (tipo === "iluminacion") return Number(valor) >= Number(limite);
  return Number(valor) <= Number(limite);
}

// ── Type/status meta ─────────────────────────────────────────
const TIPO_INCIDENTE = [
  { id: "accidente",              label: "Accidente",        color: "#dc2626", bg: "#fee2e2" },
  { id: "casi_accidente",         label: "Casi accidente",   color: "#d97706", bg: "#fef3c7" },
  { id: "enfermedad_profesional", label: "Enf. profesional", color: "#ea580c", bg: "#ffedd5" },
  { id: "emergencia",             label: "Emergencia",       color: "#7c3aed", bg: "#ede9fe" },
];

const ESTADO_INCIDENTE = [
  { id: "abierto",      label: "Abierto",      color: "#2563eb", bg: "#dbeafe" },
  { id: "investigando", label: "Investigando", color: "#d97706", bg: "#fef3c7" },
  { id: "cerrado",      label: "Cerrado",      color: "#16a34a", bg: "#dcfce7" },
];

const TIPO_MEDICION = [
  { id: "temperatura", label: "Temperatura", Icon: Thermometer, color: "#ea580c" },
  { id: "iluminacion", label: "Iluminación",  Icon: Sun,         color: "#ca8a04" },
  { id: "ruido",       label: "Ruido",        Icon: Volume2,     color: "#7c3aed" },
  { id: "humedad",     label: "Humedad",      Icon: Droplets,    color: "#0891b2" },
  { id: "polvo",       label: "Polvo",        Icon: Wind,        color: "#64748b" },
  { id: "otro",        label: "Otro",         Icon: Gauge,       color: "#6b7280" },
];

const TIPO_CAPACITACION = [
  { id: "induccion",          label: "Inducción" },
  { id: "prevencion_riesgos", label: "Prevención de riesgos" },
  { id: "primeros_auxilios",  label: "Primeros auxilios" },
  { id: "uso_epp",            label: "Uso de EPP" },
  { id: "emergencias",        label: "Emergencias" },
  { id: "especifico",         label: "Específico" },
  { id: "otro",               label: "Otro" },
];

// ── Empty forms ───────────────────────────────────────────────
const emptyIncidente = {
  tipo: "accidente", fecha_ocurrencia: "", trabajador_id: "", trabajador_nombre: "",
  descripcion: "", lugar: "", dias_perdidos: 0, estado: "abierto", causa_raiz: "",
};
const emptyMedicion = {
  tipo: "temperatura", fecha_medicion: "", ubicacion_id: "", lugar: "",
  valor: "", unidad: "°C", limite_legal: 27, responsable_id: "",
  observaciones: "", medida_preventiva: "",
};
const emptyCapacitacion = {
  nombre: "", tipo: "induccion", instructor: "", fecha: "",
  duracion_horas: "", proveedor: "", codigo_sence: "", descripcion: "",
};

// ── Helpers ───────────────────────────────────────────────────
function fFecha(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
}

function tipoIncMeta(id)   { return TIPO_INCIDENTE.find((t) => t.id === id) ?? TIPO_INCIDENTE[0]; }
function estadoMeta(id)    { return ESTADO_INCIDENTE.find((e) => e.id === id) ?? ESTADO_INCIDENTE[0]; }
function tipoMedMeta(id)   { return TIPO_MEDICION.find((t) => t.id === id) ?? TIPO_MEDICION[5]; }
function capLabel(id)      { return TIPO_CAPACITACION.find((t) => t.id === id)?.label ?? id; }

function TipoBadge({ m }) {
  return (
    <span style={{ display:"inline-block", fontSize:10, fontWeight:700, padding:"2px 8px",
      borderRadius:20, background:m.bg, color:m.color, whiteSpace:"nowrap" }}>
      {m.label}
    </span>
  );
}

function MetaItem({ icon, label, val }) {
  return (
    <div className={styles.metaItem}>
      <span className={styles.metaIcon}>{icon}</span>
      <div>
        <span className={styles.metaKey}>{label}</span>
        <span className={styles.metaVal}>{val ?? "—"}</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════
export default function NormativaPage() {
  const router = useRouter();

  const [plantaId,    setPlantaId]    = useState(null);
  const [myRol,       setMyRol]       = useState(null);
  const [plan,        setPlan]        = useState(null);
  const [planStatus,  setPlanStatus]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);

  const [activeTab, setActiveTab] = useState("incidentes");

  const [incidentes,     setIncidentes]     = useState([]);
  const [mediciones,     setMediciones]     = useState([]);
  const [capacitaciones, setCapacitaciones] = useState([]);
  const [usuarios,       setUsuarios]       = useState([]);
  const [ubicaciones,    setUbicaciones]    = useState([]);

  const [selected,       setSelected]       = useState(null);
  const [panelMode,      setPanelMode]      = useState(null); // null|"view"|"create"|"edit"
  const [panelData,      setPanelData]      = useState(null);
  const [panelAsistentes,setPanelAsistentes]= useState([]);
  const [loadingPanel,   setLoadingPanel]   = useState(false);

  const [form,                setForm]                = useState(emptyIncidente);
  const [medidasList,         setMedidasList]         = useState([]);
  const [asistSel,            setAsistSel]            = useState(new Set());
  const [trabajadorEnSistema, setTrabajadorEnSistema] = useState(true);

  const [adjFile,    setAdjFile]    = useState(null);
  const [imgFile,    setImgFile]    = useState(null);
  const [imgPreview, setImgPreview] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [saveErr,    setSaveErr]    = useState(null);
  const [confirm,    setConfirm]    = useState(null);
  const [busqueda,   setBusqueda]   = useState("");

  const imgRef  = useRef(null);
  const fileRef = useRef(null);

  // ── Desktop detection ───────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // ── Init ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: perfil } = await sb.from("usuarios").select("workspace_id, rol, plan, plan_status").eq("id", user.id).maybeSingle();
      const pId = perfil?.workspace_id;
      if (!pId) return;
      setPlantaId(pId);
      setMyRol(perfil.rol);
      setPlan(perfil?.plan ?? "basic");
      setPlanStatus(perfil?.plan_status ?? null);
      await cargarTodo(sb, pId);
      setLoading(false);
    }
    init();
  }, []);

  async function cargarTodo(sb, pId) {
    const [r1, r2, r3, r4, r5] = await Promise.allSettled([
      sb.from("incidentes").select("*").eq("workspace_id", pId).order("fecha_ocurrencia", { ascending: false }),
      sb.from("mediciones_ambientales").select("*, ubicaciones(edificio,piso)").eq("workspace_id", pId).order("fecha_medicion", { ascending: false }),
      sb.from("capacitaciones").select("*").eq("workspace_id", pId).order("fecha", { ascending: false }),
      sb.from("usuarios").select("id,nombre,rol").eq("workspace_id", pId).order("nombre"),
      sb.from("ubicaciones").select("id,edificio,piso").eq("workspace_id", pId).order("edificio"),
    ]);
    const val = (r) => r.status === "fulfilled" ? (r.value?.data ?? []) : [];
    setIncidentes(val(r1));
    setMediciones(val(r2));
    setCapacitaciones(val(r3));
    setUsuarios(val(r4));
    setUbicaciones(val(r5));
  }

  // ── Tab / panel helpers ─────────────────────────────────────
  function cambiarTab(tab) {
    setActiveTab(tab);
    setPanelMode(null);
    setSelected(null);
    setPanelData(null);
    setBusqueda("");
  }

  function cerrarPanel() {
    setPanelMode(null);
    setSelected(null);
    setPanelData(null);
  }

  function emptyForTab(tab) {
    if (tab === "incidentes") return { ...emptyIncidente };
    if (tab === "mediciones") return { ...emptyMedicion };
    return { ...emptyCapacitacion };
  }

  function abrirCrear() {
    setForm(emptyForTab(activeTab));
    setMedidasList([]);
    setAsistSel(new Set());
    setTrabajadorEnSistema(true);
    setAdjFile(null); setImgFile(null); setImgPreview(null);
    setSaveErr(null);
    setSelected(null); setPanelData(null);
    setPanelMode("create");
  }

  async function abrirItem(item) {
    setSelected(item.id);
    setPanelData(item);
    setPanelMode("view");
    if (activeTab === "capacitaciones") {
      setLoadingPanel(true);
      const sb = createClient();
      const { data, error } = await sb.from("capacitacion_asistentes").select("usuario_id").eq("capacitacion_id", item.id);
      if (!error) setPanelAsistentes(data?.map((r) => r.usuario_id) ?? []);
      setLoadingPanel(false);
    }
  }

  async function abrirEditar(item) {
    let f;
    if (activeTab === "incidentes") {
      f = {
        tipo: item.tipo ?? "accidente",
        fecha_ocurrencia: item.fecha_ocurrencia ? item.fecha_ocurrencia.slice(0, 16) : "",
        trabajador_id: item.trabajador_id ?? "",
        trabajador_nombre: item.trabajador_nombre ?? "",
        descripcion: item.descripcion ?? "",
        lugar: item.lugar ?? "",
        dias_perdidos: item.dias_perdidos ?? 0,
        estado: item.estado ?? "abierto",
        causa_raiz: item.causa_raiz ?? "",
      };
      setMedidasList(Array.isArray(item.medidas_correctivas) ? [...item.medidas_correctivas] : []);
      setTrabajadorEnSistema(!!(item.trabajador_id));
    } else if (activeTab === "mediciones") {
      f = {
        tipo: item.tipo ?? "temperatura",
        fecha_medicion: item.fecha_medicion ? item.fecha_medicion.slice(0, 16) : "",
        ubicacion_id: item.ubicacion_id ?? "",
        lugar: item.lugar ?? "",
        valor: item.valor ?? "",
        unidad: item.unidad ?? "°C",
        limite_legal: item.limite_legal ?? DS594.temperatura.limite,
        responsable_id: item.responsable_id ?? "",
        observaciones: item.observaciones ?? "",
        medida_preventiva: item.medida_preventiva ?? "",
      };
    } else {
      f = {
        nombre: item.nombre ?? "",
        tipo: item.tipo ?? "induccion",
        instructor: item.instructor ?? "",
        fecha: item.fecha ?? "",
        duracion_horas: item.duracion_horas ?? "",
        proveedor: item.proveedor ?? "",
        codigo_sence: item.codigo_sence ?? "",
        descripcion: item.descripcion ?? "",
      };
      // Load asistentes
      let asistIds = panelAsistentes;
      if (asistIds.length === 0 && item.id) {
        const sb = createClient();
        const { data } = await sb.from("capacitacion_asistentes").select("usuario_id").eq("capacitacion_id", item.id);
        asistIds = data?.map((r) => r.usuario_id) ?? [];
        setPanelAsistentes(asistIds);
      }
      setAsistSel(new Set(asistIds));
    }
    setForm(f);
    setAdjFile(null); setImgFile(null); setImgPreview(null);
    setSaveErr(null);
    setPanelMode("edit");
  }

  // ── Save ────────────────────────────────────────────────────
  async function guardar() {
    setSaveErr(null); setSaving(true);
    const sb = createClient();

    let archivo_url    = panelMode === "edit" ? (panelData?.archivo_url    ?? null) : null;
    let archivo_nombre = panelMode === "edit" ? (panelData?.archivo_nombre ?? null) : null;
    let imagen_url     = panelMode === "edit" ? (panelData?.imagen_url     ?? null) : null;

    if (adjFile) {
      const ext = adjFile.name.split(".").pop();
      const path = `${plantaId}/${Date.now()}.${ext}`;
      const { data: up } = await sb.storage.from("normativa-archivos").upload(path, adjFile, { upsert: true });
      if (up?.path) {
        const { data: pub } = sb.storage.from("normativa-archivos").getPublicUrl(up.path);
        archivo_url = pub?.publicUrl ?? null;
        archivo_nombre = adjFile.name;
      }
    }
    if (imgFile) {
      const ext = imgFile.name.split(".").pop();
      const path = `${plantaId}/${Date.now()}.${ext}`;
      const { data: up } = await sb.storage.from("normativa-imagenes").upload(path, imgFile, { upsert: true });
      if (up?.path) {
        const { data: pub } = sb.storage.from("normativa-imagenes").getPublicUrl(up.path);
        imagen_url = pub?.publicUrl ?? null;
      }
    }

    let error = null;

    if (activeTab === "incidentes") {
      if (!form.tipo)              { setSaveErr("Selecciona el tipo."); setSaving(false); return; }
      if (!form.fecha_ocurrencia)  { setSaveErr("La fecha es obligatoria."); setSaving(false); return; }
      if (!form.descripcion.trim()){ setSaveErr("La descripción es obligatoria."); setSaving(false); return; }

      const payload = {
        tipo: form.tipo,
        fecha_ocurrencia: form.fecha_ocurrencia,
        trabajador_id: trabajadorEnSistema && form.trabajador_id ? form.trabajador_id : null,
        trabajador_nombre: !trabajadorEnSistema ? (form.trabajador_nombre.trim() || null) : null,
        descripcion: form.descripcion.trim(),
        lugar: form.lugar.trim() || null,
        dias_perdidos: Number(form.dias_perdidos) || 0,
        estado: form.estado,
        causa_raiz: form.causa_raiz.trim() || null,
        medidas_correctivas: medidasList,
        imagen_url, archivo_url, archivo_nombre,
      };
      if (panelMode === "create") {
        const r = await sb.from("incidentes").insert({ ...payload, workspace_id: plantaId }).select().single();
        error = r.error;
        if (!error) { setPanelData(r.data); setSelected(r.data.id); setPanelMode("view"); }
      } else {
        const r = await sb.from("incidentes").update(payload).eq("id", panelData.id).select().single();
        error = r.error;
        if (!error) { setPanelData(r.data); setPanelMode("view"); }
      }

    } else if (activeTab === "mediciones") {
      if (!form.tipo)         { setSaveErr("Selecciona el tipo."); setSaving(false); return; }
      if (!form.fecha_medicion){ setSaveErr("La fecha es obligatoria."); setSaving(false); return; }
      if (form.valor === "")  { setSaveErr("El valor medido es obligatorio."); setSaving(false); return; }

      const cumple = calcCumple(form.tipo, form.valor, form.limite_legal);
      const payload = {
        tipo: form.tipo,
        fecha_medicion: form.fecha_medicion,
        ubicacion_id: form.ubicacion_id || null,
        lugar: form.lugar.trim() || null,
        valor: Number(form.valor),
        unidad: form.unidad,
        limite_legal: form.limite_legal !== "" ? Number(form.limite_legal) : null,
        cumple,
        responsable_id: form.responsable_id || null,
        observaciones: form.observaciones.trim() || null,
        medida_preventiva: form.medida_preventiva.trim() || null,
        archivo_url, archivo_nombre,
      };
      if (panelMode === "create") {
        const r = await sb.from("mediciones_ambientales").insert({ ...payload, workspace_id: plantaId }).select().single();
        error = r.error;
        if (!error) { setPanelData(r.data); setSelected(r.data.id); setPanelMode("view"); }
      } else {
        const r = await sb.from("mediciones_ambientales").update(payload).eq("id", panelData.id).select().single();
        error = r.error;
        if (!error) { setPanelData(r.data); setPanelMode("view"); }
      }

    } else {
      if (!form.nombre.trim()) { setSaveErr("El nombre es obligatorio."); setSaving(false); return; }
      if (!form.fecha)         { setSaveErr("La fecha es obligatoria."); setSaving(false); return; }

      const payload = {
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        instructor: form.instructor.trim() || null,
        fecha: form.fecha,
        duracion_horas: form.duracion_horas !== "" ? Number(form.duracion_horas) : null,
        proveedor: form.proveedor.trim() || null,
        codigo_sence: form.codigo_sence.trim() || null,
        descripcion: form.descripcion.trim() || null,
        archivo_url, archivo_nombre,
      };

      let capId = panelData?.id;
      if (panelMode === "create") {
        const r = await sb.from("capacitaciones").insert({ ...payload, workspace_id: plantaId }).select().single();
        error = r.error;
        if (!error) capId = r.data.id;
      } else {
        const r = await sb.from("capacitaciones").update(payload).eq("id", panelData.id).select().single();
        error = r.error;
      }
      if (!error && capId) {
        await sb.from("capacitacion_asistentes").delete().eq("capacitacion_id", capId);
        const rows = [...asistSel].map((uid) => ({ capacitacion_id: capId, usuario_id: uid }));
        if (rows.length > 0) await sb.from("capacitacion_asistentes").insert(rows);
        const newAsist = [...asistSel];
        const { data: newCap } = await sb.from("capacitaciones").select("*").eq("id", capId).single();
        setPanelData(newCap); setSelected(capId); setPanelMode("view"); setPanelAsistentes(newAsist);
      }
    }

    setSaving(false);
    if (error) { setSaveErr(error.message); return; }
    await cargarTodo(createClient(), plantaId);
  }

  // ── Delete ──────────────────────────────────────────────────
  async function eliminar(item) {
    const sb = createClient();
    const table = activeTab === "incidentes" ? "incidentes"
      : activeTab === "mediciones" ? "mediciones_ambientales" : "capacitaciones";
    await sb.from(table).delete().eq("id", item.id);
    setConfirm(null); cerrarPanel();
    await cargarTodo(sb, plantaId);
  }

  // ── Inline medida toggle ─────────────────────────────────────
  async function toggleMedida(incidente, idx) {
    const updated = incidente.medidas_correctivas.map((m, i) =>
      i === idx ? { ...m, completada: !m.completada } : m
    );
    const sb = createClient();
    await sb.from("incidentes").update({ medidas_correctivas: updated }).eq("id", incidente.id);
    setIncidentes((prev) => prev.map((inc) => inc.id === incidente.id ? { ...inc, medidas_correctivas: updated } : inc));
    if (panelData?.id === incidente.id) setPanelData((prev) => ({ ...prev, medidas_correctivas: updated }));
  }

  // ── Inline estado change ─────────────────────────────────────
  async function cambiarEstado(id, newEstado) {
    const sb = createClient();
    await sb.from("incidentes").update({ estado: newEstado }).eq("id", id);
    setIncidentes((prev) => prev.map((inc) => inc.id === id ? { ...inc, estado: newEstado } : inc));
    if (panelData?.id === id) setPanelData((prev) => ({ ...prev, estado: newEstado }));
  }

  // ── Medidas list helpers ─────────────────────────────────────
  function addMedida() {
    setMedidasList((prev) => [...prev, { descripcion: "", responsable_id: "", fecha_limite: "", completada: false }]);
  }
  function setMedida(idx, key, val) {
    setMedidasList((prev) => prev.map((m, i) => i === idx ? { ...m, [key]: val } : m));
  }
  function removeMedida(idx) {
    setMedidasList((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleAsistente(uid) {
    setAsistSel((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  }

  // ── Filtered lists ───────────────────────────────────────────
  const q = busqueda.toLowerCase();
  const filtInc = incidentes.filter((i) =>
    (usuarios.find((u) => u.id === i.trabajador_id)?.nombre ?? i.trabajador_nombre ?? "").toLowerCase().includes(q) ||
    (i.descripcion ?? "").toLowerCase().includes(q) || (i.lugar ?? "").toLowerCase().includes(q)
  );
  const filtMed = mediciones.filter((m) =>
    (m.tipo ?? "").toLowerCase().includes(q) || (m.lugar ?? "").toLowerCase().includes(q) ||
    (m.ubicaciones?.edificio ?? "").toLowerCase().includes(q)
  );
  const filtCap = capacitaciones.filter((c) =>
    (c.nombre ?? "").toLowerCase().includes(q) || (c.instructor ?? "").toLowerCase().includes(q)
  );

  if (loading) return <div className={styles.loadingScreen}>Cargando normativa…</div>;

  const isAdmin = myRol === "admin";

  // ── Render ───────────────────────────────────────────────────
  return (
    <PlanGate
      plan={plan}
      planStatus={planStatus}
      feature="normativa"
      title="Normativa y Seguridad"
      description="Registra incidentes, mediciones ambientales y capacitaciones según DS 594 y Ley 16.744."
      bullets={[
        "Registro de accidentes e incidentes laborales",
        "Mediciones ambientales con límites DS 594",
        "Capacitaciones y control de asistencia",
        "Historial completo para auditorías e inspecciones SEREMI",
      ]}
      icon={Shield}
    >
    <div className={styles.root}>
      <div className={styles.splitLayout}>

        {/* ── Left panel ── */}
        <div className={`${styles.listPanel} ${panelMode !== null && !isDesktop ? styles.listPanelHidden : ""}`}>

          {/* Header */}
          <div className={styles.listHeader}>
            <div className={styles.listHeaderTop}>
              <h1 className={styles.listTitle}>Normativa</h1>
              <button className={styles.btnNuevo} onClick={abrirCrear}>
                <Plus size={14} />
                <span>Nuevo</span>
              </button>
            </div>
            <div className={styles.tabBar}>
              {[
                { id: "incidentes",     label: "Incidentes" },
                { id: "mediciones",     label: "Mediciones" },
                { id: "capacitaciones", label: "Capacitaciones" },
              ].map((t) => (
                <button
                  key={t.id}
                  className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabBtnActive : ""}`}
                  onClick={() => cambiarTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className={styles.searchWrap}>
            <Search size={14} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Buscar…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button className={styles.searchClear} onClick={() => setBusqueda("")}>
                <X size={13} />
              </button>
            )}
          </div>

          {/* Item list */}
          <div className={styles.itemList}>

            {/* ── Incidentes ── */}
            {activeTab === "incidentes" && (
              filtInc.length === 0
                ? <div className={styles.emptyState}>Sin incidentes registrados</div>
                : filtInc.map((item) => {
                    const tm = tipoIncMeta(item.tipo);
                    const em = estadoMeta(item.estado);
                    const trab = item.trabajador_nombre ?? usuarios.find((u) => u.id === item.trabajador_id)?.nombre ?? "Sin asignar";
                    return (
                      <button key={item.id} className={`${styles.itemCard} ${selected === item.id ? styles.itemCardActive : ""}`} onClick={() => abrirItem(item)}>
                        <div className={styles.itemCardIcon} style={{ background: tm.bg }}>
                          <AlertTriangle size={16} style={{ color: tm.color }} />
                        </div>
                        <div className={styles.itemCardInfo}>
                          <div className={styles.itemCardTop}>
                            <span className={styles.itemCardName}>{tm.label}</span>
                            <span className={styles.estadoDot} style={{ background: em.color }} />
                          </div>
                          <div className={styles.itemCardMeta}>
                            <span className={styles.itemCardSub}>{trab}</span>
                            <span className={styles.itemCardDate}>{fFecha(item.fecha_ocurrencia)}</span>
                          </div>
                        </div>
                        <ChevronRight size={14} className={styles.itemChevron} />
                      </button>
                    );
                  })
            )}

            {/* ── Mediciones ── */}
            {activeTab === "mediciones" && (
              filtMed.length === 0
                ? <div className={styles.emptyState}>Sin mediciones registradas</div>
                : filtMed.map((item) => {
                    const tm = tipoMedMeta(item.tipo);
                    const lugar = item.ubicaciones ? [item.ubicaciones.edificio, item.ubicaciones.piso].filter(Boolean).join(" · ") : (item.lugar ?? "—");
                    const cumpleDot = item.cumple === true ? "#16a34a" : item.cumple === false ? "#dc2626" : "#9ca3af";
                    return (
                      <button key={item.id} className={`${styles.itemCard} ${selected === item.id ? styles.itemCardActive : ""}`} onClick={() => abrirItem(item)}>
                        <div className={styles.itemCardIcon} style={{ background: tm.color + "20" }}>
                          <tm.Icon size={16} style={{ color: tm.color }} />
                        </div>
                        <div className={styles.itemCardInfo}>
                          <div className={styles.itemCardTop}>
                            <span className={styles.itemCardName}>{tm.label}</span>
                            <span className={styles.estadoDot} style={{ background: cumpleDot }} />
                          </div>
                          <div className={styles.itemCardMeta}>
                            <span className={styles.itemCardSub}>{lugar}</span>
                            <span className={styles.itemCardDate}>{item.valor} {item.unidad}</span>
                          </div>
                        </div>
                        <ChevronRight size={14} className={styles.itemChevron} />
                      </button>
                    );
                  })
            )}

            {/* ── Capacitaciones ── */}
            {activeTab === "capacitaciones" && (
              filtCap.length === 0
                ? <div className={styles.emptyState}>Sin capacitaciones registradas</div>
                : filtCap.map((item) => (
                    <button key={item.id} className={`${styles.itemCard} ${selected === item.id ? styles.itemCardActive : ""}`} onClick={() => abrirItem(item)}>
                      <div className={styles.itemCardIcon} style={{ background: "#dbeafe" }}>
                        <GraduationCap size={16} style={{ color: "#2563eb" }} />
                      </div>
                      <div className={styles.itemCardInfo}>
                        <div className={styles.itemCardTop}>
                          <span className={styles.itemCardName}>{item.nombre}</span>
                        </div>
                        <div className={styles.itemCardMeta}>
                          <span className={styles.itemCardSub}>{item.instructor ?? capLabel(item.tipo)}</span>
                          <span className={styles.itemCardDate}>
                            {item.fecha ? new Date(item.fecha).toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) : "—"}
                          </span>
                        </div>
                      </div>
                      <ChevronRight size={14} className={styles.itemChevron} />
                    </button>
                  ))
            )}

          </div>
        </div>

        {/* ── Right panel ── */}
        {(isDesktop || panelMode !== null) && (
          <div className={panelMode !== null && !isDesktop ? styles.mobileOverlay : styles.detailPanel}>

            {panelMode === null && (
              <div className={styles.emptyPanel}>
                <Shield size={36} />
                <span>Selecciona un elemento{"\n"}o crea uno nuevo</span>
              </div>
            )}

            {/* View panels */}
            {panelMode === "view" && activeTab === "incidentes" && panelData && (
              <PanelVerIncidente
                item={panelData} usuarios={usuarios} isAdmin={isAdmin}
                onEdit={() => abrirEditar(panelData)} onDelete={() => setConfirm(panelData)}
                onClose={cerrarPanel} onToggleMedida={toggleMedida} onCambiarEstado={cambiarEstado}
              />
            )}
            {panelMode === "view" && activeTab === "mediciones" && panelData && (
              <PanelVerMedicion
                item={panelData} usuarios={usuarios} isAdmin={isAdmin}
                onEdit={() => abrirEditar(panelData)} onDelete={() => setConfirm(panelData)}
                onClose={cerrarPanel}
              />
            )}
            {panelMode === "view" && activeTab === "capacitaciones" && panelData && (
              <PanelVerCapacitacion
                item={panelData} asistentes={panelAsistentes} usuarios={usuarios}
                loading={loadingPanel} isAdmin={isAdmin}
                onEdit={() => abrirEditar(panelData)} onDelete={() => setConfirm(panelData)}
                onClose={cerrarPanel}
              />
            )}

            {/* Create / Edit form */}
            {(panelMode === "create" || panelMode === "edit") && (
              <PanelForm
                tab={activeTab} mode={panelMode}
                form={form} setForm={setForm}
                medidasList={medidasList} addMedida={addMedida}
                setMedida={setMedida} removeMedida={removeMedida}
                asistSel={asistSel} toggleAsistente={toggleAsistente}
                trabajadorEnSistema={trabajadorEnSistema}
                setTrabajadorEnSistema={setTrabajadorEnSistema}
                usuarios={usuarios} ubicaciones={ubicaciones}
                adjFile={adjFile} setAdjFile={setAdjFile}
                imgFile={imgFile} setImgFile={setImgFile}
                imgPreview={imgPreview} setImgPreview={setImgPreview}
                saving={saving} saveErr={saveErr}
                existingData={panelData}
                imgRef={imgRef} fileRef={fileRef}
                onSave={guardar} onClose={cerrarPanel}
              />
            )}

          </div>
        )}
      </div>

      {/* Confirm delete */}
      {confirm && (
        <>
          <div className={styles.overlay} onClick={() => setConfirm(null)} />
          <div className={styles.confirmModal}>
            <p className={styles.confirmText}>¿Eliminar este registro?</p>
            <p className={styles.confirmSub}>Esta acción no se puede deshacer.</p>
            <div className={styles.confirmBtns}>
              <button className={styles.btnSecundario} onClick={() => setConfirm(null)}>Cancelar</button>
              <button className={styles.btnDanger} onClick={() => eliminar(confirm)}>Eliminar</button>
            </div>
          </div>
        </>
      )}
    </div>
    </PlanGate>
  );
}

// ══════════════════════════════════════════════════════════════
// PanelVerIncidente
// ══════════════════════════════════════════════════════════════
function PanelVerIncidente({ item, usuarios, isAdmin, onEdit, onDelete, onClose, onToggleMedida, onCambiarEstado }) {
  const tm    = tipoIncMeta(item.tipo);
  const trab  = item.trabajador_nombre ?? usuarios.find((u) => u.id === item.trabajador_id)?.nombre ?? "—";
  const medidas = Array.isArray(item.medidas_correctivas) ? item.medidas_correctivas : [];

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <TipoBadge m={tm} />
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onEdit}><Pencil size={15} /></button>
          {isAdmin && <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete}><Trash2 size={15} /></button>}
          <button className={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className={styles.panelBody}>

        {/* Estado pills */}
        <div className={styles.detSection}>
          <p className={styles.detLabel}>Estado</p>
          <div className={styles.pillRow}>
            {ESTADO_INCIDENTE.map((e) => (
              <button
                key={e.id}
                className={`${styles.estadoPill} ${item.estado === e.id ? styles.estadoPillActive : ""}`}
                style={item.estado === e.id ? { background: e.bg, color: e.color, borderColor: e.color } : {}}
                onClick={() => onCambiarEstado(item.id, e.id)}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {item.imagen_url && (
          <div className={styles.detImgWrap}>
            <img src={item.imagen_url} alt="Evidencia" className={styles.detImg} />
          </div>
        )}

        <div className={styles.metaGrid}>
          <MetaItem icon={<Calendar size={14} />} label="Fecha" val={fFecha(item.fecha_ocurrencia)} />
          <MetaItem icon={<User size={14} />} label="Trabajador" val={trab} />
          <MetaItem icon={<MapPin size={14} />} label="Lugar" val={item.lugar ?? "—"} />
          <MetaItem icon={<Clock size={14} />} label="Días perdidos" val={item.dias_perdidos ?? 0} />
        </div>

        <div className={styles.detSection}>
          <p className={styles.detLabel}>Descripción</p>
          <p className={styles.detText}>{item.descripcion}</p>
        </div>

        {(item.causa_raiz || medidas.length > 0) && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Investigación</p>
            {item.causa_raiz && <p className={styles.detText} style={{ marginBottom: medidas.length > 0 ? 12 : 0 }}>{item.causa_raiz}</p>}
            {medidas.length > 0 && (
              <div className={styles.medidasList}>
                {medidas.map((m, idx) => (
                  <div key={idx} className={styles.medidaRow}>
                    <button
                      className={`${styles.medidaCheck} ${m.completada ? styles.medidaCheckDone : ""}`}
                      onClick={() => onToggleMedida(item, idx)}
                    >
                      {m.completada && <Check size={11} />}
                    </button>
                    <div className={styles.medidaInfo}>
                      <span className={m.completada ? styles.medidaTextDone : styles.medidaText}>{m.descripcion || "(sin descripción)"}</span>
                      {(m.responsable_id || m.fecha_limite) && (
                        <span className={styles.medidaMeta}>
                          {m.responsable_id && usuarios.find((u) => u.id === m.responsable_id)?.nombre}
                          {m.responsable_id && m.fecha_limite && " · "}
                          {m.fecha_limite && new Date(m.fecha_limite).toLocaleDateString("es-CL")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {item.archivo_url && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Adjunto</p>
            <a href={item.archivo_url} target="_blank" rel="noopener noreferrer" className={styles.adjuntoLink}>
              <Paperclip size={13} />{item.archivo_nombre ?? "Ver archivo"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PanelVerMedicion
// ══════════════════════════════════════════════════════════════
function PanelVerMedicion({ item, usuarios, isAdmin, onEdit, onDelete, onClose }) {
  const tm          = tipoMedMeta(item.tipo);
  const lugar       = item.ubicaciones ? [item.ubicaciones.edificio, item.ubicaciones.piso].filter(Boolean).join(" · ") : (item.lugar ?? "—");
  const responsable = usuarios.find((u) => u.id === item.responsable_id)?.nombre ?? "—";

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft} style={{ gap: 8 }}>
          <tm.Icon size={16} style={{ color: tm.color, flexShrink: 0 }} />
          <h2 className={styles.panelTitle}>{tm.label}</h2>
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onEdit}><Pencil size={15} /></button>
          {isAdmin && <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete}><Trash2 size={15} /></button>}
          <button className={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className={styles.panelBody}>

        <div style={{ marginBottom: 16 }}>
          {item.cumple === true  && <span className={`${styles.cumpleBadge} ${styles.cumpleSi}`}>Cumple DS 594</span>}
          {item.cumple === false && <span className={`${styles.cumpleBadge} ${styles.cumpleNo}`}>No cumple DS 594</span>}
          {item.cumple == null   && <span className={styles.cumpleBadge}>Sin verificar</span>}
        </div>

        <div className={styles.valorDisplay}>
          {item.valor} <span className={styles.valorUnidad}>{item.unidad}</span>
        </div>
        {item.limite_legal != null && (
          <p className={styles.limiteHint}>Límite: {item.limite_legal} {item.unidad}</p>
        )}

        <div className={styles.metaGrid} style={{ marginTop: 16 }}>
          <MetaItem icon={<Calendar size={14} />} label="Fecha" val={fFecha(item.fecha_medicion)} />
          <MetaItem icon={<MapPin size={14} />} label="Lugar" val={lugar} />
          <MetaItem icon={<User size={14} />} label="Responsable" val={responsable} />
        </div>

        {item.observaciones && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Observaciones</p>
            <p className={styles.detText}>{item.observaciones}</p>
          </div>
        )}
        {item.medida_preventiva && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Medida preventiva</p>
            <p className={styles.detText}>{item.medida_preventiva}</p>
          </div>
        )}
        {item.archivo_url && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Evidencia</p>
            <a href={item.archivo_url} target="_blank" rel="noopener noreferrer" className={styles.adjuntoLink}>
              <Paperclip size={13} />{item.archivo_nombre ?? "Ver archivo"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PanelVerCapacitacion
// ══════════════════════════════════════════════════════════════
function PanelVerCapacitacion({ item, asistentes, usuarios, loading, isAdmin, onEdit, onDelete, onClose }) {
  const asistData = usuarios.filter((u) => asistentes.includes(u.id));

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft} style={{ gap: 8 }}>
          <GraduationCap size={16} style={{ color: "#2563eb", flexShrink: 0 }} />
          <h2 className={styles.panelTitle}>{item.nombre}</h2>
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onEdit}><Pencil size={15} /></button>
          {isAdmin && <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onDelete}><Trash2 size={15} /></button>}
          <button className={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
      </div>
      <div className={styles.panelBody}>

        <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#dbeafe", color: "#2563eb", marginBottom: 16 }}>
          {capLabel(item.tipo)}
        </span>

        <div className={styles.metaGrid}>
          <MetaItem icon={<User size={14} />} label="Instructor" val={item.instructor ?? "—"} />
          <MetaItem icon={<Calendar size={14} />} label="Fecha" val={item.fecha ? new Date(item.fecha).toLocaleDateString("es-CL") : "—"} />
          <MetaItem icon={<Clock size={14} />} label="Duración" val={item.duracion_horas ? `${item.duracion_horas} hrs` : "—"} />
          <MetaItem icon={<BookOpen size={14} />} label="Código SENCE" val={item.codigo_sence ?? "—"} />
        </div>

        {item.proveedor && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Organismo / Proveedor</p>
            <p className={styles.detText}>{item.proveedor}</p>
          </div>
        )}
        {item.descripcion && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Descripción</p>
            <p className={styles.detText}>{item.descripcion}</p>
          </div>
        )}

        <div className={styles.detSection}>
          <p className={styles.detLabel}>Asistentes ({asistData.length})</p>
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--accent-5)" }}>Cargando…</p>
          ) : asistData.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--accent-5)" }}>Sin asistentes registrados</p>
          ) : (
            <div className={styles.asistList}>
              {asistData.map((u) => (
                <div key={u.id} className={styles.asistRow}>
                  <div className={styles.asistAvatar}>{u.nombre.charAt(0).toUpperCase()}</div>
                  <span className={styles.asistName}>{u.nombre}</span>
                  <Check size={13} className={styles.asistCheck} />
                </div>
              ))}
            </div>
          )}
        </div>

        {item.archivo_url && (
          <div className={styles.detSection}>
            <p className={styles.detLabel}>Certificado / Lista asistencia</p>
            <a href={item.archivo_url} target="_blank" rel="noopener noreferrer" className={styles.adjuntoLink}>
              <Paperclip size={13} />{item.archivo_nombre ?? "Ver archivo"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PanelForm (shared create/edit for all 3 tabs)
// ══════════════════════════════════════════════════════════════
function PanelForm({
  tab, mode, form, setForm,
  medidasList, addMedida, setMedida, removeMedida,
  asistSel, toggleAsistente,
  trabajadorEnSistema, setTrabajadorEnSistema,
  usuarios, ubicaciones,
  adjFile, setAdjFile, imgFile, setImgFile, imgPreview, setImgPreview,
  saving, saveErr, existingData,
  imgRef, fileRef,
  onSave, onClose,
}) {
  function sf(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // When tipo changes for medicion, auto-fill unidad and limite_legal
  function onTipoMedicionChange(tipo) {
    const def = DS594[tipo] ?? DS594.otro;
    setForm((f) => ({ ...f, tipo, unidad: def.unidad, limite_legal: def.limite ?? "" }));
  }

  const formCumple = tab === "mediciones" ? calcCumple(form.tipo, form.valor, form.limite_legal) : null;
  const title = mode === "create"
    ? (tab === "incidentes" ? "Nuevo incidente" : tab === "mediciones" ? "Nueva medición" : "Nueva capacitación")
    : "Editar";

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <h2 className={styles.panelTitle}>{title}</h2>
        </div>
        <div className={styles.panelHeaderActions}>
          <button className={styles.iconBtn} onClick={onClose}><X size={16} /></button>
        </div>
      </div>

      <div className={styles.panelBody}>

        {/* ── INCIDENTES FORM ── */}
        {tab === "incidentes" && (
          <>
            {/* Tipo pills */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Tipo de incidente *</label>
              <div className={styles.pillRow}>
                {TIPO_INCIDENTE.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.tipoPill} ${form.tipo === t.id ? styles.tipoPillActive : ""}`}
                    style={form.tipo === t.id ? { background: t.bg, color: t.color, borderColor: t.color } : {}}
                    onClick={() => sf("tipo", t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Fecha y hora *</label>
              <input className={styles.formInput} type="datetime-local" value={form.fecha_ocurrencia} onChange={(e) => sf("fecha_ocurrencia", e.target.value)} />
            </div>

            {/* Trabajador */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Trabajador afectado</label>
              <div className={styles.toggleRow}>
                <button type="button" className={`${styles.toggleBtn} ${trabajadorEnSistema ? styles.toggleBtnActive : ""}`} onClick={() => setTrabajadorEnSistema(true)}>En el sistema</button>
                <button type="button" className={`${styles.toggleBtn} ${!trabajadorEnSistema ? styles.toggleBtnActive : ""}`} onClick={() => setTrabajadorEnSistema(false)}>Ingreso manual</button>
              </div>
              {trabajadorEnSistema ? (
                <select className={styles.formSelect} value={form.trabajador_id} onChange={(e) => sf("trabajador_id", e.target.value)}>
                  <option value="">Sin asignar</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              ) : (
                <input className={styles.formInput} type="text" placeholder="Nombre del trabajador" value={form.trabajador_nombre} onChange={(e) => sf("trabajador_nombre", e.target.value)} />
              )}
            </div>

            {/* Descripción */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Descripción *</label>
              <textarea className={styles.formTextarea} rows={3} placeholder="¿Qué ocurrió?" value={form.descripcion} onChange={(e) => sf("descripcion", e.target.value)} />
            </div>

            <div className={styles.fieldRow2}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Lugar</label>
                <input className={styles.formInput} type="text" placeholder="Ej. Sala de calderas" value={form.lugar} onChange={(e) => sf("lugar", e.target.value)} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Días perdidos</label>
                <input className={styles.formInput} type="number" min={0} value={form.dias_perdidos} onChange={(e) => sf("dias_perdidos", e.target.value)} />
              </div>
            </div>

            {/* Estado */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Estado</label>
              <div className={styles.pillRow}>
                {ESTADO_INCIDENTE.map((e) => (
                  <button
                    key={e.id} type="button"
                    className={`${styles.tipoPill} ${form.estado === e.id ? styles.tipoPillActive : ""}`}
                    style={form.estado === e.id ? { background: e.bg, color: e.color, borderColor: e.color } : {}}
                    onClick={() => sf("estado", e.id)}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Causa raíz */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Causa raíz</label>
              <textarea className={styles.formTextarea} rows={2} placeholder="Identificación de causas…" value={form.causa_raiz} onChange={(e) => sf("causa_raiz", e.target.value)} />
            </div>

            {/* Medidas correctivas */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Medidas correctivas</label>
              {medidasList.map((m, idx) => (
                <div key={idx} className={styles.medidaFormRow}>
                  <input
                    className={styles.formInput}
                    type="text"
                    placeholder="Descripción de la medida"
                    value={m.descripcion}
                    onChange={(e) => setMedida(idx, "descripcion", e.target.value)}
                    style={{ marginBottom: 6 }}
                  />
                  <div className={styles.fieldRow2}>
                    <select className={styles.formSelect} value={m.responsable_id} onChange={(e) => setMedida(idx, "responsable_id", e.target.value)}>
                      <option value="">Responsable…</option>
                      {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                    <input className={styles.formInput} type="date" value={m.fecha_limite} onChange={(e) => setMedida(idx, "fecha_limite", e.target.value)} />
                  </div>
                  <button type="button" className={styles.medidaRemoveBtn} onClick={() => removeMedida(idx)}>
                    <X size={12} /> Quitar
                  </button>
                </div>
              ))}
              <button type="button" className={styles.btnAgregar} onClick={addMedida}>
                <Plus size={13} /> Agregar medida
              </button>
            </div>

            {/* Imagen */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Foto / evidencia</label>
              <div className={styles.imgUploadArea} onClick={() => imgRef.current?.click()}>
                {imgPreview ? (
                  <img src={imgPreview} alt="preview" className={styles.imgPreview} />
                ) : existingData?.imagen_url ? (
                  <img src={existingData.imagen_url} alt="actual" className={styles.imgPreview} />
                ) : (
                  <span className={styles.imgUploadHint}>Toca para subir imagen</span>
                )}
              </div>
              <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) { setImgFile(f); setImgPreview(URL.createObjectURL(f)); }
                }}
              />
            </div>

            {/* Archivo */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Archivo adjunto</label>
              <button type="button" className={styles.adjuntoBtn} onClick={() => fileRef.current?.click()}>
                <Paperclip size={14} />
                {adjFile ? adjFile.name : (existingData?.archivo_nombre ?? "Adjuntar archivo…")}
              </button>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setAdjFile(f); }} />
            </div>
          </>
        )}

        {/* ── MEDICIONES FORM ── */}
        {tab === "mediciones" && (
          <>
            {/* Tipo pills */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Tipo de medición *</label>
              <div className={styles.pillRow} style={{ flexWrap: "wrap" }}>
                {TIPO_MEDICION.map((t) => (
                  <button
                    key={t.id} type="button"
                    className={`${styles.tipoPill} ${form.tipo === t.id ? styles.tipoPillActive : ""}`}
                    style={form.tipo === t.id ? { background: t.color + "20", color: t.color, borderColor: t.color } : {}}
                    onClick={() => onTipoMedicionChange(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Fecha y hora *</label>
              <input className={styles.formInput} type="datetime-local" value={form.fecha_medicion} onChange={(e) => sf("fecha_medicion", e.target.value)} />
            </div>

            {/* Ubicación + Lugar */}
            <div className={styles.fieldRow2}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Ubicación</label>
                <select className={styles.formSelect} value={form.ubicacion_id} onChange={(e) => sf("ubicacion_id", e.target.value)}>
                  <option value="">Seleccionar…</option>
                  {ubicaciones.map((u) => <option key={u.id} value={u.id}>{[u.edificio, u.piso].filter(Boolean).join(" · ")}</option>)}
                </select>
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Detalle lugar</label>
                <input className={styles.formInput} type="text" placeholder="Ej. Sala de calderas" value={form.lugar} onChange={(e) => sf("lugar", e.target.value)} />
              </div>
            </div>

            {/* Valor + Unidad */}
            <div className={styles.fieldRow2}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Valor medido *</label>
                <input className={styles.formInput} type="number" step="any" placeholder="0" value={form.valor} onChange={(e) => sf("valor", e.target.value)} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Unidad</label>
                <input className={styles.formInput} type="text" value={form.unidad} onChange={(e) => sf("unidad", e.target.value)} />
              </div>
            </div>

            {/* Límite legal */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Límite legal</label>
              <input className={styles.formInput} type="number" step="any" value={form.limite_legal} onChange={(e) => sf("limite_legal", e.target.value)} />
              {DS594[form.tipo]?.hint && <p className={styles.ds594Hint}>{DS594[form.tipo].hint}</p>}
              {form.valor !== "" && form.limite_legal !== "" && (
                <span className={`${styles.cumpleBadge} ${formCumple === true ? styles.cumpleSi : formCumple === false ? styles.cumpleNo : ""}`} style={{ marginTop: 6, display: "inline-block" }}>
                  {formCumple === true ? "Cumple" : formCumple === false ? "No cumple" : "Sin verificar"}
                </span>
              )}
            </div>

            {/* Responsable */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Responsable</label>
              <select className={styles.formSelect} value={form.responsable_id} onChange={(e) => sf("responsable_id", e.target.value)}>
                <option value="">Sin asignar</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>

            {/* Observaciones */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Observaciones</label>
              <textarea className={styles.formTextarea} rows={2} value={form.observaciones} onChange={(e) => sf("observaciones", e.target.value)} />
            </div>

            {/* Medida preventiva */}
            {formCumple === false && (
              <div className={styles.formField}>
                <label className={styles.formLabel}>Medida preventiva tomada</label>
                <textarea className={styles.formTextarea} rows={2} placeholder="Describe la acción correctiva…" value={form.medida_preventiva} onChange={(e) => sf("medida_preventiva", e.target.value)} />
              </div>
            )}

            {/* Archivo evidencia */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Evidencia adjunta</label>
              <button type="button" className={styles.adjuntoBtn} onClick={() => fileRef.current?.click()}>
                <Paperclip size={14} />
                {adjFile ? adjFile.name : (existingData?.archivo_nombre ?? "Adjuntar archivo…")}
              </button>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setAdjFile(f); }} />
            </div>
          </>
        )}

        {/* ── CAPACITACIONES FORM ── */}
        {tab === "capacitaciones" && (
          <>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Nombre *</label>
              <input className={styles.formInput} type="text" placeholder="Ej. Inducción uso de EPP" value={form.nombre} onChange={(e) => sf("nombre", e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Tipo</label>
              <select className={styles.formSelect} value={form.tipo} onChange={(e) => sf("tipo", e.target.value)}>
                {TIPO_CAPACITACION.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            <div className={styles.fieldRow2}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Instructor</label>
                <input className={styles.formInput} type="text" placeholder="Nombre" value={form.instructor} onChange={(e) => sf("instructor", e.target.value)} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Fecha *</label>
                <input className={styles.formInput} type="date" value={form.fecha} onChange={(e) => sf("fecha", e.target.value)} />
              </div>
            </div>

            <div className={styles.fieldRow2}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Duración (horas)</label>
                <input className={styles.formInput} type="number" min={0} step="0.5" value={form.duracion_horas} onChange={(e) => sf("duracion_horas", e.target.value)} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Código SENCE</label>
                <input className={styles.formInput} type="text" placeholder="Ej. 1237891234" value={form.codigo_sence} onChange={(e) => sf("codigo_sence", e.target.value)} />
              </div>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Organismo / Proveedor</label>
              <input className={styles.formInput} type="text" placeholder="OTEC, empresa, nombre capacitador" value={form.proveedor} onChange={(e) => sf("proveedor", e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Descripción</label>
              <textarea className={styles.formTextarea} rows={2} value={form.descripcion} onChange={(e) => sf("descripcion", e.target.value)} />
            </div>

            {/* Asistentes */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Asistentes ({asistSel.size})</label>
              <div className={styles.asistPickerList}>
                {usuarios.map((u) => {
                  const sel = asistSel.has(u.id);
                  return (
                    <button
                      key={u.id} type="button"
                      className={`${styles.asistPickerItem} ${sel ? styles.asistPickerItemSel : ""}`}
                      onClick={() => toggleAsistente(u.id)}
                    >
                      <div className={styles.asistPickerAvatar}>{u.nombre.charAt(0).toUpperCase()}</div>
                      <span className={styles.asistPickerName}>{u.nombre}</span>
                      <span className={`${styles.asistPickerCheck} ${sel ? styles.asistPickerCheckSel : ""}`}>
                        {sel && <Check size={11} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Archivo (certificado) */}
            <div className={styles.formField}>
              <label className={styles.formLabel}>Certificado / Lista asistencia</label>
              <button type="button" className={styles.adjuntoBtn} onClick={() => fileRef.current?.click()}>
                <Paperclip size={14} />
                {adjFile ? adjFile.name : (existingData?.archivo_nombre ?? "Adjuntar archivo…")}
              </button>
              <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setAdjFile(f); }} />
            </div>
          </>
        )}

        {saveErr && <p className={styles.formError}>{saveErr}</p>}
      </div>

      <div className={styles.panelFooter}>
        <button className={styles.btnSecundario} onClick={onClose} disabled={saving}>Cancelar</button>
        <button className={styles.btnPrimario} onClick={onSave} disabled={saving}>
          {saving ? "Guardando…" : mode === "create" ? "Guardar" : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
