"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, MapPin,
  MessageSquare, UserCheck, Play, Pause, RefreshCw, Edit3, Trash2,
  CheckCheck, TriangleAlert, User, Calendar, TrendingUp,
  Info, XCircle, PackageX, Lock,
  Zap, Brain, ChevronRight, TrendingDown,
  Package, Timer, Activity,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Estado, Prioridad } from "@/types/ordenes";
import { parseDescMeta } from "@/lib/ordenes-api";
import { WelcomeToast } from "@/components/WelcomeToast";
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
  orden_titulo: string | null;
  usuario_nombre: string | null;
}

interface Insight {
  type: "danger" | "warning" | "info" | "success";
  message: string;
  icon: React.ReactNode;
  filtro?: string;
}

// ── Config ─────────────────────────────────────────────────────────────────────

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente:  "Sin asignar",
  en_espera:  "En espera",
  en_curso:   "En curso",
  completado: "Completada",
};

const ESTADO_DOT: Record<Estado, string> = {
  pendiente:  "var(--st-open-dot)",
  en_espera:  "var(--st-wait-dot)",
  en_curso:   "var(--st-progress-dot)",
  completado: "var(--st-done-dot)",
};

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  ninguna: "—", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
};

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  ninguna: "var(--fg-4)",
  baja:    "var(--fg-4)",
  media:   "var(--brand)",
  alta:    "var(--warning)",
  urgente: "var(--danger)",
};

const ACTIVIDAD_CONFIG: Record<string, { icon: React.ReactNode; label: string }> = {
  creado:             { icon: <Plus size={11} />,           label: "Creó" },
  editado:            { icon: <Edit3 size={11} />,          label: "Editó" },
  comentario:         { icon: <MessageSquare size={11} />,  label: "Comentó" },
  estado_cambiado:    { icon: <RefreshCw size={11} />,      label: "Cambió estado" },
  asignado:           { icon: <UserCheck size={11} />,      label: "Asignó" },
  completado:         { icon: <CheckCheck size={11} />,     label: "Completó" },
  iniciado:           { icon: <Play size={11} />,           label: "Inició" },
  pausado:            { icon: <Pause size={11} />,          label: "Pausó" },
  reanudado:          { icon: <Play size={11} />,           label: "Reanudó" },
  prioridad_cambiada: { icon: <TriangleAlert size={11} />,  label: "Cambió prioridad" },
  eliminado:          { icon: <Trash2 size={11} />,         label: "Eliminó" },
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
  const [userName, setUserName]         = useState<string>("");
  const [loading, setLoading]           = useState(true);
  const [allOTs, setAllOTs]             = useState<OTDashboard[]>([]);
  const [partes, setPartes]             = useState<Parte[]>([]);
  const [actividad, setActividad]       = useState<ActividadItem[]>([]);
  const [totalOTs, setTotalOTs] = useState(0);
  const [dateLabel] = useState(() => new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }));
  const [greetingText] = useState(() => greeting());

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

      const [ordenesRes, actividadRes, partesRes, totalRes] = await Promise.all([
        sb.from("ordenes_trabajo")
          .select(`id, titulo, descripcion, estado, prioridad, created_at, updated_at, fecha_termino, asignados_ids, numero, iniciado_at, pausado_at, tiempo_total_segundos, clasificacion, ubicaciones(edificio)`)
          .eq("workspace_id", workspaceId)
          .is("parent_id", null)
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
        sb.from("ordenes_trabajo")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .neq("estado", "cancelado"),
      ]);

      const ordenes = ordenesRes.data ?? [];
      setTotalOTs(totalRes.count ?? ordenes.length);

      const mapped: OTDashboard[] = ordenes.map((o: any) => ({
        ...o,
        ubicaciones: Array.isArray(o.ubicaciones) ? (o.ubicaciones[0] ?? null) : o.ubicaciones,
        nOT: parseDescMeta(o.descripcion).nOT,
        isBlocked: o.estado === "en_espera",
        blockedReason: null,
      }));

      setAllOTs(mapped);
      setPartes((partesRes.data ?? []) as Parte[]);
      setActividad((actividadRes.data ?? []).map((a: any) => ({
        id: a.id, tipo: a.tipo, comentario: a.comentario, created_at: a.created_at,
        orden_id: a.orden_id, orden_titulo: a.orden?.titulo ?? null, usuario_nombre: a.usuario?.nombre ?? null,
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
  const { vencidas, paraHoy, sinAsignar, bloqueadas } = useMemo(() => groupImmediateActions(allOTs), [allOTs]);
  const insights   = useMemo(() => generateInsights(allOTs, partes), [allOTs, partes]);
  const bajoStock  = useMemo(() => partes.filter(p => p.stock_actual < p.stock_minimo), [partes]);
  const completadas    = useMemo(() => allOTs.filter(o => o.estado === "completado"), [allOTs]);
  const enCurso        = useMemo(() => allOTs.filter(o => o.estado === "en_curso"), [allOTs]);
  const asignados      = useMemo(() => openOTs.filter(o => o.asignados_ids && o.asignados_ids.length > 0), [openOTs]);
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

  return (
    <div style={{ padding: "32px 40px 64px", minHeight: "100vh", background: "var(--surface-0)" }}>
      <WelcomeToast />

      {/* ── Header ── */}
      <div style={{ marginBottom: 32, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 6px", minHeight: 15 }}>
            {dateLabel}
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--fg-1)", letterSpacing: "-0.02em", margin: 0 }}>
            {greetingText}{greetingText && userName ? `, ${userName}` : ""}
          </h1>
        </div>
        <button
          onClick={() => router.push("/ordenes/crear")}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 8,
            background: "var(--brand)", color: "var(--fg-on-brand)",
            fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--brand-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--brand)"; }}
        >
          <Plus size={14} /> Nueva OT
        </button>
      </div>

      {/* ── KPI strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
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
          onClick={() => router.push("/ordenes")}
        />
      </div>

      {/* ── Status grid 2×2 ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard
            label="Asignadas"
            value={String(asignados.length)}
            sub="con técnico asignado"
            trend="neutral"
            onClick={() => router.push("/ordenes")}
          />
          <KpiCard
            label="Completadas"
            value={String(completadas.length)}
            sub="cerradas en total"
            trend="neutral"
            onClick={() => router.push("/ordenes?filtro=completadas_hoy")}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KpiCard
            label="Sin asignar"
            value={String(sinAsignar.length)}
            sub="sin técnico asignado"
            trend={sinAsignar.length > 5 ? "warn" : "neutral"}
            onClick={() => router.push("/ordenes?filtro=sin_asignar")}
          />
          <div
            onClick={() => router.push("/ordenes?filtro=levantamientos")}
            style={{
              background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10,
              padding: "18px 20px", cursor: "pointer", transition: "box-shadow 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
              Levantamientos
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--fg-2)", lineHeight: 1, letterSpacing: "-0.02em", marginBottom: 2 }}>
                  {levantamientosPendientes.length}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-4)" }}>pendientes</div>
              </div>
              <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)", lineHeight: 1, letterSpacing: "-0.02em", marginBottom: 2 }}>
                  {levantamientosCompletados.length}
                </div>
                <div style={{ fontSize: 12, color: "var(--fg-4)" }}>completados</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main 2-col grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

        {/* Left */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Priority list */}
          <Card title="Prioridades" action="Ver órdenes" onAction={() => router.push("/ordenes")}>
            {topPriority.length === 0 ? (
              <EmptyState label="Sin prioridades críticas" />
            ) : (
              topPriority.map((ot, i) => (
                <PriorityRow key={ot.id} ot={ot} rank={i + 1} onClick={() => router.push(`/ordenes?id=${ot.id}`)} />
              ))
            )}
          </Card>

          {/* Asignadas list */}
          {asignados.length > 0 && (
            <Card title="Asignadas" action="Ver todas" onAction={() => router.push("/ordenes")}>
              <div style={{ padding: "4px 0" }}>
                <ActionGroup label="Asignadas" count={asignados.length} items={asignados} dotColor="var(--success)" onNavigate={id => router.push(`/ordenes?id=${id}`)} onViewAll={() => router.push("/ordenes")} />
              </div>
            </Card>
          )}

          {/* Action groups */}
          {(vencidas.length > 0 || paraHoy.length > 0 || sinAsignar.length > 0 || bloqueadas.length > 0) && (
            <Card title="Requieren atención" action="Ver todas" onAction={() => router.push("/ordenes")}>
              <div style={{ padding: "4px 0" }}>
                <ActionGroup label="Vencidas"    count={vencidas.length}    items={vencidas}    dotColor="var(--danger)"  onNavigate={id => router.push(`/ordenes?id=${id}`)} onViewAll={() => router.push("/ordenes?filtro=vencidas")} />
                <ActionGroup label="Vencen hoy"  count={paraHoy.length}     items={paraHoy}     dotColor="var(--warning)" onNavigate={id => router.push(`/ordenes?id=${id}`)} onViewAll={() => router.push("/ordenes?filtro=vence_hoy")} />
                <ActionGroup label="Sin asignar" count={sinAsignar.length}   items={sinAsignar}  dotColor="var(--fg-4)"   onNavigate={id => router.push(`/ordenes?id=${id}`)} onViewAll={() => router.push("/ordenes?filtro=sin_asignar")} />
                <ActionGroup label="Bloqueadas"  count={bloqueadas.length}   items={bloqueadas}  dotColor="var(--warning)" onNavigate={id => router.push(`/ordenes?id=${id}`)} onViewAll={() => router.push("/ordenes?filtro=bloqueadas")} />
              </div>
            </Card>
          )}

          {/* Low stock */}
          {bajoStock.length > 0 && (
            <Card title="Inventario bajo mínimo" action="Ver inventario" onAction={() => router.push("/partes")}>
              <div style={{ padding: "4px 0" }}>
                {bajoStock.slice(0, 5).map((p, i) => {
                  const pct = p.stock_minimo > 0 ? Math.round((p.stock_actual / p.stock_minimo) * 100) : 100;
                  const isOut = p.stock_actual === 0;
                  return (
                    <div key={p.id} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 16px",
                      borderBottom: i < Math.min(bajoStock.length, 5) - 1 ? "1px solid var(--border)" : "none",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: isOut ? "var(--danger)" : "var(--warning)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <div style={{ width: 48, height: 3, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: isOut ? "var(--danger)" : "var(--warning)", borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 12, color: isOut ? "var(--danger)" : "var(--warning)", fontWeight: 600, minWidth: 32, textAlign: "right" }}>
                          {p.stock_actual}/{p.stock_minimo}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {bajoStock.length > 5 && (
                  <div style={{ padding: "8px 16px" }}>
                    <button
                      onClick={() => router.push("/partes")}
                      style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                    >
                      +{bajoStock.length - 5} más →
                    </button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Recent OTs */}
          <Card title="Órdenes recientes" action="Ver todas" onAction={() => router.push("/ordenes")}>
            {allOTs.slice(0, 12).length === 0 ? (
              <EmptyState label="Sin órdenes aún" />
            ) : (
              allOTs.slice(0, 12).map(o => (
                <OTRow key={o.id} ot={o} onClick={() => router.push(`/ordenes?id=${o.id}`)} />
              ))
            )}
          </Card>
        </div>

        {/* Right */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Insights */}
          <Card title="Alertas del sistema" action="" onAction={() => {}}>
            <div style={{ padding: "8px 0" }}>
              {insights.map((insight, i) => {
                const clickable = !!insight.filtro;
                const isLast = i === insights.length - 1;
                const dotColor = insight.type === "danger" ? "var(--danger)" : insight.type === "warning" ? "var(--warning)" : insight.type === "success" ? "var(--success)" : "var(--brand)";
                return (
                  <div
                    key={i}
                    onClick={clickable ? () => insight.filtro === "inventario" ? router.push("/partes") : router.push(`/ordenes?filtro=${insight.filtro}`) : undefined}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "10px 16px",
                      borderBottom: isLast ? "none" : "1px solid var(--border)",
                      cursor: clickable ? "pointer" : "default",
                    }}
                    onMouseEnter={e => { if (clickable) e.currentTarget.style.background = "var(--surface-hover)"; }}
                    onMouseLeave={e => { if (clickable) e.currentTarget.style.background = ""; }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, marginTop: 5 }} />
                    <span style={{ flex: 1, fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5, minWidth: 0 }}>{insight.message}</span>
                    {clickable && <ChevronRight size={13} style={{ color: "var(--fg-4)", flexShrink: 0, marginTop: 2 }} />}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Activity feed */}
          <Card title="Actividad reciente" action="Ver órdenes" onAction={() => router.push("/ordenes")}>
            {actividad.length === 0 ? (
              <EmptyState label="Sin actividad reciente" />
            ) : (
              <div style={{ padding: "4px 0" }}>
                {actividad.slice(0, 8).map((a, i) => {
                  const cfg = ACTIVIDAD_CONFIG[a.tipo] ?? { icon: <RefreshCw size={11} />, label: a.tipo };
                  return (
                    <div
                      key={a.id}
                      onClick={() => router.push(`/ordenes?id=${a.orden_id}`)}
                      style={{
                        display: "flex", gap: 10, padding: "9px 16px",
                        borderBottom: i < Math.min(actividad.length, 8) - 1 ? "1px solid var(--border)" : "none",
                        cursor: "pointer",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, marginTop: 1, background: "var(--surface-0)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--fg-2)" }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.45 }}>
                          {a.usuario_nombre && <span style={{ fontWeight: 600, color: "var(--fg-1)" }}>{a.usuario_nombre.split(" ")[0]} </span>}
                          <span>{cfg.label}</span>
                          {a.orden_titulo && (
                            <span style={{ color: "var(--fg-3)" }}>{" "}en <span style={{ fontWeight: 500, color: "var(--fg-2)" }}>{a.orden_titulo.length > 30 ? a.orden_titulo.slice(0, 30) + "…" : a.orden_titulo}</span></span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--fg-4)", marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── KpiCard ────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, trend, onClick }: {
  label: string; value: string; sub: string;
  trend: "good" | "warn" | "bad" | "neutral";
  onClick?: () => void;
}) {
  const trendColor = trend === "bad" ? "var(--danger)" : trend === "warn" ? "var(--warning)" : trend === "good" ? "var(--success)" : "var(--fg-2)";
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
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: trendColor, lineHeight: 1, fontFamily: '"Inter", system-ui, sans-serif', letterSpacing: "-0.02em", marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--fg-4)" }}>{sub}</div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────────

function Card({ title, action, onAction, children }: { title: string; action: string; onAction: () => void; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-1)" }}>{title}</span>
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

// ── PriorityRow ────────────────────────────────────────────────────────────────

function PriorityRow({ ot, rank, onClick }: { ot: OTDashboard; rank: number; onClick: () => void }) {
  const overdueDays = getOverdueDays(ot);
  const titulo      = ot.titulo || ot.descripcion?.slice(0, 60) || "Sin título";

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "11px 16px",
        borderBottom: "1px solid var(--border)",
        cursor: "pointer",
        borderLeft: overdueDays > 0 ? "2px solid var(--danger)" : ot.prioridad === "urgente" ? "2px solid var(--warning)" : "2px solid transparent",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-4)", width: 16, flexShrink: 0, textAlign: "right" }}>{rank}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {titulo}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 3, alignItems: "center" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--fg-3)" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: ESTADO_DOT[ot.estado], display: "inline-block" }} />
            {ESTADO_LABEL[ot.estado]}
          </span>
          {overdueDays > 0 && (
            <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>Vencida hace {overdueDays}d</span>
          )}
          {!overdueDays && isDueToday(ot) && (
            <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>Vence hoy</span>
          )}
          {(!ot.asignados_ids || ot.asignados_ids.length === 0) && (
            <span style={{ fontSize: 11, color: "var(--danger)" }}>Sin asignar</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: PRIORIDAD_COLOR[ot.prioridad] }}>
          {PRIORIDAD_LABEL[ot.prioridad]}
        </span>
        <ChevronRight size={13} color="var(--fg-4)" />
      </div>
    </div>
  );
}

// ── ActionGroup ────────────────────────────────────────────────────────────────

function ActionGroup({ label, count, dotColor, items, onNavigate, onViewAll }: {
  label: string; count: number; dotColor: string;
  items: OTDashboard[]; onNavigate: (id: string) => void; onViewAll: () => void;
}) {
  if (count === 0) return null;
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div
        onClick={onViewAll}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", cursor: "pointer" }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = ""; }}
      >
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--fg-2)" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg-3)" }}>{count}</span>
        <ChevronRight size={12} color="var(--fg-4)" />
      </div>
      {items.slice(0, 2).map(ot => {
        const titulo = ot.titulo || ot.descripcion?.slice(0, 50) || "Sin título";
        const overdueDays = getOverdueDays(ot);
        return (
          <div
            key={ot.id}
            onClick={() => onNavigate(ot.id)}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 16px 7px 30px", cursor: "pointer" }}
            onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = ""; }}
          >
            <span style={{ flex: 1, fontSize: 12, color: "var(--fg-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</span>
            {overdueDays > 0 && <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600, flexShrink: 0 }}>-{overdueDays}d</span>}
            <ChevronRight size={11} color="var(--border)" style={{ flexShrink: 0 }} />
          </div>
        );
      })}
      {count > 2 && (
        <div style={{ padding: "6px 16px 10px 30px" }}>
          <button onClick={onViewAll} style={{ fontSize: 11, color: "var(--brand)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
            +{count - 2} más →
          </button>
        </div>
      )}
    </div>
  );
}

// ── OTRow ──────────────────────────────────────────────────────────────────────

function OTRow({ ot, onClick }: { ot: OTDashboard; onClick: () => void }) {
  const titulo      = ot.titulo || ot.descripcion?.slice(0, 60) || "Sin título";
  const overdueDays = getOverdueDays(ot);
  const dueToday    = isDueToday(ot);

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px", borderBottom: "1px solid var(--border)",
        cursor: "pointer",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: ESTADO_DOT[ot.estado], flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 2, alignItems: "center" }}>
          {ot.ubicaciones?.edificio && (
            <span style={{ fontSize: 11, color: "var(--fg-4)", display: "flex", alignItems: "center", gap: 2 }}>
              <MapPin size={9} />{ot.ubicaciones.edificio}
            </span>
          )}
          <span style={{ fontSize: 11, color: "var(--fg-4)" }}>{ESTADO_LABEL[ot.estado]}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: PRIORIDAD_COLOR[ot.prioridad] }}>
          {ot.prioridad !== "ninguna" ? PRIORIDAD_LABEL[ot.prioridad] : ""}
        </span>
        {overdueDays > 0 ? (
          <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>-{overdueDays}d</span>
        ) : dueToday ? (
          <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>Hoy</span>
        ) : ot.fecha_termino ? (
          <span style={{ fontSize: 11, color: "var(--fg-4)" }}>{new Date(ot.fecha_termino).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}</span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--fg-4)" }}>{timeAgo(ot.created_at)}</span>
        )}
      </div>
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--fg-4)", fontSize: 13 }}>{label}</div>
  );
}
