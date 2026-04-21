"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, MapPin, Wrench, MessageSquare,
  UserCheck, Play, Pause, RefreshCw, Edit3, Trash2,
  CheckCheck, TriangleAlert, User, Calendar, TrendingUp,
  Info, XCircle, PackageX, Lock,
  Flame, Zap, Brain, ChevronRight, TrendingDown,
  Package, ShieldAlert, Timer, Activity,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Estado, Prioridad } from "@/types/ordenes";
import { parseDescMeta } from "@/lib/ordenes-api";
import {
  getOverdueDays as otGetOverdueDays,
  isOverdue as otIsOverdue,
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
  fecha_termino: string | null;
  asignados_ids: string[] | null;
  ubicaciones?: { edificio: string } | null;
  nOT?: string | null;
  numero?: number | null;
  iniciado_at: string | null;
  pausado_at: string | null;
  tiempo_total_segundos: number | null;
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
  orden_titulo: string | null;
  usuario_nombre: string | null;
}

interface Insight {
  type: "danger" | "warning" | "info" | "success";
  message: string;
  icon: React.ReactNode;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente:  "Abierta",
  en_espera:  "En espera",
  en_curso:   "En curso",
  completado: "Completada",
};

const ESTADO_STYLE: Record<Estado, { bg: string; color: string; dot: string }> = {
  pendiente:  { bg: "#EFF6FF", color: "#1D4ED8", dot: "#3B82F6" },
  en_espera:  { bg: "#FFF7ED", color: "#C2410C", dot: "#F97316" },
  en_curso:   { bg: "#F0FDF4", color: "#15803D", dot: "#22C55E" },
  completado: { bg: "#F0FDF4", color: "#166534", dot: "#16A34A" },
};

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  ninguna: "Sin prioridad", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
};

const PRIORIDAD_STYLE: Record<Prioridad, { bg: string; color: string }> = {
  ninguna: { bg: "#F1F5F9", color: "#94A3B8" },
  baja:    { bg: "#F1F5F9", color: "#64748B" },
  media:   { bg: "#EFF6FF", color: "#2563EB" },
  alta:    { bg: "#FFF7ED", color: "#EA580C" },
  urgente: { bg: "#FEF2F2", color: "#DC2626" },
};

const BLOCKER_LABEL: Record<string, string> = {
  materiales: "Esperando materiales",
  cliente:    "Esperando cliente",
  acceso:     "Sin acceso",
  otro:       "Otro motivo",
};

const ACTIVIDAD_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  creado:             { icon: <Plus size={11} />,           label: "Creó",             color: "#1E3A8A" },
  editado:            { icon: <Edit3 size={11} />,          label: "Editó",            color: "#6B7280" },
  comentario:         { icon: <MessageSquare size={11} />,  label: "Comentó",          color: "#0369A1" },
  estado_cambiado:    { icon: <RefreshCw size={11} />,      label: "Cambió estado",    color: "#7C3AED" },
  asignado:           { icon: <UserCheck size={11} />,      label: "Asignó",           color: "#059669" },
  completado:         { icon: <CheckCheck size={11} />,     label: "Completó",         color: "#166534" },
  iniciado:           { icon: <Play size={11} />,           label: "Inició",           color: "#15803D" },
  pausado:            { icon: <Pause size={11} />,          label: "Pausó",            color: "#C2410C" },
  reanudado:          { icon: <Play size={11} />,           label: "Reanudó",          color: "#15803D" },
  prioridad_cambiada: { icon: <TriangleAlert size={11} />,  label: "Cambió prioridad", color: "#D97706" },
  eliminado:          { icon: <Trash2 size={11} />,         label: "Eliminó",          color: "#DC2626" },
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

function getOverdueDays(ot: OTDashboard): number {
  return otGetOverdueDays(ot);
}

function isDueToday(ot: OTDashboard): boolean {
  if (!ot.fecha_termino) return false;
  const today = new Date().toISOString().slice(0, 10);
  return ot.fecha_termino.slice(0, 10) === today;
}

function getPriorityScore(ot: OTDashboard): number {
  const urgencyWeight =
    ot.prioridad === "urgente" ? 10
    : ot.prioridad === "alta" ? 8
    : ot.prioridad === "media" ? 5
    : ot.prioridad === "baja" ? 2
    : 1;
  const overduePenalty    = getOverdueDays(ot) * 5;
  const unassignedPenalty = isUnassigned(ot) ? 10 : 0;
  const blockedPenalty    = ot.estado === "en_espera" ? 8 : 0;
  return urgencyWeight + overduePenalty + unassignedPenalty + blockedPenalty;
}

function getBlockedHours(ot: OTDashboard): number {
  if (ot.estado !== "en_espera") return 0;
  // Use pausado_at if available, else updated_at, else created_at
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

function groupBlockAlerts(ots: OTDashboard[]): { reason: string; count: number; over24h: number }[] {
  const blocked = ots.filter(o => o.estado === "en_espera");
  const byReason: Record<string, { count: number; over24h: number }> = {};

  for (const ot of blocked) {
    const reason = ot.blockedReason ?? "otro";
    if (!byReason[reason]) byReason[reason] = { count: 0, over24h: 0 };
    byReason[reason].count++;
    if (getBlockedHours(ot) > 24) byReason[reason].over24h++;
  }

  return Object.entries(byReason)
    .map(([reason, data]) => ({ reason, ...data }))
    .filter(g => g.count > 0)
    .sort((a, b) => b.over24h - a.over24h || b.count - a.count);
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

  // Workload imbalance: any technician assigned to 4+ open OTs
  const assigneeCounts: Record<string, number> = {};
  for (const ot of open) {
    for (const uid of ot.asignados_ids ?? []) {
      assigneeCounts[uid] = (assigneeCounts[uid] ?? 0) + 1;
    }
  }
  const overloaded = Object.values(assigneeCounts).filter(c => c >= 4).length;

  // Time distribution
  const timeDist = aggregateTimeDistribution(open as any);
  const waitingPct = timeDist.waitingPct;

  // Avg resolution time (hours)
  const avgRes = avgResolutionTime(completadas as any);

  const insights: Insight[] = [];

  if (vencidas.length > 0) {
    insights.push({
      type: "danger",
      message: `${vencidas.length} orden${vencidas.length > 1 ? "es vencidas" : " vencida"} sin cerrar`,
      icon: <XCircle size={14} />,
    });
  }

  if (bloqueadas.length > 0) {
    const over24 = bloqueadas.filter(o => getBlockedHours(o) > 24).length;
    if (over24 > 0) {
      insights.push({
        type: "danger",
        message: `${over24} orden${over24 > 1 ? "es llevan" : " lleva"} más de 24h bloqueada${over24 > 1 ? "s" : ""}`,
        icon: <Lock size={14} />,
      });
    } else {
      insights.push({
        type: "warning",
        message: `${bloqueadas.length} orden${bloqueadas.length > 1 ? "es bloqueadas" : " bloqueada"} — revisar`,
        icon: <Clock size={14} />,
      });
    }
  }

  if (bajo_stock.length > 0) {
    insights.push({
      type: "warning",
      message: `${bajo_stock.length} ítem${bajo_stock.length > 1 ? "s" : ""} de inventario bajo stock mínimo`,
      icon: <Package size={14} />,
    });
  }

  if (sinAsignar.length > 0) {
    insights.push({
      type: "warning",
      message: `${sinAsignar.length} orden${sinAsignar.length > 1 ? "es" : ""} sin técnico asignado`,
      icon: <User size={14} />,
    });
  }

  if (urgentes.length > 0) {
    insights.push({
      type: "danger",
      message: `${urgentes.length} orden${urgentes.length > 1 ? "es de prioridad alta/urgente" : " de alta prioridad"} activa${urgentes.length > 1 ? "s" : ""}`,
      icon: <Zap size={14} />,
    });
  }

  if (open.length > completadas.length * 1.5 && completadas.length > 0) {
    insights.push({
      type: "warning",
      message: "El backlog está creciendo: se abren más órdenes de las que se cierran",
      icon: <TrendingUp size={14} />,
    });
  }

  if (waitingPct > 40 && timeDist.totalHours > 0) {
    insights.push({
      type: "warning",
      message: `El ${waitingPct}% del tiempo activo se pierde en esperas y bloqueos`,
      icon: <Timer size={14} />,
    });
  }

  if (overloaded > 0) {
    insights.push({
      type: "warning",
      message: `${overloaded} técnico${overloaded > 1 ? "s" : ""} con 4 o más órdenes asignadas simultáneamente`,
      icon: <AlertTriangle size={14} />,
    });
  }

  if (avgRes > 0 && avgRes > 48) {
    const days = Math.round(avgRes / 24);
    insights.push({
      type: "info",
      message: `Tiempo promedio de resolución: ${days} día${days > 1 ? "s" : ""}`,
      icon: <Clock size={14} />,
    });
  }

  if (insights.length === 0 && open.length === 0) {
    insights.push({ type: "success", message: "Todo al día — no hay órdenes pendientes", icon: <CheckCircle2 size={14} /> });
  } else if (insights.length === 0) {
    insights.push({ type: "info", message: `${open.length} orden${open.length !== 1 ? "es" : ""} activa${open.length !== 1 ? "s" : ""} sin alertas críticas`, icon: <Info size={14} /> });
  }

  return insights;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function InicioDashboard() {
  const router = useRouter();
  const [userName, setUserName]     = useState<string>("");
  const [loading, setLoading]       = useState(true);
  const [allOTs, setAllOTs]         = useState<OTDashboard[]>([]);
  const [partes, setPartes]         = useState<Parte[]>([]);
  const [actividad, setActividad]   = useState<ActividadItem[]>([]);
  const [weekCreated, setWeekCreated]   = useState(0);
  const [weekCompleted, setWeekCompleted] = useState(0);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const { data: perfil } = await sb
        .from("usuarios")
        .select("nombre, workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      if (perfil?.nombre) setUserName(perfil.nombre.split(" ")[0]);
      const workspaceId = perfil?.workspace_id;
      if (!workspaceId) { setLoading(false); return; }

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [ordenesRes, actividadRes, partesRes] = await Promise.all([
        sb.from("ordenes_trabajo")
          .select(`
            id, titulo, descripcion, estado, prioridad,
            created_at, updated_at, fecha_termino, asignados_ids, numero,
            iniciado_at, pausado_at, tiempo_total_segundos,
            ubicaciones(edificio)
          `)
          .eq("workspace_id", workspaceId)
          .neq("estado", "cancelado")
          .order("created_at", { ascending: false })
          .limit(400),

        sb.from("actividad_ot")
          .select("id, tipo, comentario, created_at, orden_id, orden:ordenes_trabajo!orden_id(titulo), usuario:usuarios!usuario_id(nombre)")
          .eq("ordenes_trabajo.workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(20),

        sb.from("partes")
          .select("id, nombre, stock_actual, stock_minimo")
          .eq("workspace_id", workspaceId)
          .not("stock_minimo", "is", null)
          .gt("stock_minimo", 0),
      ]);

      const ordenes = ordenesRes.data ?? [];

      // Week flow
      setWeekCreated(ordenes.filter(o => new Date(o.created_at) >= weekAgo).length);
      setWeekCompleted(ordenes.filter(o => o.estado === "completado" && o.updated_at && new Date(o.updated_at) >= weekAgo).length);

      const mapped: OTDashboard[] = ordenes.map((o: any) => ({
        ...o,
        ubicaciones: Array.isArray(o.ubicaciones) ? (o.ubicaciones[0] ?? null) : o.ubicaciones,
        nOT: parseDescMeta(o.descripcion).nOT,
        isBlocked: o.estado === "en_espera",
        blockedReason: null,
      }));

      setAllOTs(mapped);
      setPartes((partesRes.data ?? []) as Parte[]);

      const rawActividad = actividadRes.data ?? [];
      setActividad(rawActividad.map((a: any) => ({
        id:             a.id,
        tipo:           a.tipo,
        comentario:     a.comentario,
        created_at:     a.created_at,
        orden_id:       a.orden_id,
        orden_titulo:   a.orden?.titulo ?? null,
        usuario_nombre: a.usuario?.nombre ?? null,
      })));

      setLoading(false);
    }
    load();
  }, []);

  const openOTs    = useMemo(() => allOTs.filter(o => o.estado !== "completado"), [allOTs]);
  const topPriority = useMemo(() =>
    [...openOTs].sort((a, b) => getPriorityScore(b) - getPriorityScore(a)).slice(0, 5),
    [openOTs]
  );
  const { vencidas, paraHoy, sinAsignar, bloqueadas } = useMemo(
    () => groupImmediateActions(allOTs), [allOTs]
  );
  const blockAlerts  = useMemo(() => groupBlockAlerts(allOTs), [allOTs]);
  const insights     = useMemo(() => generateInsights(allOTs, partes), [allOTs, partes]);
  const bajoStock    = useMemo(() => partes.filter(p => p.stock_actual < p.stock_minimo), [partes]);
  const recent       = allOTs.slice(0, 15);

  // KPI computations
  const completadas       = useMemo(() => allOTs.filter(o => o.estado === "completado"), [allOTs]);
  const pctBloqueadas     = openOTs.length > 0 ? Math.round((bloqueadas.length / openOTs.length) * 100) : 0;
  const avgResHours       = useMemo(() => avgResolutionTime(completadas as any), [completadas]);
  const avgResDays        = avgResHours > 0 ? (avgResHours / 24).toFixed(1) : "—";

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#8594A3", fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 64px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.025em", margin: "0 0 4px", fontFamily: '"Inter", system-ui, sans-serif' }}>
          {greeting()}{userName ? `, ${userName}` : ""} 👋
        </h1>
        <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Main 2-col layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

        {/* ── Left column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 1. Prioridades de hoy */}
          <PrioridadesHoy ots={topPriority} onNavigate={id => router.push(`/ordenes/${id}`)} />

          {/* 2. Acción inmediata */}
          <AccionInmediata
            vencidas={vencidas}
            paraHoy={paraHoy}
            sinAsignar={sinAsignar}
            bloqueadas={bloqueadas}
            onNavigate={id => router.push(`/ordenes/${id}`)}
            onViewAll={() => router.push("/ordenes")}
          />

          {/* 3. Alertas de bloqueo */}
          {blockAlerts.length > 0 && (
            <BlockAlertsPanel groups={blockAlerts} onViewAll={() => router.push("/ordenes")} />
          )}

          {/* 4. Alertas de inventario */}
          {bajoStock.length > 0 && (
            <InventoryAlertsPanel
              bajoStock={bajoStock}
              onViewAll={() => router.push("/partes")}
            />
          )}

          {/* 7. Órdenes recientes */}
          <Section
            title="Órdenes recientes"
            action="Ver todas"
            onAction={() => router.push("/ordenes")}
          >
            {recent.length === 0 ? (
              <Empty label="Sin órdenes aún" />
            ) : (
              recent.map(o => (
                <EnhancedOTItem
                  key={o.id}
                  ot={o}
                  onClick={() => router.push(`/ordenes/${o.id}`)}
                />
              ))
            )}
            <button
              onClick={() => router.push("/ordenes/crear")}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 16px", background: "none", border: "none", borderTop: "1px solid #E2E8F0",
                cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#2563EB", fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#EFF6FF"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <Plus size={13} /> Nueva orden de trabajo
            </button>
          </Section>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 5. Salud operacional (mini KPIs) */}
          <KpiPanel
            backlog={openOTs.length}
            pctBloqueadas={pctBloqueadas}
            avgResDays={avgResDays}
            weekCreated={weekCreated}
            weekCompleted={weekCompleted}
          />

          {/* 6. Insights */}
          <InsightsPanel insights={insights} />

          {/* Activity feed */}
          <Section
            title="Actividad reciente"
            action="Ver órdenes"
            onAction={() => router.push("/ordenes")}
          >
            {actividad.length === 0 ? (
              <Empty label="Sin actividad reciente" />
            ) : (
              <div style={{ padding: "4px 0" }}>
                {actividad.slice(0, 8).map((a, i) => {
                  const cfg = ACTIVIDAD_CONFIG[a.tipo] ?? { icon: <RefreshCw size={11} />, label: a.tipo, color: "#6B7280" };
                  return (
                    <div
                      key={a.id}
                      onClick={() => router.push(`/ordenes/${a.orden_id}`)}
                      style={{
                        display: "flex", gap: 10, padding: "8px 14px",
                        borderBottom: i < Math.min(actividad.length, 8) - 1 ? "1px solid #F1F5F9" : "none",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                    >
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                        background: cfg.color + "15",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: cfg.color,
                      }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.4 }}>
                          {a.usuario_nombre && (
                            <span style={{ fontWeight: 600 }}>{a.usuario_nombre.split(" ")[0]} </span>
                          )}
                          <span style={{ color: cfg.color, fontWeight: 500 }}>{cfg.label}</span>
                          {a.orden_titulo && (
                            <> <span style={{ color: "#6B7280" }}>en</span>{" "}
                            <span style={{ fontWeight: 500 }}>
                              {a.orden_titulo.length > 28 ? a.orden_titulo.slice(0, 28) + "…" : a.orden_titulo}
                            </span></>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "#C4CDD6", marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// ── PrioridadesHoy ─────────────────────────────────────────────────────────────

function PrioridadesHoy({ ots, onNavigate }: { ots: OTDashboard[]; onNavigate: (id: string) => void }) {
  const criticalCount = ots.filter(o => getOverdueDays(o) > 0 || o.prioridad === "urgente").length;
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "14px 16px", borderBottom: "1px solid #E2E8F0",
        background: "linear-gradient(135deg, #fff 0%, #FFF7ED 100%)",
      }}>
        <Flame size={16} color="#EA580C" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Prioridades de hoy</span>
        {criticalCount > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", padding: "2px 8px", borderRadius: 20 }}>
            {criticalCount} crítica{criticalCount > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div>
        {ots.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
            <CheckCircle2 size={20} style={{ margin: "0 auto 6px", display: "block", color: "#22C55E" }} />
            Sin prioridades críticas hoy
          </div>
        ) : (
          ots.map((ot, i) => <PriorityItem key={ot.id} ot={ot} rank={i + 1} onClick={() => onNavigate(ot.id)} />)
        )}
      </div>
    </div>
  );
}

function PriorityItem({ ot, rank, onClick }: { ot: OTDashboard; rank: number; onClick: () => void }) {
  const overdueDays = getOverdueDays(ot);
  const isUrgent    = ot.prioridad === "urgente" || ot.prioridad === "alta";
  const isCritical  = overdueDays > 0 || isUrgent;
  const prStyle     = PRIORIDAD_STYLE[ot.prioridad];
  const titulo      = ot.titulo || ot.descripcion?.slice(0, 60) || "Sin título";
  const score       = getPriorityScore(ot);

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid #F1F5F9",
        borderLeft: overdueDays > 2 ? "3px solid #DC2626" : isCritical ? "3px solid #F97316" : "3px solid #E2E8F0",
        background: overdueDays > 0 ? "#FFFBFB" : "#fff",
        cursor: "pointer",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = overdueDays > 0 ? "#FEF2F2" : "#F8FAFC"; }}
      onMouseLeave={e => { e.currentTarget.style.background = overdueDays > 0 ? "#FFFBFB" : "#fff"; }}
    >
      {/* Rank */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        background: rank === 1 ? "#FEF2F2" : rank === 2 ? "#FFF7ED" : "#F1F5F9",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color: rank === 1 ? "#DC2626" : rank === 2 ? "#EA580C" : "#64748B",
      }}>
        {rank}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 5 }}>
          {titulo}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4, background: prStyle.bg, color: prStyle.color }}>
            {PRIORIDAD_LABEL[ot.prioridad]}
          </span>

          {ot.isBlocked ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: "#FFF7ED", color: "#C2410C", display: "flex", alignItems: "center", gap: 3 }}>
              <Lock size={9} /> En espera
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: ESTADO_STYLE[ot.estado].bg, color: ESTADO_STYLE[ot.estado].color }}>
              {ESTADO_LABEL[ot.estado]}
            </span>
          )}

          {ot.fecha_termino && (
            overdueDays > 0 ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={9} /> Vencida hace {overdueDays}d
              </span>
            ) : isDueToday(ot) ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={9} /> Vence hoy
              </span>
            ) : (
              <span style={{ fontSize: 10, color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
                <Calendar size={9} /> {new Date(ot.fecha_termino).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
              </span>
            )
          )}

          {(!ot.asignados_ids || ot.asignados_ids.length === 0) ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", display: "flex", alignItems: "center", gap: 3 }}>
              <User size={9} /> Sin asignar
            </span>
          ) : (
            <span style={{ fontSize: 10, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
              <User size={9} /> {ot.asignados_ids.length} asignado{ot.asignados_ids.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: score >= 20 ? "#DC2626" : score >= 10 ? "#D97706" : "#94A3B8" }}>
          ↑{score}
        </span>
        <ChevronRight size={14} color="#CBD5E1" />
      </div>
    </div>
  );
}

// ── AccionInmediata ────────────────────────────────────────────────────────────

function AccionInmediata({
  vencidas, paraHoy, sinAsignar, bloqueadas, onNavigate, onViewAll,
}: {
  vencidas: OTDashboard[];
  paraHoy: OTDashboard[];
  sinAsignar: OTDashboard[];
  bloqueadas: OTDashboard[];
  onNavigate: (id: string) => void;
  onViewAll: () => void;
}) {
  const hasAny = vencidas.length > 0 || paraHoy.length > 0 || sinAsignar.length > 0 || bloqueadas.length > 0;

  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid #E2E8F0" }}>
        <Zap size={16} color="#2563EB" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Acción inmediata</span>
        <button
          onClick={onViewAll}
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          Ver todas <ArrowRight size={12} />
        </button>
      </div>

      {!hasAny ? (
        <div style={{ padding: "24px 16px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
          <CheckCircle2 size={20} style={{ margin: "0 auto 6px", display: "block", color: "#22C55E" }} />
          No hay acciones urgentes pendientes
        </div>
      ) : (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <ActionGroup emoji="🔴" label="Órdenes vencidas"  color="#DC2626" bgColor="#FEF2F2" count={vencidas.length}   items={vencidas}   onNavigate={onNavigate} onViewAll={onViewAll} />
          <ActionGroup emoji="🟡" label="Vencen hoy"        color="#D97706" bgColor="#FFFBEB" count={paraHoy.length}   items={paraHoy}    onNavigate={onNavigate} onViewAll={onViewAll} />
          <ActionGroup emoji="⚫" label="Sin asignar"       color="#475569" bgColor="#F1F5F9" count={sinAsignar.length} items={sinAsignar} onNavigate={onNavigate} onViewAll={onViewAll} />
          <ActionGroup emoji="🟠" label="Bloqueadas"        color="#C2410C" bgColor="#FFF7ED" count={bloqueadas.length} items={bloqueadas} onNavigate={onNavigate} onViewAll={onViewAll} />
        </div>
      )}
    </div>
  );
}

function ActionGroup({
  emoji, label, color, bgColor, count, items, onNavigate, onViewAll,
}: {
  emoji: string; label: string; color: string; bgColor: string;
  count: number; items: OTDashboard[];
  onNavigate: (id: string) => void; onViewAll: () => void;
}) {
  if (count === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
        <span style={{ fontSize: 12 }}>{emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: bgColor, color }}>
          {count}
        </span>
        {count > 3 && (
          <button onClick={onViewAll} style={{ marginLeft: "auto", fontSize: 11, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            +{count - 3} más
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.slice(0, 3).map(ot => {
          const titulo = ot.titulo || ot.descripcion?.slice(0, 50) || "Sin título";
          const overdueDays = getOverdueDays(ot);
          const blockedHrs = getBlockedHours(ot);
          return (
            <div
              key={ot.id}
              onClick={() => onNavigate(ot.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 8,
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                cursor: "pointer",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = bgColor; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.background = "#F8FAFC"; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {titulo}
                </div>
                {overdueDays > 0 && (
                  <div style={{ fontSize: 10, color: "#DC2626", fontWeight: 600, marginTop: 1 }}>
                    Vencida hace {overdueDays} día{overdueDays > 1 ? "s" : ""}
                  </div>
                )}
                {ot.estado === "en_espera" && blockedHrs > 0 && (
                  <div style={{ fontSize: 10, color: "#C2410C", fontWeight: 600, marginTop: 1 }}>
                    Bloqueada hace {blockedHrs > 48 ? `${Math.round(blockedHrs / 24)}d` : `${Math.round(blockedHrs)}h`}
                  </div>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: PRIORIDAD_STYLE[ot.prioridad].bg, color: PRIORIDAD_STYLE[ot.prioridad].color, flexShrink: 0 }}>
                {PRIORIDAD_LABEL[ot.prioridad]}
              </span>
              <ChevronRight size={12} color="#CBD5E1" style={{ flexShrink: 0 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── BlockAlertsPanel ───────────────────────────────────────────────────────────

function BlockAlertsPanel({
  groups, onViewAll,
}: {
  groups: { reason: string; count: number; over24h: number }[];
  onViewAll: () => void;
}) {
  const totalOver24 = groups.reduce((s, g) => s + g.over24h, 0);

  return (
    <div style={{ background: "#fff", border: "1px solid #FED7AA", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "14px 16px", borderBottom: "1px solid #FED7AA",
        background: "linear-gradient(135deg, #fff 0%, #FFF7ED 100%)",
      }}>
        <ShieldAlert size={16} color="#EA580C" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Alertas de bloqueo</span>
        {totalOver24 > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", padding: "2px 8px", borderRadius: 20 }}>
            {totalOver24} +24h
          </span>
        )}
        <button onClick={onViewAll} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginLeft: totalOver24 > 0 ? 0 : "auto" }}>
          Ver <ArrowRight size={11} />
        </button>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map(g => {
          const label = BLOCKER_LABEL[g.reason] ?? g.reason;
          const hasLong = g.over24h > 0;
          return (
            <div key={g.reason} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 12px", borderRadius: 8,
              background: hasLong ? "#FFF7ED" : "#F8FAFC",
              border: `1px solid ${hasLong ? "#FED7AA" : "#E2E8F0"}`,
            }}>
              <Lock size={14} style={{ color: hasLong ? "#EA580C" : "#94A3B8", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>
                  {g.count} orden{g.count > 1 ? "es" : ""} bloqueada{g.count > 1 ? "s" : ""} — {label}
                </span>
                {g.over24h > 0 && (
                  <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 600, marginTop: 2 }}>
                    {g.over24h} lleva{g.over24h > 1 ? "n" : ""} más de 24 horas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── InventoryAlertsPanel ───────────────────────────────────────────────────────

function InventoryAlertsPanel({ bajoStock, onViewAll }: { bajoStock: Parte[]; onViewAll: () => void }) {
  const critical = bajoStock.filter(p => p.stock_actual === 0);
  const low      = bajoStock.filter(p => p.stock_actual > 0);

  return (
    <div style={{ background: "#fff", border: "1px solid #BFDBFE", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "14px 16px", borderBottom: "1px solid #BFDBFE",
        background: "linear-gradient(135deg, #fff 0%, #EFF6FF 100%)",
      }}>
        <PackageX size={16} color="#2563EB" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Alertas de inventario</span>
        {critical.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", padding: "2px 8px", borderRadius: 20 }}>
            {critical.length} sin stock
          </span>
        )}
        <button onClick={onViewAll} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginLeft: critical.length > 0 ? 0 : "auto" }}>
          Ver inventario <ArrowRight size={11} />
        </button>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {critical.length > 0 && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", marginBottom: 4 }}>Sin stock — {critical.length} ítem{critical.length > 1 ? "s" : ""}</div>
            {critical.slice(0, 3).map(p => (
              <div key={p.id} style={{ fontSize: 12, color: "#7F1D1D", display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                <span>{p.nombre}</span>
                <span style={{ fontWeight: 700 }}>0 / mín {p.stock_minimo}</span>
              </div>
            ))}
            {critical.length > 3 && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>+{critical.length - 3} más</div>}
          </div>
        )}

        {low.slice(0, 4).map(p => {
          const pct = p.stock_minimo > 0 ? Math.round((p.stock_actual / p.stock_minimo) * 100) : 100;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7, background: "#FFFBEB", border: "1px solid #FDE68A" }}>
              <Package size={13} style={{ color: "#D97706", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#D97706", flexShrink: 0 }}>
                {p.stock_actual} / mín {p.stock_minimo}
              </span>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: "#FDE68A", flexShrink: 0, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: pct < 50 ? "#EF4444" : "#F59E0B", borderRadius: 2 }} />
              </div>
            </div>
          );
        })}

        {bajoStock.length > 4 + critical.length && (
          <button onClick={onViewAll} style={{ fontSize: 11, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "4px 0" }}>
            +{bajoStock.length - 4 - critical.length} ítems más bajo stock mínimo →
          </button>
        )}
      </div>
    </div>
  );
}

// ── KpiPanel ───────────────────────────────────────────────────────────────────

function KpiPanel({ backlog, pctBloqueadas, avgResDays, weekCreated, weekCompleted }: {
  backlog: number;
  pctBloqueadas: number;
  avgResDays: string;
  weekCreated: number;
  weekCompleted: number;
}) {
  const flowDelta = weekCompleted - weekCreated;
  const flowPositive = flowDelta >= 0;

  const kpis = [
    {
      label: "Backlog",
      value: String(backlog),
      sub: "órdenes abiertas",
      icon: <ClipboardList size={14} />,
      color: backlog > 20 ? "#DC2626" : backlog > 10 ? "#D97706" : "#10B981",
      bg: backlog > 20 ? "#FEF2F2" : backlog > 10 ? "#FFFBEB" : "#F0FDF4",
    },
    {
      label: "Bloqueadas",
      value: `${pctBloqueadas}%`,
      sub: "del total activo",
      icon: <Lock size={14} />,
      color: pctBloqueadas > 20 ? "#DC2626" : pctBloqueadas > 10 ? "#D97706" : "#10B981",
      bg: pctBloqueadas > 20 ? "#FEF2F2" : pctBloqueadas > 10 ? "#FFFBEB" : "#F0FDF4",
    },
    {
      label: "Resolución",
      value: avgResDays === "—" ? "—" : `${avgResDays}d`,
      sub: "promedio",
      icon: <Timer size={14} />,
      color: "#475569",
      bg: "#F8FAFC",
    },
    {
      label: "Flujo semana",
      value: `${weekCreated}↑ ${weekCompleted}↓`,
      sub: flowPositive ? "al día" : `${Math.abs(flowDelta)} neto sin cerrar`,
      icon: flowPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />,
      color: flowPositive ? "#10B981" : "#D97706",
      bg: flowPositive ? "#F0FDF4" : "#FFFBEB",
    },
  ];

  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid #E2E8F0" }}>
        <Activity size={15} color="#475569" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Salud operacional</span>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", borderRadius: 8,
            background: k.bg, border: `1px solid ${k.color}22`,
          }}>
            <div style={{ color: k.color, flexShrink: 0 }}>{k.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>{k.label}</div>
              <div style={{ fontSize: 11, color: "#64748B" }}>{k.sub}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: k.color, fontFamily: '"Inter", system-ui, sans-serif', flexShrink: 0 }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── InsightsPanel ──────────────────────────────────────────────────────────────

const INSIGHT_STYLE: Record<Insight["type"], { bg: string; color: string; border: string }> = {
  danger:  { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5" },
  warning: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
  info:    { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  success: { bg: "#F0FDF4", color: "#15803D", border: "#86EFAC" },
};

function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", borderBottom: "1px solid #E2E8F0" }}>
        <Brain size={16} color="#7C3AED" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Insights automáticos</span>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 7 }}>
        {insights.map((insight, i) => {
          const s = INSIGHT_STYLE[insight.type];
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 9,
              padding: "8px 11px", borderRadius: 8,
              background: s.bg, border: `1px solid ${s.border}`,
            }}>
              <div style={{ color: s.color, marginTop: 1, flexShrink: 0 }}>{insight.icon}</div>
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, fontWeight: 500 }}>{insight.message}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EnhancedOTItem ─────────────────────────────────────────────────────────────

function EnhancedOTItem({ ot, onClick }: { ot: OTDashboard; onClick: () => void }) {
  const estado      = ESTADO_STYLE[ot.estado];
  const titulo      = ot.titulo || ot.descripcion?.slice(0, 60) || "Sin título";
  const overdueDays = getOverdueDays(ot);
  const dueToday    = isDueToday(ot);
  const slaLate     = overdueDays > 0;

  return (
    <div
      onClick={onClick}
      style={{
        padding: "10px 16px", borderBottom: "1px solid #F1F5F9",
        cursor: "pointer",
        borderLeft: ot.isBlocked ? "3px solid #F97316" : slaLate ? "3px solid #EF4444" : "3px solid transparent",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "#F8FAFC"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {ot.nOT && (
            <div style={{ fontSize: 10, fontWeight: 600, color: "#1E3A8A", fontFamily: "monospace", marginBottom: 1 }}>{ot.nOT}</div>
          )}
          <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {titulo}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4, alignItems: "center" }}>
            {ot.ubicaciones?.edificio && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94A3B8" }}>
                <MapPin size={9} />{ot.ubicaciones.edificio}
              </span>
            )}
            {ot.isBlocked ? (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#C2410C", display: "flex", alignItems: "center", gap: 3 }}>
                <Lock size={9} /> En espera
              </span>
            ) : null}
            {(!ot.asignados_ids || ot.asignados_ids.length === 0) ? (
              <span style={{ fontSize: 10, color: "#EF4444", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                <User size={9} /> Sin asignar
              </span>
            ) : (
              <span style={{ fontSize: 10, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
                <User size={9} /> {ot.asignados_ids.length} técnico{ot.asignados_ids.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            fontSize: 11, fontWeight: 600, padding: "2px 7px",
            background: estado.bg, color: estado.color, borderRadius: 6,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: estado.dot }} />
            {ESTADO_LABEL[ot.estado]}
          </span>

          {ot.fecha_termino && (
            slaLate ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={9} /> -{overdueDays}d
              </span>
            ) : dueToday ? (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", display: "flex", alignItems: "center", gap: 3 }}>
                <Clock size={9} /> Hoy
              </span>
            ) : (
              <span style={{ fontSize: 10, color: "#94A3B8", display: "flex", alignItems: "center", gap: 3 }}>
                <Calendar size={9} /> {new Date(ot.fecha_termino).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
              </span>
            )
          )}

          <span style={{ fontSize: 10, color: "#94A3B8" }}>{timeAgo(ot.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function Section({ title, action, onAction, children }: {
  title: string; action: string; onAction: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E2E8F0" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{title}</span>
        <button onClick={onAction} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          {action} <ArrowRight size={12} />
        </button>
      </div>
      <div>{children}</div>
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div style={{ padding: "28px 16px", textAlign: "center", color: "#C4CDD6", fontSize: 13 }}>
      {label}
    </div>
  );
}
