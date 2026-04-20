"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from "recharts";
import {
  AlertTriangle, TrendingUp, Clock,
  Wrench, Users, DollarSign, Activity,
  ArrowUpRight, ArrowDownRight, Minus, BarChart2,
  Zap, ShieldAlert, CheckCircle2, XCircle,
  Brain, Target, RotateCcw, Timer, GitBranch,
  Lock, Package, PhoneOff, DoorClosed,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Estado, Prioridad, TipoTrabajo } from "@/types/ordenes";
import {
  getResponseTime, getResolutionTime, getWorkingTime, getBlockedDuration,
  avgResponseTime, avgResolutionTime, aggregateTimeDistribution, calcFTFR,
  isOverdue, getOverdueDays as otGetOverdueDays,
} from "@/lib/ot-metrics";

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  brand: "#1E3A8A", mid: "#2563EB", light: "#EFF6FF",
  success: "#10B981", successBg: "#ECFDF5",
  warning: "#F59E0B", warningBg: "#FFFBEB",
  danger: "#EF4444",  dangerBg: "#FEF2F2",
  info: "#3B82F6",    infoBg: "#EFF6FF",
  purple: "#7C3AED",  purpleBg: "#F5F3FF",
  text1: "#0F172A", text2: "#475569", text3: "#94A3B8",
  border: "#E2E8F0", bg: "#F8FAFC", surface: "#FFFFFF",
};

// ── DB row shapes ─────────────────────────────────────────────────────────────
interface OTRow {
  id: string;
  titulo: string | null;
  estado: Estado;
  prioridad: Prioridad;
  tipo_trabajo: TipoTrabajo | null;
  created_at: string;
  fecha_termino: string | null;
  iniciado_at: string | null;
  updated_at: string | null;
  asignados_ids: string[] | null;
  activo_id: string | null;
  ubicacion_id: string | null;
  activos: { id: string; nombre: string } | null;
  ubicaciones: { id: string; edificio: string } | null;
}

interface UsuarioRow {
  id: string;
  nombre: string;
  rol: string;
  oficio: string | null;
  activo: boolean;
}

interface ActiveRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  ubicacion_id: string | null;
  ubicaciones: { edificio: string } | null;
}

interface MaterialUsadoRow {
  id: string;
  orden_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number | null;
  material_id: string | null;
  materiales: { precio_unitario: number | null } | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hoursFromDates(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 36e5;
}
function daysSince(d: string) {
  return Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
}
function monthKey(d: string) { return d.slice(0, 7); }
function unitPrice(m: MaterialUsadoRow): number {
  return m.precio_unitario ?? m.materiales?.precio_unitario ?? 0;
}

// ── Analytics helpers (local, non-metric) ────────────────────────────────────

function calculateFlow(ots: OTRow[], rangeMonths: number): Array<{ label: string; created: number; completed: number }> {
  const days: Array<{ label: string; created: number; completed: number }> = [];
  const now = new Date();
  const useWeeks = rangeMonths > 2;
  const buckets = useWeeks ? rangeMonths * 4 : rangeMonths * 30;
  const bucketSize = useWeeks ? 7 : 1;

  for (let i = buckets - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(start.getDate() - i * bucketSize);
    const end = new Date(start);
    end.setDate(end.getDate() + bucketSize);
    const startStr = start.toISOString().slice(0, 10);
    const endStr   = end.toISOString().slice(0, 10);
    days.push({
      label:     start.toLocaleDateString("es-CL", { day: "numeric", month: "short" }),
      created:   ots.filter(o => o.created_at.slice(0, 10) >= startStr && o.created_at.slice(0, 10) < endStr).length,
      completed: ots.filter(o => o.estado === "completado" && o.updated_at && o.updated_at.slice(0, 10) >= startStr && o.updated_at.slice(0, 10) < endStr).length,
    });
  }
  if (days.length > 20) {
    const step = Math.ceil(days.length / 20);
    return days.filter((_, i) => i % step === 0 || i === days.length - 1);
  }
  return days;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = C.mid, trend }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string; trend?: "up" | "down" | "neutral";
}) {
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor = trend === "up" ? C.danger : trend === "down" ? C.success : C.text3;
  return (
    <Card style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text1, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon size={20} color={color} />
          </div>
          {trend && <TrendIcon size={16} color={trendColor} />}
        </div>
      </div>
    </Card>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    urgente: { bg: C.dangerBg,  color: C.danger,  label: "Urgente" },
    alta:    { bg: C.warningBg, color: C.warning, label: "Alta" },
    media:   { bg: C.infoBg,    color: C.info,    label: "Media" },
    baja:    { bg: "#F8FAFC",   color: C.text3,   label: "Baja" },
    ninguna: { bg: "#F8FAFC",   color: C.text3,   label: "—" },
  };
  const s = map[p] ?? map.ninguna;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: s.bg, color: s.color }}>{s.label}</span>;
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Icon size={15} color={C.mid} />
      <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: "10px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? C.text1 }}>{value}</div>
    </div>
  );
}

function InsightBadge({ level }: { level: "critical" | "warning" | "info" }) {
  const map = {
    critical: { Icon: ShieldAlert,  color: C.danger,  bg: C.dangerBg },
    warning:  { Icon: AlertTriangle, color: C.warning, bg: C.warningBg },
    info:     { Icon: Activity,      color: C.info,    bg: C.infoBg },
  };
  const { Icon, color, bg } = map[level];
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <Icon size={16} color={color} />
    </div>
  );
}

function ClipboardIcon({ size, color }: { size: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
    </svg>
  );
}

// ── NEW: Time Distribution Section ────────────────────────────────────────────
function TimeDistributionSection({ ots }: { ots: OTRow[] }) {
  const times = useMemo(() => {
    const t = aggregateTimeDistribution(ots);
    return { working: t.workingHours, waiting: t.waitingHours, total: t.totalHours };
  }, [ots]);
  const workPct    = times.total > 0 ? Math.round((times.working / times.total) * 100) : 0;
  const waitPct    = times.total > 0 ? Math.round((times.waiting / times.total) * 100) : 0;

  const pieData = [
    { name: "Tiempo activo",  value: Math.round(times.working), color: C.success },
    { name: "En espera",      value: Math.round(times.waiting), color: C.warning },
  ].filter(d => d.value > 0);

  const hasData = times.total > 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Card>
        <CardHeader title="Distribución del tiempo" subtitle="Tiempo activo vs tiempo en espera (estimado)" />
        <div style={{ padding: "16px 20px" }}>
          {!hasData ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: C.text3, fontSize: 13 }}>
              Sin datos de tiempo suficientes (requiere iniciado_at)
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 20, justifyContent: "center", marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={v => [`${Number(v).toFixed(1)}h`, ""]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.successBg, border: `1px solid ${C.success}30` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.success, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Tiempo activo</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.text1 }}>{workPct}%</div>
                  <div style={{ fontSize: 11, color: C.text2 }}>{times.working.toFixed(1)}h</div>
                </div>
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.warningBg, border: `1px solid ${C.warning}30` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.warning, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>En espera</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.text1 }}>{waitPct}%</div>
                  <div style={{ fontSize: 11, color: C.text2 }}>{times.waiting.toFixed(1)}h</div>
                </div>
              </div>
              {waitPct > 40 && (
                <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: C.warningBg, border: `1px solid ${C.warning}40`, fontSize: 12, color: C.text1 }}>
                  ⚠️ <strong>{waitPct}% del tiempo se pierde esperando.</strong> Identificar causas de bloqueo puede reducir el tiempo de ciclo.
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Tiempos de respuesta vs resolución" subtitle="Desde creación hasta inicio / cierre" />
        <div style={{ padding: "16px 20px" }}>
          <ResponseResolutionChart ots={ots} />
        </div>
      </Card>
    </div>
  );
}

function ResponseResolutionChart({ ots }: { ots: OTRow[] }) {
  const { avgResponse, avgResolution } = useMemo(() => ({
    avgResponse: avgResponseTime(ots),
    avgResolution: avgResolutionTime(ots),
  }), [ots]);

  if (avgResponse === 0 && avgResolution === 0) {
    return <div style={{ padding: "20px 0", textAlign: "center", color: C.text3, fontSize: 13 }}>Sin datos de tiempos suficientes</div>;
  }

  const barData = [
    { label: "Respuesta", value: parseFloat(avgResponse.toFixed(1)), color: C.info, help: "Creación → inicio de trabajo" },
    { label: "Resolución", value: parseFloat(avgResolution.toFixed(1)), color: C.mid, help: "Creación → completada" },
  ];

  const max = Math.max(...barData.map(b => b.value), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {barData.map(bar => (
        <div key={bar.label}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{bar.label}</span>
              <span style={{ fontSize: 11, color: C.text3, marginLeft: 6 }}>{bar.help}</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, color: bar.color }}>{bar.value > 0 ? `${bar.value}h` : "—"}</span>
          </div>
          <div style={{ height: 10, borderRadius: 6, background: C.bg, border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(bar.value / max) * 100}%`, background: bar.color, borderRadius: 6, transition: "width 0.4s" }} />
          </div>
        </div>
      ))}
      {avgResolution > 0 && avgResponse > 0 && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, fontSize: 12, color: C.text2 }}>
          El <strong>{Math.round((avgResponse / avgResolution) * 100)}%</strong> del tiempo de resolución se consume solo en responder (antes de empezar a trabajar).
        </div>
      )}
    </div>
  );
}

// ── NEW: Work Flow Section ────────────────────────────────────────────────────
function WorkFlowSection({ ots, rangeMonths }: { ots: OTRow[]; rangeMonths: number }) {
  const flowData = useMemo(() => calculateFlow(ots, rangeMonths), [ots, rangeMonths]);

  const recentHalf = flowData.slice(Math.floor(flowData.length / 2));
  const totalCreatedRecent   = recentHalf.reduce((s, d) => s + d.created, 0);
  const totalCompletedRecent = recentHalf.reduce((s, d) => s + d.completed, 0);
  const backlogGrowing = totalCreatedRecent > totalCompletedRecent && totalCreatedRecent > 0;

  return (
    <Card>
      <CardHeader
        title="Flujo de trabajo"
        subtitle="Órdenes creadas vs completadas en el tiempo"
        action={
          backlogGrowing ? (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.dangerBg, color: C.danger, display: "flex", alignItems: "center", gap: 4 }}>
              <TrendingUp size={11} /> Backlog creciendo
            </span>
          ) : (
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: C.successBg, color: C.success }}>
              ✓ Flujo estable
            </span>
          )
        }
      />
      <div style={{ padding: "16px 8px" }}>
        {flowData.every(d => d.created === 0 && d.completed === 0) ? (
          <div style={{ padding: "20px", textAlign: "center", color: C.text3, fontSize: 13 }}>Sin datos en el período</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={flowData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 12, fill: C.text3 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="created"   stroke={C.warning} strokeWidth={2} dot={false} name="Creadas" />
                <Line type="monotone" dataKey="completed" stroke={C.success} strokeWidth={2} dot={false} name="Completadas" />
              </LineChart>
            </ResponsiveContainer>
            {backlogGrowing && (
              <div style={{ margin: "12px 12px 0", padding: "8px 12px", borderRadius: 8, background: C.dangerBg, border: `1px solid ${C.danger}30`, fontSize: 12, color: C.text1 }}>
                ⚠️ En la segunda mitad del período, se crearon <strong>{totalCreatedRecent}</strong> órdenes pero solo se completaron <strong>{totalCompletedRecent}</strong>. El backlog está aumentando.
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// ── NEW: FTFR KPI + Rework ────────────────────────────────────────────────────
function ReworkSection({ ots, activos }: { ots: OTRow[]; activos: ActiveRow[] }) {
  const ftfr = useMemo(() => calcFTFR(ots), [ots]);

  const reworkByAsset = useMemo(() => {
    return activos.map(a => ({
      name:  a.nombre.length > 22 ? a.nombre.slice(0, 20) + "…" : a.nombre,
      count: ots.filter(o => o.activo_id === a.id && o.tipo_trabajo === "reactiva").length,
    }))
      .filter(x => x.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [ots, activos]);

  const ftfrColor = ftfr >= 80 ? C.success : ftfr >= 60 ? C.warning : C.danger;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 14 }}>
      {/* FTFR KPI card */}
      <Card style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: ftfrColor + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Target size={20} color={ftfrColor} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Primera visita</div>
        </div>
        <div>
          <div style={{ fontSize: 36, fontWeight: 800, color: ftfrColor, lineHeight: 1 }}>{ftfr > 0 ? `${ftfr}%` : "—"}</div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 4 }}>Tasa de solución en 1ª visita</div>
        </div>
        <div style={{ height: 6, borderRadius: 4, background: C.bg, border: `1px solid ${C.border}` }}>
          <div style={{ height: "100%", width: `${ftfr}%`, background: ftfrColor, borderRadius: 4 }} />
        </div>
        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.4 }}>
          {ftfr >= 80 ? "Buen nivel. La mayoría se resuelven sin reincidencia." : ftfr >= 60 ? "Nivel medio. Revisar activos con fallas repetidas." : "Nivel bajo. Alta tasa de reincidencia en activos."}
        </div>
      </Card>

      {/* Repeat failures */}
      <Card>
        <CardHeader title="Re-trabajos por activo" subtitle="Activos con 2+ fallas reactivas en el período" />
        {reworkByAsset.length === 0 ? (
          <div style={{ padding: "20px", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={16} color={C.success} />
            <span style={{ fontSize: 13, color: C.text2 }}>Sin fallas repetidas en el período</span>
          </div>
        ) : (
          <div style={{ padding: "16px 8px" }}>
            <ResponsiveContainer width="100%" height={Math.max(130, reworkByAsset.length * 36)}>
              <BarChart data={reworkByAsset} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis type="number" tick={{ fontSize: 12, fill: C.text3 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text2 }} width={120} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill={C.danger} radius={[0, 4, 4, 0]} name="Fallas reactivas">
                  {reworkByAsset.map((_, i) => <Cell key={i} fill={i === 0 ? C.danger : C.warning} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── NEW: Operational Insights ─────────────────────────────────────────────────
function OperationalInsights({ ots, activos, rangeMonths }: { ots: OTRow[]; activos: ActiveRow[]; rangeMonths: number }) {
  const insights = useMemo(() => {
    const result: { level: "critical" | "warning" | "info" | "success"; text: string }[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const open = ots.filter(o => o.estado !== "completado");
    const completed = ots.filter(o => o.estado === "completado");

    // Time distribution
    const { waitingPct, totalHours } = aggregateTimeDistribution(ots);
    if (totalHours > 0) {
      if (waitingPct > 50) result.push({ level: "critical", text: `El ${waitingPct}% del tiempo se pierde en espera. La mayoría de las OTs están bloqueadas antes de trabajarse.` });
      else if (waitingPct > 30) result.push({ level: "warning", text: `El ${waitingPct}% del tiempo es tiempo de espera, no de trabajo. Revisar cuellos de botella.` });
    }

    // Blockers
    const bloqueadas = open.filter(o => o.estado === "en_espera");
    if (bloqueadas.length > 0) {
      const pct = Math.round((bloqueadas.length / Math.max(open.length, 1)) * 100);
      result.push({ level: "warning", text: `${bloqueadas.length} de ${open.length} órdenes abiertas están bloqueadas (${pct}%). Resolver bloqueos tiene alto impacto.` });
    }

    // Backlog flow
    const flowData = calculateFlow(ots, rangeMonths);
    const recent   = flowData.slice(Math.floor(flowData.length / 2));
    const c = recent.reduce((s, d) => s + d.created, 0);
    const done = recent.reduce((s, d) => s + d.completed, 0);
    if (c > done && c > 0) result.push({ level: "warning", text: `El backlog está creciendo: ${c} nuevas vs ${done} completadas en la segunda mitad del período.` });

    // FTFR
    const ftfr = calcFTFR(ots);
    if (ftfr > 0 && ftfr < 60) result.push({ level: "warning", text: `Tasa de solución en primera visita baja (${ftfr}%). Muchos activos requieren intervenciones repetidas.` });
    else if (ftfr >= 85) result.push({ level: "success" as any, text: `Excelente tasa de solución en primera visita (${ftfr}%). Las intervenciones son efectivas.` });

    // Response time
    const avgResponse   = avgResponseTime(ots);
    const avgResolution = avgResolutionTime(ots);
    if (avgResponse > 0 && avgResolution > 0) {
      const responsePct = Math.round((avgResponse / avgResolution) * 100);
      if (responsePct > 40) result.push({ level: "warning", text: `El ${responsePct}% del tiempo de resolución se gasta solo en responder (antes de iniciar trabajo). Mejorar asignación reduce tiempos.` });
    }

    // Unassigned
    const unassigned = open.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
    if (unassigned.length >= 3) result.push({ level: "warning", text: `${unassigned.length} órdenes abiertas sin técnico asignado. Las OTs sin asignar no progresan.` });

    // Overdue
    const overdue = open.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) < today);
    if (overdue.length > 0) result.push({ level: "critical", text: `${overdue.length} orden${overdue.length > 1 ? "es" : ""} vencida${overdue.length > 1 ? "s" : ""}. SLA comprometido.` });

    if (result.length === 0) result.push({ level: "success" as any, text: "Sin alertas activas. Las operaciones de mantenimiento están en buen estado." });

    return result;
  }, [ots, activos, rangeMonths]);

  const levelStyle: Record<string, { bg: string; border: string; iconColor: string; Icon: React.ElementType }> = {
    critical: { bg: C.dangerBg,   border: C.danger + "40",  iconColor: C.danger,  Icon: XCircle },
    warning:  { bg: C.warningBg,  border: C.warning + "40", iconColor: C.warning, Icon: AlertTriangle },
    info:     { bg: C.infoBg,     border: C.info + "40",    iconColor: C.info,    Icon: Activity },
    success:  { bg: C.successBg,  border: C.success + "40", iconColor: C.success, Icon: CheckCircle2 },
  };

  return (
    <Card style={{ marginBottom: 24 }}>
      <CardHeader
        title="Insights operacionales"
        subtitle="Diagnóstico automático basado en los datos del período"
        action={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Brain size={14} color={C.purple} />
            <span style={{ fontSize: 11, fontWeight: 600, color: C.purple }}>{insights.length} análisis</span>
          </div>
        }
      />
      <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.map((ins, i) => {
          const s = levelStyle[ins.level] ?? levelStyle.info;
          const Icon = s.Icon;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 14px", borderRadius: 8, background: s.bg, border: `1px solid ${s.border}` }}>
              <Icon size={16} color={s.iconColor} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 13, color: C.text1, flex: 1, lineHeight: 1.5 }}>{ins.text}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnaliticaPage() {
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const [allOTs, setAllOTs] = useState<OTRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [activos, setActivos] = useState<ActiveRow[]>([]);
  const [materialesUsados, setMaterialesUsados] = useState<MaterialUsadoRow[]>([]);

  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [rangeMonths, setRangeMonths] = useState(3);
  const [ubicacionFilter, setUbicacionFilter] = useState("all");

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      const wsId = perfil?.workspace_id;
      if (!wsId) { setLoading(false); return; }
      setWorkspaceId(wsId);

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const [otsRes, usersRes, activosRes, matsRes] = await Promise.all([
        sb.from("ordenes_trabajo")
          .select("id, titulo, estado, prioridad, tipo_trabajo, created_at, fecha_termino, iniciado_at, updated_at, asignados_ids, activo_id, ubicacion_id, activos(id,nombre), ubicaciones(id,edificio)")
          .eq("workspace_id", wsId)
          .neq("estado", "cancelado")
          .gte("created_at", cutoffStr)
          .order("created_at", { ascending: false })
          .limit(2000),
        sb.from("usuarios")
          .select("id, nombre, rol, oficio, activo")
          .eq("workspace_id", wsId)
          .eq("activo", true),
        sb.from("activos")
          .select("id, nombre, descripcion, ubicacion_id, ubicaciones(edificio)")
          .eq("workspace_id", wsId)
          .eq("activo", true),
        sb.from("materiales_usados")
          .select("id, orden_id, nombre, cantidad, precio_unitario, material_id, materiales(precio_unitario), created_at")
          .gte("created_at", cutoffStr),
      ]);

      const normalizeJoin = <T,>(v: T | T[] | null): T | null =>
        Array.isArray(v) ? (v[0] ?? null) : v;

      setAllOTs(((otsRes.data ?? []) as unknown[]).map((o: any) => ({
        ...o,
        activos: normalizeJoin(o.activos),
        ubicaciones: normalizeJoin(o.ubicaciones),
      })) as OTRow[]);
      setUsuarios((usersRes.data ?? []) as unknown as UsuarioRow[]);
      setActivos(((activosRes.data ?? []) as unknown[]).map((a: any) => ({
        ...a,
        ubicaciones: normalizeJoin(a.ubicaciones),
      })) as ActiveRow[]);
      setMaterialesUsados(((matsRes.data ?? []) as unknown[]).map((m: any) => ({
        ...m,
        materiales: normalizeJoin(m.materiales),
      })) as MaterialUsadoRow[]);
      setLoading(false);
    }
    load();
  }, []);

  // ── Derived: date filter ────────────────────────────────────────────────────
  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - rangeMonths);
    return d.toISOString().slice(0, 10);
  }, [rangeMonths]);

  const ots = useMemo(() => allOTs.filter(o => {
    const inRange = o.created_at.slice(0, 10) >= cutoffDate;
    const inLoc = ubicacionFilter === "all" || o.ubicacion_id === ubicacionFilter;
    return inRange && inLoc;
  }), [allOTs, cutoffDate, ubicacionFilter]);

  const mats = useMemo(() => materialesUsados.filter(m => {
    const ot = ots.find(o => o.id === m.orden_id);
    return !!ot;
  }), [ots, materialesUsados]);

  // ── Ubicaciones for filter dropdown ────────────────────────────────────────
  const ubicaciones = useMemo(() => {
    const map = new Map<string, string>();
    allOTs.forEach(o => {
      if (o.ubicacion_id && o.ubicaciones?.edificio)
        map.set(o.ubicacion_id, o.ubicaciones.edificio);
    });
    return Array.from(map.entries());
  }, [allOTs]);

  // ── Operations Overview ─────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const openOTs = ots.filter(o => o.estado === "pendiente" || o.estado === "en_espera" || o.estado === "en_curso");
  const overdueOTs = openOTs.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) < today);
  const inCurso = ots.filter(o => o.estado === "en_curso");

  const byPriority = (["urgente", "alta", "media", "baja"] as Prioridad[]).map(p => ({
    name: p.charAt(0).toUpperCase() + p.slice(1),
    value: openOTs.filter(o => o.prioridad === p).length,
    color: p === "urgente" ? C.danger : p === "alta" ? C.warning : p === "media" ? C.info : C.text3,
  }));

  const techs = usuarios;
  const activeTechIds = new Set(openOTs.flatMap(o => o.asignados_ids ?? []));

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const completedOTs = ots.filter(o => o.estado === "completado" && o.iniciado_at && o.updated_at);
  const avgMTTR = completedOTs.length
    ? completedOTs.reduce((s, o) => s + hoursFromDates(o.iniciado_at!, o.updated_at!), 0) / completedOTs.length
    : 0;

  const assetCompletions: Record<string, number[]> = {};
  completedOTs.forEach(o => {
    if (!o.activo_id) return;
    if (!assetCompletions[o.activo_id]) assetCompletions[o.activo_id] = [];
    assetCompletions[o.activo_id].push(new Date(o.updated_at!).getTime());
  });
  const mtbfVals: number[] = [];
  Object.values(assetCompletions).forEach(times => {
    const sorted = [...times].sort();
    for (let i = 1; i < sorted.length; i++) mtbfVals.push((sorted[i] - sorted[i - 1]) / 36e5);
  });
  const avgMTBF = mtbfVals.length ? mtbfVals.reduce((s, v) => s + v, 0) / mtbfVals.length : 0;

  const preventiveOTs = ots.filter(o => o.tipo_trabajo === "preventiva");
  const completedPMs = preventiveOTs.filter(o => o.estado === "completado");
  const pmCompliance = preventiveOTs.length ? Math.round((completedPMs.length / preventiveOTs.length) * 100) : 0;

  const totalCompleted = ots.filter(o => o.estado === "completado").length;
  const reactiveCompleted = ots.filter(o => o.estado === "completado" && o.tipo_trabajo === "reactiva").length;
  const reactiveRatio = totalCompleted ? Math.round((reactiveCompleted / totalCompleted) * 100) : 0;

  // ── Monthly trend ────────────────────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const months: string[] = [];
    for (let i = rangeMonths - 1; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }
    return months.map(mk => {
      const mOTs = allOTs.filter(o => monthKey(o.created_at) === mk);
      const mMats = materialesUsados.filter(m => monthKey(m.created_at) === mk);
      const partsCost = mMats.reduce((s, m) => s + unitPrice(m) * m.cantidad, 0);
      return {
        month: new Date(mk + "-01").toLocaleDateString("es-CL", { month: "short" }),
        abiertas: mOTs.filter(o => o.estado === "pendiente" || o.estado === "en_espera").length,
        completadas: mOTs.filter(o => o.estado === "completado").length,
        costo: Math.round(partsCost),
      };
    });
  }, [allOTs, materialesUsados, rangeMonths]);

  // ── Asset Risk Ranking ───────────────────────────────────────────────────────
  const assetRisk = useMemo(() => {
    return activos.map(a => {
      const aOTs = ots.filter(o => o.activo_id === a.id && o.tipo_trabajo === "reactiva");
      const freq = aOTs.length;
      const completed = aOTs.filter(o => o.estado === "completado" && o.iniciado_at && o.updated_at);
      const downtime = completed.reduce((s, o) => s + hoursFromDates(o.iniciado_at!, o.updated_at!), 0);
      const aMats = mats.filter(m => aOTs.some(o => o.id === m.orden_id));
      const cost = aMats.reduce((s, m) => s + unitPrice(m) * m.cantidad, 0);

      const mid = new Date(); mid.setMonth(mid.getMonth() - rangeMonths / 2);
      const midStr = mid.toISOString().slice(0, 10);
      const recent = aOTs.filter(o => o.created_at.slice(0, 10) >= midStr).length;
      const prior  = aOTs.filter(o => o.created_at.slice(0, 10) < midStr).length;
      const trending = recent > prior && recent > 0;

      const freqScore    = Math.min(freq / 5, 1) * 40;
      const downtimeScore = Math.min(downtime / 40, 1) * 35;
      const costScore    = Math.min(cost / 300000, 1) * 25;
      const riskScore    = Math.round(freqScore + downtimeScore + costScore);

      return { ...a, freq, downtime: Math.round(downtime), cost: Math.round(cost), riskScore, trending };
    })
      .filter(a => a.freq > 0)
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);
  }, [activos, ots, mats, rangeMonths]);

  // ── WO Analytics ────────────────────────────────────────────────────────────
  const avgCompletionHours = completedOTs.length
    ? completedOTs.reduce((s, o) => s + hoursFromDates(o.created_at, o.updated_at!), 0) / completedOTs.length
    : 0;

  const backlogByAge = [
    { label: "< 3 días",  count: openOTs.filter(o => daysSince(o.created_at) < 3).length },
    { label: "3–7 días",  count: openOTs.filter(o => daysSince(o.created_at) >= 3 && daysSince(o.created_at) < 7).length },
    { label: "7–14 días", count: openOTs.filter(o => daysSince(o.created_at) >= 7 && daysSince(o.created_at) < 14).length },
    { label: "> 14 días", count: openOTs.filter(o => daysSince(o.created_at) >= 14).length },
  ];

  const repeatByAsset = activos.map(a => ({
    name: a.nombre.length > 20 ? a.nombre.slice(0, 18) + "…" : a.nombre,
    count: ots.filter(o => o.activo_id === a.id && o.tipo_trabajo === "reactiva").length,
  })).filter(x => x.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6);

  // ── Team Performance (enhanced) ──────────────────────────────────────────────
  const techPerf = techs.map(t => {
    const tOTs = ots.filter(o => o.asignados_ids?.includes(t.id));
    const done = tOTs.filter(o => o.estado === "completado" && o.iniciado_at && o.updated_at);
    const avgTime = done.length ? done.reduce((s, o) => s + hoursFromDates(o.iniciado_at!, o.updated_at!), 0) / done.length : 0;
    const active = tOTs.filter(o => o.estado === "en_curso").length;
    const blocked = tOTs.filter(o => o.estado === "en_espera").length;
    const avgPerTech = ots.length / Math.max(techs.length, 1);
    const utilization = Math.min(Math.round((tOTs.length / Math.max(avgPerTech, 1)) * 100), 100);
    const blockedPct  = tOTs.length > 0 ? Math.round((blocked / tOTs.length) * 100) : 0;
    return { ...t, jobs: tOTs.length, avgTime, active, blocked, blockedPct, utilization };
  }).sort((a, b) => b.jobs - a.jobs);

  // ── Cost Analytics ───────────────────────────────────────────────────────────
  const costByAsset = activos.map(a => {
    const aOTs = ots.filter(o => o.activo_id === a.id);
    const aMats = mats.filter(m => aOTs.some(o => o.id === m.orden_id));
    const parts = Math.round(aMats.reduce((s, m) => s + unitPrice(m) * m.cantidad, 0));
    return {
      name: a.nombre.length > 18 ? a.nombre.slice(0, 16) + "…" : a.nombre,
      parts,
      total: parts,
    };
  }).filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 7);

  const totalPartsCost = Math.round(mats.reduce((s, m) => s + unitPrice(m) * m.cantidad, 0));
  const totalOTs = ots.length;

  // ── Asset drill-down ────────────────────────────────────────────────────────
  const assetDetail = selectedAsset ? activos.find(a => a.id === selectedAsset) : null;
  const assetOTs = selectedAsset ? ots.filter(o => o.activo_id === selectedAsset).sort((a, b) => b.created_at.localeCompare(a.created_at)) : [];

  // ── Legacy Insights (top of page) ───────────────────────────────────────────
  const legacyInsights: { level: "critical" | "warning" | "info"; text: string }[] = [];
  if (overdueOTs.length > 0)
    legacyInsights.push({ level: "critical", text: `${overdueOTs.length} orden${overdueOTs.length > 1 ? "es" : ""} vencida${overdueOTs.length > 1 ? "s" : ""}. Requieren atención inmediata.` });
  const trendingAssets = assetRisk.filter(a => a.trending);
  if (trendingAssets.length > 0)
    legacyInsights.push({ level: "warning", text: `Tendencia creciente de fallas en: ${trendingAssets.map(a => a.nombre).join(", ")}.` });
  if (pmCompliance > 0 && pmCompliance < 70)
    legacyInsights.push({ level: "warning", text: `Cumplimiento PM bajo (${pmCompliance}%). Revisar programa de mantenimiento preventivo.` });
  const overloaded = techPerf.filter(t => t.active >= 3);
  if (overloaded.length > 0)
    legacyInsights.push({ level: "warning", text: `Técnico${overloaded.length > 1 ? "s" : ""} con carga alta: ${overloaded.map(t => t.nombre.split(" ")[0]).join(", ")} (3+ órdenes activas).` });
  const backlogOld = openOTs.filter(o => daysSince(o.created_at) >= 7).length;
  if (backlogOld > 3)
    legacyInsights.push({ level: "warning", text: `Backlog envejeciendo: ${backlogOld} órdenes llevan más de 7 días abiertas.` });
  if (legacyInsights.length === 0)
    legacyInsights.push({ level: "info", text: "Sin alertas activas en el período seleccionado." });

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 32, height: 32, border: `3px solid ${C.border}`, borderTopColor: C.mid, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Cargando analítica…</p>
        </div>
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontSize: 14, color: C.text2 }}>No se pudo cargar el workspace.</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "24px 28px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text1, margin: 0 }}>Analítica CMMS</h1>
          <p style={{ fontSize: 13, color: C.text3, margin: "4px 0 0" }}>
            Priorización y diagnóstico operacional · {new Date().toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={rangeMonths}
            onChange={e => setRangeMonths(Number(e.target.value))}
            style={{ height: 36, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontSize: 13, color: C.text1, cursor: "pointer" }}
          >
            <option value={1}>Último mes</option>
            <option value={2}>Últimos 2 meses</option>
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
          </select>
          <select
            value={ubicacionFilter}
            onChange={e => setUbicacionFilter(e.target.value)}
            style={{ height: 36, padding: "0 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, fontSize: 13, color: C.text1, cursor: "pointer" }}
          >
            <option value="all">Todas las ubicaciones</option>
            {ubicaciones.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
          </select>
        </div>
      </div>

      {/* ── Operational Insights (NEW, top) ── */}
      <OperationalInsights ots={ots} activos={activos} rangeMonths={rangeMonths} />

      {/* Legacy quick alerts */}
      <Card style={{ marginBottom: 24 }}>
        <CardHeader
          title="Alertas del sistema"
          subtitle="Anomalías detectadas automáticamente"
          action={<span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: C.infoBg, color: C.info }}>{legacyInsights.length} alertas</span>}
        />
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {legacyInsights.map((ins, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 12px", borderRadius: 8, background: ins.level === "critical" ? C.dangerBg : ins.level === "warning" ? C.warningBg : C.infoBg }}>
              <InsightBadge level={ins.level} />
              <p style={{ margin: 0, fontSize: 13, color: C.text1, flex: 1, lineHeight: 1.5 }}>{ins.text}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Operations Overview */}
      <SectionLabel icon={Activity} label="Operations Overview" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Órdenes abiertas"     value={openOTs.length}     sub={`${totalOTs} total en período`}             icon={ClipboardIcon}  color={C.mid}     trend="neutral" />
        <StatCard label="Órdenes vencidas"      value={overdueOTs.length}  sub="Requieren acción hoy"                       icon={AlertTriangle}  color={C.danger}  trend={overdueOTs.length > 0 ? "up" : "neutral"} />
        <StatCard label="Órdenes en ejecución"  value={inCurso.length}     sub="En proceso ahora"                           icon={Wrench}         color={C.info}    trend="neutral" />
        <StatCard label="Con OTs asignadas"     value={activeTechIds.size} sub={`de ${techs.length} en el workspace`}       icon={Users}          color={C.success} trend="neutral" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, marginBottom: 24 }}>
        <Card>
          <CardHeader title="Por prioridad" subtitle="Órdenes abiertas" />
          <div style={{ padding: 20 }}>
            {byPriority.map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: C.text2, flex: 1 }}>{p.name}</span>
                <div style={{ width: 80, height: 6, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${openOTs.length ? (p.value / openOTs.length) * 100 : 0}%`, background: p.color, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text1, minWidth: 20, textAlign: "right" }}>{p.value}</span>
              </div>
            ))}
            {openOTs.length === 0 && <p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Sin órdenes abiertas</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Órdenes vencidas" subtitle={`${overdueOTs.length} requieren atención inmediata`} />
          {overdueOTs.length === 0 ? (
            <div style={{ padding: 20, display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={16} color={C.success} />
              <span style={{ fontSize: 13, color: C.text2 }}>Sin órdenes vencidas</span>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Título", "Activo", "Prioridad", "Vence", "Días"].map(h => (
                      <th key={h} style={{ padding: "8px 16px", fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overdueOTs.slice(0, 8).map(o => {
                    const daysLate = daysSince(o.fecha_termino!);
                    return (
                      <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}`, background: daysLate > 3 ? C.dangerBg : "transparent" }}>
                        <td style={{ padding: "10px 16px", fontSize: 13, color: C.text1, fontWeight: 500 }}>{o.titulo ?? "Sin título"}</td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: C.text2 }}>{o.activos?.nombre ?? "—"}</td>
                        <td style={{ padding: "10px 16px" }}><PriorityBadge p={o.prioridad} /></td>
                        <td style={{ padding: "10px 16px", fontSize: 12, color: C.text2 }}>{o.fecha_termino?.slice(0, 10)}</td>
                        <td style={{ padding: "10px 16px" }}><span style={{ fontSize: 12, fontWeight: 700, color: C.danger }}>+{daysLate}d</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* ── Time Intelligence ── */}
      <SectionLabel icon={Timer} label="Inteligencia de Tiempo" />
      <div style={{ marginBottom: 24 }}>
        <TimeDistributionSection ots={ots} />
      </div>

      {/* ── Work Flow ── */}
      <SectionLabel icon={GitBranch} label="Flujo de Trabajo" />
      <div style={{ marginBottom: 24 }}>
        <WorkFlowSection ots={ots} rangeMonths={rangeMonths} />
      </div>

      {/* KPI Metrics */}
      <SectionLabel icon={BarChart2} label="KPIs de Mantenimiento" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="MTTR Promedio"   value={avgMTTR > 0 ? `${avgMTTR.toFixed(1)}h` : "—"} sub="Tiempo medio de reparación"       icon={Clock}        color={C.mid}     trend={avgMTTR > 12 ? "up" : avgMTTR > 0 ? "down" : "neutral"} />
        <StatCard label="MTBF Promedio"   value={avgMTBF > 0 ? `${Math.round(avgMTBF)}h` : "—"} sub="Tiempo medio entre fallas"       icon={Activity}     color={C.success} trend={avgMTBF > 300 ? "down" : avgMTBF > 0 ? "up" : "neutral"} />
        <StatCard label="Cumplimiento PM" value={preventiveOTs.length ? `${pmCompliance}%` : "—"} sub={`${completedPMs.length}/${preventiveOTs.length} PMs completados`} icon={CheckCircle2} color={pmCompliance >= 80 ? C.success : C.warning} trend={pmCompliance >= 80 ? "down" : pmCompliance > 0 ? "up" : "neutral"} />
        <StatCard label="Ratio Reactivo"  value={totalCompleted ? `${reactiveRatio}%` : "—"}    sub="Correctivos vs completadas"      icon={Zap}          color={reactiveRatio > 60 ? C.danger : C.info} trend={reactiveRatio > 60 ? "up" : "down"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <Card>
          <CardHeader title="Tendencia mensual de OTs" subtitle="Abiertas vs completadas" />
          <div style={{ padding: "16px 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyTrend} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.text3 }} />
                <YAxis tick={{ fontSize: 12, fill: C.text3 }} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="completadas" stroke={C.success} strokeWidth={2} dot={{ r: 4 }} name="Completadas" />
                <Line type="monotone" dataKey="abiertas" stroke={C.warning} strokeWidth={2} dot={{ r: 4 }} name="Abiertas" strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <CardHeader title="Costo de partes por mes" subtitle="Materiales usados en OTs completadas" />
          <div style={{ padding: "16px 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyTrend} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: C.text3 }} />
                <YAxis tick={{ fontSize: 12, fill: C.text3 }} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={v => [`$${Number(v).toLocaleString("es-CL")}`, "Costo"]} />
                <Bar dataKey="costo" fill={C.mid} radius={[4, 4, 0, 0]} name="Partes" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── First-Time Fix Rate + Rework ── */}
      <SectionLabel icon={RotateCcw} label="Re-trabajos y Efectividad" />
      <div style={{ marginBottom: 24 }}>
        <ReworkSection ots={ots} activos={activos} />
      </div>

      {/* Asset Risk Ranking */}
      <SectionLabel icon={ShieldAlert} label="Ranking de Riesgo por Activo" />
      <Card style={{ marginBottom: 24 }}>
        <CardHeader
          title="Top activos por riesgo"
          subtitle="Calculado por frecuencia de fallas reactivas, tiempo de reparación y costo de partes"
          action={<span style={{ fontSize: 11, color: C.text3 }}>Click en una fila para ver historial</span>}
        />
        {assetRisk.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <CheckCircle2 size={24} color={C.success} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: C.text2, margin: 0 }}>Sin fallas reactivas registradas en el período</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["#", "Activo", "Fallas", "Downtime estimado", "Costo partes", "Risk Score", "Tendencia"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assetRisk.map((a, i) => {
                  const isSelected = selectedAsset === a.id;
                  const riskColor = a.riskScore >= 60 ? C.danger : a.riskScore >= 35 ? C.warning : C.success;
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedAsset(isSelected ? null : a.id)}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer", background: isSelected ? C.infoBg : i === 0 ? C.dangerBg : "transparent", boxShadow: isSelected ? `inset 3px 0 0 ${C.mid}` : "none", transition: "background 0.15s" }}
                      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = C.bg; }}
                      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = i === 0 ? C.dangerBg : "transparent"; }}
                    >
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: i === 0 ? C.danger : C.text3 }}>{i + 1}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{a.nombre}</div>
                        {a.ubicaciones?.edificio && <div style={{ fontSize: 11, color: C.text3 }}>{a.ubicaciones.edificio}</div>}
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: a.freq >= 3 ? C.danger : C.text1 }}>{a.freq}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: C.text2 }}>{a.downtime > 0 ? `${a.downtime}h` : "—"}</td>
                      <td style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: C.text1 }}>{a.cost > 0 ? `$${a.cost.toLocaleString("es-CL")}` : "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 4, background: C.bg, overflow: "hidden", minWidth: 60 }}>
                            <div style={{ height: "100%", width: `${a.riskScore}%`, background: riskColor, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: riskColor, minWidth: 28 }}>{a.riskScore}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        {a.trending
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: C.danger }}><TrendingUp size={12} />Aumentando</span>
                          : <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.text3 }}><Minus size={12} />Estable</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Asset drill-down */}
      {assetDetail && (
        <Card style={{ marginBottom: 24, border: `1px solid ${C.mid}` }}>
          <CardHeader
            title={`Historial: ${assetDetail.nombre}`}
            subtitle={assetDetail.ubicaciones?.edificio ?? ""}
            action={<button onClick={() => setSelectedAsset(null)} style={{ fontSize: 12, color: C.text3, background: "none", border: "none", cursor: "pointer" }}>✕ Cerrar</button>}
          />
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
            {assetOTs.length === 0
              ? <p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Sin órdenes en el período seleccionado</p>
              : assetOTs.slice(0, 8).map(o => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}` }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.estado === "completado" ? C.success : o.estado === "en_curso" ? C.mid : C.warning, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, flex: 1, color: C.text1, fontWeight: 500 }}>{o.titulo ?? "Sin título"}</span>
                  <span style={{ fontSize: 11, color: C.text3 }}>{o.created_at.slice(0, 10)}</span>
                  <PriorityBadge p={o.prioridad} />
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: o.tipo_trabajo === "reactiva" ? C.dangerBg : C.successBg, color: o.tipo_trabajo === "reactiva" ? C.danger : C.success, fontWeight: 600 }}>
                    {o.tipo_trabajo ?? "—"}
                  </span>
                </div>
              ))
            }
            {assetOTs.length > 8 && <span style={{ fontSize: 11, color: C.text3 }}>+{assetOTs.length - 8} más</span>}
          </div>
        </Card>
      )}

      {/* WO Analytics */}
      <SectionLabel icon={Wrench} label="Analítica de Órdenes de Trabajo" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Tiempo medio de cierre" value={avgCompletionHours > 0 ? `${avgCompletionHours.toFixed(1)}h` : "—"} sub="Desde creación a completada" icon={Clock}        color={C.mid} />
        <StatCard label="Backlog total"           value={openOTs.length}                                                      sub="Órdenes sin cerrar"          icon={ClipboardIcon} color={C.warning} />
        <StatCard label="Tasa de completación"    value={totalOTs ? `${Math.round((totalCompleted / totalOTs) * 100)}%` : "—"} sub={`${totalCompleted} completadas`} icon={CheckCircle2} color={C.success} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <Card>
          <CardHeader title="Antigüedad del backlog" subtitle="Órdenes abiertas por tiempo en espera" />
          <div style={{ padding: "16px 8px" }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={backlogByAge} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: C.text3 }} />
                <YAxis tick={{ fontSize: 12, fill: C.text3 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Órdenes">
                  {backlogByAge.map((_, i) => (
                    <Cell key={i} fill={i === 3 ? C.danger : i === 2 ? C.warning : C.mid} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Fallas reactivas repetidas" subtitle="Activos con 2+ OTs reactivas en el período" />
          {repeatByAsset.length === 0
            ? <div style={{ padding: 20 }}><p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Sin fallas repetidas en el período</p></div>
            : (
              <div style={{ padding: "16px 8px" }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={repeatByAsset} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: C.text3 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text2 }} width={110} />
                    <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" fill={C.danger} radius={[0, 4, 4, 0]} name="Reactivas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>
      </div>

      {/* Team Performance — enhanced */}
      <SectionLabel icon={Users} label="Rendimiento del Equipo" />
      <Card style={{ marginBottom: 24 }}>
        <CardHeader title="Carga por técnico" subtitle="Órdenes asignadas, tiempo activo y bloqueos" />
        {techPerf.length === 0
          ? <div style={{ padding: 20 }}><p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Sin técnicos registrados</p></div>
          : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Técnico", "Rol", "Total OTs", "Activas", "Bloqueadas", "Tiempo promedio", "% Bloqueado", "Carga"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {techPerf.map(t => {
                    const isOverloaded = t.active >= 3;
                    const highBlocked  = t.blockedPct >= 30;
                    return (
                      <tr
                        key={t.id}
                        style={{ borderBottom: `1px solid ${C.border}`, background: isOverloaded ? C.dangerBg + "80" : highBlocked ? C.warningBg + "80" : "transparent" }}
                      >
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.brand}, ${C.mid})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                              {t.nombre.split(" ").map(p => p[0]).slice(0, 2).join("")}
                            </div>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{t.nombre}</div>
                              {isOverloaded && <div style={{ fontSize: 10, color: C.danger, fontWeight: 600 }}>⚠ Sobrecargado</div>}
                              {!isOverloaded && highBlocked && <div style={{ fontSize: 10, color: C.warning, fontWeight: 600 }}>⏸ Alto bloqueo</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: C.text2, textTransform: "capitalize" }}>{t.rol}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: C.text1 }}>{t.jobs}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: t.active >= 2 ? C.dangerBg : t.active === 1 ? C.warningBg : C.successBg, color: t.active >= 2 ? C.danger : t.active === 1 ? C.warning : C.success }}>
                            {t.active}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: t.blocked >= 2 ? C.warningBg : "transparent", color: t.blocked >= 2 ? C.warning : C.text3 }}>
                            {t.blocked > 0 ? t.blocked : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: C.text2 }}>{t.avgTime > 0 ? `${t.avgTime.toFixed(1)}h` : "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: t.blockedPct >= 30 ? C.warning : C.text3 }}>
                            {t.jobs > 0 ? `${t.blockedPct}%` : "—"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 4, background: C.bg, overflow: "hidden", minWidth: 80 }}>
                              <div style={{ height: "100%", width: `${t.utilization}%`, background: t.utilization >= 80 ? C.danger : t.utilization >= 60 ? C.warning : C.success, borderRadius: 4 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.text1, minWidth: 32 }}>{t.utilization}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </Card>

      {/* Cost Analytics */}
      <SectionLabel icon={DollarSign} label="Analítica de Costos (Partes)" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, marginBottom: 24 }}>
        <Card>
          <CardHeader title="Costo de partes por activo" subtitle="Materiales usados en el período" />
          {costByAsset.length === 0
            ? <div style={{ padding: 20 }}><p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Sin consumo de materiales registrado</p></div>
            : (
              <div style={{ padding: "16px 8px" }}>
                <ResponsiveContainer width="100%" height={Math.max(200, costByAsset.length * 36)}>
                  <BarChart data={costByAsset} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: C.text3 }} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text2 }} width={120} />
                    <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={v => [`$${Number(v).toLocaleString("es-CL")}`, "Partes"]} />
                    <Bar dataKey="parts" fill={C.mid} radius={[0, 4, 4, 0]} name="Partes" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          }
        </Card>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, alignContent: "start", minWidth: 180 }}>
          <MiniStat label="Total partes" value={totalPartsCost > 0 ? `$${totalPartsCost.toLocaleString("es-CL")}` : "—"} color={C.mid} />
          <MiniStat label="Costo / OT"   value={totalOTs && totalPartsCost > 0 ? `$${Math.round(totalPartsCost / totalOTs).toLocaleString("es-CL")}` : "—"} />
          <MiniStat label="OTs con partes" value={new Set(mats.map(m => m.orden_id)).size} />
          <MiniStat label="Ítems usados"  value={mats.length} />
        </div>
      </div>

    </div>
  );
}
