"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList, Clock, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, MapPin, Wrench, MessageSquare,
  UserCheck, Play, Pause, RefreshCw, Edit3, Trash2,
  CheckCheck, TriangleAlert, User, Calendar, TrendingUp,
  Info, XCircle, PackageX, PhoneOff, Lock,
  Flame, Zap, Brain, ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Estado, Prioridad } from "@/types/ordenes";
import { parseDescMeta } from "@/lib/ordenes-api";
import {
  getOverdueDays as otGetOverdueDays,
  isOverdue, isUnassigned,
  aggregateTimeDistribution,
} from "@/lib/ot-metrics";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OTDashboard {
  id: string;
  titulo: string | null;
  descripcion: string;
  estado: Estado;
  prioridad: Prioridad;
  created_at: string;
  fecha_termino: string | null;
  asignados_ids: string[] | null;
  ubicaciones?: { edificio: string } | null;
  nOT?: string | null;
  numero?: number | null;
  // Frontend-only blocker fields (derived from en_espera + description hints)
  isBlocked?: boolean;
  blockedReason?: "materiales" | "cliente" | "acceso" | null;
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

// ── Config ────────────────────────────────────────────────────────────────────

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
};

const ACTIVIDAD_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  creado:             { icon: <Plus size={11} />,           label: "Creó",              color: "#1E3A8A" },
  editado:            { icon: <Edit3 size={11} />,          label: "Editó",             color: "#6B7280" },
  comentario:         { icon: <MessageSquare size={11} />,  label: "Comentó",           color: "#0369A1" },
  estado_cambiado:    { icon: <RefreshCw size={11} />,      label: "Cambió estado",     color: "#7C3AED" },
  asignado:           { icon: <UserCheck size={11} />,      label: "Asignó",            color: "#059669" },
  completado:         { icon: <CheckCheck size={11} />,     label: "Completó",          color: "#166534" },
  iniciado:           { icon: <Play size={11} />,           label: "Inició",            color: "#15803D" },
  pausado:            { icon: <Pause size={11} />,          label: "Pausó",             color: "#C2410C" },
  reanudado:          { icon: <Play size={11} />,           label: "Reanudó",           color: "#15803D" },
  prioridad_cambiada: { icon: <TriangleAlert size={11} />,  label: "Cambió prioridad",  color: "#D97706" },
  eliminado:          { icon: <Trash2 size={11} />,         label: "Eliminó",           color: "#DC2626" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Delegate to shared lib; keep local name for backward compat within this file
function getOverdueDays(ot: OTDashboard): number {
  return otGetOverdueDays(ot);
}

function isDueToday(ot: OTDashboard): boolean {
  if (!ot.fecha_termino) return false;
  const today = new Date().toISOString().slice(0, 10);
  return ot.fecha_termino.slice(0, 10) === today;
}

function getPriorityScore(ot: OTDashboard): number {
  const urgencyWeight = ot.prioridad === "urgente" ? 10
    : ot.prioridad === "alta" ? 8
    : ot.prioridad === "media" ? 5
    : ot.prioridad === "baja" ? 2
    : 1;
  const overduePenalty = getOverdueDays(ot) * 5;
  const unassignedPenalty = isUnassigned(ot) ? 10 : 0;
  const blockedPenalty = ot.estado === "en_espera" ? 8 : 0;
  return urgencyWeight + overduePenalty + unassignedPenalty + blockedPenalty;
}

function groupImmediateActions(ots: OTDashboard[]) {
  const open = ots.filter(o => o.estado !== "completado");
  const today = new Date().toISOString().slice(0, 10);

  const vencidas = open.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) < today);
  const paraHoy  = open.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) === today);
  const sinAsignar = open.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);

  return { vencidas, paraHoy, sinAsignar };
}

function generateInsights(ots: OTDashboard[]): Insight[] {
  const open = ots.filter(o => o.estado !== "completado");
  const today = new Date().toISOString().slice(0, 10);

  const vencidas = open.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) < today);
  const sinAsignar = open.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
  const bloqueadas = open.filter(o => o.estado === "en_espera");
  const urgentes   = open.filter(o => o.prioridad === "urgente" || o.prioridad === "alta");
  const completadas = ots.filter(o => o.estado === "completado");

  const insights: Insight[] = [];

  if (vencidas.length > 0) {
    insights.push({
      type: "danger",
      message: `${vencidas.length} orden${vencidas.length > 1 ? "es" : ""} vencida${vencidas.length > 1 ? "s" : ""} sin cerrar`,
      icon: <XCircle size={14} />,
    });
  }

  if (sinAsignar.length > 0) {
    insights.push({
      type: "warning",
      message: `${sinAsignar.length} orden${sinAsignar.length > 1 ? "es" : ""} sin técnico asignado`,
      icon: <User size={14} />,
    });
  }

  if (bloqueadas.length > 0) {
    insights.push({
      type: "warning",
      message: `${bloqueadas.length} orden${bloqueadas.length > 1 ? "es" : ""} en espera (bloqueadas)`,
      icon: <Clock size={14} />,
    });
  }

  if (urgentes.length > 0) {
    insights.push({
      type: "danger",
      message: `${urgentes.length} orden${urgentes.length > 1 ? "es" : ""} de alta prioridad activas`,
      icon: <Zap size={14} />,
    });
  }

  if (open.length > completadas.length * 1.5 && completadas.length > 0) {
    insights.push({
      type: "warning",
      message: "El backlog está creciendo: más órdenes abiertas que completadas",
      icon: <TrendingUp size={14} />,
    });
  }

  if (insights.length === 0 && open.length === 0) {
    insights.push({
      type: "success",
      message: "Todo al día. No hay órdenes pendientes.",
      icon: <CheckCircle2 size={14} />,
    });
  } else if (insights.length === 0) {
    insights.push({
      type: "info",
      message: `${open.length} orden${open.length !== 1 ? "es" : ""} activa${open.length !== 1 ? "s" : ""}, sin alertas críticas`,
      icon: <Info size={14} />,
    });
  }

  return insights;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InicioDashboard() {
  const router = useRouter();
  const [userName, setUserName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({ abiertas: 0, en_curso: 0, urgentes: 0, completadas_hoy: 0 });
  const [allOTs, setAllOTs] = useState<OTDashboard[]>([]);
  const [actividad, setActividad] = useState<ActividadItem[]>([]);

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

      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

      const [ordenesRes, actividadRes] = await Promise.all([
        sb.from("ordenes_trabajo")
          .select("id, titulo, descripcion, estado, prioridad, created_at, fecha_termino, asignados_ids, numero, ubicaciones(edificio)")
          .eq("workspace_id", workspaceId)
          .neq("estado", "cancelado")
          .order("created_at", { ascending: false })
          .limit(400),
        sb.from("actividad_ot")
          .select("id, tipo, comentario, created_at, orden_id, orden:ordenes_trabajo!orden_id(titulo), usuario:usuarios!usuario_id(nombre)")
          .eq("ordenes_trabajo.workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const ordenes = ordenesRes.data ?? [];

      const abiertas        = ordenes.filter(o => o.estado === "pendiente" || o.estado === "en_espera").length;
      const en_curso        = ordenes.filter(o => o.estado === "en_curso").length;
      const urgentes        = ordenes.filter(o => o.prioridad === "urgente" && o.estado !== "completado").length;
      const completadas_hoy = ordenes.filter(o =>
        o.estado === "completado" && o.created_at >= todayStart.toISOString()
      ).length;

      setStats({ abiertas, en_curso, urgentes, completadas_hoy });

      const mapped: OTDashboard[] = ordenes.map((o: any) => ({
        ...o,
        ubicaciones: Array.isArray(o.ubicaciones) ? (o.ubicaciones[0] ?? null) : o.ubicaciones,
        nOT: parseDescMeta(o.descripcion).nOT,
        // Derive blocker from en_espera status
        isBlocked: o.estado === "en_espera",
        blockedReason: null,
      }));

      setAllOTs(mapped);

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

  const statCards = [
    { label: "Abiertas",        value: stats.abiertas,        icon: <ClipboardList size={18} />, color: "#1D4ED8", bg: "#EFF6FF" },
    { label: "En curso",        value: stats.en_curso,        icon: <Wrench size={18} />,        color: "#15803D", bg: "#F0FDF4" },
    { label: "Urgentes",        value: stats.urgentes,        icon: <AlertTriangle size={18} />, color: "#DC2626", bg: "#FEF2F2" },
    { label: "Completadas hoy", value: stats.completadas_hoy, icon: <CheckCircle2 size={18} />,  color: "#166534", bg: "#DCFCE7" },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#8594A3", fontSize: 13 }}>
        Cargando…
      </div>
    );
  }

  const openOTs     = allOTs.filter(o => o.estado !== "completado");
  const topPriority = [...openOTs].sort((a, b) => getPriorityScore(b) - getPriorityScore(a)).slice(0, 5);
  const { vencidas, paraHoy, sinAsignar } = groupImmediateActions(allOTs);
  const insights = generateInsights(allOTs);
  const recent   = allOTs.slice(0, 15);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 32px 64px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.025em", margin: "0 0 4px", fontFamily: '"Inter", system-ui, sans-serif' }}>
          {greeting()}{userName ? `, ${userName}` : ""} 👋
        </h1>
        <p style={{ fontSize: 13, color: "#94A3B8", margin: 0 }}>
          {new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {statCards.map(s => (
          <div
            key={s.label}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "14px 16px", background: "#fff",
              border: "1px solid #E2E8F0", borderRadius: 10,
              boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
            }}
          >
            <div style={{ width: 36, height: 36, borderRadius: 8, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", lineHeight: 1, fontFamily: '"Inter", system-ui, sans-serif' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 3, fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 1. Prioridades de hoy */}
          <PrioridadesHoy ots={topPriority} onNavigate={id => router.push(`/ordenes/${id}`)} />

          {/* 2. Acción inmediata */}
          <AccionInmediata
            vencidas={vencidas}
            paraHoy={paraHoy}
            sinAsignar={sinAsignar}
            onNavigate={id => router.push(`/ordenes/${id}`)}
            onViewAll={() => router.push("/ordenes")}
          />

          {/* 4. Órdenes recientes (enhanced) */}
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
                transition: "background 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#EFF6FF"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
            >
              <Plus size={13} /> Nueva orden de trabajo
            </button>
          </Section>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 3. Insights */}
          <InsightsPanel insights={insights} />

          {/* Activity feed (minimized) */}
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
                        cursor: "pointer", transition: "background 0.1s",
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

// ── PrioridadesHoy ────────────────────────────────────────────────────────────

function PrioridadesHoy({ ots, onNavigate }: { ots: OTDashboard[]; onNavigate: (id: string) => void }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "14px 16px", borderBottom: "1px solid #E2E8F0",
        background: "linear-gradient(135deg, #fff 0%, #FFF7ED 100%)",
      }}>
        <Flame size={16} color="#EA580C" />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Prioridades de hoy</span>
        {ots.length > 0 && (
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, background: "#FEF2F2", color: "#DC2626", padding: "2px 8px", borderRadius: 20 }}>
            {ots.length} urgente{ots.length > 1 ? "s" : ""}
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

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid #F1F5F9",
        borderLeft: isCritical ? "3px solid #EF4444" : "3px solid transparent",
        background: overdueDays > 0 ? "#FFFBFB" : "#fff",
        cursor: "pointer", transition: "background 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = overdueDays > 0 ? "#FEF2F2" : "#F8FAFC"; }}
      onMouseLeave={e => { e.currentTarget.style.background = overdueDays > 0 ? "#FFFBFB" : "#fff"; }}
    >
      {/* Rank */}
      <div style={{
        width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        background: rank === 1 ? "#FEF2F2" : "#F1F5F9",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700, color: rank === 1 ? "#DC2626" : "#64748B",
      }}>
        {rank}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
          {titulo}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {/* Priority badge */}
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 4,
            background: prStyle.bg, color: prStyle.color,
          }}>
            {PRIORIDAD_LABEL[ot.prioridad]}
          </span>

          {/* Status */}
          {ot.isBlocked ? (
            <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4, background: "#FFF7ED", color: "#C2410C", display: "flex", alignItems: "center", gap: 3 }}>
              <Lock size={9} /> Bloqueada
            </span>
          ) : (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 4,
              background: ESTADO_STYLE[ot.estado].bg, color: ESTADO_STYLE[ot.estado].color,
            }}>
              {ESTADO_LABEL[ot.estado]}
            </span>
          )}

          {/* Due date */}
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

          {/* Assignee */}
          {(!ot.asignados_ids || ot.asignados_ids.length === 0) ? (
            <span style={{ fontSize: 10, fontWeight: 600, color: "#EF4444", display: "flex", alignItems: "center", gap: 3 }}>
              <User size={9} /> Sin asignar
            </span>
          ) : (
            <span style={{ fontSize: 10, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
              <User size={9} /> {ot.asignados_ids.length} asignado{ot.asignados_ids.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <ChevronRight size={14} color="#CBD5E1" style={{ flexShrink: 0, marginTop: 3 }} />
    </div>
  );
}

// ── AccionInmediata ───────────────────────────────────────────────────────────

function AccionInmediata({
  vencidas, paraHoy, sinAsignar, onNavigate, onViewAll,
}: {
  vencidas: OTDashboard[];
  paraHoy: OTDashboard[];
  sinAsignar: OTDashboard[];
  onNavigate: (id: string) => void;
  onViewAll: () => void;
}) {
  const hasAny = vencidas.length > 0 || paraHoy.length > 0 || sinAsignar.length > 0;

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
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <ActionGroup
            emoji="🔴"
            label="Órdenes vencidas"
            color="#DC2626"
            bgColor="#FEF2F2"
            count={vencidas.length}
            items={vencidas}
            onNavigate={onNavigate}
            onViewAll={onViewAll}
          />
          <ActionGroup
            emoji="🟡"
            label="Vencen hoy"
            color="#D97706"
            bgColor="#FFFBEB"
            count={paraHoy.length}
            items={paraHoy}
            onNavigate={onNavigate}
            onViewAll={onViewAll}
          />
          <ActionGroup
            emoji="⚪"
            label="Sin asignar"
            color="#475569"
            bgColor="#F1F5F9"
            count={sinAsignar.length}
            items={sinAsignar}
            onNavigate={onNavigate}
            onViewAll={onViewAll}
          />
        </div>
      )}
    </div>
  );
}

function ActionGroup({
  emoji, label, color, bgColor, count, items, onNavigate, onViewAll,
}: {
  emoji: string;
  label: string;
  color: string;
  bgColor: string;
  count: number;
  items: OTDashboard[];
  onNavigate: (id: string) => void;
  onViewAll: () => void;
}) {
  if (count === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12 }}>{emoji}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 20,
          background: bgColor, color,
        }}>
          {count}
        </span>
        {count > 3 && (
          <button
            onClick={onViewAll}
            style={{ marginLeft: "auto", fontSize: 11, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
          >
            +{count - 3} más
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.slice(0, 3).map(ot => {
          const titulo = ot.titulo || ot.descripcion?.slice(0, 50) || "Sin título";
          const overdueDays = getOverdueDays(ot);
          return (
            <div
              key={ot.id}
              onClick={() => onNavigate(ot.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 10px", borderRadius: 8,
                background: "#F8FAFC", border: "1px solid #E2E8F0",
                cursor: "pointer", transition: "border-color 0.1s, background 0.1s",
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
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
                background: PRIORIDAD_STYLE[ot.prioridad].bg, color: PRIORIDAD_STYLE[ot.prioridad].color, flexShrink: 0,
              }}>
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

// ── InsightsPanel ─────────────────────────────────────────────────────────────

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
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Insights</span>
      </div>
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.map((insight, i) => {
          const style = INSIGHT_STYLE[insight.type];
          return (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "9px 12px", borderRadius: 8,
                background: style.bg, border: `1px solid ${style.border}`,
              }}
            >
              <div style={{ color: style.color, marginTop: 1, flexShrink: 0 }}>
                {insight.icon}
              </div>
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, fontWeight: 500 }}>
                {insight.message}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Enhanced OTItem ───────────────────────────────────────────────────────────

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
        cursor: "pointer", transition: "background 0.1s",
        borderLeft: ot.isBlocked ? "3px solid #F97316" : "3px solid transparent",
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

          {/* Metadata row */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4, alignItems: "center" }}>
            {ot.ubicaciones?.edificio && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "#94A3B8" }}>
                <MapPin size={9} />{ot.ubicaciones.edificio}
              </span>
            )}
            {ot.isBlocked && ot.blockedReason && (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#C2410C", display: "flex", alignItems: "center", gap: 3 }}>
                <Lock size={9} /> {BLOCKER_LABEL[ot.blockedReason]}
              </span>
            )}
            {ot.isBlocked && !ot.blockedReason && (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#C2410C", display: "flex", alignItems: "center", gap: 3 }}>
                <Lock size={9} /> En espera
              </span>
            )}
            {/* Technician */}
            {!ot.asignados_ids || ot.asignados_ids.length === 0 ? (
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

          {/* SLA indicator */}
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

// ── Shared sub-components ─────────────────────────────────────────────────────

function Section({ title, titleColor, action, onAction, children }: {
  title: string;
  titleColor?: string;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #E2E8F0" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: titleColor ?? "#0F172A" }}>{title}</span>
        <button
          onClick={onAction}
          style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#2563EB", fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
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
