"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Calendar, ChevronDown, ChevronLeft, X, Search, SlidersHorizontal,
  Zap, Wrench, Wind, HardHat, ShieldAlert, Flame, Sparkles,
  AlertTriangle, ClipboardCheck, BadgeCheck, Settings2, Wifi,
  Paintbrush, Leaf, ChevronRight, Clock, User, MapPin,
  Repeat, FileText, Trash2, ExternalLink, Paperclip,
  CheckSquare, AlertCircle, Info,
  // Status icons
  CircleDot, PauseCircle, PlayCircle, CheckCircle2, XCircle,
  // Priority icons
  ChevronUp, Minus,
  // Comments
  MessageSquare, Send, Activity,
  // OT actions menu
  MoreHorizontal, Copy, Ban, Pencil, Link,
  // Capture zone
  Camera, Check as CheckIcon, ScanLine, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { callEdge } from "@/lib/edge";
import PanelCrearOT from "@/components/PanelCrearOT";
import styles from "./page.module.css";
import { limitesParaPlan } from "@/lib/planes";

// ── Constantes ────────────────────────────────────────────────

const LUCIDE_ICONS = {
  Zap, Wrench, Wind, HardHat, ShieldAlert, Flame, Sparkles,
  AlertTriangle, ClipboardCheck, BadgeCheck, Settings2, Wifi,
  Paintbrush, Leaf,
};

const ESTADO_LABEL = {
  pendiente:   "Abierta",
  en_espera:   "En espera",
  en_curso:    "En curso",
  en_revision: "En revisión",
  completado:  "Completada",
  cancelado:   "Cancelada",
};
const ESTADO_COLOR = {
  pendiente:   { bg: "#EFF6FF", text: "#3B82F6" },
  en_espera:   { bg: "#FFFBEB", text: "#D97706" },
  en_curso:    { bg: "#EEF2FF", text: "#6366F1" },
  en_revision: { bg: "#EEF2FF", text: "#6366F1" },
  completado:  { bg: "#F0FDF4", text: "#22C55E" },
  cancelado:   { bg: "#F3F4F6", text: "#6B7280" },
};
const PRIORIDAD_COLOR = {
  ninguna: null,
  baja:    "#9CA3AF",
  media:   "#3B82F6",
  alta:    "#F97316",
  urgente: "#EF4444",
};
const PRIORIDAD_LABEL = {
  ninguna: "Sin prioridad",
  baja:    "Baja",
  media:   "Media",
  alta:    "Alta",
  urgente: "Urgente",
};
const TIPO_TRABAJO_LABEL = {
  reactiva:   "Reactiva",
  preventiva: "Preventiva",
  inspeccion: "Inspección",
  mejora:     "Mejora",
};
const RECURRENCIA_LABEL = {
  ninguna:       "Sin recurrencia",
  diaria:        "Diaria",
  semanal:       "Semanal",
  mensual_fecha: "Mensual (por fecha)",
  mensual_dia:   "Mensual (por día)",
  anual:         "Anual",
};
const PASO_TIPO_ICON = {
  instruccion:  Info,
  verificacion: CheckSquare,
  advertencia:  AlertCircle,
};
const PASO_TIPO_COLOR = {
  instruccion:  "#6B7280",
  verificacion: "#3B82F6",
  advertencia:  "#D97706",
};

const ESTADO_ICON = {
  pendiente:   CircleDot,
  en_espera:   PauseCircle,
  en_curso:    PlayCircle,
  en_revision: PlayCircle,
  completado:  CheckCircle2,
  cancelado:   XCircle,
};

const PRIORIDAD_ICON = {
  baja:    ChevronDown,
  media:   Minus,
  alta:    ChevronUp,
  urgente: AlertTriangle,
};

const ESTADOS_FILTRO_PENDIENTES = [
  { value: "todas",       label: "Todas" },
  { value: "pendiente",   label: "Abierta" },
  { value: "en_espera",   label: "En espera" },
  { value: "en_curso",    label: "En curso" },
  { value: "en_revision", label: "En revisión" },
];
const ESTADOS_FILTRO_COMPLETADAS = [
  { value: "todas",      label: "Todas" },
  { value: "completado", label: "Completada" },
  { value: "cancelado",  label: "Cancelada" },
];
const SORT_OPTS = [
  { value: "created_at_desc", label: "Más reciente" },
  { value: "fecha_termino_asc", label: "Fecha límite ↑" },
  { value: "prioridad_desc", label: "Prioridad ↓" },
  { value: "prioridad_asc",  label: "Prioridad ↑" },
  { value: "ubicacion",      label: "Ubicación" },
];
const PRIORIDAD_ORDER = { urgente: 4, alta: 3, media: 2, baja: 1, ninguna: 0 };

// ── Helpers ───────────────────────────────────────────────────

function formatId(o) {
  const y = new Date(o.created_at).getFullYear();
  return `${o.tipo === "emergencia" ? "EM" : "OT"}-${y}-${o.id.slice(-4).toUpperCase()}`;
}

function vencimiento(fecha) {
  if (!fecha) return null;
  const diff = Math.ceil((new Date(fecha) - Date.now()) / 86400000);
  if (diff < 0)  return { label: `vencida hace ${Math.abs(diff)} día${Math.abs(diff) !== 1 ? "s" : ""}`, urgent: true };
  if (diff === 0) return { label: "vence hoy", urgent: true };
  if (diff === 1) return { label: "vence mañana", urgent: true };
  if (diff <= 7)  return { label: `vence en ${diff} días`, urgent: false };
  return { label: new Date(fecha).toLocaleDateString("es-CL"), urgent: false };
}

function tiempoFmt(min) {
  if (!min) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function categoriaIcon(cat) {
  if (!cat) return null;
  const Icon = LUCIDE_ICONS[cat.icono];
  return Icon ? <Icon size={14} style={{ color: cat.color, flexShrink: 0 }} /> : null;
}

// ── Componente principal ──────────────────────────────────────

export default function BandejaOrdenesClient({
  myId: initialMyId,
  myRol: initialMyRol,
  plantaId: initialPlantaId,
  plan: initialPlan,
  planStatus: initialPlanStatus,
  trialDays: initialTrialDays,
  trialEnd: initialTrialEnd,
  initialOrdenes,
  initialUsuarios,
  initialUbicaciones,
  initialActivos,
  initialCategorias,
  initialPlantillas,
  initialPartesCatalogo,
}) {
  const router = useRouter();
  const [plantaId,  setPlantaId]  = useState(initialPlantaId);
  const [myId,      setMyId]      = useState(initialMyId);
  const [myRol,     setMyRol]     = useState(initialMyRol);
  const [ordenes,   setOrdenes]   = useState(initialOrdenes ?? []);
  const [loading,   setLoading]   = useState(false);
  const [ubicaciones, setUbicaciones] = useState(initialUbicaciones ?? []);
  const [activos,   setActivos]   = useState(initialActivos ?? []);
  const [categorias, setCategorias] = useState(initialCategorias ?? []);
  const [plantillas, setPlantillas] = useState(initialPlantillas ?? []);
  const [partesCatalogo, setPartesCatalogo] = useState(initialPartesCatalogo ?? []);
  const [comCounts,  setComCounts]  = useState({}); // { orden_id: count }

  // Plan
  const [plan,        setPlan]        = useState(initialPlan);
  const [planStatus,  setPlanStatus]  = useState(initialPlanStatus);

  // Trial banner
  const [trialDays,    setTrialDays]    = useState(initialTrialDays);
  const [trialEnd,     setTrialEnd]     = useState(initialTrialEnd);
  const [trialDismiss, setTrialDismiss] = useState(false);

  // Filters
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [sortBy, setSortBy] = useState("created_at_desc");
  const [busqueda, setBusqueda] = useState("");

  // Active tab
  const [activeTab, setActiveTab] = useState("pendientes"); // "pendientes" | "completadas"

  // Calendar overlay
  const [calendarOpen,  setCalendarOpen]  = useState(false);
  const [calendarDate,  setCalendarDate]  = useState(null); // null = no filter; Date = specific day

  // Filter overlay
  const [filterOpen, setFilterOpen] = useState(false);
  const [filtros, setFiltros] = useState({
    asignado_a: [], prioridad: [], ubicacion_id: [], activo_id: [],
    categoria_id: [], tipo_trabajo: [],
    fecha_termino_desde: "", fecha_termino_hasta: "",
    created_desde: "", created_hasta: "",
  });

  // Panel
  const [selected, setSelected]   = useState(null); // orden id
  const [panelMode, setPanelMode] = useState(null); // null | 'view' | 'create'
  const [ordenData, setOrdenData] = useState(null);
  const [loadingPanel, setLoadingPanel] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Create/Edit form
  const emptyForm = {
    titulo: "", descripcion: "", tipo_trabajo: "reactiva",
    prioridad: "media", estado: "pendiente",
    ubicacion_id: "", activo_id: "", categoria_id: "",
    fecha_inicio: "", fecha_termino: "",
    tiempo_estimado_h: "", tiempo_estimado_m: "",
    recurrencia: "ninguna",
    plantilla_id: "", pasos: [],
    partes: [],
    nueva_ubicacion: "", nuevo_activo: "",
    guardarComoPreventivo: false, frecuencia_dias: "30",
  };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showNuevUbic, setShowNuevUbic] = useState(false);
  const [showNuevActivo, setShowNuevActivo] = useState(false);

  // Archivos
  const [archivos, setArchivos] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileRef = useRef(null);
  // Archivos en modo creación (buffered hasta tener orden id)
  const [pendingFiles, setPendingFiles] = useState([]);
  const createFileRef = useRef(null);

  // Comentarios / actividad
  const [comentarios, setComentarios] = useState([]);
  const [comentarioTexto, setComentarioTexto] = useState("");
  const [sendingComentario, setSendingComentario] = useState(false);
  const comentariosChannelRef = useRef(null);
  const urlCheckedRef = useRef(false);

  // Usuarios del workspace (para asignación)
  const [usuarios, setUsuarios] = useState(initialUsuarios ?? []);

  // Capture zone
  const [capturaTitulo,  setCapturaTitulo]  = useState("");
  const [capturaActivo,  setCapturaActivo]  = useState(null); // { id, nombre }
  const [capturaPhoto,   setCapturaPhoto]   = useState(null); // File
  const [scanningDoc,    setScanningDoc]    = useState(false);
  const [scanResult,     setScanResult]     = useState(null); // parsed scan fields
  const [showScanSheet, setShowScanSheet] = useState(false);
  const [scanCreating,  setScanCreating]  = useState(false);
  const [scanSuccess,   setScanSuccess]   = useState(false);
  const [scanDupError,  setScanDupError]  = useState(false);
  const capturaImgRef = useRef(null);
  const ordenesRTChannelRef = useRef(null);

  // ── Init ─────────────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // ── comCounts (comment counts per OT) ────────────────────────
  useEffect(() => {
    if (!initialPlantaId) return;
    const sb = createClient();
    sb.from("comentarios_orden")
      .select("orden_id")
      .eq("planta_id", initialPlantaId)
      .then(({ data }) => {
        if (data) {
          const m = {};
          data.forEach(r => { m[r.orden_id] = (m[r.orden_id] ?? 0) + 1; });
          setComCounts(m);
        }
      });
  }, [initialPlantaId]);

  // ── Realtime: INSERT + UPDATE on ordenes_trabajo ──────────────
  useEffect(() => {
    if (!initialPlantaId) return;
    const sb = createClient();

    // Flush any offline-queued OTs on reconnect
    async function flushOTQueue() {
      try {
        const queue = JSON.parse(localStorage.getItem("pangui_ot_queue") || "[]");
        if (!queue.length) return;
        localStorage.removeItem("pangui_ot_queue");
        for (const item of queue) {
          await sb.from("ordenes_trabajo").insert({
            workspace_id: initialPlantaId, creado_por: initialMyId,
            titulo: item.titulo, descripcion: "", tipo: "solicitud",
            estado: "pendiente", prioridad: "media", recurrencia: "ninguna",
            activo_id: item.activo_id ?? null,
          });
        }
        // Reload after flush
        const { data: refreshed } = await sb.from("ordenes_trabajo")
          .select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
          .eq("workspace_id", initialPlantaId).order("created_at", { ascending: false }).limit(200);
        if (refreshed) setOrdenes(refreshed);
      } catch { /* ignore */ }
    }
    window.addEventListener("online", flushOTQueue, { once: true });

    ordenesRTChannelRef.current = sb.channel(`ordenes-rt-${initialPlantaId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "ordenes_trabajo",
        filter: `workspace_id=eq.${initialPlantaId}`,
      }, (payload) => {
        setOrdenes(prev => {
          if (prev.find(o => o.id === payload.new.id)) return prev; // already there (optimistic)
          return [payload.new, ...prev];
        });
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "ordenes_trabajo",
        filter: `workspace_id=eq.${initialPlantaId}`,
      }, (payload) => {
        // payload.new is raw row (no joins) — spread over existing to preserve join data
        setOrdenes(prev =>
          prev.map(o => o.id === payload.new.id ? { ...o, ...payload.new } : o)
        );
        setOrdenData(prev =>
          prev?.id === payload.new.id ? { ...prev, ...payload.new } : prev
        );
      })
      .subscribe();

    return () => {
      if (ordenesRTChannelRef.current) sb.removeChannel(ordenesRTChannelRef.current);
    };
  }, [initialPlantaId, initialMyId]);

  // ── Auto-open create from onboarding (?nuevo=1) or ?abrir=UUID on mobile ─
  useEffect(() => {
    if (isDesktop || loading) return;
    const params = new URLSearchParams(window.location.search);
    const nuevoParam = params.get("nuevo");
    const abrirParam = params.get("abrir");
    if (nuevoParam === "1") { window.history.replaceState({}, "", "/ordenes"); abrirCrear(); }
    else if (abrirParam) { window.history.replaceState({}, "", "/ordenes"); abrirOT(abrirParam); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, loading]);

  // ── Auto-open order from URL or sessionStorage on desktop ────
  useEffect(() => {
    if (!isDesktop || loading || urlCheckedRef.current) return;
    urlCheckedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const parts = window.location.pathname.split("/");
    const last = parts[parts.length - 1];
    if (last && last !== "ordenes") { abrirOT(last); return; }
    const stored = sessionStorage.getItem("pangui_open_ot");
    if (stored) { sessionStorage.removeItem("pangui_open_ot"); abrirOT(stored); return; }
    const nuevoParam = params.get("nuevo");
    const abrirParam = params.get("abrir");
    if (nuevoParam === "1") { window.history.replaceState({}, "", "/ordenes"); abrirCrear(); }
    else if (abrirParam) { window.history.replaceState({}, "", "/ordenes"); abrirOT(abrirParam); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, loading]);

  // ── Filtrado y ordenamiento ───────────────────────────────────
  const ESTADOS_PENDIENTES  = new Set(["pendiente","en_espera","en_curso","en_revision"]);
  const ESTADOS_COMPLETADAS = new Set(["completado","cancelado"]);

  const ordenesFiltradas = (() => {
    let list = [...ordenes];

    // Tab filter (applied before user estado filter)
    if (activeTab === "pendientes")  list = list.filter(o => ESTADOS_PENDIENTES.has(o.estado));
    if (activeTab === "completadas") list = list.filter(o => ESTADOS_COMPLETADAS.has(o.estado));

    // Estado
    if (filtroEstado !== "todas") {
      if (filtroEstado === "en_curso") {
        list = list.filter((o) => o.estado === "en_curso" || o.estado === "en_revision");
      } else {
        list = list.filter((o) => o.estado === filtroEstado);
      }
    }

    // Búsqueda
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      list = list.filter((o) =>
        (o.titulo ?? o.descripcion ?? "").toLowerCase().includes(q)
      );
    }

    // Calendar date filter (created_at matches selected day)
    if (calendarDate) {
      const cy = calendarDate.getFullYear(), cm = calendarDate.getMonth(), cd = calendarDate.getDate();
      list = list.filter(o => {
        const d = new Date(o.created_at);
        return d.getFullYear() === cy && d.getMonth() === cm && d.getDate() === cd;
      });
    }

    // Advanced filters
    if (filtros.prioridad.length > 0)     list = list.filter(o => filtros.prioridad.includes(o.prioridad));
    if (filtros.asignado_a.length > 0)    list = list.filter(o => (o.asignados_ids ?? []).some(uid => filtros.asignado_a.includes(uid)));
    if (filtros.ubicacion_id.length > 0)  list = list.filter(o => filtros.ubicacion_id.includes(o.ubicacion_id));
    if (filtros.activo_id.length > 0)     list = list.filter(o => filtros.activo_id.includes(o.activo_id));
    if (filtros.categoria_id.length > 0)  list = list.filter(o => filtros.categoria_id.includes(o.categoria_id));
    if (filtros.tipo_trabajo.length > 0)  list = list.filter(o => filtros.tipo_trabajo.includes(o.tipo_trabajo));
    if (filtros.created_desde)            list = list.filter(o => new Date(o.created_at) >= new Date(filtros.created_desde));
    if (filtros.created_hasta)            list = list.filter(o => new Date(o.created_at) <= new Date(filtros.created_hasta + "T23:59:59"));
    if (filtros.fecha_termino_desde)      list = list.filter(o => o.fecha_termino && new Date(o.fecha_termino) >= new Date(filtros.fecha_termino_desde));
    if (filtros.fecha_termino_hasta)      list = list.filter(o => o.fecha_termino && new Date(o.fecha_termino) <= new Date(filtros.fecha_termino_hasta + "T23:59:59"));

    // Sort
    list.sort((a, b) => {
      if (sortBy === "created_at_desc") return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === "fecha_termino_asc") {
        if (!a.fecha_termino) return 1;
        if (!b.fecha_termino) return -1;
        return new Date(a.fecha_termino) - new Date(b.fecha_termino);
      }
      if (sortBy === "prioridad_desc") return (PRIORIDAD_ORDER[b.prioridad] ?? 0) - (PRIORIDAD_ORDER[a.prioridad] ?? 0);
      if (sortBy === "prioridad_asc")  return (PRIORIDAD_ORDER[a.prioridad] ?? 0) - (PRIORIDAD_ORDER[b.prioridad] ?? 0);
      if (sortBy === "ubicacion") return (a.ubicaciones?.edificio ?? "").localeCompare(b.ubicaciones?.edificio ?? "");
      return 0;
    });

    return list;
  })();

  // ── Panel: load OT detail ─────────────────────────────────────
  async function abrirOT(id) {
    if (!isDesktop) { router.push(`/ordenes/${id}`); return; }
    window.history.pushState({}, "", `/ordenes/${id}`);
    setSelected(id);
    setPanelMode("view");
    setLoadingPanel(true);
    const sb = createClient();
    // Base query — only columns guaranteed to exist pre-migration
    const { data: baseData } = await sb.from("ordenes_trabajo")
      .select("*, ubicaciones(id,edificio,piso,detalle)")
      .eq("id", id).maybeSingle();

    // New-table joins — may fail before migration; handled gracefully
    const extras = await Promise.allSettled([
      sb.from("archivos_orden").select("*").eq("orden_id", id).order("created_at"),
      baseData?.plantilla_id
        ? sb.from("pasos_plantilla").select("*").eq("plantilla_id", baseData.plantilla_id).order("orden")
        : Promise.resolve({ data: [] }),
      baseData?.categoria_id
        ? sb.from("categorias_ot").select("id,nombre,icono,color").eq("id", baseData.categoria_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const getExtra = (r) => r.status === "fulfilled" ? r.value?.data : null;
    const arcs   = getExtra(extras[0]) ?? [];
    const pasos  = getExtra(extras[1]) ?? [];
    const catRow = getExtra(extras[2]);

    setArchivos(arcs);
    const partesRaw = baseData?.partes_requeridas;
    const partesParsed = Array.isArray(partesRaw) ? partesRaw
      : typeof partesRaw === "string" ? (() => { try { return JSON.parse(partesRaw); } catch { return []; } })()
      : [];
    setOrdenData(baseData ? { ...baseData, partes_requeridas: partesParsed, _pasos: pasos, categorias_ot: catRow } : null);

    // Comentarios — graceful if table doesn't exist yet
    let comsData = [];
    try {
      const { data } = await sb.from("comentarios_orden")
        .select("id, tipo, contenido, metadatos, created_at, usuario_id, usuarios(nombre)")
        .eq("orden_id", id).order("created_at", { ascending: true });
      comsData = data ?? [];
    } catch { /* tabla no creada aún */ }
    setComentarios(comsData);
    setComentarioTexto("");

    // Real-time subscription for new comments
    if (comentariosChannelRef.current) sb.removeChannel(comentariosChannelRef.current);
    comentariosChannelRef.current = sb
      .channel(`comentarios-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comentarios_orden", filter: `orden_id=eq.${id}` },
        (payload) => {
          setComentarios((prev) => {
            if (prev.find((c) => c.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    setLoadingPanel(false);
  }

  // ── Registrar actividad ───────────────────────────────────────
  async function registrarActividad(sb, ordenId, tipo, contenido, metadatos = null) {
    try {
      await sb.from("comentarios_orden").insert({
        orden_id: ordenId,
        planta_id: plantaId,
        usuario_id: myId,
        tipo,
        contenido,
        metadatos,
      });
    } catch { /* tabla no creada aún */ }
  }

  // ── Agregar comentario manual ─────────────────────────────────
  async function agregarComentario() {
    const texto = comentarioTexto.trim();
    if (!texto || !ordenData?.id) return;
    setSendingComentario(true);
    const sb = createClient();
    const { data: nuevo } = await sb.from("comentarios_orden").insert({
      orden_id: ordenData.id,
      planta_id: plantaId,
      usuario_id: myId,
      tipo: "comentario",
      contenido: texto,
    }).select("id, tipo, contenido, metadatos, created_at, usuario_id").single();
    if (nuevo) setComentarios((prev) => [...prev.filter((c) => c.id !== nuevo.id), nuevo].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    setComentarioTexto("");
    setSendingComentario(false);
  }

  // ── Browser back closes panel ────────────────────────────────
  useEffect(() => {
    function handlePop() { setPanelMode(null); setSelected(null); }
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  // ── Editar OT inline ─────────────────────────────────────────
  function abrirEditar() {
    if (!ordenData) return;
    const min = ordenData.tiempo_estimado ?? 0;
    const partes = Array.isArray(ordenData.partes_requeridas) ? ordenData.partes_requeridas
      : (typeof ordenData.partes_requeridas === "string" ? JSON.parse(ordenData.partes_requeridas || "[]") : []);
    setForm({
      titulo:            ordenData.titulo ?? "",
      descripcion:       ordenData.descripcion ?? "",
      tipo_trabajo:      ordenData.tipo_trabajo ?? "reactiva",
      prioridad:         ordenData.prioridad ?? "media",
      estado:            ordenData.estado ?? "pendiente",
      ubicacion_id:      ordenData.ubicacion_id ?? "",
      activo_id:         ordenData.activo_id ?? "",
      categoria_id:      ordenData.categoria_id ?? "",
      fecha_inicio:      ordenData.fecha_inicio ? ordenData.fecha_inicio.slice(0, 10) : "",
      fecha_termino:     ordenData.fecha_termino ? ordenData.fecha_termino.slice(0, 10) : "",
      tiempo_estimado_h: min ? String(Math.floor(min / 60)) : "",
      tiempo_estimado_m: min ? String(min % 60) : "",
      recurrencia:       ordenData.recurrencia ?? "ninguna",
      plantilla_id:      ordenData.plantilla_id ?? "",
      partes,
      nueva_ubicacion: "", nuevo_activo: "",
    });
    setSaveError(null);
    setPanelMode("edit");
  }

  async function guardarEdicionOT() {
    if (!form.descripcion.trim() && !form.titulo.trim()) {
      setSaveError("Agrega un título o descripción para la OT.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const sb = createClient();
    const tiempoMin = ((parseInt(form.tiempo_estimado_h) || 0) * 60) + (parseInt(form.tiempo_estimado_m) || 0) || null;
    const { error } = await sb.from("ordenes_trabajo").update({
      titulo:          form.titulo.trim() || null,
      descripcion:     form.descripcion.trim(),
      tipo_trabajo:    form.tipo_trabajo || null,
      estado:          form.estado,
      prioridad:       form.prioridad,
      ubicacion_id:    form.ubicacion_id || null,
      activo_id:       form.activo_id || null,
      categoria_id:    form.categoria_id || null,
      fecha_inicio:    form.fecha_inicio || null,
      fecha_termino:   form.fecha_termino || null,
      tiempo_estimado: tiempoMin,
      recurrencia:     form.recurrencia,
      plantilla_id:    form.plantilla_id || null,
      partes_requeridas: JSON.stringify(normalizarPartes(form.partes)),
    }).eq("id", selected);
    if (error) { setSaveError(error.message); setSaving(false); return; }
    await registrarActividad(sb, selected, "sistema", "Orden editada");
    const { data: updatedList } = await sb.from("ordenes_trabajo")
      .select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
      .eq("workspace_id", plantaId).order("created_at", { ascending: false });
    setOrdenes(updatedList ?? []);
    setSaving(false);
    abrirOT(selected); // Re-open view with refreshed data
  }

  // ── Frecuentes: top 3 activos por frecuencia de uso ─────────
  const frecuentes = useMemo(() => {
    const counts = {};
    ordenes.forEach(o => { if (o.activo_id) counts[o.activo_id] = (counts[o.activo_id] || 0) + 1; });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => activos.find(a => a.id === id))
      .filter(Boolean);
  }, [ordenes, activos]);

  // ── Document scanner ──────────────────────────────────────────
  async function escanearDocumento(file) {
    setScanningDoc(true);
    setScanResult(null);
    try {
      // Compress to ≤1000px — enough for text recognition, smaller payload
      const compressed = await new Promise((resolve) => {
        const img = new Image();
        const blobUrl = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(blobUrl);
          const MAX = 1000;
          const scale = img.width > MAX ? MAX / img.width : 1;
          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => resolve(new File([blob], "scan.jpg", { type: "image/jpeg" })),
            "image/jpeg", 0.85,
          );
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(file); };
        img.src = blobUrl;
      });

      // Convert to base64
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(compressed);
      });

      const res = await callEdge("escanear-orden", { imageBase64: base64, mimeType: "image/jpeg" });
      if (!res.ok) throw new Error("scan failed");
      const data = await res.json();

      setScanResult(data);
      setShowScanSheet(true);
    } catch {
      // Scan failed silently — photo still attached as regular attachment
    } finally {
      setScanningDoc(false);
    }
  }

  // ── Crear desde escaneo ───────────────────────────────────────
  async function crearDesdeEscaneo({ titulo, numero_meconecta, solicitante, prioridad, asignadosIds, ubicacion, lugar, descripcion }) {
    setScanCreating(true);
    setScanDupError(false);
    const sb = createClient();

    // Duplicate check
    if (numero_meconecta?.trim()) {
      const { data: dup } = await sb.from("ordenes_trabajo")
        .select("id").eq("workspace_id", plantaId)
        .eq("numero_meconecta", numero_meconecta.trim()).maybeSingle();
      if (dup) {
        setScanDupError(true);
        setScanCreating(false);
        return;
      }
    }

    const { data, error } = await sb.from("ordenes_trabajo").insert({
      workspace_id: plantaId, creado_por: myId,
      titulo: titulo.trim() || "Sin título",
      descripcion: descripcion?.trim() || "",
      numero_meconecta: numero_meconecta?.trim() || null,
      solicitante: solicitante?.trim() || null,
      ubicacion_texto: ubicacion?.trim() || null,
      lugar: lugar?.trim() || null,
      tipo: "solicitud", estado: "pendiente",
      prioridad: prioridad || "media", recurrencia: "ninguna",
      asignados_ids: asignadosIds.length > 0 ? asignadosIds : null,
    }).select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, numero_meconecta, solicitante, ubicacion_texto, lugar, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)").single();

    if (error || !data) { setScanCreating(false); return; }

    // Upload scan photo as attachment
    const photoSnap = capturaPhoto;
    if (photoSnap) {
      try {
        const path = `${plantaId}/${data.id}/scan_${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage.from("archivos-ordenes").upload(path, photoSnap, { upsert: false });
        if (!upErr) {
          const { data: { publicUrl } } = sb.storage.from("archivos-ordenes").getPublicUrl(path);
          await sb.from("archivos_orden").insert({
            orden_id: data.id, nombre: "orden_escaneada.jpg",
            url: publicUrl, tipo_mime: "image/jpeg", tipo: "contexto",
            tamano_kb: Math.round(photoSnap.size / 1024),
          });
        }
      } catch { /* non-blocking */ }
    }

    setOrdenes(prev => [data, ...prev]);
    setScanSuccess(true);

    setTimeout(() => {
      setShowScanSheet(false);
      setScanSuccess(false);
      setScanResult(null);
      setCapturaPhoto(null);
      setScanCreating(false);
      setScanDupError(false);
      abrirOT(data.id);
    }, 1400);
  }

  // ── Quick capture ─────────────────────────────────────────────
  async function crearRapida() {
    const titulo = capturaTitulo.trim();
    if (!titulo && !capturaPhoto) return;
    const finalTitulo = titulo || "Foto adjunta";
    const activoSnap  = capturaActivo;
    const photoSnap   = capturaPhoto;
    const scanSnap    = scanResult;
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id: tempId, titulo: finalTitulo, estado: "pendiente",
      created_at: new Date().toISOString(), activo_id: activoSnap?.id ?? null,
      activos: activoSnap ? { nombre: activoSnap.nombre } : null,
      _pending: true,
    };
    setOrdenes(prev => [optimistic, ...prev]);
    setCapturaTitulo("");
    setCapturaActivo(null);
    setCapturaPhoto(null);
    setScanResult(null);

    // Offline queue — no network? save locally and return
    if (!navigator.onLine) {
      try {
        const queue = JSON.parse(localStorage.getItem("pangui_ot_queue") || "[]");
        queue.push({ titulo: finalTitulo, activo_id: activoSnap?.id ?? null, ts: Date.now() });
        localStorage.setItem("pangui_ot_queue", JSON.stringify(queue));
      } catch { /* ignore */ }
      return;
    }

    // Build description from scan data if available
    const descParts = [
      scanSnap?.numero_meconecta && `N° ${scanSnap.numero_meconecta}`,
      scanSnap?.ubicacion && `📍 ${scanSnap.ubicacion}${scanSnap.lugar ? ` — ${scanSnap.lugar}` : ""}`,
      scanSnap?.solicitante && `Solicitante: ${scanSnap.solicitante}`,
      scanSnap?.descripcion,
    ].filter(Boolean);
    const finalDescripcion = descParts.join("\n\n");
    const VALID_PRIOS = new Set(["urgente", "alta", "media", "baja"]);
    const finalPrioridad = VALID_PRIOS.has(scanSnap?.prioridad) ? scanSnap.prioridad : "media";

    const sb = createClient();
    const { data, error } = await sb.from("ordenes_trabajo").insert({
      workspace_id: plantaId, creado_por: myId,
      titulo: finalTitulo, descripcion: finalDescripcion,
      tipo: "solicitud", estado: "pendiente", prioridad: finalPrioridad, recurrencia: "ninguna",
      activo_id: activoSnap?.id ?? null,
    }).select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)").single();

    if (error || !data) {
      setOrdenes(prev => prev.filter(o => o.id !== tempId)); // rollback
      return;
    }
    // Replace temp item and remove any realtime duplicate that may have arrived in the race
    setOrdenes(prev => {
      const without = prev.filter(o => o.id !== tempId && o.id !== data.id);
      return [{ ...data, _pending: false }, ...without];
    });

    // Upload photo if attached
    if (photoSnap) {
      try {
        const ext = photoSnap.name.split(".").pop() || "jpg";
        const path = `${plantaId}/${data.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("archivos-ordenes").upload(path, photoSnap, { upsert: false });
        if (!upErr) {
          const { data: { publicUrl } } = sb.storage.from("archivos-ordenes").getPublicUrl(path);
          await sb.from("archivos_orden").insert({
            orden_id: data.id, nombre: photoSnap.name,
            url: publicUrl, tipo_mime: photoSnap.type,
            tipo: "contexto",
            tamano_kb: Math.round(photoSnap.size / 1024),
          });
        }
      } catch { /* photo upload failure is non-blocking */ }
    }

    abrirOT(data.id);
  }

  // ── Crear nueva OT ───────────────────────────────────────────
  function abrirCrear() {
    setSelected(null);
    setOrdenData(null);
    setForm({ ...emptyForm });
    setArchivos([]);
    setPendingFiles([]);
    setSaveError(null);
    setPanelMode("create");
    window.history.pushState({}, "", "/ordenes/crear");
  }

  function setF(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  async function guardarNuevaOT() {
    if (!form.titulo.trim()) {
      setSaveError("Escribe un título para la orden.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    const sb = createClient();
    const tiempoMin = ((parseInt(form.tiempo_estimado_h) || 0) * 60) + (parseInt(form.tiempo_estimado_m) || 0) || null;
    const { data: nueva, error } = await sb.from("ordenes_trabajo").insert({
      workspace_id:    plantaId,
      creado_por:      myId,
      titulo:          form.titulo.trim() || null,
      descripcion:     form.descripcion.trim(),
      tipo:            "solicitud",
      tipo_trabajo:    form.tipo_trabajo || null,
      estado:          form.estado,
      prioridad:       form.prioridad,
      ubicacion_id:    form.ubicacion_id || null,
      activo_id:       form.activo_id || null,
      categoria_id:    form.categoria_id || null,
      fecha_inicio:    form.fecha_inicio || null,
      fecha_termino:   form.fecha_termino || null,
      tiempo_estimado: tiempoMin,
      recurrencia:     form.recurrencia,
      plantilla_id:    form.plantilla_id || null,
      partes_requeridas: JSON.stringify(normalizarPartes(form.partes)),
    }).select("id").single();
    if (error) { setSaveError(error.message); setSaving(false); return; }
    await registrarActividad(sb, nueva.id, "creacion", "Orden de trabajo creada");

    // Guardar como preventivo si fue marcado
    if (form.guardarComoPreventivo) {
      const frecDias = parseInt(form.frecuencia_dias) || 30;
      const proxFecha = new Date();
      proxFecha.setDate(proxFecha.getDate() + frecDias);
      const { error: prevErr } = await sb.from("preventivos").insert({
        workspace_id:      plantaId,
        titulo:            form.titulo.trim() || form.descripcion.trim().slice(0, 80),
        descripcion:       form.descripcion.trim() || form.titulo.trim() || "Sin descripción",
        tipo_trabajo:      form.tipo_trabajo || null,
        prioridad:         form.prioridad,
        categoria_id:      form.categoria_id || null,
        activo_id:         form.activo_id || null,
        ubicacion_id:      form.ubicacion_id || null,
        tiempo_estimado:   tiempoMin,
        frecuencia_dias:   frecDias,
        proxima_fecha:     proxFecha.toISOString().split("T")[0],
        pauta_id:          form.plantilla_id || null,
        partes_requeridas: JSON.stringify(normalizarPartes(form.partes)),
        activo:            true,
      });
      if (prevErr) setSaveError("OT guardada pero falló al crear el preventivo: " + prevErr.message);
    }

    // Upload buffered files from create panel
    if (pendingFiles.length > 0) {
      await Promise.all(pendingFiles.map(async (file) => {
        const ext = file.name.split(".").pop();
        const path = `${nueva.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await sb.storage.from("archivos-ordenes").upload(path, file, { upsert: false });
        if (upErr) return;
        const { data: { publicUrl } } = sb.storage.from("archivos-ordenes").getPublicUrl(path);
        await sb.from("archivos_orden").insert({
          orden_id: nueva.id,
          nombre: file.name,
          url: publicUrl,
          tipo_mime: file.type,
          tipo: "contexto",
          tamano_kb: Math.round(file.size / 1024),
        });
      }));
      setPendingFiles([]);
    }

    const { data: updatedList } = await sb.from("ordenes_trabajo")
      .select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
      .eq("workspace_id", plantaId).order("created_at", { ascending: false });
    setOrdenes(updatedList ?? []);
    setSaving(false);
    abrirOT(nueva.id);
  }

  // ── Actualizar estado / prioridad ────────────────────────────
  async function cambiarEstado(ordenId, nuevoEstado) {
    const sb = createClient();
    const estadoAnterior = ordenData?.estado;
    await sb.from("ordenes_trabajo").update({ estado: nuevoEstado }).eq("id", ordenId);
    setOrdenes((prev) => prev.map((o) => o.id === ordenId ? { ...o, estado: nuevoEstado } : o));
    if (ordenData?.id === ordenId) setOrdenData((prev) => prev ? { ...prev, estado: nuevoEstado } : prev);
    await registrarActividad(sb, ordenId, "cambio_estado",
      `Estado cambiado de "${ESTADO_LABEL[estadoAnterior] ?? estadoAnterior}" a "${ESTADO_LABEL[nuevoEstado] ?? nuevoEstado}"`,
      { campo: "estado", de: estadoAnterior, a: nuevoEstado }
    );
    // Notify all assigned users when job is initiated
    if (nuevoEstado === "en_curso") {
      const orden = ordenes.find(o => o.id === ordenId);
      const asignados = (orden?.asignados_ids ?? []).filter(uid => uid !== myId);
      if (asignados.length > 0) {
        callEdge("notificar", {
          usuario_ids: asignados,
          titulo: "Orden de trabajo iniciada",
          mensaje: orden?.titulo || "Se ha iniciado una orden de trabajo",
          url: `/ordenes/${ordenId}`,
        }).catch(() => {});
      }
    }
  }

  async function cambiarPrioridad(ordenId, nuevaPrioridad) {
    const sb = createClient();
    const prioAnterior = ordenData?.prioridad;
    await sb.from("ordenes_trabajo").update({ prioridad: nuevaPrioridad }).eq("id", ordenId);
    setOrdenes((prev) => prev.map((o) => o.id === ordenId ? { ...o, prioridad: nuevaPrioridad } : o));
    if (ordenData?.id === ordenId) setOrdenData((prev) => prev ? { ...prev, prioridad: nuevaPrioridad } : prev);
    await registrarActividad(sb, ordenId, "cambio_prioridad",
      `Prioridad cambiada de "${PRIORIDAD_LABEL[prioAnterior] ?? prioAnterior}" a "${PRIORIDAD_LABEL[nuevaPrioridad] ?? nuevaPrioridad}"`,
      { campo: "prioridad", de: prioAnterior, a: nuevaPrioridad }
    );
  }

  // ── Asignar responsables (multi-select toggle) ───────────────
  async function toggleResponsable(ordenId, userId) {
    const sb = createClient();
    const anterior = ordenData?.asignados_ids ?? [];
    const siguiente = anterior.includes(userId)
      ? anterior.filter(id => id !== userId)
      : [...anterior, userId];
    // Optimistic update
    setOrdenes(prev => prev.map(o => o.id === ordenId ? { ...o, asignados_ids: siguiente } : o));
    setOrdenData(prev => prev ? { ...prev, asignados_ids: siguiente } : prev);

    const { error } = await sb.from("ordenes_trabajo")
      .update({ asignados_ids: siguiente })
      .eq("id", ordenId);

    if (error) {
      setOrdenes(prev => prev.map(o => o.id === ordenId ? { ...o, asignados_ids: anterior } : o));
      setOrdenData(prev => prev ? { ...prev, asignados_ids: anterior } : prev);
      return;
    }
    const u = usuarios.find(u => u.id === userId);
    const added = !anterior.includes(userId);
    await registrarActividad(sb, ordenId, "cambio_tecnico",
      added ? `Responsable agregado: ${u?.nombre ?? "técnico"}` : `Responsable removido: ${u?.nombre ?? "técnico"}`
    );
    if (added) {
      const orden = ordenes.find(o => o.id === ordenId);
      callEdge("notificar", {
        usuario_id: userId,
        titulo: "Te han asignado una orden de trabajo",
        mensaje: orden?.titulo || "Nueva asignación",
        url: `/ordenes/${ordenId}`,
      }).catch(() => {});
    }
  }

  async function limpiarResponsables(ordenId) {
    const sb = createClient();
    const anterior = ordenData?.asignados_ids ?? [];
    setOrdenes(prev => prev.map(o => o.id === ordenId ? { ...o, asignados_ids: [] } : o));
    setOrdenData(prev => prev ? { ...prev, asignados_ids: [] } : prev);
    const { error } = await sb.from("ordenes_trabajo")
      .update({ asignados_ids: [] })
      .eq("id", ordenId);
    if (error) {
      setOrdenes(prev => prev.map(o => o.id === ordenId ? { ...o, asignados_ids: anterior } : o));
      setOrdenData(prev => prev ? { ...prev, asignados_ids: anterior } : prev);
    }
  }

  // ── Cerrar OT ─────────────────────────────────────────────────
  async function cerrarOT(ordenId) {
    const sb = createClient();
    const estadoAnterior = ordenData?.estado;
    const ahora = new Date().toISOString();
    // Optimistic update
    setOrdenes(prev => prev.map(o => o.id === ordenId ? { ...o, estado: "completado", completado_en: ahora } : o));
    setOrdenData(prev => prev ? { ...prev, estado: "completado", completado_en: ahora } : prev);

    const { error } = await sb.from("ordenes_trabajo")
      .update({ estado: "completado", completado_en: ahora })
      .eq("id", ordenId);

    if (error) {
      setOrdenes(prev => prev.map(o => o.id === ordenId ? { ...o, estado: estadoAnterior, completado_en: null } : o));
      setOrdenData(prev => prev ? { ...prev, estado: estadoAnterior, completado_en: null } : prev);
      return;
    }
    await registrarActividad(sb, ordenId, "cambio_estado", "OT cerrada como completada",
      { campo: "estado", de: estadoAnterior, a: "completado" }
    );
  }

  // ── Duplicar OT ───────────────────────────────────────────────
  async function duplicarOT(ordenId) {
    const sb = createClient();
    const { data: src } = await sb.from("ordenes_trabajo")
      .select("workspace_id, titulo, descripcion, tipo, tipo_trabajo, prioridad, ubicacion_id, categoria_id, plantilla_id, activo_id, tiempo_estimado")
      .eq("id", ordenId).single();
    if (!src) return;
    const { data: nueva, error } = await sb.from("ordenes_trabajo")
      .insert({ ...src, estado: "pendiente", titulo: src.titulo ? `${src.titulo} (copia)` : null })
      .select("id").single();
    if (error || !nueva) return;
    await registrarActividad(sb, nueva.id, "creacion", `Duplicada desde OT ${ordenId.slice(-4).toUpperCase()}`);
    const { data: updatedList } = await sb.from("ordenes_trabajo")
      .select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
      .eq("workspace_id", plantaId).order("created_at", { ascending: false });
    setOrdenes(updatedList ?? []);
    abrirOT(nueva.id);
  }

  // ── Eliminar OT ───────────────────────────────────────────────
  async function eliminarOT(ordenId) {
    const sb = createClient();
    await sb.from("ordenes_trabajo").delete().eq("id", ordenId);
    setOrdenes((prev) => prev.filter(o => o.id !== ordenId));
    setPanelMode(null);
    setSelected(null);
    setOrdenData(null);
  }

  // ── Subir archivo ─────────────────────────────────────────────
  async function subirArchivo(file) {
    if (!ordenData?.id) return;
    setUploadingFile(true);
    const sb = createClient();
    const ext = file.name.split(".").pop();
    const path = `${ordenData.id}/${Date.now()}.${ext}`;
    const { error: upErr } = await sb.storage.from("archivos-ordenes").upload(path, file, { upsert: false });
    if (upErr) { setUploadingFile(false); return; }
    const { data: { publicUrl } } = sb.storage.from("archivos-ordenes").getPublicUrl(path);
    const { data: arc } = await sb.from("archivos_orden").insert({
      orden_id: ordenData.id,
      nombre: file.name,
      url: publicUrl,
      tipo_mime: file.type,
      tipo: "contexto",
      tamano_kb: Math.round(file.size / 1024),
    }).select().single();
    if (arc) setArchivos((prev) => [...prev, arc]);
    setUploadingFile(false);
  }

  async function eliminarArchivo(arcId, url) {
    const sb = createClient();
    await sb.from("archivos_orden").delete().eq("id", arcId);
    setArchivos((prev) => prev.filter((a) => a.id !== arcId));
  }

  // ── Agregar nueva ubicación inline ────────────────────────────
  async function crearUbicacion() {
    if (!form.nueva_ubicacion.trim()) return;
    const sb = createClient();
    const { data } = await sb.from("ubicaciones").insert({ workspace_id: plantaId, edificio: form.nueva_ubicacion.trim() }).select("id, edificio").single();
    if (data) {
      setUbicaciones((prev) => [...prev, { ...data, piso: null, detalle: null, activa: true }]);
      setF("ubicacion_id", data.id);
      setF("nueva_ubicacion", "");
      setShowNuevUbic(false);
    }
  }

  // ── Agregar nuevo activo inline ───────────────────────────────
  async function crearActivo() {
    if (!form.nuevo_activo.trim()) return;
    const sb = createClient();
    const { data } = await sb.from("activos").insert({ workspace_id: plantaId, nombre: form.nuevo_activo.trim() }).select("id, nombre").single();
    if (data) {
      setActivos((prev) => [...prev, { ...data, codigo: null }]);
      setF("activo_id", data.id);
      setF("nuevo_activo", "");
      setShowNuevActivo(false);
    }
  }

  // ── Agregar parte requerida ───────────────────────────────────
  function addParte() { setF("partes", [...form.partes, { parte_id: "", nombre: "", cantidad: 1, unidad: "un" }]); }
  function setParte(i, key, val) {
    setF("partes", form.partes.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  }
  function setParteFields(i, fields) {
    setF("partes", form.partes.map((p, idx) => idx === i ? { ...p, ...fields } : p));
  }
  function removeParte(i) { setF("partes", form.partes.filter((_, idx) => idx !== i)); }
  // Normalize partes before saving — strip __otro__ sentinel, keep only filled rows
  function normalizarPartes(partes) {
    return partes
      .map(p => ({ ...p, parte_id: p.parte_id === "__otro__" ? null : (p.parte_id || null) }))
      .filter(p => p.nombre?.trim() || p.parte_id);
  }

  // ── Render ────────────────────────────────────────────────────
  const limites     = limitesParaPlan(plan);
  const isBasic     = (plan ?? "basic") === "basic" && planStatus !== "trial";
  const now         = new Date();
  const otsEsteMes  = ordenes.filter(o => {
    const d = new Date(o.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const otLimitReached = isBasic && otsEsteMes >= limites.ots_mes;

  const activeFilterCount = [
    filtros.asignado_a.length > 0, filtros.prioridad.length > 0,
    filtros.ubicacion_id.length > 0, filtros.activo_id.length > 0,
    filtros.categoria_id.length > 0, filtros.tipo_trabajo.length > 0,
    !!(filtros.fecha_termino_desde || filtros.fecha_termino_hasta),
    !!(filtros.created_desde || filtros.created_hasta),
    sortBy !== "created_at_desc",
  ].filter(Boolean).length;

  return (
    <div className={styles.root}>
      {/* ── LEFT PANEL ── */}
      <div className={`${styles.listPanel} ${panelMode && isDesktop ? styles.listPanelShrink : ""}`}>

        {/* Page title header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageHeaderSearch}>
            <Search size={15} className={styles.pageHeaderSearchIcon} />
            <input
              className={styles.pageHeaderSearchInput}
              placeholder="Buscar órdenes…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && <button className={styles.pageHeaderSearchClear} onClick={() => setBusqueda("")}><X size={14} /></button>}
          </div>
          <div className={styles.pageHeaderActions}>
            <button
              className={`${styles.pageHeaderBtn} ${calendarDate ? styles.pageHeaderBtnActive : ""}`}
              onClick={() => setCalendarOpen(true)}
              title="Filtrar por fecha"
              type="button"
            >
              <Calendar size={18} />
              {calendarDate && <span className={styles.pageHeaderBtnDot} />}
            </button>
            <button
              className={`${styles.pageHeaderBtn} ${activeFilterCount > 0 ? styles.pageHeaderBtnActive : ""}`}
              onClick={() => setFilterOpen(true)}
              title="Filtros avanzados"
              type="button"
            >
              <SlidersHorizontal size={18} />
              {activeFilterCount > 0 && <span className={styles.pageHeaderBtnBadge}>{activeFilterCount}</span>}
            </button>
          </div>
        </div>

        {/* Section tabs */}
        <div className={styles.sectionTabs}>
          <button
            className={`${styles.sectionTab} ${activeTab === "pendientes" ? styles.sectionTabActive : ""}`}
            type="button" onClick={() => { setActiveTab("pendientes"); setFiltroEstado("todas"); }}>
            Pendientes
          </button>
          <button
            className={`${styles.sectionTab} ${activeTab === "completadas" ? styles.sectionTabActive : ""}`}
            type="button" onClick={() => { setActiveTab("completadas"); setFiltroEstado("todas"); }}>
            Completadas
          </button>
        </div>

        {/* Trial banner */}
        {trialDays !== null && !trialDismiss && (
          <div className={styles.trialBanner}>
            <span className={styles.trialText}>
              {trialDays === 0
                ? "⚠️ Tu período de prueba terminó hoy."
                : "⏳ Tu prueba gratuita vence mañana."}{" "}
              <a href="/configuracion/suscripcion" className={styles.trialLink}>Ver planes →</a>
            </span>
            <button className={styles.trialClose} onClick={() => {
              try { localStorage.setItem(`pangui_trial_dismissed_${trialEnd}`, "1"); } catch {}
              setTrialDismiss(true);
            }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* OT limit banner for Basic */}
        {isBasic && (
          <div className={styles.limitBanner} style={{
            background: otLimitReached ? "#FEF2F2" : "#FFF7ED",
            borderBottom: `1px solid ${otLimitReached ? "#FECACA" : "#FED7AA"}`,
            padding: "8px 16px",
            fontSize: 13,
            color: otLimitReached ? "#B91C1C" : "#92400E",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span>
              {otLimitReached
                ? `Límite alcanzado: ${otsEsteMes} de ${limites.ots_mes} OTs este mes`
                : `${otsEsteMes} de ${limites.ots_mes} OTs este mes`}
            </span>
            {otLimitReached && (
              <a href="/configuracion/suscripcion" style={{ color: "#B91C1C", fontWeight: 700, textDecoration: "none", fontSize: 12 }}>
                Ver Pro →
              </a>
            )}
          </div>
        )}

        {/* ── Capture zone ── */}
        {!otLimitReached && (
          <div className={styles.captureZone}>
            <div className={styles.captureRow}>
              <input
                className={styles.captureInput}
                placeholder="¿Qué hay que hacer?"
                value={capturaTitulo}
                onChange={e => setCapturaTitulo(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") crearRapida(); }}
                autoFocus={!isDesktop}
                inputMode="text"
                autoComplete="off"
              />
              {/* Hidden camera file input — triggers document scan */}
              <input
                ref={capturaImgRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setCapturaPhoto(f); escanearDocumento(f); }
                  e.target.value = "";
                }}
              />
              <button
                className={`${styles.captureIconBtn} ${capturaPhoto ? styles.captureIconBtnActive : ""}`}
                onClick={() => capturaImgRef.current?.click()}
                title="Escanear documento"
                type="button"
                disabled={scanningDoc}
              >
                {scanningDoc
                  ? <Loader2 size={17} className={styles.spinIcon} />
                  : capturaPhoto
                    ? <CheckIcon size={17} />
                    : <ScanLine size={17} />}
              </button>
              <button
                className={styles.captureSubmitBtn}
                onClick={crearRapida}
                disabled={!capturaTitulo.trim() && !capturaPhoto}
                type="button"
                title="Crear orden"
              >
                <Plus size={19} strokeWidth={2.5} />
              </button>
            </div>

            {/* Scan sheet is rendered below as an overlay */}

            {/* Frequent asset chips */}
            {frecuentes.length > 0 && (
              <div className={styles.frecuentesRow}>
                {frecuentes.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    className={`${styles.frecuenteChip} ${capturaActivo?.id === a.id ? styles.frecuenteChipActive : ""}`}
                    onClick={() => setCapturaActivo(prev => prev?.id === a.id ? null : a)}
                  >
                    {capturaActivo?.id === a.id && <CheckIcon size={11} style={{ marginRight: 4 }} />}
                    {a.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* OT List */}
        <div className={styles.otList}>
          {loading ? (
            <div className={styles.emptyState}>Cargando órdenes…</div>
          ) : ordenesFiltradas.length === 0 ? (
            <div className={styles.emptyState}>Sin órdenes para mostrar</div>
          ) : (
            ordenesFiltradas.map((o) => {
              const venc       = vencimiento(o.fecha_termino);
              const est        = ESTADO_COLOR[o.estado] ?? { bg: "#F3F4F6", text: "#6B7280" };
              const StatusIcon = ESTADO_ICON[o.estado] ?? CircleDot;
              const PrioIcon   = PRIORIDAD_ICON[o.prioridad];
              const prioColor  = PRIORIDAD_COLOR[o.prioridad];
              return (
                <button key={o.id}
                  className={`${styles.otCard} ${selected === o.id ? styles.otCardActive : ""} ${o._pending ? styles.otCardPending : ""}`}
                  onClick={() => !o._pending && abrirOT(o.id)}
                  onPointerEnter={() => router.prefetch(`/ordenes/${o.id}`)}
                  disabled={!!o._pending}>
                  {/* Top row: status badge + time */}
                  <div className={styles.otCardHeader}>
                    {o._pending ? (
                      <span className={styles.otStatusBadge} style={{ background: "#F3F4F6", color: "#6B7280" }}>
                        <span className={styles.pendingDot} />
                        Guardando…
                      </span>
                    ) : (
                      <span className={styles.otStatusBadge} style={{ background: est.bg, color: est.text }}>
                        {ESTADO_LABEL[o.estado]}
                      </span>
                    )}
                    <span className={styles.otTimeAgo}>
                      {(() => {
                        const diff = Date.now() - new Date(o.created_at);
                        const min = Math.floor(diff / 60000);
                        if (min < 1) return "ahora";
                        if (min < 60) return `hace ${min}m`;
                        const h = Math.floor(min / 60);
                        if (h < 24) return `hace ${h}h`;
                        return new Date(o.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
                      })()}
                    </span>
                  </div>
                  {/* Title */}
                  <p className={styles.otTitle}>{o.titulo || o.descripcion?.slice(0, 80) || "Sin título"}</p>
                  {/* Meta: activo + location + date + comments */}
                  <div className={styles.otCardMeta}>
                    {o.activos?.nombre && (
                      <span className={styles.otMeta}>
                        <Settings2 size={11} />
                        {o.activos.nombre}
                      </span>
                    )}
                    {o.ubicaciones?.edificio && (
                      <span className={styles.otMeta}>
                        <MapPin size={11} />
                        {o.ubicaciones.edificio}
                      </span>
                    )}
                    {venc && (
                      <span className={`${styles.otMeta} ${venc.urgent ? styles.otMetaUrgent : ""}`}>
                        <Clock size={11} />
                        {venc.label}
                      </span>
                    )}
                    {comCounts[o.id] > 0 && (
                      <span className={styles.otMeta} style={{ color: "var(--accent-1)" }}>
                        <MessageSquare size={11} />
                        {comCounts[o.id]}
                      </span>
                    )}
                    {PrioIcon && (
                      <span className={styles.otMeta} style={{ color: prioColor }}>
                        <PrioIcon size={11} />
                        {PRIORIDAD_LABEL[o.prioridad]}
                      </span>
                    )}
                    {o.asignados_ids?.length > 0 && o.asignados_ids.map(uid => {
                      const u = usuarios.find(uu => uu.id === uid);
                      if (!u) return null;
                      const initials = u.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                      return (
                        <span key={uid} className={styles.otMeta} style={{ color: "var(--accent-1)" }}>
                          <span className={styles.otAssignedDot}>{initials}</span>
                          {u.nombre.split(" ")[0]}
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL (desktop) ── */}
      {isDesktop && panelMode && (
        <div className={styles.detailPanel}>
          {panelMode === "create" ? (
            <PanelCrear
              form={form} setF={setF}
              ubicaciones={ubicaciones}
              activos={activos} categorias={categorias}
              plantillas={plantillas} partesCatalogo={partesCatalogo}
              saving={saving} error={saveError}
              showNuevUbic={showNuevUbic} setShowNuevUbic={setShowNuevUbic}
              showNuevActivo={showNuevActivo} setShowNuevActivo={setShowNuevActivo}
              crearUbicacion={crearUbicacion} crearActivo={crearActivo}
              addParte={addParte} setParte={setParte} setParteFields={setParteFields} removeParte={removeParte}
              pendingFiles={pendingFiles} setPendingFiles={setPendingFiles} createFileRef={createFileRef}
              onGuardar={guardarNuevaOT}
              onCerrar={() => { setPanelMode(null); window.history.pushState({}, "", "/ordenes"); }}
            />
          ) : panelMode === "edit" ? (
            <PanelCrear
              isEdit
              form={form} setF={setF}
              ubicaciones={ubicaciones}
              activos={activos} categorias={categorias}
              plantillas={plantillas} partesCatalogo={partesCatalogo}
              saving={saving} error={saveError}
              showNuevUbic={showNuevUbic} setShowNuevUbic={setShowNuevUbic}
              showNuevActivo={showNuevActivo} setShowNuevActivo={setShowNuevActivo}
              crearUbicacion={crearUbicacion} crearActivo={crearActivo}
              addParte={addParte} setParte={setParte} setParteFields={setParteFields} removeParte={removeParte}
              archivos={archivos} fileRef={fileRef} uploadingFile={uploadingFile}
              subirArchivo={subirArchivo} eliminarArchivo={eliminarArchivo}
              onGuardar={guardarEdicionOT}
              onCerrar={() => { setPanelMode("view"); setSaveError(null); }}
            />
          ) : loadingPanel ? (
            <div className={styles.panelLoading}>Cargando…</div>
          ) : ordenData ? (
            <PanelVer
              orden={ordenData}
              archivos={archivos}
              fileRef={fileRef}
              uploadingFile={uploadingFile}
              subirArchivo={subirArchivo}
              eliminarArchivo={eliminarArchivo}
              myId={myId}
              myRol={myRol}
              onCambiarEstado={cambiarEstado}
              onCambiarPrioridad={cambiarPrioridad}
              onDuplicar={duplicarOT}
              onEliminar={eliminarOT}
              onEditar={abrirEditar}
              comentarios={comentarios}
              comentarioTexto={comentarioTexto}
              setComentarioTexto={setComentarioTexto}
              onAgregarComentario={agregarComentario}
              sendingComentario={sendingComentario}
              onCerrar={() => { setPanelMode(null); setSelected(null); window.history.pushState({}, "", "/ordenes"); }}
              onCerrarOT={cerrarOT}
              onToggleResponsable={toggleResponsable}
              onLimpiarResponsables={limpiarResponsables}
              usuarios={usuarios}
            />
          ) : null}
        </div>
      )}

      {/* Empty state desktop */}
      {isDesktop && !panelMode && (
        <div className={styles.emptyPanel}>
          <FileText size={48} style={{ opacity: 0.15, marginBottom: 12 }} />
          <p>Selecciona una OT o crea una nueva</p>
        </div>
      )}

      {/* ── MOBILE CREATE OVERLAY ── */}
      {!isDesktop && panelMode === "create" && (
        <div className={styles.mobileOverlay}>
          <PanelCrear
            form={form} setF={setF}
            ubicaciones={ubicaciones}
            activos={activos} categorias={categorias}
            plantillas={plantillas} partesCatalogo={partesCatalogo}
            saving={saving} error={saveError}
            showNuevUbic={showNuevUbic} setShowNuevUbic={setShowNuevUbic}
            showNuevActivo={showNuevActivo} setShowNuevActivo={setShowNuevActivo}
            crearUbicacion={crearUbicacion} crearActivo={crearActivo}
            addParte={addParte} setParte={setParte} setParteFields={setParteFields} removeParte={removeParte}
            pendingFiles={pendingFiles} setPendingFiles={setPendingFiles} createFileRef={createFileRef}
            onGuardar={guardarNuevaOT}
            onCerrar={() => setPanelMode(null)}
          />
        </div>
      )}

      {/* ── CALENDAR OVERLAY ── */}
      {calendarOpen && (
        <CalendarOverlay
          onClose={() => setCalendarOpen(false)}
          calendarDate={calendarDate}
          setCalendarDate={setCalendarDate}
          ordenes={ordenes}
        />
      )}

      {/* ── FILTER OVERLAY ── */}
      {filterOpen && (
        <FilterOverlay
          onClose={() => setFilterOpen(false)}
          filtros={filtros}
          setFiltros={setFiltros}
          sortBy={sortBy}
          setSortBy={setSortBy}
          usuarios={usuarios}
          ubicaciones={ubicaciones}
          activos={activos}
          categorias={categorias}
        />
      )}

      {/* ── SCAN SHEET OVERLAY ── */}
      {showScanSheet && scanResult && (
        <ScanSheet
          scanResult={scanResult}
          capturaPhoto={capturaPhoto}
          usuarios={usuarios}
          creating={scanCreating}
          success={scanSuccess}
          dupError={scanDupError}
          onClose={() => { setShowScanSheet(false); setScanResult(null); setCapturaPhoto(null); setScanDupError(false); }}
          onConfirm={crearDesdeEscaneo}
        />
      )}
    </div>
  );
}

// ── CalendarOverlay ───────────────────────────────────────────

function CalendarOverlay({ onClose, calendarDate, setCalendarDate, ordenes }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = calendarDate || new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const firstDow = (new Date(viewMonth.year, viewMonth.month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewMonth.year, viewMonth.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // Count ordenes per day in view month
  const countByDay = {};
  ordenes.forEach(o => {
    const d = new Date(o.created_at);
    if (d.getFullYear() === viewMonth.year && d.getMonth() === viewMonth.month) {
      countByDay[d.getDate()] = (countByDay[d.getDate()] || 0) + 1;
    }
  });

  // Ordenes for selected day
  const ordenesDia = calendarDate ? ordenes.filter(o => {
    const d = new Date(o.created_at);
    return sameDay(d, calendarDate);
  }) : [];

  const monthLabel = new Date(viewMonth.year, viewMonth.month, 1)
    .toLocaleDateString("es-CL", { month: "long", year: "numeric" });

  function prevMonth() {
    const d = new Date(viewMonth.year, viewMonth.month - 1, 1);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }
  function nextMonth() {
    const d = new Date(viewMonth.year, viewMonth.month + 1, 1);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }
  function selectDay(day) {
    if (!day) return;
    const d = new Date(viewMonth.year, viewMonth.month, day);
    setCalendarDate(sameDay(d, calendarDate) ? null : d);
  }

  return (
    <div className={styles.overlayFull}>
      <div className={styles.overlayHeader}>
        <button className={styles.overlayBack} onClick={onClose} type="button"><X size={20} /></button>
        <span className={styles.overlayTitle}>Buscar por fecha</span>
        {calendarDate && (
          <button className={styles.overlayClearBtn} type="button" onClick={() => setCalendarDate(null)}>Limpiar</button>
        )}
      </div>

      <div className={styles.calendarWrap}>
        <div className={styles.calendarNav}>
          <button className={styles.calNavBtn} onClick={prevMonth} type="button"><ChevronLeft size={18} /></button>
          <span className={styles.calMonthLabel}>{monthLabel}</span>
          <button className={styles.calNavBtn} onClick={nextMonth} type="button"><ChevronRight size={18} /></button>
        </div>
        <div className={styles.calDowRow}>
          {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
            <div key={d} className={styles.calDow}>{d}</div>
          ))}
        </div>
        <div className={styles.calGrid}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e-${i}`} />;
            const thisDate = new Date(viewMonth.year, viewMonth.month, day);
            const isToday    = sameDay(thisDate, today);
            const isSelected = sameDay(thisDate, calendarDate);
            const count      = countByDay[day] || 0;
            return (
              <button key={day} type="button"
                className={`${styles.calDay} ${isToday ? styles.calDayToday : ""} ${isSelected ? styles.calDaySelected : ""}`}
                onClick={() => selectDay(day)}>
                {day}
                {count > 0 && <span className={styles.calDayDot} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.calResults}>
        {calendarDate ? (
          <>
            <p className={styles.calResultsLabel}>
              {ordenesDia.length > 0
                ? `${ordenesDia.length} orden${ordenesDia.length !== 1 ? "es" : ""} creada${ordenesDia.length !== 1 ? "s" : ""} — ${calendarDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}`
                : `Sin órdenes creadas el ${calendarDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}`}
            </p>
            <div className={styles.calResultsList}>
              {ordenesDia.map(o => {
                const est = ESTADO_COLOR[o.estado] ?? { bg: "#F3F4F6", text: "#6B7280" };
                return (
                  <div key={o.id} className={styles.calResultCard}>
                    <span className={styles.otStatusBadge} style={{ background: est.bg, color: est.text, fontSize: 11 }}>
                      {ESTADO_LABEL[o.estado]}
                    </span>
                    <p className={styles.calResultTitle}>{o.titulo || "Sin título"}</p>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className={styles.calHint}>Selecciona un día para ver las órdenes creadas en esa fecha</p>
        )}
      </div>

      <div className={styles.filterFooter}>
        <button className={styles.filterApplyBtn} type="button" onClick={onClose}>
          {calendarDate ? "Ver resultados" : "Cerrar"}
        </button>
      </div>
    </div>
  );
}

// ── FilterOverlay ─────────────────────────────────────────────

function FilterOverlay({ onClose, filtros, setFiltros, sortBy, setSortBy, usuarios, ubicaciones, activos, categorias }) {
  function toggle(key, val) {
    setFiltros(f => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] };
    });
  }
  function clearAll() {
    setFiltros({ asignado_a: [], prioridad: [], ubicacion_id: [], activo_id: [], categoria_id: [], tipo_trabajo: [], fecha_termino_desde: "", fecha_termino_hasta: "", created_desde: "", created_hasta: "" });
    setSortBy("created_at_desc");
  }
  const activeCount = [
    filtros.asignado_a.length > 0, filtros.prioridad.length > 0,
    filtros.ubicacion_id.length > 0, filtros.activo_id.length > 0,
    filtros.categoria_id.length > 0, filtros.tipo_trabajo.length > 0,
    !!(filtros.fecha_termino_desde || filtros.fecha_termino_hasta),
    !!(filtros.created_desde || filtros.created_hasta),
    sortBy !== "created_at_desc",
  ].filter(Boolean).length;

  return (
    <div className={styles.overlayFull}>
      <div className={styles.overlayHeader}>
        <button className={styles.overlayBack} onClick={onClose} type="button"><X size={20} /></button>
        <span className={styles.overlayTitle}>Filtros{activeCount > 0 ? ` (${activeCount})` : ""}</span>
        {activeCount > 0 && <button className={styles.overlayClearBtn} type="button" onClick={clearAll}>Limpiar todo</button>}
      </div>

      <div className={styles.filterBody}>
        {/* Sort */}
        <div className={styles.filterSection}>
          <p className={styles.filterSectionLabel}>Ordenar por</p>
          <div className={styles.filterChipRow}>
            {SORT_OPTS.map(o => (
              <button key={o.value} type="button"
                className={`${styles.filterChip} ${sortBy === o.value ? styles.filterChipActive : ""}`}
                onClick={() => setSortBy(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prioridad */}
        <div className={styles.filterSection}>
          <p className={styles.filterSectionLabel}>Prioridad</p>
          <div className={styles.filterChipRow}>
            {["urgente","alta","media","baja","ninguna"].map(v => (
              <button key={v} type="button"
                className={`${styles.filterChip} ${filtros.prioridad.includes(v) ? styles.filterChipActive : ""}`}
                onClick={() => toggle("prioridad", v)}
                style={filtros.prioridad.includes(v) && PRIORIDAD_COLOR[v] ? { borderColor: PRIORIDAD_COLOR[v], color: PRIORIDAD_COLOR[v], background: PRIORIDAD_COLOR[v] + "18" } : {}}>
                {PRIORIDAD_LABEL[v]}
              </button>
            ))}
          </div>
        </div>

        {/* Responsable */}
        {usuarios.length > 0 && (
          <div className={styles.filterSection}>
            <p className={styles.filterSectionLabel}>Responsable</p>
            <div className={styles.filterChipRow}>
              {usuarios.map(u => {
                const initials = u.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                const active = filtros.asignado_a.includes(u.id);
                return (
                  <button key={u.id} type="button"
                    className={`${styles.filterChip} ${active ? styles.filterChipActive : ""}`}
                    onClick={() => toggle("asignado_a", u.id)}>
                    <span className={styles.filterAvatar} style={active ? { background: "var(--accent-1)", color: "#fff" } : {}}>{initials}</span>
                    {u.nombre.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tipo de trabajo */}
        <div className={styles.filterSection}>
          <p className={styles.filterSectionLabel}>Tipo de trabajo</p>
          <div className={styles.filterChipRow}>
            {Object.entries(TIPO_TRABAJO_LABEL).map(([v, l]) => (
              <button key={v} type="button"
                className={`${styles.filterChip} ${filtros.tipo_trabajo.includes(v) ? styles.filterChipActive : ""}`}
                onClick={() => toggle("tipo_trabajo", v)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Ubicación */}
        {ubicaciones.length > 0 && (
          <div className={styles.filterSection}>
            <p className={styles.filterSectionLabel}>Ubicación</p>
            <div className={styles.filterChipRow}>
              {ubicaciones.map(u => (
                <button key={u.id} type="button"
                  className={`${styles.filterChip} ${filtros.ubicacion_id.includes(u.id) ? styles.filterChipActive : ""}`}
                  onClick={() => toggle("ubicacion_id", u.id)}>
                  <MapPin size={11} style={{ flexShrink: 0 }} />{u.edificio}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Activo */}
        {activos.length > 0 && (
          <div className={styles.filterSection}>
            <p className={styles.filterSectionLabel}>Activo / Equipo</p>
            <div className={styles.filterChipRow}>
              {activos.map(a => (
                <button key={a.id} type="button"
                  className={`${styles.filterChip} ${filtros.activo_id.includes(a.id) ? styles.filterChipActive : ""}`}
                  onClick={() => toggle("activo_id", a.id)}>
                  <Settings2 size={11} style={{ flexShrink: 0 }} />{a.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Categoría */}
        {categorias.length > 0 && (
          <div className={styles.filterSection}>
            <p className={styles.filterSectionLabel}>Categoría</p>
            <div className={styles.filterChipRow}>
              {categorias.map(c => (
                <button key={c.id} type="button"
                  className={`${styles.filterChip} ${filtros.categoria_id.includes(c.id) ? styles.filterChipActive : ""}`}
                  onClick={() => toggle("categoria_id", c.id)}
                  style={filtros.categoria_id.includes(c.id) && c.color ? { borderColor: c.color, color: c.color, background: c.color + "18" } : {}}>
                  {categoriaIcon(c)}{c.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Fecha de creación */}
        <div className={styles.filterSection}>
          <p className={styles.filterSectionLabel}>Fecha de creación</p>
          <div className={styles.filterDateRow}>
            <div className={styles.filterDateField}>
              <label className={styles.filterDateLabel}>Desde</label>
              <input type="date" className={styles.filterDateInput} value={filtros.created_desde}
                onChange={e => setFiltros(f => ({ ...f, created_desde: e.target.value }))} />
            </div>
            <div className={styles.filterDateField}>
              <label className={styles.filterDateLabel}>Hasta</label>
              <input type="date" className={styles.filterDateInput} value={filtros.created_hasta}
                onChange={e => setFiltros(f => ({ ...f, created_hasta: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Fecha límite */}
        <div className={styles.filterSection}>
          <p className={styles.filterSectionLabel}>Fecha límite</p>
          <div className={styles.filterDateRow}>
            <div className={styles.filterDateField}>
              <label className={styles.filterDateLabel}>Desde</label>
              <input type="date" className={styles.filterDateInput} value={filtros.fecha_termino_desde}
                onChange={e => setFiltros(f => ({ ...f, fecha_termino_desde: e.target.value }))} />
            </div>
            <div className={styles.filterDateField}>
              <label className={styles.filterDateLabel}>Hasta</label>
              <input type="date" className={styles.filterDateInput} value={filtros.fecha_termino_hasta}
                onChange={e => setFiltros(f => ({ ...f, fecha_termino_hasta: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={{ height: 100 }} />
      </div>

      <div className={styles.filterFooter}>
        <button className={styles.filterApplyBtn} type="button" onClick={onClose}>
          Ver resultados
        </button>
      </div>
    </div>
  );
}

// ── PanelCrear: alias for shared component ────────────────────
const PanelCrear = PanelCrearOT;

// ── PanelVer ──────────────────────────────────────────────────

const ACTIVIDAD_ICON = {
  creacion:         { Icon: Activity,    color: "#6366F1" },
  cambio_estado:    { Icon: CircleDot,   color: "#3B82F6" },
  cambio_prioridad: { Icon: AlertTriangle, color: "#F97316" },
  cambio_tecnico:   { Icon: User,        color: "#8B5CF6" },
  adjunto:          { Icon: Paperclip,   color: "#6B7280" },
  comentario:       { Icon: MessageSquare, color: "#22C55E" },
  sistema:          { Icon: Info,        color: "#9CA3AF" },
};

function fmtTs(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" }) + " " +
    d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function PanelVer({ orden, archivos, fileRef, uploadingFile, subirArchivo, eliminarArchivo, myId, myRol, onCambiarEstado, onCambiarPrioridad, onDuplicar, onEliminar, onEditar, comentarios, comentarioTexto, setComentarioTexto, onAgregarComentario, sendingComentario, onCerrar, onCerrarOT, onToggleResponsable, onLimpiarResponsables, usuarios = [] }) {
  const venc = vencimiento(orden.fecha_termino);
  const tiempoStr = tiempoFmt(orden.tiempo_estimado);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handle(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  const puedeAccion = !["completado", "cancelado"].includes(orden.estado);
  const puedeEliminar = myRol === "admin"
    || (myRol === "jefe" && orden.creado_por === myId)
    || (myRol === "tecnico" && orden.creado_por === myId && orden.estado === "pendiente");

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <div className={styles.panelHeaderTopRow}>
            <span className={styles.panelOTId}>
              {orden.tipo === "emergencia" ? "EM" : "OT"}-{new Date(orden.created_at).getFullYear()}-{orden.id.slice(-4).toUpperCase()}
            </span>
            {orden.categorias_ot && (
              <span className={styles.panelCategoria} style={{ color: orden.categorias_ot.color }}>
                {categoriaIcon(orden.categorias_ot)}
                {orden.categorias_ot.nombre}
              </span>
            )}
          </div>
          <span className={styles.panelCreatedAt}>
            Creada el{" "}
            {new Date(orden.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
            {" · "}
            {new Date(orden.created_at).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className={styles.panelHeaderActions}>
          {/* Copy link */}
          <button
            className={styles.iconBtn}
            title="Copiar enlace"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/ordenes/${orden.id}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <span className={styles.copiedLabel}>Copiado</span> : <Link size={16} />}
          </button>
          {/* 3-dot menu */}
          <div className={styles.menuWrap} ref={menuRef}>
            <button className={styles.iconBtn} onClick={() => setMenuOpen(v => !v)} title="Más opciones">
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div className={styles.dropMenu}>
                <button className={styles.dropItem} onClick={() => { setMenuOpen(false); onEditar(); }}>
                  <Pencil size={14} /> Editar
                </button>
                <button className={styles.dropItem} onClick={() => { setMenuOpen(false); onDuplicar(orden.id); }}>
                  <Copy size={14} /> Duplicar
                </button>
                {puedeAccion && (
                  <button className={styles.dropItem} onClick={() => { setMenuOpen(false); onCambiarEstado(orden.id, "cancelado"); }}>
                    <Ban size={14} /> Cancelar OT
                  </button>
                )}
                {puedeEliminar && (
                  <>
                    <div className={styles.dropDivider} />
                    <button className={`${styles.dropItem} ${styles.dropItemDanger}`} onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}>
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          <button className={styles.panelClose} onClick={onCerrar}><X size={18} /></button>
        </div>
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className={styles.deleteConfirm}>
          <p className={styles.deleteConfirmText}>¿Eliminar esta orden permanentemente? Esta acción no se puede deshacer.</p>
          <div className={styles.deleteConfirmBtns}>
            <button className={styles.btnSecundario} onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button className={styles.btnDanger} onClick={() => onEliminar(orden.id)}>Eliminar</button>
          </div>
        </div>
      )}

      <div className={styles.panelBody}>
        {/* Acción rápida — botón prominente según estado */}
        {onCerrarOT && (() => {
          if (orden.estado === "pendiente" || orden.estado === "en_espera") return (
            <div className={styles.quickActionBar}>
              <button className={styles.quickActionBtn}
                style={{ background: "var(--accent-1)", color: "#fff" }}
                onClick={() => onCambiarEstado(orden.id, "en_curso")}>
                <PlayCircle size={18} /> Iniciar trabajo
              </button>
            </div>
          );
          if (orden.estado === "en_curso") return (
            <div className={styles.quickActionBar}>
              <button className={styles.quickActionBtn}
                style={{ background: "#22C55E", color: "#fff" }}
                onClick={() => onCerrarOT(orden.id)}>
                <CheckCircle2 size={18} /> Completar OT
              </button>
            </div>
          );
          if (orden.estado === "en_revision") return (
            <div className={styles.quickActionBar}>
              <button className={styles.quickActionBtn}
                style={{ background: "#22C55E", color: "#fff" }}
                onClick={() => onCerrarOT(orden.id)}>
                <BadgeCheck size={18} /> Aprobar y cerrar
              </button>
            </div>
          );
          return null;
        })()}

        {/* Título */}
        <h2 className={styles.otDetalleTitulo}>{orden.titulo || orden.descripcion?.slice(0, 80) || "Sin título"}</h2>

        {/* Estado */}
        <div className={styles.detSection}>
          <p className={styles.detSectionLabel}>Estado</p>
          <div className={styles.statusGrid}>
            {[
              { value: "pendiente",   label: "Abierta",     Icon: CircleDot },
              { value: "en_espera",   label: "En espera",   Icon: PauseCircle },
              { value: "en_curso",    label: "En curso",    Icon: PlayCircle },
              { value: "en_revision", label: "En revisión", Icon: PlayCircle },
              { value: "completado",  label: "Completada",  Icon: CheckCircle2 },
              { value: "cancelado",   label: "Cancelada",   Icon: XCircle },
            ].map(({ value, label, Icon }) => {
              const col = ESTADO_COLOR[value] ?? { bg: "#F3F4F6", text: "#6B7280" };
              const active = orden.estado === value;
              return (
                <button key={value} type="button"
                  className={`${styles.statusBtn} ${active ? styles.statusBtnActive : ""}`}
                  style={active ? { background: col.bg, color: col.text, borderColor: col.text } : {}}
                  onClick={() => onCambiarEstado(orden.id, value)}>
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prioridad */}
        <div className={styles.detSection}>
          <p className={styles.detSectionLabel}>Prioridad{orden.tipo_trabajo && <span className={styles.tipoBadge} style={{ marginLeft: 8 }}>{TIPO_TRABAJO_LABEL[orden.tipo_trabajo]}</span>}</p>
          <div className={styles.prioGrid}>
            {[
              { value: "baja",    label: "Baja",    Icon: ChevronDown,   color: "#9CA3AF" },
              { value: "media",   label: "Media",   Icon: Minus,         color: "#3B82F6" },
              { value: "alta",    label: "Alta",    Icon: ChevronUp,     color: "#F97316" },
              { value: "urgente", label: "Urgente", Icon: AlertTriangle, color: "#EF4444" },
            ].map(({ value, label, Icon, color }) => {
              const active = orden.prioridad === value;
              return (
                <button key={value} type="button"
                  className={`${styles.prioBtn} ${active ? styles.prioBtnActive : ""}`}
                  style={active ? { color, borderColor: color, background: `${color}18` } : {}}
                  onClick={() => onCambiarPrioridad(orden.id, value)}>
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Responsables */}
        {onToggleResponsable && usuarios.length > 0 && (
          <div className={styles.detSection}>
            <p className={styles.detSectionLabel}>Responsables</p>
            <div className={styles.assignChipsRow}>
              <button type="button"
                className={`${styles.assignChip} ${!(orden.asignados_ids?.length) ? styles.assignChipActive : ""}`}
                onClick={() => onLimpiarResponsables(orden.id)}>
                <span className={styles.assignAvatar} style={{ background: "#E5E7EB", color: "#6B7280" }}>–</span>
                Sin asignar
              </button>
              {usuarios.map(u => {
                const initials = u.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
                const active = orden.asignados_ids?.includes(u.id);
                return (
                  <button key={u.id} type="button"
                    className={`${styles.assignChip} ${active ? styles.assignChipActive : ""}`}
                    onClick={() => onToggleResponsable(orden.id, u.id)}>
                    <span className={styles.assignAvatar}
                      style={active ? { background: "var(--accent-1)", color: "#fff" } : { background: "#EEF2FF", color: "var(--accent-1)" }}>
                      {initials}
                    </span>
                    {u.nombre.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Descripción */}
        {orden.descripcion && (
          <div className={styles.detSection}>
            <p className={styles.detSectionLabel}>Descripción</p>
            <p className={styles.detText}>{orden.descripcion}</p>
          </div>
        )}

        {/* Meta grid */}
        <div className={styles.metaGrid}>
          {orden.ubicaciones && (
            <div className={styles.metaItem}>
              <MapPin size={13} className={styles.metaIcon} />
              <div>
                <span className={styles.metaKey}>Ubicación</span>
                <span className={styles.metaVal}>
                  {orden.ubicaciones.edificio}{orden.ubicaciones.piso ? `, piso ${orden.ubicaciones.piso}` : ""}
                </span>
              </div>
            </div>
          )}
          {orden.activos && (
            <div className={styles.metaItem}>
              <Settings2 size={13} className={styles.metaIcon} />
              <div>
                <span className={styles.metaKey}>Activo</span>
                <span className={styles.metaVal}>{orden.activos.nombre}</span>
              </div>
            </div>
          )}
          {orden.fecha_termino && (
            <div className={styles.metaItem}>
              <Clock size={13} className={styles.metaIcon} style={{ color: venc?.urgent ? "#EF4444" : undefined }} />
              <div>
                <span className={styles.metaKey}>Fecha límite</span>
                <span className={`${styles.metaVal} ${venc?.urgent ? styles.metaValUrgent : ""}`}>
                  {new Date(orden.fecha_termino).toLocaleDateString("es-CL")}{venc ? ` — ${venc.label}` : ""}
                </span>
              </div>
            </div>
          )}
          {tiempoStr && (
            <div className={styles.metaItem}>
              <Clock size={13} className={styles.metaIcon} />
              <div>
                <span className={styles.metaKey}>Tiempo estimado</span>
                <span className={styles.metaVal}>{tiempoStr}</span>
              </div>
            </div>
          )}
          {orden.recurrencia && orden.recurrencia !== "ninguna" && (
            <div className={styles.metaItem}>
              <Repeat size={13} className={styles.metaIcon} />
              <div>
                <span className={styles.metaKey}>Recurrencia</span>
                <span className={styles.metaVal}>{RECURRENCIA_LABEL[orden.recurrencia]}</span>
              </div>
            </div>
          )}
        </div>

        {/* Procedimiento */}
        {orden._pasos?.length > 0 && (
          <div className={styles.detSection}>
            <p className={styles.detSectionLabel}>
              <ClipboardCheck size={13} style={{ marginRight: 5 }} />
              Procedimiento{orden.plantillas_procedimiento ? ` — ${orden.plantillas_procedimiento.nombre}` : ""}
            </p>
            <div className={styles.pasosList}>
              {orden._pasos.map((p) => {
                const Icon = PASO_TIPO_ICON[p.tipo] ?? Info;
                return (
                  <div key={p.id} className={styles.pasoItem}>
                    <Icon size={14} style={{ color: PASO_TIPO_COLOR[p.tipo], flexShrink: 0 }} />
                    <span className={styles.pasoContenido}>{p.contenido}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Repuestos */}
        {Array.isArray(orden.partes_requeridas) && orden.partes_requeridas.length > 0 && (
          <div className={styles.detSection}>
            <p className={styles.detSectionLabel}>Repuestos requeridos</p>
            <div className={styles.partesList}>
              {orden.partes_requeridas.map((p, i) => (
                <div key={i} className={styles.parteViewRow}>
                  <span className={styles.parteNombre}>{p.nombre}</span>
                  <span className={styles.parteCantidad}>{p.cantidad} {p.unidad}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Archivos adjuntos */}
        <div className={styles.detSection}>
          <div className={styles.sectionHeaderRow}>
            <p className={styles.detSectionLabel}><Paperclip size={13} style={{ marginRight: 5 }} />Archivos adjuntos</p>
            <button className={styles.addLinkBtn} onClick={() => fileRef.current?.click()} disabled={uploadingFile}>
              {uploadingFile ? "Subiendo…" : <><Plus size={13} /> Adjuntar</>}
            </button>
          </div>
          <input ref={fileRef} type="file" style={{ display: "none" }} multiple
            onChange={(e) => [...(e.target.files ?? [])].forEach(subirArchivo)} />
          {archivos.length > 0 && (
            <div className={styles.archivosList}>
              {archivos.map((a) => (
                <div key={a.id} className={styles.archivoItem}>
                  <FileText size={14} className={styles.archivoIcon} />
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className={styles.archivoNombre}>{a.nombre}</a>
                  {a.tamano_kb && <span className={styles.archivoSize}>{a.tamano_kb} KB</span>}
                  <button className={styles.archivoDelete} onClick={() => eliminarArchivo(a.id, a.url)}><Trash2 size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Actividad y comentarios ── */}
        <div className={styles.actividadSection}>
          <p className={styles.detSectionLabel} style={{ marginBottom: 14 }}>
            <MessageSquare size={13} style={{ marginRight: 5 }} />
            Actividad
          </p>

          {/* Feed */}
          <div className={styles.actividadFeed}>
            {comentarios.length === 0 ? (
              <p className={styles.actividadVacia}>Sin actividad aún</p>
            ) : (
              comentarios.map((c) => {
                const { Icon, color } = ACTIVIDAD_ICON[c.tipo] ?? ACTIVIDAD_ICON.sistema;
                const esComentario = c.tipo === "comentario";
                return (
                  <div key={c.id} className={`${styles.actividadItem} ${esComentario ? styles.actividadComentario : ""}`}>
                    <span className={styles.actividadIconWrap} style={{ background: color + "20", color }}>
                      <Icon size={12} />
                    </span>
                    <div className={styles.actividadContent}>
                      {c.usuarios?.nombre && (
                        <span className={styles.actividadAutor}>{c.usuarios.nombre}</span>
                      )}
                      <span className={styles.actividadTexto}>{c.contenido}</span>
                      <span className={styles.actividadTs}>{fmtTs(c.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          <div className={styles.comentarioInputRow}>
            <textarea
              className={styles.comentarioInput}
              placeholder="Escribe un comentario…"
              value={comentarioTexto}
              onChange={(e) => setComentarioTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onAgregarComentario(); } }}
              rows={2}
            />
            <button
              className={styles.comentarioSend}
              onClick={onAgregarComentario}
              disabled={!comentarioTexto.trim() || sendingComentario}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ScanSheet ─────────────────────────────────────────────────

function ScanSheet({ scanResult, capturaPhoto, usuarios, creating, success, dupError, onClose, onConfirm }) {
  const [titulo,        setTitulo]        = useState(scanResult?.titulo ?? "");
  const [numero,        setNumero]        = useState(scanResult?.numero_meconecta ?? "");
  const [ubicacion,     setUbicacion]     = useState(scanResult?.ubicacion ?? "");
  const [lugar,         setLugar]         = useState(scanResult?.lugar ?? "");
  const [descripcion,   setDescripcion]   = useState(scanResult?.descripcion ?? "");
  const [solicitante,   setSolicitante]   = useState(scanResult?.solicitante ?? "");
  const [prioridad,     setPrioridad]     = useState(scanResult?.prioridad ?? "media");
  const [asignadosIds,  setAsignadosIds]  = useState([]);
  const [photoUrl,      setPhotoUrl]      = useState(null);

  useEffect(() => {
    if (!capturaPhoto) return;
    const url = URL.createObjectURL(capturaPhoto);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [capturaPhoto]);

  const isLow = (field) => scanResult?.[`${field}_conf`] === "low" || scanResult?.[field] == null;
  const PRIO_BTNS = [
    { value: "baja",    label: "Baja",    color: "#9CA3AF" },
    { value: "media",   label: "Media",   color: "#3B82F6" },
    { value: "alta",    label: "Alta",    color: "#F97316" },
    { value: "urgente", label: "Urgente", color: "#EF4444" },
  ];

  if (success) {
    return (
      <div className={styles.scanOverlay}>
        <div className={styles.scanSuccessCard}>
          <CheckCircle2 size={48} style={{ color: "#22C55E" }} />
          <p className={styles.scanSuccessTitle}>Orden creada</p>
          <p className={styles.scanSuccessSub}>Lista para asignar ✔</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.scanOverlay} onClick={onClose}>
      <div className={styles.scanSheet} onClick={e => e.stopPropagation()}>
        <div className={styles.sheetHandle} />
        <div className={styles.scanSheetHeader}>
          <span className={styles.scanSheetTitle}>Orden escaneada</span>
          <button className={styles.scanSheetClose} onClick={onClose} type="button"><X size={18} /></button>
        </div>

        <div className={styles.scanSheetBody}>
          {photoUrl && (
            <img src={photoUrl} alt="Orden escaneada" className={styles.scanPhotoThumb} />
          )}

          {/* N° Solicitud */}
          <div className={styles.scanFieldRow}>
            <label className={styles.scanLabel}>
              N° Referencia
            </label>
            <div className={styles.scanInputWrap}>
              <input
                className={`${styles.scanInput} ${isLow("numero_meconecta") ? styles.scanInputWarn : styles.scanInputOk}`}
                value={numero}
                onChange={e => setNumero(e.target.value)}
                placeholder="Nº de referencia"
              />
              {!isLow("numero_meconecta") && <CheckCircle2 size={15} className={styles.scanConfHigh} />}
              {isLow("numero_meconecta") && <AlertTriangle size={15} className={styles.scanConfLow} />}
            </div>
            {dupError && <p className={styles.scanDupError}>⚠ Este número ya existe en el sistema</p>}
          </div>

          {/* Título */}
          <div className={styles.scanFieldRow}>
            <label className={styles.scanLabel}>Título <span style={{ color: "#EF4444" }}>*</span></label>
            <div className={styles.scanInputWrap}>
              <input
                className={`${styles.scanInput} ${isLow("titulo") ? styles.scanInputWarn : styles.scanInputOk}`}
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="¿Qué hay que hacer?"
              />
              {!isLow("titulo") && <CheckCircle2 size={15} className={styles.scanConfHigh} />}
              {isLow("titulo") && <AlertTriangle size={15} className={styles.scanConfLow} />}
            </div>
          </div>

          {/* Ubicación */}
          <div className={styles.scanFieldRow}>
            <label className={styles.scanLabel}>Ubicación (edificio)</label>
            <div className={styles.scanInputWrap}>
              <input
                className={`${styles.scanInput} ${isLow("ubicacion") ? styles.scanInputWarn : styles.scanInputOk}`}
                value={ubicacion}
                onChange={e => setUbicacion(e.target.value)}
                placeholder="Ej: Aulas Centrales Salvador Gálvez"
              />
              {!isLow("ubicacion") && <CheckCircle2 size={15} className={styles.scanConfHigh} />}
              {isLow("ubicacion") && <AlertTriangle size={15} className={styles.scanConfLow} />}
            </div>
          </div>

          {/* Lugar */}
          <div className={styles.scanFieldRow}>
            <label className={styles.scanLabel}>Lugar (sector específico)</label>
            <div className={styles.scanInputWrap}>
              <input
                className={`${styles.scanInput} ${isLow("lugar") ? styles.scanInputWarn : styles.scanInputOk}`}
                value={lugar}
                onChange={e => setLugar(e.target.value)}
                placeholder="Ej: Pasos cubiertos aula 9"
              />
              {!isLow("lugar") && lugar && <CheckCircle2 size={15} className={styles.scanConfHigh} />}
              {isLow("lugar") && <AlertTriangle size={15} className={styles.scanConfLow} />}
            </div>
          </div>

          {/* Descripción */}
          <div className={styles.scanFieldRow}>
            <label className={styles.scanLabel}>Detalle / Descripción</label>
            <textarea
              className={`${styles.scanInput} ${styles.scanTextarea}`}
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Detalle de lo que hay que hacer…"
              rows={3}
            />
          </div>

          {/* Solicitante */}
          <div className={styles.scanFieldRow}>
            <label className={styles.scanLabel}>Solicitante</label>
            <div className={styles.scanInputWrap}>
              <input
                className={`${styles.scanInput} ${isLow("solicitante") ? styles.scanInputWarn : styles.scanInputOk}`}
                value={solicitante}
                onChange={e => setSolicitante(e.target.value)}
                placeholder="Nombre del solicitante"
              />
              {!isLow("solicitante") && <CheckCircle2 size={15} className={styles.scanConfHigh} />}
              {isLow("solicitante") && <AlertTriangle size={15} className={styles.scanConfLow} />}
            </div>
          </div>

          {/* Prioridad */}
          <div className={styles.scanFieldRow}>
            <label className={styles.scanLabel}>Prioridad</label>
            <div className={styles.scanPrioRow}>
              {PRIO_BTNS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  className={styles.scanPrioBtn}
                  style={prioridad === p.value ? { borderColor: p.color, color: p.color, background: `${p.color}18` } : {}}
                  onClick={() => setPrioridad(p.value)}
                >{p.label}</button>
              ))}
            </div>
          </div>

          {/* Asignar */}
          {usuarios.length > 0 && (
            <div className={styles.scanFieldRow}>
              <label className={styles.scanLabel}>Asignar a</label>
              <div className={styles.scanAssignRow}>
                {usuarios.map(u => {
                  const active = asignadosIds.includes(u.id);
                  const initials = u.nombre.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`${styles.scanAssignChip} ${active ? styles.scanAssignChipActive : ""}`}
                      onClick={() => setAsignadosIds(prev => active ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                    >
                      <span className={styles.scanAssignAvatar} style={active ? { background: "var(--accent-1)", color: "#fff" } : {}}>
                        {initials}
                      </span>
                      {u.nombre.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className={styles.scanSheetFooter}>
          <button
            className={styles.scanConfirmBtn}
            type="button"
            disabled={creating || !titulo.trim()}
            onClick={() => onConfirm({ titulo, numero_meconecta: numero, solicitante, prioridad, asignadosIds, ubicacion, lugar, descripcion })}
          >
            {creating
              ? <><Loader2 size={18} className={styles.spinIcon} /> Creando…</>
              : <><CheckCircle2 size={18} /> Confirmar y crear</>}
          </button>
        </div>
      </div>
    </div>
  );
}
