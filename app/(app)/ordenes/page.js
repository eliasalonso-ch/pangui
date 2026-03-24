"use client";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Calendar, ChevronDown, X, Search, SlidersHorizontal,
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
  Camera, Check as CheckIcon,
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

const ESTADOS_FILTRO = [
  { value: "todas",      label: "Todas" },
  { value: "pendiente",  label: "Abierta" },
  { value: "en_espera",  label: "En espera" },
  { value: "en_curso",   label: "En curso" },
  { value: "completado", label: "Completada" },
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

export default function BandejaOrdenes() {
  const router = useRouter();
  const [plantaId,  setPlantaId]  = useState(null);
  const [myId,      setMyId]      = useState(null);
  const [myRol,     setMyRol]     = useState(null);
  const [ordenes,   setOrdenes]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [activos,   setActivos]   = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [plantillas, setPlantillas] = useState([]);
  const [partesCatalogo, setPartesCatalogo] = useState([]);
  const [comCounts,  setComCounts]  = useState({}); // { orden_id: count }

  // Plan
  const [plan,        setPlan]        = useState(null);
  const [planStatus,  setPlanStatus]  = useState(null);

  // Trial banner
  const [trialDays,    setTrialDays]    = useState(null);
  const [trialEnd,     setTrialEnd]     = useState(null);
  const [trialDismiss, setTrialDismiss] = useState(false);

  // Filters
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [sortBy, setSortBy] = useState("created_at_desc");
  const [busqueda, setBusqueda] = useState("");
  const [dateFilter, setDateFilter] = useState("todas"); // todas/hoy/semana/mes
  const [sortOpen, setSortOpen] = useState(false);

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
  const [usuarios, setUsuarios] = useState([]);

  // Capture zone
  const [capturaTitulo,  setCapturaTitulo]  = useState("");
  const [capturaActivo,  setCapturaActivo]  = useState(null); // { id, nombre }
  const [capturaPhoto,   setCapturaPhoto]   = useState(null); // File
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

  useEffect(() => {
    async function init() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setMyId(user.id);
      const { data: perfil } = await sb.from("usuarios").select("workspace_id, plan_status, trial_end, rol, plan").eq("id", user.id).maybeSingle();
      setMyRol(perfil?.rol ?? null);
      setPlan(perfil?.plan ?? "basic");
      setPlanStatus(perfil?.plan_status ?? null);
      const effectivePlantaId = perfil?.workspace_id;
      if (!effectivePlantaId) { setLoading(false); return; }
      setPlantaId(effectivePlantaId);

      // Mostrar datos cacheados instantáneamente (stale-while-revalidate)
      try {
        const cached = JSON.parse(localStorage.getItem("pangui_ordenes_cache") || "null");
        if (Array.isArray(cached) && cached.length > 0) {
          setOrdenes(cached);
          setLoading(false);
        }
      } catch { /* ignore */ }

      // Trial banner — show only on the last day
      if (perfil?.plan_status === "trial" && perfil?.trial_end) {
        const days = Math.ceil((new Date(perfil.trial_end) - Date.now()) / 86400000);
        if (days <= 1) {
          const key = `pangui_trial_dismissed_${perfil.trial_end}`;
          if (!localStorage.getItem(key)) {
            setTrialDays(Math.max(0, days));
            setTrialEnd(perfil.trial_end);
          }
        }
      }

      // Parallel loads — allSettled so new-table 404s don't kill the page
      const results = await Promise.allSettled([
        // Try full query (post-migration); fall back to basic on error
        sb.from("ordenes_trabajo")
          .select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
          .eq("workspace_id", perfil.workspace_id)
          .order("created_at", { ascending: false }),
        sb.from("ubicaciones").select("id, edificio, piso, detalle").eq("workspace_id", perfil.workspace_id).eq("activa", true),
        sb.from("activos").select("id, nombre, codigo").eq("workspace_id", perfil.workspace_id).eq("activo", true),
        sb.from("categorias_ot").select("id, nombre, icono, color").or(`workspace_id.is.null,workspace_id.eq.${perfil.workspace_id}`).order("nombre"),
        sb.from("plantillas_procedimiento").select("id, nombre").eq("workspace_id", perfil.workspace_id).order("nombre"),
        sb.from("partes").select("id, nombre, unidad, codigo, stock_actual").eq("workspace_id", perfil.workspace_id).eq("activo", true).order("nombre"),
        sb.from("usuarios").select("id, nombre, rol").eq("workspace_id", perfil.workspace_id).order("nombre"),
      ]);

      const val = (r) => (r.status === "fulfilled" ? r.value?.data : null);

      // If the full ordenes query failed (missing columns pre-migration), retry with basic cols
      let ordenesData = val(results[0]);
      if (ordenesData === null) {
        const { data: basic } = await sb.from("ordenes_trabajo")
          .select("id, descripcion, estado, prioridad, tipo, created_at, ubicacion_id, ubicaciones(edificio)")
          .eq("workspace_id", perfil.workspace_id)
          .order("created_at", { ascending: false });
        ordenesData = basic ?? [];
      }

      setOrdenes(ordenesData);
      // Persist fresh data to localStorage for instant next load
      try {
        localStorage.setItem("pangui_ordenes_cache", JSON.stringify(ordenesData));
      } catch { /* quota exceeded — non-fatal */ }

      // Cargar conteo de comentarios de usuario por OT
      if (ordenesData.length > 0) {
        try {
          const { data: cds } = await sb.from("comentarios_orden")
            .select("orden_id")
            .in("orden_id", ordenesData.map(o => o.id))
            .eq("tipo", "comentario");
          const map = {};
          cds?.forEach(c => { map[c.orden_id] = (map[c.orden_id] || 0) + 1; });
          setComCounts(map);
        } catch { /* tabla puede no existir */ }
      }

      setUbicaciones(val(results[1]) ?? []);
      setActivos(val(results[2]) ?? []);
      setCategorias(val(results[3]) ?? []);
      setPlantillas(val(results[4]) ?? []);
      setPartesCatalogo(val(results[5]) ?? []);
      setUsuarios(val(results[6]) ?? []);
      setLoading(false);

      // Realtime: INSERT + UPDATE on ordenes_trabajo from other sessions
      ordenesRTChannelRef.current = sb.channel(`ordenes-rt-${perfil.workspace_id}`)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "ordenes_trabajo",
          filter: `workspace_id=eq.${perfil.workspace_id}`,
        }, (payload) => {
          setOrdenes(prev => {
            if (prev.find(o => o.id === payload.new.id)) return prev; // already there (optimistic)
            return [payload.new, ...prev];
          });
        })
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "ordenes_trabajo",
          filter: `workspace_id=eq.${perfil.workspace_id}`,
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

      // Flush any offline-queued OTs on reconnect
      async function flushOTQueue() {
        try {
          const queue = JSON.parse(localStorage.getItem("pangui_ot_queue") || "[]");
          if (!queue.length) return;
          localStorage.removeItem("pangui_ot_queue");
          for (const item of queue) {
            await sb.from("ordenes_trabajo").insert({
              workspace_id: perfil.workspace_id, creado_por: user.id,
              titulo: item.titulo, descripcion: "", tipo: "solicitud",
              estado: "pendiente", prioridad: "media", recurrencia: "ninguna",
              activo_id: item.activo_id ?? null,
            });
          }
          // Reload after flush
          const { data: refreshed } = await sb.from("ordenes_trabajo")
            .select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
            .eq("workspace_id", perfil.workspace_id).order("created_at", { ascending: false });
          if (refreshed) setOrdenes(refreshed);
        } catch { /* ignore */ }
      }
      window.addEventListener("online", flushOTQueue, { once: true });
    }
    init();
    return () => {
      if (ordenesRTChannelRef.current) createClient().removeChannel(ordenesRTChannelRef.current);
    };
  }, []);

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
  const ordenesFiltradas = (() => {
    let list = [...ordenes];

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

    // Date filter
    if (dateFilter !== "todas") {
      const now = new Date();
      const hoy = now.toDateString();
      const semana = new Date(now); semana.setDate(now.getDate() + 7);
      const mes = new Date(now); mes.setMonth(now.getMonth() + 1);
      list = list.filter((o) => {
        if (!o.fecha_termino) return false;
        const d = new Date(o.fecha_termino);
        if (dateFilter === "hoy")   return d.toDateString() === hoy;
        if (dateFilter === "semana") return d <= semana;
        if (dateFilter === "mes")   return d <= mes;
        return true;
      });
    }

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
        workspace_id: plantaId,
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
      workspace_id: plantaId,
      usuario_id: myId,
      tipo: "comentario",
      contenido: texto,
    }).select("id, tipo, contenido, metadatos, created_at, usuario_id, usuarios(nombre)").single();
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

  // ── Quick capture ─────────────────────────────────────────────
  async function crearRapida() {
    const titulo = capturaTitulo.trim();
    if (!titulo && !capturaPhoto) return;
    const finalTitulo = titulo || "Foto adjunta";
    const activoSnap = capturaActivo; // snapshot before clearing
    const photoSnap  = capturaPhoto;
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

    // Offline queue — no network? save locally and return
    if (!navigator.onLine) {
      try {
        const queue = JSON.parse(localStorage.getItem("pangui_ot_queue") || "[]");
        queue.push({ titulo: finalTitulo, activo_id: activoSnap?.id ?? null, ts: Date.now() });
        localStorage.setItem("pangui_ot_queue", JSON.stringify(queue));
      } catch { /* ignore */ }
      return;
    }

    const sb = createClient();
    const { data, error } = await sb.from("ordenes_trabajo").insert({
      workspace_id: plantaId, creado_por: myId,
      titulo: finalTitulo, descripcion: "",
      tipo: "solicitud", estado: "pendiente", prioridad: "media", recurrencia: "ninguna",
      activo_id: activoSnap?.id ?? null,
    }).select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)").single();

    if (error || !data) {
      setOrdenes(prev => prev.filter(o => o.id !== tempId)); // rollback
      return;
    }
    setOrdenes(prev => prev.map(o => o.id === tempId ? { ...data, _pending: false } : o));

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

  return (
    <div className={styles.root}>
      {/* ── LEFT PANEL ── */}
      <div className={`${styles.listPanel} ${panelMode && isDesktop ? styles.listPanelShrink : ""}`}>

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
                placeholder="¿Qué pasó?"
                value={capturaTitulo}
                onChange={e => setCapturaTitulo(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") crearRapida(); }}
                autoFocus={!isDesktop}
                inputMode="text"
                autoComplete="off"
              />
              {/* Hidden camera file input */}
              <input
                ref={capturaImgRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setCapturaPhoto(f); e.target.value = ""; }}
              />
              <button
                className={`${styles.captureIconBtn} ${capturaPhoto ? styles.captureIconBtnActive : ""}`}
                onClick={() => capturaImgRef.current?.click()}
                title="Adjuntar foto"
                type="button"
              >
                {capturaPhoto ? <CheckIcon size={17} /> : <Camera size={17} />}
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

        {/* Header */}
        <div className={styles.listHeader}>
          <h1 className={styles.listTitle}>Órdenes</h1>
          <button
            className={styles.btnNueva}
            onClick={otLimitReached ? () => window.location.href = "/configuracion/suscripcion" : abrirCrear}
            title={otLimitReached ? "Límite de OTs alcanzado — Actualiza a Pro" : undefined}
            style={otLimitReached ? { opacity: 0.6 } : undefined}
          >
            <Plus size={16} />
            <span>Nueva OT</span>
          </button>
        </div>

        {/* Search */}
        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            placeholder="Buscar OTs…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda && <button className={styles.searchClear} onClick={() => setBusqueda("")}><X size={14} /></button>}
        </div>

        {/* Filters */}
        <div className={styles.filtersRow}>
          {/* Date filter */}
          <div className={styles.dateFilterWrap}>
            <Calendar size={14} className={styles.dateIcon} />
            <select className={styles.dateSelect} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
              <option value="todas">Todas las fechas</option>
              <option value="hoy">Vence hoy</option>
              <option value="semana">Esta semana</option>
              <option value="mes">Este mes</option>
            </select>
          </div>

          {/* Sort */}
          <div className={styles.sortWrap}>
            <button className={styles.sortBtn} onClick={() => setSortOpen((v) => !v)}>
              <SlidersHorizontal size={14} />
              <span>{SORT_OPTS.find((o) => o.value === sortBy)?.label}</span>
              <ChevronDown size={12} />
            </button>
            {sortOpen && (
              <>
                <div className={styles.sortBackdrop} onClick={() => setSortOpen(false)} />
                <div className={styles.sortMenu}>
                  {SORT_OPTS.map((o) => (
                    <button key={o.value} className={`${styles.sortItem} ${sortBy === o.value ? styles.sortItemActive : ""}`}
                      onClick={() => { setSortBy(o.value); setSortOpen(false); }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Status pills */}
        <div className={styles.pillsRow}>
          {ESTADOS_FILTRO.map((e) => (
            <button key={e.value}
              className={`${styles.pill} ${filtroEstado === e.value ? styles.pillActive : ""}`}
              onClick={() => setFiltroEstado(e.value)}>
              {e.label}
            </button>
          ))}
        </div>

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
