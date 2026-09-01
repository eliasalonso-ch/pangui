"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle, Loader2, Check, Filter, ArrowUpDown,
  Camera, MapPin,
  Plus, ArrowRight,
  MessageSquare, UserCheck, Play, Pause, RefreshCw, Edit3, Trash2,
  CheckCheck, TriangleAlert, User, TrendingUp,
  Info, XCircle, PackageX, Lock,
  Zap, Brain, ChevronRight, TrendingDown,
  Package, Timer, Activity,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { ordenQueryOptions } from "@/lib/queries";
import OTDetail from "@/app/(app)/ordenes/OTDetail";
import OTEditPanel from "@/app/(app)/ordenes/OTEditPanel";
import type {
  Activo, CategoriaOT, LugarEspecifico, OrdenTrabajo, Sociedad, Ubicacion, Usuario,
} from "@/types/ordenes";
import type { Estado, Prioridad } from "@/types/ordenes";
import { getSoloAsignadasUserId } from "@/lib/ordenes-api";
import { esAdmin } from "@/lib/roles";
import { backlogPorAntiguedad, buildFlowSeries, planificadoVsNo } from "@/lib/ot-flow";
import { classifyWaitingReason, waitingReasonColor } from "@/lib/waiting-reason";
import { WelcomeToast } from "@/components/WelcomeToast";
import {
  isUnassigned,
  aggregateTimeDistribution,
  avgResolutionTime,
} from "@/lib/ot-metrics";

// ── Types ──────────────────────────────────────────────────────────────────────

interface OTDashboard {
  id: string;
  titulo: string | null;
  descripcion: string;
  estado: Estado;
  prioridad: Prioridad;
  created_at: string;
  updated_at: string | null;
  completado_en?: string | null;
  tipo_trabajo?: string | null;
  fecha_termino: string | null;
  asignados_ids: string[] | null;
  numero?: number | null;
  iniciado_at: string | null;
  pausado_at: string | null;
  tiempo_total_segundos: number | null;
  clasificacion?: "levantamiento" | "ejecucion" | null;
  isBlocked?: boolean;
  blockedReason?: "materiales" | "cliente" | "acceso" | null;
}

interface Parte {
  id: string;
  nombre: string;
  stock_actual: number;
  stock_minimo: number;
}

interface ActividadItem {
  id: string;
  tipo: string;
  comentario: string | null;
  created_at: string;
  orden_id: string;
  usuario_id: string | null;
  orden_titulo: string | null;
  usuario_nombre: string | null;
}

const ACTIVIDAD_PAGE = 20;

const ACTIVIDAD_SELECT =
  "id, tipo, comentario, created_at, orden_id, usuario_id, " +
  "orden:ordenes_trabajo!orden_id(titulo), usuario:usuarios!usuario_id(nombre)";

/**
 * Medianoche de hoy en Santiago, en ISO UTC.
 *
 * El feed del tablero muestra sólo el día en curso y se reinicia a las 00:00
 * de Santiago. Se calcula sobre la zona del negocio y no la del navegador:
 * un administrador conectado desde otro huso vería el corte a otra hora.
 */
function inicioDelDiaSantiago(): string {
  const ahora = new Date();
  const enSantiago = new Date(ahora.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  const desfase = ahora.getTime() - enSantiago.getTime();
  const medianoche = new Date(enSantiago.getFullYear(), enSantiago.getMonth(), enSantiago.getDate());
  return new Date(medianoche.getTime() + desfase).toISOString();
}

/** Aplana una fila de actividad_ot; los joins llegan como objeto o array. */
function mapActividad(a: any): ActividadItem {
  return {
    id: a.id,
    tipo: a.tipo,
    comentario: a.comentario,
    created_at: a.created_at,
    orden_id: a.orden_id,
    usuario_id: a.usuario_id ?? null,
    orden_titulo: Array.isArray(a.orden) ? a.orden[0]?.titulo ?? null : a.orden?.titulo ?? null,
    usuario_nombre: Array.isArray(a.usuario) ? a.usuario[0]?.nombre ?? null : a.usuario?.nombre ?? null,
  };
}

type AtencionFiltro = "todas" | "materiales" | "acceso" | "vencidas" | "sin_asignar" | "otro";
type AtencionOrden  = "urgencia" | "atraso" | "reciente";

const ATENCION_FILTRO_KEY = "pangui_inicio_atencion_filtro";
const ATENCION_ORDEN_KEY  = "pangui_inicio_atencion_orden";
const ACTIVIDAD_TIPO_KEY  = "pangui_inicio_actividad_tipo";
const ACTIVIDAD_USER_KEY  = "pangui_inicio_actividad_usuario";

interface Insight {
  type: "danger" | "warning" | "info" | "success";
  message: string;
  icon: React.ReactNode;
  filtro?: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const ACTIVIDAD_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  creado:             { icon: <Plus size={16} />,           label: "Creó" },
  editado:            { icon: <Edit3 size={16} />,          label: "Editó" },
  comentario:         { icon: <MessageSquare size={16} />,  label: "Comentó" },
  estado_cambiado:    { icon: <RefreshCw size={16} />,      label: "Cambió estado" },
  asignado:           { icon: <UserCheck size={16} />,      label: "Asignó" },
  completado:         { icon: <CheckCheck size={16} />,     label: "Completó" },
  iniciado:           { icon: <Play size={16} />,           label: "Inició" },
  pausado:            { icon: <Pause size={16} />,          label: "Pausó" },
  reanudado:          { icon: <Play size={16} />,           label: "Reanudó" },
  prioridad_cambiada: { icon: <TriangleAlert size={16} />,  label: "Cambió prioridad" },
  eliminado:          { icon: <Trash2 size={16} />,         label: "Eliminó" },
  // Los dos más frecuentes de la tabla: sin entrada acá se mostraban con su
  // valor crudo de base de datos.
  fotos_grupo_subidas:{ icon: <Camera size={16} />,         label: "Subió fotos" },
  ubicacion_cambiada: { icon: <MapPin size={16} />,         label: "Cambió ubicación" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1)  return "ahora";
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24)    return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7)     return `${d}d`;
  return new Date(dateStr).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function getBlockedHours(ot: OTDashboard): number {
  if (ot.estado !== "en_espera") return 0;
  const since = ot.pausado_at ?? ot.updated_at ?? ot.created_at;
  return (Date.now() - new Date(since).getTime()) / 3600000;
}

function groupImmediateActions(ots: OTDashboard[]) {
  const open  = ots.filter(o => o.estado !== "completado");
  const today = new Date().toISOString().slice(0, 10);
  const vencidas   = open.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) < today);
  const paraHoy    = open.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) === today);
  const sinAsignar = open.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
  const bloqueadas = open.filter(o => o.estado === "en_espera");
  return { vencidas, paraHoy, sinAsignar, bloqueadas };
}

function generateInsights(ots: OTDashboard[], partes: Parte[]): Insight[] {
  const open        = ots.filter(o => o.estado !== "completado");
  const today       = new Date().toISOString().slice(0, 10);
  const vencidas    = open.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) < today);
  const sinAsignar  = open.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
  const bloqueadas  = open.filter(o => o.estado === "en_espera");
  const urgentes    = open.filter(o => o.prioridad === "urgente" || o.prioridad === "alta");
  const completadas = ots.filter(o => o.estado === "completado");
  const bajo_stock  = partes.filter(p => p.stock_actual < p.stock_minimo);

  const assigneeCounts: Record<string, number> = {};
  for (const ot of open) {
    for (const uid of ot.asignados_ids ?? []) {
      assigneeCounts[uid] = (assigneeCounts[uid] ?? 0) + 1;
    }
  }
  const overloaded = Object.values(assigneeCounts).filter(c => c >= 4).length;
  const timeDist   = aggregateTimeDistribution(open as any);
  const waitingPct = timeDist.waitingPct;
  const avgRes     = avgResolutionTime(completadas as any);
  const insights: Insight[] = [];

  if (vencidas.length > 0) insights.push({ type: "danger",  message: `${vencidas.length} orden${vencidas.length > 1 ? "es vencidas" : " vencida"} sin cerrar`, icon: <XCircle size={13} />, filtro: "vencidas" });
  if (bloqueadas.length > 0) {
    const over24 = bloqueadas.filter(o => getBlockedHours(o) > 24).length;
    insights.push(over24 > 0
      ? { type: "danger",  message: `${over24} orden${over24 > 1 ? "es llevan" : " lleva"} más de 24h bloqueada${over24 > 1 ? "s" : ""}`, icon: <Lock size={13} />, filtro: "bloqueadas" }
      : { type: "warning", message: `${bloqueadas.length} orden${bloqueadas.length > 1 ? "es bloqueadas" : " bloqueada"} en espera`, icon: <Clock size={13} />, filtro: "bloqueadas" }
    );
  }
  if (bajo_stock.length > 0)  insights.push({ type: "warning", message: `${bajo_stock.length} ítem${bajo_stock.length > 1 ? "s" : ""} de inventario bajo stock mínimo`, icon: <Package size={13} />, filtro: "inventario" });
  if (sinAsignar.length > 0)  insights.push({ type: "warning", message: `${sinAsignar.length} orden${sinAsignar.length > 1 ? "es" : ""} sin técnico asignado`, icon: <User size={13} />, filtro: "sin_asignar" });
  if (urgentes.length > 0)    insights.push({ type: "danger",  message: `${urgentes.length} orden${urgentes.length > 1 ? "es de alta prioridad" : " de alta prioridad"} activa${urgentes.length > 1 ? "s" : ""}`, icon: <Zap size={13} />, filtro: "alta_prioridad" });
  if (open.length > completadas.length * 1.5 && completadas.length > 0) insights.push({ type: "warning", message: "El backlog está creciendo — se abren más órdenes de las que se cierran", icon: <TrendingUp size={13} /> });
  if (waitingPct > 40 && timeDist.totalHours > 0) insights.push({ type: "warning", message: `El ${waitingPct}% del tiempo activo se pierde en esperas`, icon: <Timer size={13} /> });
  if (overloaded > 0) insights.push({ type: "warning", message: `${overloaded} técnico${overloaded > 1 ? "s" : ""} con 4 o más órdenes asignadas`, icon: <AlertTriangle size={13} /> });
  if (avgRes > 48)    insights.push({ type: "info",    message: `Tiempo promedio de resolución: ${Math.round(avgRes / 24)} días`, icon: <Clock size={13} /> });

  if (insights.length === 0 && open.length === 0)
    insights.push({ type: "success", message: "Todo al día — no hay órdenes pendientes", icon: <CheckCircle2 size={13} /> });
  else if (insights.length === 0)
    insights.push({ type: "info", message: `${open.length} orden${open.length !== 1 ? "es" : ""} activa${open.length !== 1 ? "s" : ""} sin alertas críticas`, icon: <Info size={13} /> });

  return insights;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function InicioDashboard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [userName, setUserName]         = useState<string>("");
  const [loading, setLoading]           = useState(true);
  // Sin esto, cualquier fallo de red dejaba la pagina en "Cargando..." para
  // siempre: `load()` no tenia try/catch ni finally, asi que una excepcion (o
  // un `return` temprano) se saltaba setLoading(false) y no habia forma de
  // salir del estado de carga salvo recargando.
  const [loadError, setLoadError]       = useState(false);
  const [allOTs, setAllOTs]             = useState<OTDashboard[]>([]);
  const [partes, setPartes]             = useState<Parte[]>([]);
  const [actividad, setActividad]       = useState<ActividadItem[]>([]);
  const [totalOTs, setTotalOTs] = useState(0);
  // Cuadrilla en terreno: sólo para admins/owners. Un técnico no necesita ver
  // la actividad de sus colegas, y con `solo_asignadas` ni siquiera vería sus OTs.
  const [equipo, setEquipo] = useState<{ id: string; nombre: string }[]>([]);
  const [esSupervisor, setEsSupervisor] = useState(false);
  /** Último comentario de pausa por OT, para explicar POR QUÉ está detenida. */
  const [motivosPausa, setMotivosPausa] = useState<Map<string, string | null>>(new Map());
  /** Página siguiente de actividad; null cuando ya no hay más. */
  const [actividadPage, setActividadPage] = useState(0);
  const [actividadFin, setActividadFin] = useState(false);
  const [cargandoActividad, setCargandoActividad] = useState(false);
  // Filtro y orden de "Requieren atención". Se leen de localStorage en un
  // efecto y no en el useState inicial: tocar `window` durante el primer
  // render rompe la hidratación.
  const [atencionFiltro, setAtencionFiltro] = useState<AtencionFiltro[]>([]);
  const [atencionOrden, setAtencionOrden]   = useState<AtencionOrden>("urgencia");

  useEffect(() => {
    try {
      const f = localStorage.getItem(ATENCION_FILTRO_KEY);
      const o = localStorage.getItem(ATENCION_ORDEN_KEY) as AtencionOrden | null;
      if (f) setAtencionFiltro(JSON.parse(f) as AtencionFiltro[]);
      if (o) setAtencionOrden(o);
    } catch {
      // Modo privado o cookies bloqueadas: se usan los valores por defecto.
    }
  }, []);

  function cambiarFiltro(v: string[]) {
    setAtencionFiltro(v as AtencionFiltro[]);
    try { localStorage.setItem(ATENCION_FILTRO_KEY, JSON.stringify(v)); } catch {}
  }
  function cambiarOrden(v: AtencionOrden) {
    setAtencionOrden(v);
    try { localStorage.setItem(ATENCION_ORDEN_KEY, v); } catch {}
  }

  const [actividadTipo, setActividadTipo] = useState<string[]>([]);
  useEffect(() => {
    try {
      const t = localStorage.getItem(ACTIVIDAD_TIPO_KEY);
      if (t) setActividadTipo(JSON.parse(t) as string[]);
    } catch {}
  }, []);
  function cambiarActividadTipo(v: string[]) {
    setActividadTipo(v);
    try { localStorage.setItem(ACTIVIDAD_TIPO_KEY, JSON.stringify(v)); } catch {}
  }

  const [actividadUser, setActividadUser] = useState<string[]>([]);
  useEffect(() => {
    try {
      const u = localStorage.getItem(ACTIVIDAD_USER_KEY);
      if (u) setActividadUser(JSON.parse(u) as string[]);
    } catch {}
  }, []);
  function cambiarActividadUser(v: string[]) {
    setActividadUser(v);
    try { localStorage.setItem(ACTIVIDAD_USER_KEY, JSON.stringify(v)); } catch {}
  }
  // Modal de detalle de OT. La idea es que /inicio sea utilizable sin saltar a
  // /ordenes: se abre acá y desde el propio modal se puede ir a la lista.
  const [otAbierta, setOtAbierta] = useState<OrdenTrabajo | null>(null);
  const [cargandoOT, setCargandoOT] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [myId, setMyId] = useState("");
  const [myRol, setMyRol] = useState<string | null>(null);
  const [wsId, setWsId] = useState("");
  // Catálogos que sólo necesita OTEditPanel. Se cargan bajo demanda -- la
  // mayoría de las visitas a /inicio no abren el editor, y traerlos siempre
  // sería exactamente el egress que acabamos de sacar de esta página.
  const [editando, setEditando] = useState(false);
  const [catalogos, setCatalogos] = useState<{
    ubicaciones: Ubicacion[]; lugares: LugarEspecifico[]; sociedades: Sociedad[];
    activos: Activo[]; categorias: CategoriaOT[];
  } | null>(null);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);
  const [dateLabel] = useState(() => {
    const f = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
    return f.charAt(0).toUpperCase() + f.slice(1);
  });
  const [greetingText] = useState(() => greeting());

  useEffect(() => {
    async function load() {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return;

        const { data: perfil } = await sb
          .from("usuarios")
          .select("nombre, workspace_id, rol")
          .eq("id", user.id)
          .maybeSingle();

        if (perfil?.nombre) setUserName(perfil.nombre.split(" ")[0]);
        setMyId(user.id);
        setMyRol(perfil?.rol ?? null);
        setWsId(perfil?.workspace_id ?? "");
        const puedeVerEquipo = esAdmin(perfil?.rol);
        setEsSupervisor(puedeVerEquipo);
        const workspaceId = perfil?.workspace_id;
        if (!workspaceId) return;

        // A member with solo_asignadas only sees their own OTs. RLS scopes by
        // workspace only, so the dashboard has to apply the same filter the
        // bandeja does or it leaks counts and cards for the whole workspace.
        // `user.id` ya lo tenemos de getUser() mas arriba; pasarlo evita un
        // segundo viaje a /auth/v1/user (~700 ms desde Chile a us-east-1).
        const soloAsignadas = await getSoloAsignadasUserId(user.id);
        const soloMias = <T extends { contains: (c: string, v: any) => T }>(q: T): T =>
          soloAsignadas ? q.contains("asignados_ids", [soloAsignadas]) : q;

        const [ordenesRes, actividadRes, partesRes, totalRes] = await Promise.all([
          soloMias(sb.from("ordenes_trabajo")
            .select(`id, titulo, descripcion, estado, prioridad, created_at, updated_at, completado_en, tipo_trabajo, fecha_termino, asignados_ids, numero, iniciado_at, pausado_at, tiempo_total_segundos, clasificacion`)
            .eq("workspace_id", workspaceId)
            .is("parent_id", null)
            .is("deleted_at", null)
            .neq("estado", "cancelado"))
            .order("created_at", { ascending: false })
            .limit(400),
          sb.from("actividad_ot")
            .select(ACTIVIDAD_SELECT)
            .eq("ordenes_trabajo.workspace_id", workspaceId)
            .gte("created_at", inicioDelDiaSantiago())
            .order("created_at", { ascending: false })
            .limit(ACTIVIDAD_PAGE),
          sb.from("partes")
            .select("id, nombre, stock_actual, stock_minimo")
            .eq("workspace_id", workspaceId)
            .not("stock_minimo", "is", null)
            .gt("stock_minimo", 0),
          soloMias(sb.from("ordenes_trabajo")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .is("deleted_at", null)
            .neq("estado", "cancelado")),
        ]);

        // `usuarios` alimenta tanto el panel de cuadrilla como el modal de
        // detalle (asignados, autores de comentarios), así que se carga siempre.
        const { data: usuariosData } = await sb
          .from("usuarios")
          .select("id, nombre, rol, deleted_at")
          .eq("workspace_id", workspaceId)
          .order("nombre");
        setUsuarios((usuariosData ?? []) as unknown as Usuario[]);
        setEquipo((usuariosData ?? []).filter((u: any) => !u.deleted_at).map((u: any) => ({ id: u.id, nombre: u.nombre })));

        // Motivos de pausa: sin esto "en espera" no dice nada accionable.
        // Se piden sólo para las que están efectivamente pausadas.
        const enEsperaIds = (ordenesRes.data ?? [])
          .filter((o: any) => o.estado === "en_espera")
          .map((o: any) => o.id);
        if (enEsperaIds.length > 0) {
          const { data: pausas } = await sb
            .from("actividad_ot")
            .select("orden_id, comentario, created_at")
            .eq("tipo", "pausado")
            .in("orden_id", enEsperaIds)
            .order("created_at", { ascending: false });
          const ultimo = new Map<string, string | null>();
          for (const row of (pausas ?? []) as any[]) {
            if (!ultimo.has(row.orden_id)) ultimo.set(row.orden_id, row.comentario);
          }
          setMotivosPausa(ultimo);
        }

        const ordenes = ordenesRes.data ?? [];
        setTotalOTs(totalRes.count ?? ordenes.length);

        const mapped: OTDashboard[] = ordenes.map((o: any) => ({
          ...o,
          isBlocked: o.estado === "en_espera",
          blockedReason: null,
        }));

        setAllOTs(mapped);
        setPartes((partesRes.data ?? []) as Parte[]);
        setActividad((actividadRes.data ?? []).map(mapActividad));
      } catch {
        // Una consulta lenta o caida no puede dejar la pantalla colgada: se
        // muestra el error con opcion a reintentar.
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const openOTs    = useMemo(() => allOTs.filter(o => o.estado !== "completado"), [allOTs]);
  const asignados      = useMemo(() => openOTs.filter(o => o.asignados_ids && o.asignados_ids.length > 0), [openOTs]);
  const { vencidas, sinAsignar, bloqueadas } = useMemo(() => groupImmediateActions(allOTs), [allOTs]);
  /**
   * Quién está trabajando ahora: una fila por OT en curso, con su técnico y
   * cuánto lleva. Una OT con varios asignados aparece una vez por persona --
   * están las dos trabajando en ella, y la pregunta es por persona.
   */
  const enTerreno = useMemo(() => {
    const nombrePorId = new Map(equipo.map(u => [u.id, u.nombre]));
    const filas = [];
    for (const o of allOTs) {
      if (o.estado !== "en_curso") continue;
      const inicio = o.iniciado_at ? new Date(o.iniciado_at).getTime() : null;
      const horas = inicio ? Math.max(0, Date.now() - inicio) / 3_600_000 : 0;

      for (const uid of o.asignados_ids ?? []) {
        const nombre = nombrePorId.get(uid);
        if (!nombre) continue;
        const partes = nombre.trim().split(/\s+/);
        filas.push({
          otId: o.id,
          numero: o.numero ?? null,
          titulo: o.titulo || o.descripcion?.slice(0, 50) || "Sin título",
          nombre,
          iniciales: (partes.length === 1
            ? partes[0].slice(0, 2)
            : partes[0][0] + partes[partes.length - 1][0]).toUpperCase(),
          inicio,
          horas,
        });
      }
    }
    // El que lleva más tiempo primero: es el que probablemente olvidó cerrarla.
    return filas.sort((a, b) => b.horas - a.horas);
  }, [allOTs, equipo]);

  // Escape cierra el modal, como en cualquier otro overlay de la app.
  useEffect(() => {
    if (!otAbierta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape sale primero del editor, y sólo entonces cierra el modal.
      if (editando) setEditando(false); else setOtAbierta(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [otAbierta, editando]);

  /** Abre el editor dentro del modal, cargando sus catálogos la primera vez. */
  async function abrirEditor() {
    setEditando(true);
    if (catalogos || !wsId) return;
    setCargandoCatalogos(true);
    try {
      const sb = createClient();
      const [ubic, lug, soc, act, cat] = await Promise.all([
        sb.from("ubicaciones").select("id,edificio,detalle,activa,sociedad_id,sociedades(id,nombre)")
          .eq("workspace_id", wsId).eq("activa", true).order("edificio"),
        sb.from("lugares").select("id,nombre,ubicacion_id,activo,imagen_url,descripcion,ubicaciones(id,edificio)")
          .eq("workspace_id", wsId).eq("activo", true).order("nombre"),
        sb.from("sociedades").select("id,nombre,activa,imagen_url")
          .eq("workspace_id", wsId).eq("activa", true).order("nombre"),
        sb.from("activos").select("id,nombre,numero_serie")
          .eq("workspace_id", wsId).eq("activo", true),
        sb.from("categorias_ot").select("id,nombre,icono,color")
          .or(`workspace_id.is.null,workspace_id.eq.${wsId}`).order("nombre"),
      ]);
      setCatalogos({
        ubicaciones: (ubic.data ?? []) as unknown as Ubicacion[],
        lugares: (lug.data ?? []) as unknown as LugarEspecifico[],
        sociedades: (soc.data ?? []) as unknown as Sociedad[],
        activos: (act.data ?? []) as unknown as Activo[],
        categorias: (cat.data ?? []) as unknown as CategoriaOT[],
      });
    } finally {
      setCargandoCatalogos(false);
    }
  }

  /** Abre el modal de detalle sin salir de /inicio. */
  async function abrirOT(id: string) {
    const cached = queryClient.getQueryData<OrdenTrabajo | null>(["orden", id]);
    if (cached) {
      setOtAbierta(cached);
      return;
    }
    // Pinta primero la fila del dashboard para que el modal no aparezca vacío,
    // y completa con el registro real cuando llega.
    const row = allOTs.find(o => o.id === id);
    setOtAbierta(row ? ({ ...row } as unknown as OrdenTrabajo) : null);
    setCargandoOT(true);
    try {
      const orden = await queryClient.fetchQuery(ordenQueryOptions(id, row?.estado));
      if (orden) setOtAbierta(orden);
    } catch {
      // Se queda la fila parcial en pantalla en vez de dejar el modal en blanco.
    } finally {
      setCargandoOT(false);
    }
  }

  // Series de los gráficos. Vienen de lib/ot-flow, el mismo módulo que usa
  // /analitica/ordenes, así que las dos vistas no pueden discrepar.
  const flujo = useMemo(() => buildFlowSeries(allOTs, 14), [allOTs]);
  const plan  = useMemo(() => planificadoVsNo(allOTs), [allOTs]);
  // 30 días para el backlog: en 14 la tendencia de la cola no se distingue.
  const flujoLargo = useMemo(() => buildFlowSeries(allOTs, 30, 2), [allOTs]);
  const backlogEdad = useMemo(() => backlogPorAntiguedad(allOTs), [allOTs]);

  /**
   * OTs que requieren atención, con el motivo por delante.
   *
   * El orden es el de urgencia real: primero lo bloqueado por algo que alguien
   * tiene que destrabar (materiales, acceso), después lo vencido, y al final lo
   * que no tiene responsable. Una OT aparece una sola vez, con su razón más
   * apremiante -- si está vencida Y sin materiales, el problema es el material.
   */
  const requierenAtencion = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    type Fila = { id: string; titulo: string; numero: number | null; motivo: string; color: string; detalle: string | null; orden: number; clave: AtencionFiltro; diasAtraso: number; creada: string };
    const filas: Fila[] = [];

    for (const o of allOTs) {
      if (o.estado === "completado") continue;
      const titulo = o.titulo || o.descripcion?.slice(0, 60) || "Sin título";

      if (o.estado === "en_espera") {
        const comentario = motivosPausa.get(o.id) ?? null;
        const r = classifyWaitingReason(comentario);
        filas.push({
          id: o.id, titulo, numero: o.numero ?? null,
          motivo: r.label, color: waitingReasonColor(r.key),
          detalle: comentario,
          orden: r.key === "materiales" ? 0 : r.key === "acceso" ? 1 : 3,
          clave: r.key === "materiales" ? "materiales" : r.key === "acceso" ? "acceso" : "otro",
          diasAtraso: 0, creada: o.created_at,
        });
        continue;
      }
      if (o.fecha_termino && o.fecha_termino.slice(0, 10) < hoy) {
        const dias = Math.max(1, Math.round((Date.parse(hoy) - Date.parse(o.fecha_termino.slice(0, 10))) / 86400000));
        filas.push({
          id: o.id, titulo, numero: o.numero ?? null,
          motivo: "Vencida", color: "var(--danger)",
          detalle: `${dias} ${dias === 1 ? "día" : "días"} de atraso`,
          orden: 2, clave: "vencidas", diasAtraso: dias, creada: o.created_at,
        });
        continue;
      }
      if (!o.asignados_ids || o.asignados_ids.length === 0) {
        filas.push({
          id: o.id, titulo, numero: o.numero ?? null,
          motivo: "Sin asignar", color: "var(--fg-4)",
          detalle: null, orden: 4, clave: "sin_asignar",
          diasAtraso: 0, creada: o.created_at,
        });
      }
    }
    const visibles = atencionFiltro.length === 0
      ? filas
      : filas.filter(f => atencionFiltro.includes(f.clave));

    return visibles.sort((a, b) => {
      if (atencionOrden === "atraso")   return b.diasAtraso - a.diasAtraso || a.orden - b.orden;
      if (atencionOrden === "reciente") return b.creada.localeCompare(a.creada);
      return a.orden - b.orden;
    });
  }, [allOTs, motivosPausa, atencionFiltro, atencionOrden]);

  /** Conteo por tipo, para mostrarlo junto a cada opción del filtro. */
  const atencionConteos = useMemo(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    const c: Record<AtencionFiltro, number> = { todas: 0, materiales: 0, acceso: 0, vencidas: 0, sin_asignar: 0, otro: 0 };
    for (const o of allOTs) {
      if (o.estado === "completado") continue;
      if (o.estado === "en_espera") {
        const k = classifyWaitingReason(motivosPausa.get(o.id) ?? null).key;
        c[k === "materiales" ? "materiales" : k === "acceso" ? "acceso" : "otro"]++;
      } else if (o.fecha_termino && o.fecha_termino.slice(0, 10) < hoy) {
        c.vencidas++;
      } else if (!o.asignados_ids || o.asignados_ids.length === 0) {
        c.sin_asignar++;
      } else continue;
      c.todas++;
    }
    return c;
  }, [allOTs, motivosPausa]);

  /** Carga la siguiente página de actividad al llegar al fondo de la tarjeta. */
  const cargarMasActividad = useCallback(async () => {
    if (actividadFin || cargandoActividad || !wsId) return;
    setCargandoActividad(true);
    try {
      const sb = createClient();
      const siguiente = actividadPage + 1;
      const desde = siguiente * ACTIVIDAD_PAGE;
      let q = sb
        .from("actividad_ot")
        .select(ACTIVIDAD_SELECT)
        .eq("ordenes_trabajo.workspace_id", wsId)
        .gte("created_at", inicioDelDiaSantiago())
        .order("created_at", { ascending: false })
        .range(desde, desde + ACTIVIDAD_PAGE - 1);
      // La página siguiente arrastra el filtro: si no, al bajar aparecerían
      // registros de otros usuarios o tipos.
      if (actividadTipo.length > 0) q = q.in("tipo", actividadTipo);
      if (actividadUser.length > 0) q = q.in("usuario_id", actividadUser);
      const { data } = await q;
      const filas = (data ?? []).map(mapActividad);
      setActividad(prev => [...prev, ...filas]);
      setActividadPage(siguiente);
      if (filas.length < ACTIVIDAD_PAGE) setActividadFin(true);
    } catch {
      // Se corta la paginación en vez de reintentar en bucle contra el scroll.
      setActividadFin(true);
    } finally {
      setCargandoActividad(false);
    }
  }, [actividadFin, cargandoActividad, wsId, actividadPage]);

  /**
   * Actividad: los filtros van al SERVIDOR, no sobre lo ya cargado.
   *
   * Filtrando en cliente sólo se veía lo de las 20 filas cargadas: si Elvis no
   * aparecía en esa primera página, no salía en el desplegable, y para ver su
   * actividad había que bajar hasta cargarla toda. Con la consulta filtrada,
   * elegir a alguien trae SUS registros aunque el más reciente sea de hace un
   * mes.
   */
  useEffect(() => {
    // La primera carga la hace `load()`; este efecto sólo reacciona a cambios
    // de filtro, para no pedir dos veces lo mismo al abrir la página.
    if (!wsId) return;
    let cancelado = false;
    (async () => {
      const sb = createClient();
      let q = sb
        .from("actividad_ot")
        .select(ACTIVIDAD_SELECT)
        .eq("ordenes_trabajo.workspace_id", wsId)
        .gte("created_at", inicioDelDiaSantiago())
        .order("created_at", { ascending: false })
        .range(0, ACTIVIDAD_PAGE - 1);
      if (actividadTipo.length > 0) q = q.in("tipo", actividadTipo);
      if (actividadUser.length > 0) q = q.in("usuario_id", actividadUser);

      const { data } = await q;
      if (cancelado) return;
      setActividad((data ?? []).map(mapActividad));
      setActividadPage(0);
      setActividadFin((data ?? []).length < ACTIVIDAD_PAGE);
    })();
    return () => { cancelado = true; };
  }, [wsId, actividadTipo, actividadUser]);

  /** Ya viene filtrado del servidor. */
  const actividadVisible = actividad;

  /**
   * Opciones de usuario: salen de `usuarios` (todo el workspace), no de lo
   * cargado. Si salieran del feed, alguien sin actividad reciente sería
   * infiltrable -- justo el problema que esto arregla.
   */
  const actividadUsuarios = useMemo(
    () => usuarios
      .filter(u => !u.deleted_at)
      .map(u => ({ value: u.id, label: u.nombre.split(" ")[0] })),
    [usuarios],
  );

  /** Tipos: lista fija, no derivada de lo cargado, por la misma razón. */
  const actividadTipos = useMemo(
    () => Object.entries(ACTIVIDAD_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label })),
    [],
  );

  const insights   = useMemo(() => generateInsights(allOTs, partes), [allOTs, partes]);
  const completadas    = useMemo(() => allOTs.filter(o => o.estado === "completado"), [allOTs]);
  const enCurso        = useMemo(() => allOTs.filter(o => o.estado === "en_curso"), [allOTs]);
  const levantamientos          = useMemo(() => allOTs.filter(o => o.clasificacion === "levantamiento"), [allOTs]);
  const levantamientosPendientes = useMemo(() => levantamientos.filter(o => o.estado !== "completado"), [levantamientos]);
  const levantamientosCompletados = useMemo(() => levantamientos.filter(o => o.estado === "completado"), [levantamientos]);
  const avgResHours   = useMemo(() => avgResolutionTime(completadas as any), [completadas]);
  const avgResDays    = avgResHours > 0 ? (avgResHours / 24).toFixed(1) : "—";

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--fg-4)", fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--fg-2)", fontSize: 13 }}>
        <span>No se pudo cargar el inicio.</span>
        <button
          onClick={() => window.location.reload()}
          style={{
            height: 34, padding: "0 16px", border: "1px solid var(--border-1)",
            borderRadius: "var(--r-md)", background: "var(--surface-2)",
            color: "var(--fg-1)", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px 40px 64px", minHeight: "100vh", background: "var(--surface-canvas)" }}>
      <WelcomeToast />

      {/* ── Header ── */}
      <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)", letterSpacing: "0.01em", margin: "0 0 6px", minHeight: 18 }}>
            {dateLabel}
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.02em", margin: 0 }}>
            {greetingText}{greetingText && userName ? `, ${userName}` : ""}
          </h1>
        </div>
        {/* Mismo botón que el de /ordenes (OrdenesBandeja): alto fijo 38,
            14px/500, ícono 16 y el mismo cambio plano de color en hover. */}
        <button
          type="button"
          onClick={() => router.push("/ordenes/crear")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 16px", height: 38,
            background: "var(--brand)", color: "var(--fg-on-brand)",
            border: "none", borderRadius: 8,
            fontSize: 14, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
            whiteSpace: "nowrap", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-active)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
        >
          <Plus size={16} strokeWidth={2} />
          Nueva Orden de Trabajo
        </button>
      </div>

      {/* ── KPI strip ──
          Una sola grilla: con 4/2/1 los siete KPIs dejaban dos huecos vacíos.
          `auto-fit` + minmax reparte las tarjetas parejas y baja de fila solo
          cuando ya no caben. */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12, marginBottom: 28,
      }}>
        <KpiCard
          label="En curso"
          value={String(enCurso.length)}
          sub="en ejecución ahora"
          trend="neutral"
          onClick={() => router.push("/ordenes?filtro=en_curso")}
        />
        <KpiCard
          label="En espera"
          value={String(bloqueadas.length)}
          sub="órdenes pausadas"
          trend={bloqueadas.length > 10 ? "bad" : bloqueadas.length > 5 ? "warn" : "good"}
          onClick={() => router.push("/ordenes?filtro=bloqueadas")}
        />
        <KpiCard
          label="Sin asignar"
          value={String(sinAsignar.length)}
          sub="sin técnico asignado"
          trend={sinAsignar.length > 5 ? "warn" : "good"}
          onClick={() => router.push("/ordenes?filtro=sin_asignar")}
        />
        <KpiCard
          label="Asignadas"
          value={String(asignados.length)}
          sub="con técnico asignado"
          trend="neutral"
          onClick={() => router.push("/ordenes?filtro=asignado")}
        />
        <KpiCard
          label="Completadas"
          value={String(completadas.length)}
          sub="cerradas en total"
          trend="neutral"
          onClick={() => router.push("/ordenes?filtro=completadas_hoy")}
        />
        <KpiCard
          label="Resolución"
          value={avgResDays === "—" ? "—" : `${avgResDays}d`}
          sub="promedio"
          trend="neutral"
        />
        <KpiCard
          label="Total histórico"
          value={String(totalOTs)}
          sub="OTs y sub-OTs"
          trend="neutral"
        />
      </div>

      {/* ── Gráficos ──
          Sólo dos, y sólo porque el número solo no basta: "246 completadas" no
          dice si el backlog crece, y "16 preventivas" no dice que son el 2%.
          Los contadores de estado de arriba se quedan como número. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 28 }}>
        <ChartCard title="Creadas vs completadas" hint="Últimos 14 días">
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={flujo} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fontSize: 11, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="creadas" name="Creadas" fill="var(--brand)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="completadas" name="Completadas" fill="var(--success)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Planificado vs no planificado"
          hint={plan.pctPlanificado == null ? "Sin mantenciones" : `${plan.pctPlanificado.toFixed(0)}% planificado`}
        >
          {plan.pctPlanificado == null ? (
            <div style={{ height: 150, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-4)", fontSize: 14 }}>
              Sin datos
            </div>
          ) : (
            /* Barra apilada, no torta: con un reparto 98/2 una torta es un
               círculo con una astilla invisible. */
            <div style={{ height: 150, display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
              <div style={{ display: "flex", height: 34, borderRadius: 6, overflow: "hidden", background: "var(--surface-hover)" }}>
                <div style={{ width: `${plan.pctPlanificado}%`, background: "var(--success)", minWidth: plan.planificadas > 0 ? 3 : 0 }} />
                <div style={{ flex: 1, background: "var(--danger)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { c: "var(--success)", l: "Planificado (preventiva)", v: plan.planificadas },
                  { c: "var(--danger)",  l: "No planificado (reactiva/emergencia)", v: plan.noPlanificadas },
                ].map(r => (
                  <div key={r.l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--fg-2)" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: r.c, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{r.l}</span>
                    <span style={{ fontWeight: 400, color: "var(--fg-1)" }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Flujo y backlog — el mismo gráfico de /analitica/ordenes. Va debajo de
          los otros dos y a ancho completo porque son tres series sobre 30 días:
          en media columna las líneas se pisan. */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 12, marginBottom: 28 }}>
        <ChartCard title="Flujo de OTs" hint="Últimos 30 días">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={flujoLargo} margin={{ top: 4, right: 8, left: -26, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="creadas" name="Creadas" stroke="var(--warning)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completadas" name="Completadas" stroke="var(--success)" strokeWidth={2} dot={false} />
              {/* El backlog es la línea que importa: si sube, se abren más OTs
                  de las que se cierran. */}
              <Line type="monotone" dataKey="backlog" name="Backlog" stroke="var(--brand)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Antigüedad del backlog: dice cuánto lleva esperando la cola, no
            sólo cuánta hay. Las barras se tiñen por tramo. */}
        <ChartCard title="Antigüedad del backlog" hint={`${backlogEdad.reduce((n, b) => n + b.count, 0)} pendientes`}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={backlogEdad} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--fg-4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                       cursor={{ fill: "var(--surface-hover)" }} />
              <Bar dataKey="count" name="OTs pendientes" radius={[3, 3, 0, 0]}>
                {backlogEdad.map(b => (
                  <Cell key={b.label} fill={b.tone === "bad" ? "var(--danger)" : b.tone === "warn" ? "var(--warning)" : "var(--brand)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Cuadrilla en terreno. NO muestra "en línea/desconectado": last_active
          sólo lo escribe la web, así que los técnicos -- que trabajan desde el
          móvil -- saldrían todos desconectados justo mientras trabajan. */}
      {esSupervisor && enTerreno.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Card title={`En terreno ahora (${enTerreno.length})`} action="" onAction={() => {}}>
            <div style={{ maxHeight: 192, overflowY: "auto" }}>
            {enTerreno.map((t, i) => (
              <button
                key={t.otId}
                onClick={() => abrirOT(t.otId)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                  height: 48, boxSizing: "border-box", padding: "0 16px", background: "none", border: "none",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, var(--brand-active), var(--brand))",
                  color: "var(--fg-on-brand)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>{t.iniciales}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.nombre}
                  </span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.numero != null ? `#${t.numero} · ` : ""}{t.titulo}
                  </span>
                </span>
                <span style={{
                  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 14, fontWeight: 400,
                  color: t.horas >= 12 ? "var(--danger)" : "var(--fg-3)",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  {t.horas >= 12 && <AlertTriangle size={14} />}
                  <LiveTimer desde={t.inicio} />
                </span>
              </button>
            ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Secciones a ancho completo ──
          Antes era una grilla 1fr/340px. En 340px los títulos de OT de
          "Actividad reciente" se cortaban a media palabra y cada alerta se
          partía en dos líneas; a ancho completo entran de una. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Requieren atención — reemplaza al inventario, que pertenece a
              /partes. Acá el motivo va por delante: "en espera" sin decir por
              qué no se puede accionar. */}
          {atencionConteos.todas > 0 && (
            <Card
              title={`Requieren atención (${atencionConteos.todas})`}
              action=""
              onAction={() => {}}
              controls={
                <>
                  <HeaderMultiSelect
                    icon={Filter}
                    label="Motivo"
                    values={atencionFiltro}
                    onChange={cambiarFiltro}
                    options={[
                      { value: "materiales",  label: "Faltan materiales", count: atencionConteos.materiales },
                      { value: "acceso",      label: "Sin acceso",        count: atencionConteos.acceso },
                      { value: "vencidas",    label: "Vencidas",          count: atencionConteos.vencidas },
                      { value: "sin_asignar", label: "Sin asignar",       count: atencionConteos.sin_asignar },
                      { value: "otro",        label: "Otro motivo",       count: atencionConteos.otro },
                    ]}
                  />
                  {/* El orden es excluyente: se guarda como array de uno para
                      reusar el mismo control, pero sólo admite un valor. */}
                  <HeaderMultiSelect
                    icon={ArrowUpDown}
                    label="Orden"
                    single
                    values={atencionOrden === "urgencia" ? [] : [atencionOrden]}
                    onChange={(v) => cambiarOrden((v[v.length - 1] as AtencionOrden) ?? "urgencia")}
                    options={[
                      { value: "atraso",   label: "Más atrasadas" },
                      { value: "reciente", label: "Más recientes" },
                    ]}
                  />
                </>
              }
            >
              <div style={{ maxHeight: 192, overflowY: "auto" }}>
              {requierenAtencion.length === 0 && (
                <p style={{ padding: "16px", margin: 0, fontSize: 14, color: "var(--fg-4)" }}>
                  Nada con ese filtro.
                </p>
              )}
              {requierenAtencion.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => abrirOT(r.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    height: 48, boxSizing: "border-box",
                    padding: "0 16px", background: "none", border: "none",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.numero != null ? `#${r.numero} · ` : ""}{r.titulo}
                      {r.detalle && <span style={{ color: "var(--fg-4)" }}> · {r.detalle}</span>}
                    </span>
                  </span>
                  <span style={{
                    flexShrink: 0, fontSize: 14, fontWeight: 400, color: r.color,
                    whiteSpace: "nowrap",
                  }}>{r.motivo}</span>
                </button>
              ))}
              </div>
            </Card>
          )}

        {/* Insights */}
          <Card title={`Alertas del sistema (${insights.length})`} action="" onAction={() => {}}>
            <div style={{ maxHeight: 192, overflowY: "auto" }}>
              {insights.map((insight, i) => {
                const clickable = !!insight.filtro;
                const isLast = i === insights.length - 1;
                const dotColor = insight.type === "danger" ? "var(--danger)" : insight.type === "warning" ? "var(--warning)" : insight.type === "success" ? "var(--success)" : "var(--brand)";
                return (
                  <div
                    key={i}
                    onClick={clickable ? () => insight.filtro === "inventario" ? router.push("/partes") : router.push(`/ordenes?filtro=${insight.filtro}`) : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      height: 48, boxSizing: "border-box", padding: "0 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--border)",
                      cursor: clickable ? "pointer" : "default",
                    }}
                    onMouseEnter={e => { if (clickable) e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { if (clickable) e.currentTarget.style.background = ""; }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", lineHeight: 1.5, minWidth: 0 }}>{insight.message}</span>
                    {clickable && <ChevronRight size={13} style={{ color: "var(--fg-4)", flexShrink: 0, marginTop: 2 }} />}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Activity feed */}
          <Card
            title="Actividad reciente (hoy)"
            action=""
            onAction={() => {}}
            controls={
              <>
                <HeaderMultiSelect
                  icon={User}
                  label="Usuario"
                  values={actividadUser}
                  onChange={cambiarActividadUser}
                  options={actividadUsuarios}
                />
                <HeaderMultiSelect
                  icon={Filter}
                  label="Tipo"
                  values={actividadTipo}
                  onChange={cambiarActividadTipo}
                  options={actividadTipos}
                />
              </>
            }
          >
            {actividad.length === 0 ? (
              <EmptyState label="Sin actividad reciente" />
            ) : (
              <div data-scroll style={{ maxHeight: 192, overflowY: "auto" }}>
                {actividadVisible.map((a, i) => {
                  const cfg = ACTIVIDAD_CONFIG[a.tipo] ?? { icon: <RefreshCw size={16} />, label: a.tipo };
                  return (
                    <div
                      key={a.id}
                      onClick={() => abrirOT(a.orden_id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, height: 48, boxSizing: "border-box", padding: "0 16px",
                        borderTop: i === 0 ? "none" : "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                    >
                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brand)" }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.usuario_nombre && <span>{a.usuario_nombre.split(" ")[0]} </span>}
                          <span style={{ color: "var(--fg-3)" }}>{cfg.label}</span>
                          {a.orden_titulo && (
                            <span style={{ color: "var(--fg-3)" }}>{" "}en <span style={{ color: "var(--fg-1)" }}>{a.orden_titulo}</span></span>
                          )}
                        </div>
                      </div>
                      <span style={{ flexShrink: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>{timeAgo(a.created_at)}</span>
                    </div>
                  );
                })}
                <InfiniteSentinel onHit={cargarMasActividad} disabled={actividadFin} />
              </div>
            )}
          </Card>
      </div>

      {/* ── Modal de detalle de OT ──
          Mismo patrón que el overlay de calendario/kanban en OrdenesBandeja:
          fondo oscuro que cierra al hacer clic, tarjeta centrada de 960px.
          Reusa OTDetail para no mantener una segunda vista de la misma OT. */}
      {otAbierta && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => { setOtAbierta(null); setEditando(false); }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--surface-1)", borderRadius: 14,
              width: "min(960px, 100%)", height: "calc(100vh - 48px)", maxHeight: "calc(100vh - 48px)",
              display: "flex", flexDirection: "column",
              boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
              overflow: "hidden",
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              {editando ? (
                cargandoCatalogos || !catalogos ? (
                  /* Mismo estado de carga que usa /ordenes: spinner azul de 22
                     apilado sobre la etiqueta, no un spinner gris en línea. */
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 12, color: "var(--fg-4)" }}>
                    <Loader2 size={22} className="animate-spin" style={{ color: "var(--brand)" }} />
                    <p style={{ fontSize: 13, color: "var(--fg-2)", fontWeight: 500, margin: 0 }}>Cargando…</p>
                  </div>
                ) : (
                  <OTEditPanel
                    orden={otAbierta}
                    usuarios={usuarios}
                    ubicaciones={catalogos.ubicaciones}
                    lugares={catalogos.lugares}
                    sociedades={catalogos.sociedades}
                    activos={catalogos.activos}
                    categorias={catalogos.categorias}
                    myId={myId}
                    wsId={wsId}
                    onClose={() => setEditando(false)}
                    onSaved={(updated) => {
                      setOtAbierta(prev => prev ? { ...prev, ...updated } : prev);
                      setAllOTs(prev => prev.map(o =>
                        o.id === otAbierta.id ? { ...o, ...(updated as Partial<OTDashboard>) } : o
                      ));
                      setEditando(false);
                    }}
                  />
                )
              ) : (
              <OTDetail
                key={otAbierta.id}
                orden={otAbierta}
                usuarios={usuarios}
                myId={myId}
                myRol={myRol}
                wsId={wsId}
                showCloseButton
                onClose={() => { setOtAbierta(null); setEditando(false); }}
                headerAction={{
                  icon: <ClipboardList size={16} />,
                  label: "Ver en Órdenes",
                  onClick: () => {
                    const id = otAbierta.id;
                    setOtAbierta(null);
                    router.push(`/ordenes/lista?id=${encodeURIComponent(id)}`);
                  },
                }}
                // Editar y eliminar viven en /ordenes: este modal es de lectura
                // y acción rápida, no un segundo lugar donde mantener esos flujos.
                onEdit={abrirEditor}
                // Eliminar sigue viviendo en /ordenes: es destructivo y allá
                // está el diálogo de confirmación y el refresco de la lista.
                onDelete={() => {
                  const id = otAbierta.id;
                  setOtAbierta(null);
                  router.push(`/ordenes/lista?id=${encodeURIComponent(id)}`);
                }}
                onOpenOrden={(id) => abrirOT(id)}
                onOrdenUpdated={(patch) => {
                  // Refleja el cambio en el modal y en las tarjetas de abajo,
                  // para que cerrar no deje el dashboard desactualizado.
                  setOtAbierta(prev => prev ? { ...prev, ...patch } : prev);
                  setAllOTs(prev => prev.map(o =>
                    o.id === otAbierta.id ? { ...o, ...(patch as Partial<OTDashboard>) } : o
                  ));
                }}
              />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Dispara `onHit` al entrar en vista. Se usa dentro del contenedor con scroll
 * de "Actividad reciente" para cargar la siguiente página al bajar.
 */
function InfiniteSentinel({ onHit, disabled }: { onHit: () => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const hitRef = useRef(onHit);
  hitRef.current = onHit;

  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) hitRef.current(); },
      { root: el.closest("[data-scroll]") as Element | null, rootMargin: "120px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled]);

  if (disabled) return null;
  return <div ref={ref} style={{ height: 1 }} aria-hidden />;
}

/** Contenedor de gráfico: mismo lenguaje que Card, con una nota a la derecha. */
function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)" }}>{title}</span>
        {hint && <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>{hint}</span>}
      </div>
      <div style={{ padding: "12px 12px 8px" }}>{children}</div>
    </div>
  );
}

// ── KpiCard ────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, trend, onClick }: {
  label: string; value: string; sub: string;
  trend: "good" | "warn" | "bad" | "neutral";
  onClick?: () => void;
}) {
  const trendColor = trend === "bad" ? "var(--danger)" : trend === "warn" ? "var(--warning)" : trend === "good" ? "var(--success)" : "var(--fg-1)";
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10,
        padding: "18px 20px",
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)", letterSpacing: "0.01em", marginBottom: 8 }}>{label}</div>
      {/* Sin fontFamily propio: pedía "Inter", que esta app no carga, así que
          caía en system-ui mientras el resto de la página va en Geist. */}
      <div style={{ fontSize: 26, fontWeight: 700, color: trendColor, lineHeight: 1.15, letterSpacing: "-0.02em", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>{sub}</div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────

function Card({ title, action, onAction, controls, children }: {
  title: string; action: string; onAction: () => void;
  /** Controles opcionales (filtros, orden) entre el título y el enlace. */
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--fg-1)", flexShrink: 0 }}>{title}</span>
        <span style={{ flex: 1 }} />
        {controls}
        {action && (
          <button onClick={onAction} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--brand)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            {action} <ArrowRight size={11} />
          </button>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

/**
 * Selector compacto para la cabecera de una tarjeta.
 *
 * Mismo lenguaje que los chips de filtro de /ordenes: 32 de alto, radio del
 * token, borde de marca cuando hay algo seleccionado y el ícono siempre en
 * azul. Se usa tanto para filtrar como para ordenar.
 */
/**
 * Selector múltiple para la cabecera de una tarjeta.
 *
 * Mismo comportamiento que los filtros de /ordenes: se pueden marcar varios
 * valores y el chip muestra cuántos. Un array vacío significa "todos", que es
 * lo que evita el caso raro de "ninguno seleccionado = no se ve nada".
 */
function HeaderMultiSelect({ icon: Icon, label, values, options, onChange, single }: {
  icon: React.ElementType;
  /** Texto del chip cuando no hay nada marcado. */
  label: string;
  values: string[];
  options: { value: string; label: string; count?: number }[];
  onChange: (v: string[]) => void;
  /**
   * Elección excluyente: sin casillas, sólo texto. Una casilla promete que se
   * pueden marcar varios, y en el orden eso no aplica.
   */
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = values.length > 0;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as Node;
      // El menú va en un portal, así que NO está dentro de `ref`: sin esta
      // segunda comprobación el mousedown lo cerraba antes del click.
      if (ref.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function abrir() {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const alto = Math.min(options.length * 38 + 44, 320);
      const cabeAbajo = window.innerHeight - r.bottom > alto + 12;
      setPos({
        top: cabeAbajo ? r.bottom + 4 : Math.max(8, r.top - alto - 4),
        right: window.innerWidth - r.right,
      });
    }
    setOpen(v => !v);
  }

  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  }

  const texto = values.length === 0
    ? label
    : values.length === 1
      ? options.find(o => o.value === values[0])?.label ?? label
      : `${label}: ${values.length}`;

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={abrir}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 32, padding: "0 11px",
          border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
          borderRadius: "var(--r-sm)",
          background: active ? "var(--brand-tint)" : "var(--surface-1)",
          color: active ? "var(--brand)" : "var(--fg-2)",
          fontSize: 14, fontWeight: 400,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", color: "var(--brand)" }}><Icon size={16} /></span>
        {texto}
      </button>

      {open && mounted && createPortal(
        <div ref={menuRef} style={{
          position: "fixed", top: pos.top, right: pos.right, zIndex: 9999,
          minWidth: 280, maxWidth: 360, maxHeight: 320, overflowY: "auto",
          background: "var(--surface-1)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)",
        }}>
          {/* Cabecera igual a la de los filtros de /ordenes. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px 6px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.01em" }}>{label}</span>
            {active && (
              <button
                type="button"
                onClick={() => onChange([])}
                style={{ fontSize: 13, color: "var(--fg-4)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
              >
                Limpiar
              </button>
            )}
          </div>
          {options.map(o => {
            const sel = values.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0,
                  padding: "8px 12px", background: sel ? "var(--brand-tint)" : "transparent",
                  border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = sel ? "var(--brand-tint)" : "transparent"; }}
              >
                {/* Casilla, no palomita: así el estado NO marcado también se ve. */}
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                {o.count != null && <span style={{ fontSize: 14, color: "var(--fg-4)", flexShrink: 0 }}>{o.count}</span>}
                {!single && (
                  <span aria-hidden style={{
                    width: 15, height: 15, flexShrink: 0, borderRadius: 3,
                    border: sel ? "none" : "1.5px solid var(--border-strong, var(--border))",
                    background: sel ? "var(--brand)" : "var(--surface-0)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {sel && <Check size={11} strokeWidth={3} style={{ color: "var(--fg-on-brand)" }} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── LiveTimer ──────────────────────────────────────────────────────────────────

/**
 * Cronómetro que corre solo. Vive en su propio componente para que el tick de
 * cada segundo re-renderice este <span> y nada más: el dashboard maneja ~400
 * OTs, y re-renderizarlo entero una vez por segundo sería caro para lo que es.
 *
 * Arranca en null y sólo empieza a contar tras el montaje: `Date.now()` en el
 * servidor no coincide con el del cliente, así que pintar un valor en el
 * primer render daría error de hidratación.
 */
function LiveTimer({ desde }: { desde: number | null }) {
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    if (desde == null) return;
    setAhora(Date.now());
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [desde]);

  if (desde == null) return <>—</>;
  // Antes del primer tick no hay nada que mostrar sin arriesgar la hidratación.
  if (ahora == null) return <>·</>;

  const total = Math.max(0, Math.floor((ahora - desde) / 1000));
  const dias = Math.floor(total / 86400);

  // Bajo un día corre el segundero; más allá es ruido y pasa a "2 d 3 h".
  if (dias >= 1) return <>{`${dias} d ${Math.floor((total % 86400) / 3600)} h`}</>;

  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return <>{hh > 0
    ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${mm}:${String(ss).padStart(2, "0")}`}</>;
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>{label}</div>
  );
}
