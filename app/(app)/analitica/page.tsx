"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Activity,
  BarChart2,
  CheckCircle2,
  Clock,
  GitBranch,
  ShieldAlert,
  Timer,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import type { Estado, Prioridad, TipoTrabajo } from "@/types/ordenes";

const C = {
  brand: "var(--brand)",
  success: "var(--success)",
  successBg: "var(--success-bg)",
  warning: "var(--warning)",
  warningBg: "var(--st-wait-bg)",
  danger: "var(--danger)",
  dangerBg: "var(--danger-bg)",
  info: "var(--brand)",
  infoBg: "var(--brand-tint)",
  text1: "var(--fg-1)",
  text2: "var(--fg-2)",
  text3: "var(--fg-4)",
  border: "var(--border)",
  bg: "var(--surface-0)",
  surface: "var(--surface-1)",
};

type EstadoAnalitica = Estado | "cancelado" | "en_revision";

interface OTRow {
  id: string;
  titulo: string | null;
  estado: EstadoAnalitica;
  prioridad: Prioridad;
  tipo_trabajo: TipoTrabajo | null;
  clasificacion: "levantamiento" | "ejecucion" | null;
  created_at: string;
  updated_at: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  presupuesto: string | null;
  iniciado_at: string | null;
  pausado_at: string | null;
  en_ejecucion: boolean | null;
  tiempo_total_segundos: number | null;
  asignados_ids: string[] | null;
  parent_id: string | null;
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
  cargo: string | null;
  activo: boolean;
}

interface ActiveRow {
  id: string;
  nombre: string;
  criticidad: string | null;
  ubicacion_id: string | null;
  ubicaciones: { edificio: string } | null;
}

interface ProcExecRow {
  id: string;
  orden_id: string;
  estado: string;
  iniciado_at: string | null;
  completado_at: string | null;
  created_at: string;
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: "15px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "26px 0 12px" }}>
      <Icon size={15} color={C.brand} />
      <span style={{ fontSize: 11, fontWeight: 800, color: C.text2, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color = C.brand,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const bg = tone === "bad" ? C.dangerBg : tone === "warn" ? C.warningBg : tone === "good" ? C.successBg : "var(--surface-hover)";
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 29, fontWeight: 850, color: C.text1, lineHeight: 1, letterSpacing: 0 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: C.text2, marginTop: 7 }}>{sub}</div>}
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </Card>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    urgente: { bg: C.dangerBg, color: C.danger, label: "Urgente" },
    alta: { bg: C.warningBg, color: C.warning, label: "Alta" },
    media: { bg: C.infoBg, color: C.info, label: "Media" },
    baja: { bg: C.bg, color: C.text3, label: "Baja" },
    ninguna: { bg: C.bg, color: C.text3, label: "-" },
  };
  const s = map[p] ?? map.ninguna;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: s.bg, color: s.color }}>{s.label}</span>;
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function monthKey(d: string) {
  return d.slice(0, 7);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function rangeStart(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateInRange(date: string | null | undefined, start: string) {
  return !!date && date.slice(0, 10) >= start;
}

function isOpen(o: OTRow) {
  return o.estado !== "completado" && o.estado !== "cancelado";
}

function isRoot(o: OTRow) {
  return o.parent_id === null;
}

function isAssigned(o: OTRow) {
  return (o.asignados_ids ?? []).length > 0;
}

function completedAt(o: OTRow) {
  return o.estado === "completado" ? (o.fecha_termino ?? o.updated_at) : null;
}

function hoursBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 36e5);
}

function daysSince(d: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 864e5));
}

function workingHours(o: OTRow) {
  if (o.tiempo_total_segundos && o.tiempo_total_segundos > 0) return o.tiempo_total_segundos / 3600;
  if (o.iniciado_at && completedAt(o)) return hoursBetween(o.iniciado_at, completedAt(o)!);
  return null;
}

function responseHours(o: OTRow) {
  if (!o.iniciado_at) return null;
  return hoursBetween(o.created_at, o.iniciado_at);
}

function cycleHours(o: OTRow) {
  const end = completedAt(o);
  if (!end) return null;
  return hoursBetween(o.created_at, end);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function fmtHours(h: number) {
  if (!h) return "-";
  if (h >= 24) return `${(h / 24).toFixed(1)}d`;
  return `${h.toFixed(1)}h`;
}

function fmtPct(n: number, d: number) {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "-";
}

function uniqueIds(rows: OTRow[]) {
  return new Set(rows.map(r => r.id)).size;
}

function normalizeJoin<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function buildFlow(ots: OTRow[], months: number) {
  const start = rangeStart(months);
  const now = new Date();
  const weekly = months > 2;
  const step = weekly ? 7 : 1;
  const rows: Array<{ label: string; creadas: number; completadas: number; backlog: number }> = [];

  for (let d = new Date(start); d <= now; d = addDays(d, step)) {
    const end = addDays(d, step);
    const startStr = dayKey(d);
    const endStr = dayKey(end > now ? addDays(now, 1) : end);
    const created = ots.filter(o => o.created_at.slice(0, 10) >= startStr && o.created_at.slice(0, 10) < endStr);
    const completed = ots.filter(o => {
      const c = completedAt(o);
      return c && c.slice(0, 10) >= startStr && c.slice(0, 10) < endStr;
    });
    const backlog = ots.filter(o => o.created_at.slice(0, 10) < endStr && (!completedAt(o) || completedAt(o)!.slice(0, 10) >= endStr)).length;
    rows.push({
      label: d.toLocaleDateString("es-CL", { day: "numeric", month: "short" }),
      creadas: uniqueIds(created),
      completadas: uniqueIds(completed),
      backlog,
    });
  }
  return rows;
}

export default function AnaliticaPage() {
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [allOTs, setAllOTs] = useState<OTRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [activos, setActivos] = useState<ActiveRow[]>([]);
  const [procExecs, setProcExecs] = useState<ProcExecRow[]>([]);
  const [rangeMonths, setRangeMonths] = useState(3);
  const [ubicacionFilter, setUbicacionFilter] = useState("all");
  const [usuarioFilter, setUsuarioFilter] = useState("all");
  const [scope, setScope] = useState<"root" | "all">("root");
  const [peopleMode, setPeopleMode] = useState<"open" | "completed">("open");

  const suscripcion = useSuscripcion();
  const maxRange = suscripcion.data?.plan_limits?.historial_meses ?? Infinity;
  const setRangeSafe = (n: number) => setRangeMonths(Number.isFinite(maxRange) && n > maxRange ? maxRange : n);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: perfil } = await sb
        .from("usuarios")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle();

      const wsId = perfil?.workspace_id;
      if (!wsId) {
        setLoading(false);
        return;
      }
      setWorkspaceId(wsId);

      const [otsRes, usersRes, activosRes, procRes] = await Promise.all([
        sb.from("ordenes_trabajo")
          .select("id, titulo, estado, prioridad, tipo_trabajo, clasificacion, created_at, updated_at, fecha_inicio, fecha_termino, presupuesto, iniciado_at, pausado_at, en_ejecucion, tiempo_total_segundos, asignados_ids, parent_id, activo_id, ubicacion_id, activos(id,nombre), ubicaciones(id,edificio)")
          .eq("workspace_id", wsId)
          .order("created_at", { ascending: false })
          .limit(5000),
        sb.from("usuarios")
          .select("id, nombre, rol, oficio, cargo, activo")
          .eq("workspace_id", wsId)
          .eq("activo", true)
          .order("nombre"),
        sb.from("activos")
          .select("id, nombre, criticidad, ubicacion_id, ubicaciones(edificio)")
          .eq("workspace_id", wsId)
          .eq("activo", true),
        sb.from("procedimiento_ejecuciones")
          .select("id, orden_id, estado, iniciado_at, completado_at, created_at")
          .eq("workspace_id", wsId)
          .order("created_at", { ascending: false })
          .limit(5000),
      ]);

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
      setProcExecs((procRes.data ?? []) as unknown as ProcExecRow[]);
      setLoading(false);
    }
    load();
  }, []);

  const cutoff = useMemo(() => dayKey(rangeStart(rangeMonths)), [rangeMonths]);
  const baseOTs = useMemo(() => allOTs.filter(o => o.estado !== "cancelado"), [allOTs]);
  const rootOTs = useMemo(() => baseOTs.filter(isRoot), [baseOTs]);
  const subOTs = useMemo(() => baseOTs.filter(o => !isRoot(o)), [baseOTs]);
  const scopedHistorical = scope === "root" ? rootOTs : baseOTs;

  const periodOTs = useMemo(() => scopedHistorical.filter(o => {
    const inPeriod = dateInRange(o.created_at, cutoff) || dateInRange(completedAt(o), cutoff);
    const inLoc = ubicacionFilter === "all" || o.ubicacion_id === ubicacionFilter;
    const inUser = usuarioFilter === "all" || (o.asignados_ids ?? []).includes(usuarioFilter);
    return inPeriod && inLoc && inUser;
  }), [scopedHistorical, cutoff, ubicacionFilter, usuarioFilter]);

  const periodRootOTs = useMemo(() => periodOTs.filter(isRoot), [periodOTs]);
  const periodSubOTs = useMemo(() => periodOTs.filter(o => !isRoot(o)), [periodOTs]);
  const openOTs = useMemo(() => periodOTs.filter(isOpen), [periodOTs]);
  const openRootOTs = useMemo(() => periodRootOTs.filter(isOpen), [periodRootOTs]);
  const completedOTs = useMemo(() => periodOTs.filter(o => o.estado === "completado"), [periodOTs]);
  const completedRootOTs = useMemo(() => periodRootOTs.filter(o => o.estado === "completado"), [periodRootOTs]);

  const today = dayKey(new Date());
  const overdue = openOTs.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) < today);
  const dueThisWeek = openOTs.filter(o => o.fecha_termino && o.fecha_termino.slice(0, 10) >= today && o.fecha_termino.slice(0, 10) <= dayKey(addDays(new Date(), 7)));
  const unassignedOpen = openOTs.filter(o => !isAssigned(o));
  const unassignedRootOpen = openRootOTs.filter(o => !isAssigned(o));
  const assignedOpen = openOTs.filter(isAssigned);
  const running = openOTs.filter(o => o.estado === "en_curso" || o.en_ejecucion);
  const blocked = openOTs.filter(o => o.estado === "en_espera");
  const assignedNoProgress = assignedOpen.filter(o => o.estado === "pendiente" && !o.iniciado_at && !o.en_ejecucion);
  const assignedNoProgressRoot = assignedNoProgress.filter(isRoot);

  const responseVals = completedOTs.map(responseHours).filter((v): v is number => v !== null);
  const cycleVals = completedOTs.map(cycleHours).filter((v): v is number => v !== null);
  const workVals = completedOTs.map(workingHours).filter((v): v is number => v !== null);
  const responseMedian = median(responseVals);
  const cycleMedian = median(cycleVals);
  const cycleP75 = percentile(cycleVals, 75);
  const wrenchMedian = median(workVals);

  const createdInPeriod = periodOTs.filter(o => dateInRange(o.created_at, cutoff));
  const completedInPeriod = periodOTs.filter(o => dateInRange(completedAt(o), cutoff));
  const createdRootInPeriod = periodRootOTs.filter(o => dateInRange(o.created_at, cutoff));
  const completedRootInPeriod = periodRootOTs.filter(o => dateInRange(completedAt(o), cutoff));
  const completionRate = fmtPct(completedRootInPeriod.length, createdRootInPeriod.length);

  const flow = useMemo(() => buildFlow(periodOTs, rangeMonths), [periodOTs, rangeMonths]);
  const byPriority = (["urgente", "alta", "media", "baja", "ninguna"] as Prioridad[]).map(p => ({
    name: p,
    count: openOTs.filter(o => o.prioridad === p).length,
    color: p === "urgente" ? C.danger : p === "alta" ? C.warning : p === "media" ? C.info : C.text3,
  }));
  const byStatus = [
    { name: "Pendiente", count: openOTs.filter(o => o.estado === "pendiente").length, color: C.info },
    { name: "En curso", count: running.length, color: C.brand },
    { name: "En espera", count: blocked.length, color: C.warning },
    { name: "Completadas", count: completedOTs.length, color: C.success },
  ];
  const backlogAge = [
    { label: "< 3 dias", count: openOTs.filter(o => daysSince(o.created_at) < 3).length },
    { label: "3-7 dias", count: openOTs.filter(o => daysSince(o.created_at) >= 3 && daysSince(o.created_at) < 7).length },
    { label: "7-14 dias", count: openOTs.filter(o => daysSince(o.created_at) >= 7 && daysSince(o.created_at) < 14).length },
    { label: "> 14 dias", count: openOTs.filter(o => daysSince(o.created_at) >= 14).length },
  ];

  const procInScope = useMemo(() => {
    const ids = new Set(periodOTs.map(o => o.id));
    return procExecs.filter(p => ids.has(p.orden_id));
  }, [procExecs, periodOTs]);
  const procCompleted = procInScope.filter(p => p.estado === "completado").length;
  const procCompletion = fmtPct(procCompleted, procInScope.length);
  const reactiveOTs = periodOTs.filter(o => o.tipo_trabajo === "reactiva");
  const plannedOTs = periodOTs.filter(o => o.tipo_trabajo === "preventiva" || o.tipo_trabajo === "inspeccion" || o.tipo_trabajo === "mejora" || o.tipo_trabajo === "presupuesto");
  const plannedRatio = fmtPct(plannedOTs.length, plannedOTs.length + reactiveOTs.length);
  const urgentReactive = reactiveOTs.filter(o => o.prioridad === "urgente" || o.prioridad === "alta");
  const budgetRefOTs = periodOTs.filter(o => !!o.presupuesto?.trim());

  const assetRisk = useMemo(() => {
    const map = new Map<string, { id: string; name: string; location: string; criticality: string | null; reactive: number; open: number; overdue: number; downtime: number }>();
    for (const a of activos) {
      map.set(a.id, { id: a.id, name: a.nombre, location: a.ubicaciones?.edificio ?? "-", criticality: a.criticidad, reactive: 0, open: 0, overdue: 0, downtime: 0 });
    }
    for (const ot of periodOTs) {
      if (!ot.activo_id || ot.tipo_trabajo !== "reactiva") continue;
      const row = map.get(ot.activo_id);
      if (!row) continue;
      row.reactive += 1;
      if (isOpen(ot)) row.open += 1;
      if (overdue.some(o => o.id === ot.id)) row.overdue += 1;
      const w = workingHours(ot);
      if (w) row.downtime += w;
    }
    return [...map.values()]
      .filter(r => r.reactive > 0 || r.open > 0)
      .map(r => ({ ...r, score: r.reactive * 10 + r.open * 12 + r.overdue * 18 + Math.min(30, r.downtime / 2) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [activos, periodOTs, overdue]);

  const techPerf = useMemo(() => {
    const totalAssignments = usuarios.reduce((sum, u) => sum + openOTs.filter(o => o.asignados_ids?.includes(u.id)).length, 0);
    const totalCompletedAssignments = usuarios.reduce((sum, u) => sum + completedOTs.filter(o => o.asignados_ids?.includes(u.id)).length, 0);
    return usuarios.map(u => {
      const assigned = periodOTs.filter(o => o.asignados_ids?.includes(u.id));
      const openAssigned = assigned.filter(isOpen);
      const done = assigned.filter(o => o.estado === "completado");
      const overdueAssigned = openAssigned.filter(o => overdue.some(v => v.id === o.id));
      const hours = done.map(workingHours).filter((v): v is number => v !== null);
      const cycles = done.map(cycleHours).filter((v): v is number => v !== null);
      return {
        ...u,
        open: openAssigned.length,
        rootOpen: openAssigned.filter(isRoot).length,
        subOpen: openAssigned.filter(o => !isRoot(o)).length,
        completed: done.length,
        rootCompleted: done.filter(isRoot).length,
        subCompleted: done.filter(o => !isRoot(o)).length,
        overdue: overdueAssigned.length,
        blocked: openAssigned.filter(o => o.estado === "en_espera").length,
        avgWork: hours.length ? hours.reduce((s, v) => s + v, 0) / hours.length : 0,
        avgCycle: cycles.length ? cycles.reduce((s, v) => s + v, 0) / cycles.length : 0,
        share: totalAssignments > 0 ? Math.round((openAssigned.length / totalAssignments) * 100) : 0,
        completionShare: totalCompletedAssignments > 0 ? Math.round((done.length / totalCompletedAssignments) * 100) : 0,
      };
    });
  }, [usuarios, periodOTs, openOTs, completedOTs, overdue]);

  const techRows = useMemo(() => {
    return [...techPerf].sort((a, b) => {
      if (peopleMode === "completed") return b.completed - a.completed || a.avgCycle - b.avgCycle || b.open - a.open;
      return b.open - a.open || b.overdue - a.overdue || b.completed - a.completed;
    });
  }, [techPerf, peopleMode]);

  const quality = [
    { label: "Abiertas sin fecha termino", count: openOTs.filter(o => !o.fecha_termino).length },
    { label: "Abiertas sin tecnico", count: unassignedOpen.length },
    { label: "Sin activo vinculado", count: periodOTs.filter(o => !o.activo_id).length },
    { label: "Completadas sin inicio", count: completedOTs.filter(o => !o.iniciado_at).length },
    { label: "Completadas sin tiempo", count: completedOTs.filter(o => !workingHours(o)).length },
  ];
  const costReadiness = [
    { label: "Con N de presupuesto", count: budgetRefOTs.length },
    { label: "Sin presupuesto", count: periodOTs.length - budgetRefOTs.length },
    { label: "Costo monetario OT", count: 0 },
    { label: "Costo mano de obra", count: 0 },
  ];

  const insights = (() => {
    const items: Array<{ tone: "bad" | "warn" | "good"; text: string }> = [];
    if (overdue.length > 0) items.push({ tone: "bad", text: `${overdue.length} OT${overdue.length === 1 ? "" : "s"} vencida${overdue.length === 1 ? "" : "s"} requieren cierre o reprogramacion.` });
    if (unassignedRootOpen.length > 0) items.push({ tone: "warn", text: `${unassignedRootOpen.length} OT${unassignedRootOpen.length === 1 ? "" : "s"} principal${unassignedRootOpen.length === 1 ? "" : "es"} sin tecnico asignado.` });
    if (createdRootInPeriod.length > completedRootInPeriod.length) items.push({ tone: "warn", text: `El backlog crece en el periodo: ${createdRootInPeriod.length} principales creadas vs ${completedRootInPeriod.length} cerradas.` });
    if (blocked.length > Math.max(3, openOTs.length * 0.15)) items.push({ tone: "warn", text: `${blocked.length} OTs en espera. Revisar causa de pausa y proxima accion.` });
    if (cycleP75 > 72) items.push({ tone: "warn", text: `P75 de ciclo en ${fmtHours(cycleP75)}. Una de cada cuatro OTs tarda mas que eso en cerrar.` });
    if (items.length === 0) items.push({ tone: "good", text: "Sin alertas operacionales fuertes en el periodo seleccionado." });
    return items;
  })();

  const ubicaciones = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of allOTs) if (o.ubicacion_id && o.ubicaciones?.edificio) map.set(o.ubicacion_id, o.ubicaciones.edificio);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allOTs]);

  if (loading) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 13 }}>Cargando analitica...</div>;
  }

  if (!workspaceId) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 13 }}>No se pudo cargar el workspace.</div>;
  }

  return (
    <div style={{ padding: "28px 32px 64px", minHeight: "100vh", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, color: C.text1, fontSize: 24, fontWeight: 850, letterSpacing: 0 }}>Analitica operacional</h1>
          <p style={{ margin: "5px 0 0", color: C.text3, fontSize: 13 }}>
            KPIs basados en OTs reales, sub-OTs, asignacion, vencimientos y ejecucion en terreno.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={rangeMonths} onChange={e => setRangeSafe(Number(e.target.value))} style={selectStyle}>
            <option value={1}>Ultimo mes</option>
            <option value={3} disabled={maxRange < 3}>Ultimos 3 meses</option>
            <option value={6} disabled={maxRange < 6}>Ultimos 6 meses</option>
            <option value={12} disabled={maxRange < 12}>Ultimos 12 meses</option>
          </select>
          <select value={scope} onChange={e => setScope(e.target.value as "root" | "all")} style={selectStyle}>
            <option value="root">Solo OTs principales</option>
            <option value="all">Principales + sub-OTs</option>
          </select>
          <select value={ubicacionFilter} onChange={e => setUbicacionFilter(e.target.value)} style={selectStyle}>
            <option value="all">Todas las ubicaciones</option>
            {ubicaciones.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={usuarioFilter} onChange={e => setUsuarioFilter(e.target.value)} style={selectStyle}>
            <option value="all">Todos los tecnicos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
      </div>

      <SectionLabel icon={Activity} label="1. Operacion" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
        <StatCard label="Total historico" value={baseOTs.length} sub={`${rootOTs.length} principales + ${subOTs.length} sub-OTs`} icon={BarChart2} color={C.brand} />
        <StatCard label="En espera" value={blocked.length} sub={`${fmtPct(blocked.length, openOTs.length)} de las abiertas`} icon={Activity} color={blocked.length ? C.warning : C.success} tone={blocked.length > 0 ? "warn" : "good"} />
        <StatCard label="Sin asignar" value={unassignedOpen.length} sub={`${unassignedRootOpen.length} principales, ${unassignedOpen.length - unassignedRootOpen.length} sub-OTs`} icon={Users} color={unassignedOpen.length ? C.warning : C.success} tone={unassignedOpen.length ? "warn" : "good"} />
        <StatCard label="Vencidas" value={overdue.length} sub={`${dueThisWeek.length} vencen en 7 dias`} icon={AlertTriangle} color={overdue.length ? C.danger : C.success} tone={overdue.length ? "bad" : "good"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginTop: 14 }}>
        <StatCard label="Asignadas sin progreso" value={assignedNoProgress.length} sub={`${assignedNoProgressRoot.length} principales pendientes`} icon={CheckCircle2} color={assignedNoProgress.length ? C.warning : C.success} tone={assignedNoProgress.length ? "warn" : "good"} />
        <StatCard label="Creadas periodo" value={createdInPeriod.length} sub={`${createdRootInPeriod.length} principales`} icon={TrendingUp} color={C.brand} />
        <StatCard label="Cerradas periodo" value={completedInPeriod.length} sub={`${completionRate} cierre vs creadas principales`} icon={CheckCircle2} color={C.success} />
        <StatCard label="Sub-OTs periodo" value={periodSubOTs.length} sub={`${periodSubOTs.filter(isOpen).length} abiertas`} icon={GitBranch} color={C.info} />
      </div>

      <SectionLabel icon={ShieldAlert} label="Decisiones inmediatas" />
      <Card>
        <div style={{ padding: 16, display: "grid", gap: 10 }}>
          {insights.map((i, idx) => (
            <div key={idx} style={{ padding: "11px 12px", borderRadius: 8, border: `1px solid ${i.tone === "bad" ? C.danger : i.tone === "warn" ? C.warning : C.success}`, background: i.tone === "bad" ? C.dangerBg : i.tone === "warn" ? C.warningBg : C.successBg, color: C.text1, fontSize: 13 }}>
              {i.text}
            </div>
          ))}
        </div>
      </Card>

      <SectionLabel icon={Timer} label="2. Tiempo y cumplimiento" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
        <StatCard label="Respuesta mediana" value={fmtHours(responseMedian)} sub={`${responseVals.length} OTs con inicio`} icon={Clock} color={C.info} />
        <StatCard label="Ciclo mediano" value={fmtHours(cycleMedian)} sub="Creacion a cierre" icon={Timer} color={C.brand} />
        <StatCard label="Ciclo P75" value={fmtHours(cycleP75)} sub="El 75% cierra bajo este tiempo" icon={TrendingUp} color={cycleP75 > 72 ? C.warning : C.success} tone={cycleP75 > 72 ? "warn" : "neutral"} />
        <StatCard label="SLA vencido" value={fmtPct(overdue.length, openOTs.length)} sub={`${overdue.length}/${openOTs.length} abiertas fuera de fecha`} icon={AlertTriangle} color={overdue.length ? C.danger : C.success} tone={overdue.length ? "bad" : "good"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 14, marginTop: 14 }}>
        <Card>
          <CardHeader title="Flujo de OTs" subtitle="Creadas, completadas y backlog acumulado" />
          <div style={{ padding: "16px 8px" }}>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={flow} margin={{ left: -10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 12, fill: C.text3 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="creadas" stroke={C.warning} strokeWidth={2} name="Creadas" dot={false} />
                <Line type="monotone" dataKey="completadas" stroke={C.success} strokeWidth={2} name="Completadas" dot={false} />
                <Line type="monotone" dataKey="backlog" stroke={C.brand} strokeWidth={2} name="Backlog" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Antiguedad del backlog" subtitle="Edad desde creacion" />
          <div style={{ padding: "16px 8px" }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={backlogAge} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} />
                <YAxis tick={{ fontSize: 12, fill: C.text3 }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="OTs" radius={[4, 4, 0, 0]}>
                  {backlogAge.map((_, i) => <Cell key={i} fill={i >= 3 ? C.danger : i === 2 ? C.warning : C.brand} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <SectionLabel icon={Zap} label="3. Preventivo vs correctivo" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14, marginBottom: 14 }}>
        <StatCard label="Planificado" value={plannedRatio} sub={`${plannedOTs.length} planificadas / ${reactiveOTs.length} reactivas`} icon={CheckCircle2} color={C.success} />
        <StatCard label="Reactivas" value={reactiveOTs.length} sub={`${fmtPct(reactiveOTs.length, plannedOTs.length + reactiveOTs.length)} del mix`} icon={Zap} color={reactiveOTs.length > plannedOTs.length ? C.warning : C.brand} tone={reactiveOTs.length > plannedOTs.length ? "warn" : "neutral"} />
        <StatCard label="Emergencias" value={urgentReactive.length} sub="Reactivas alta/urgente" icon={AlertTriangle} color={urgentReactive.length ? C.danger : C.success} tone={urgentReactive.length ? "bad" : "good"} />
        <StatCard label="PM / checklist" value={procCompletion} sub={`${procCompleted}/${procInScope.length} procedimientos completados`} icon={CheckCircle2} color={C.success} />
      </div>

      <SectionLabel icon={Activity} label="Backlog operativo" />
      <div style={{ display: "grid", gridTemplateColumns: "0.7fr 0.7fr 1fr", gap: 14 }}>
        <Card>
          <CardHeader title="Estado actual" subtitle="OTs del periodo" />
          <SimpleBars data={byStatus} total={Math.max(1, periodOTs.length)} />
        </Card>
        <Card>
          <CardHeader title="Prioridad abierta" subtitle="Solo backlog" />
          <SimpleBars data={byPriority.map(p => ({ name: p.name, count: p.count, color: p.color }))} total={Math.max(1, openOTs.length)} />
        </Card>
        <Card>
          <CardHeader title="OTs vencidas" subtitle="Primeras 8 por dias de atraso" />
          <div style={{ padding: "8px 0" }}>
            {overdue.length === 0 ? (
              <EmptyRow text="Sin OTs vencidas en el filtro actual." />
            ) : overdue.sort((a, b) => daysSince(b.fecha_termino!) - daysSince(a.fecha_termino!)).slice(0, 8).map(o => (
              <div key={o.id} style={listRowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.titulo ?? "Sin titulo"}</div>
                  <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{o.activos?.nombre ?? o.ubicaciones?.edificio ?? "Sin activo/ubicacion"}</div>
                </div>
                <PriorityBadge p={o.prioridad} />
                <span style={{ fontSize: 12, fontWeight: 800, color: C.danger, minWidth: 40, textAlign: "right" }}>+{daysSince(o.fecha_termino!)}d</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <SectionLabel icon={Users} label="6. Personas y productividad" />
      <Card>
        <CardHeader
          title="Carga por tecnico"
          subtitle={peopleMode === "open" ? "Backlog asignado, sub-OTs y vencidas" : "OTs cerradas por tecnico en el periodo"}
          action={(
            <div style={segmentedStyle}>
              <button type="button" onClick={() => setPeopleMode("open")} style={segmentButtonStyle(peopleMode === "open")}>Carga abierta</button>
              <button type="button" onClick={() => setPeopleMode("completed")} style={segmentButtonStyle(peopleMode === "completed")}>Completadas</button>
            </div>
          )}
        />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {(peopleMode === "open"
                  ? ["Tecnico", "Rol", "Abiertas", "Principales", "Sub-OTs", "Vencidas", "Bloqueadas", "Cerradas", "Trabajo prom.", "Carga"]
                  : ["Tecnico", "Rol", "Cerradas", "Principales", "Sub-OTs", "Abiertas", "Vencidas", "Ciclo prom.", "Trabajo prom.", "Participacion"]
                ).map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {techRows.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}`, background: t.overdue > 0 ? C.dangerBg : t.blocked > 0 ? C.warningBg : "transparent" }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 750, color: C.text1 }}>{t.nombre}</div>
                    {t.oficio && <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>{t.oficio}</div>}
                  </td>
                  <td style={tdMuted}>{t.rol}</td>
                  <td style={tdStrong}>{peopleMode === "open" ? t.open : t.completed}</td>
                  <td style={tdMuted}>{peopleMode === "open" ? t.rootOpen : t.rootCompleted}</td>
                  <td style={tdMuted}>{peopleMode === "open" ? t.subOpen : t.subCompleted}</td>
                  {peopleMode === "open" ? (
                    <>
                      <td style={{ ...tdStyle, color: t.overdue ? C.danger : C.text2, fontWeight: 800 }}>{t.overdue}</td>
                      <td style={{ ...tdStyle, color: t.blocked ? C.warning : C.text2, fontWeight: 800 }}>{t.blocked}</td>
                    </>
                  ) : (
                    <>
                      <td style={tdMuted}>{t.open}</td>
                      <td style={{ ...tdStyle, color: t.overdue ? C.danger : C.text2, fontWeight: 800 }}>{t.overdue}</td>
                    </>
                  )}
                  {peopleMode === "open" ? (
                    <td style={tdMuted}>{t.completed}</td>
                  ) : (
                    <td style={tdMuted}>{fmtHours(t.avgCycle)}</td>
                  )}
                  <td style={tdMuted}>{fmtHours(t.avgWork)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
                        <div style={{ width: `${peopleMode === "open" ? t.share : t.completionShare}%`, height: "100%", background: peopleMode === "open" ? (t.share >= 35 ? C.danger : t.share >= 20 ? C.warning : C.success) : C.success }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: C.text1, minWidth: 32 }}>{peopleMode === "open" ? t.share : t.completionShare}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionLabel icon={ShieldAlert} label="4. Activos y equipos" />
      <Card>
        <CardHeader title="Activos con mas riesgo operativo" subtitle="Reactivos, backlog, vencidas y horas de trabajo" />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Activo", "Ubicacion", "Criticidad", "Reactivas", "Abiertas", "Vencidas", "Horas", "Score"].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {assetRisk.length === 0 ? (
                <tr><td colSpan={8}><EmptyRow text="Sin activos con OTs reactivas en el periodo." /></td></tr>
              ) : assetRisk.map(a => (
                <tr key={a.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={tdStrong}>{a.name}</td>
                  <td style={tdMuted}>{a.location}</td>
                  <td style={tdMuted}>{a.criticality ?? "-"}</td>
                  <td style={tdStrong}>{a.reactive}</td>
                  <td style={tdMuted}>{a.open}</td>
                  <td style={{ ...tdStyle, color: a.overdue ? C.danger : C.text2, fontWeight: 800 }}>{a.overdue}</td>
                  <td style={tdMuted}>{fmtHours(a.downtime)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                      <div style={{ flex: 1, height: 7, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, Math.round(a.score))}%`, height: "100%", background: a.score >= 60 ? C.danger : a.score >= 30 ? C.warning : C.success }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800 }}>{Math.round(a.score)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionLabel icon={BarChart2} label="5. Costos" />
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 14, marginBottom: 14 }}>
        <Card>
          <CardHeader title="Preparacion para costos" subtitle="Hoy Pangui no tiene costo_total activo en OT" />
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>
              Hay referencias de presupuesto, pero las columnas historicas de costo monetario fueron retiradas. Este bloque queda como control de madurez: para costo por edificio, preventivo vs correctivo y activo mas costoso hay que registrar costo de materiales, mano de obra o terceros.
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Cobertura de datos de costo" subtitle="Base para reportes financieros" />
          <SimpleBars data={costReadiness.map(q => ({ name: q.label, count: q.count, color: q.count > 0 ? C.brand : C.warning }))} total={Math.max(1, periodOTs.length)} />
        </Card>
      </div>

      <SectionLabel icon={CheckCircle2} label="Calidad de datos" />
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 14 }}>
        <Card>
          <CardHeader title="Ejecucion de procedimientos" subtitle="Checklists iniciados en OTs del filtro" />
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 34, fontWeight: 850, color: C.text1, lineHeight: 1 }}>{procCompletion}</div>
            <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>{procCompleted}/{procInScope.length} ejecuciones completadas</div>
            <div style={{ marginTop: 14, height: 8, background: C.bg, borderRadius: 5, overflow: "hidden" }}>
              <div style={{ height: "100%", width: procInScope.length ? `${(procCompleted / procInScope.length) * 100}%` : "0%", background: C.success }} />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Calidad de datos" subtitle="Campos faltantes que reducen precision de reportes" />
          <SimpleBars data={quality.map(q => ({ name: q.label, count: q.count, color: q.count > 0 ? C.warning : C.success }))} total={Math.max(1, periodOTs.length)} />
        </Card>
      </div>
    </div>
  );
}

function SimpleBars({ data, total }: { data: Array<{ name: string; count: number; color: string }>; total: number }) {
  return (
    <div style={{ padding: 18, display: "grid", gap: 12 }}>
      {data.map(d => (
        <div key={d.name}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
            <span style={{ fontSize: 12, color: C.text2, textTransform: "capitalize" }}>{d.name}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text1 }}>{d.count}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (d.count / total) * 100)}%`, background: d.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ padding: "16px 18px", color: C.text3, fontSize: 13 }}>{text}</div>;
}

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text1,
  fontSize: 13,
  cursor: "pointer",
};

const segmentedStyle: React.CSSProperties = {
  display: "flex",
  padding: 3,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: C.bg,
  gap: 2,
};

function segmentButtonStyle(active: boolean): React.CSSProperties {
  return {
    height: 28,
    padding: "0 10px",
    border: "none",
    borderRadius: 6,
    background: active ? C.brand : "transparent",
    color: active ? "white" : C.text2,
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

const tooltipStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 12,
};

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 800,
  color: C.text3,
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 12,
  color: C.text2,
  verticalAlign: "middle",
};

const tdMuted: React.CSSProperties = {
  ...tdStyle,
  color: C.text2,
};

const tdStrong: React.CSSProperties = {
  ...tdStyle,
  color: C.text1,
  fontWeight: 800,
};

const listRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 16px",
  borderBottom: `1px solid ${C.border}`,
};
