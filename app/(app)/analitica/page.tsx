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
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { Estado, Prioridad, TipoTrabajo } from "@/types/ordenes";

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  brand: "#1E3A8A", mid: "#2563EB", light: "#EFF6FF",
  success: "#10B981", successBg: "#ECFDF5",
  warning: "#F59E0B", warningBg: "#FFFBEB",
  danger: "#EF4444",  dangerBg: "#FEF2F2",
  info: "#3B82F6",    infoBg: "#EFF6FF",
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
  // completado is set when estado === "completado", use updated_at as proxy
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
// Resolve unit price: use row value first, fall back to joined material catalogue price
function unitPrice(m: MaterialUsadoRow): number {
  return m.precio_unitario ?? m.materiales?.precio_unitario ?? 0;
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

      // Date cutoff: last N months (fetch generous range, filter client-side)
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12); // always fetch 12 months, filter in useMemo
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
        // Join materiales to get fallback precio_unitario when it's null on the row
        sb.from("materiales_usados")
          .select("id, orden_id, nombre, cantidad, precio_unitario, material_id, materiales(precio_unitario), created_at")
          .gte("created_at", cutoffStr),
      ]);

      // Supabase may return joined relations as arrays; normalize to single object
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

  // All workspace members (active), any role can be assigned to OTs
  const techs = usuarios;
  // Techs with at least one open OT assigned to them
  const activeTechIds = new Set(openOTs.flatMap(o => o.asignados_ids ?? []));

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const completedOTs = ots.filter(o => o.estado === "completado" && o.iniciado_at && o.updated_at);
  const avgMTTR = completedOTs.length
    ? completedOTs.reduce((s, o) => s + hoursFromDates(o.iniciado_at!, o.updated_at!), 0) / completedOTs.length
    : 0;

  // MTBF: per asset, time between consecutive completions as proxy
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

      // Trending: more failures in second half of the period vs first half
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

  // ── Team Performance ─────────────────────────────────────────────────────────
  const techPerf = techs.map(t => {
    const tOTs = ots.filter(o => o.asignados_ids?.includes(t.id));
    const done = tOTs.filter(o => o.estado === "completado" && o.iniciado_at && o.updated_at);
    const avgTime = done.length ? done.reduce((s, o) => s + hoursFromDates(o.iniciado_at!, o.updated_at!), 0) / done.length : 0;
    const active = tOTs.filter(o => o.estado === "en_curso").length;
    const avgPerTech = ots.length / Math.max(techs.length, 1);
    const utilization = Math.min(Math.round((tOTs.length / Math.max(avgPerTech, 1)) * 100), 100);
    return { ...t, jobs: tOTs.length, avgTime, active, utilization };
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

  // ── Insights ────────────────────────────────────────────────────────────────
  const insights: { level: "critical" | "warning" | "info"; text: string }[] = [];

  if (overdueOTs.length > 0)
    insights.push({ level: "critical", text: `${overdueOTs.length} orden${overdueOTs.length > 1 ? "es" : ""} vencida${overdueOTs.length > 1 ? "s" : ""}. Requieren atención inmediata.` });

  const trendingAssets = assetRisk.filter(a => a.trending);
  if (trendingAssets.length > 0)
    insights.push({ level: "warning", text: `Tendencia creciente de fallas en: ${trendingAssets.map(a => a.nombre).join(", ")}.` });

  if (pmCompliance > 0 && pmCompliance < 70)
    insights.push({ level: "warning", text: `Cumplimiento PM bajo (${pmCompliance}%). Revisar programa de mantenimiento preventivo.` });
  else if (pmCompliance >= 85 && reactiveRatio > 60)
    insights.push({ level: "warning", text: `PM compliance alto (${pmCompliance}%) pero ${reactiveRatio}% de OTs son reactivas. Posibles fallas no anticipadas.` });

  const overloaded = techPerf.filter(t => t.active >= 3);
  if (overloaded.length > 0)
    insights.push({ level: "warning", text: `Técnico${overloaded.length > 1 ? "s" : ""} con carga alta: ${overloaded.map(t => t.nombre.split(" ")[0]).join(", ")} (3+ órdenes activas).` });

  const backlogOld = openOTs.filter(o => daysSince(o.created_at) >= 7).length;
  if (backlogOld > 3)
    insights.push({ level: "warning", text: `Backlog envejeciendo: ${backlogOld} órdenes llevan más de 7 días abiertas.` });

  if (insights.length === 0)
    insights.push({ level: "info", text: "Sin alertas activas en el período seleccionado." });

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

      {/* Insights */}
      <Card style={{ marginBottom: 24 }}>
        <CardHeader
          title="Insights automáticos"
          subtitle="Anomalías y recomendaciones generadas por el sistema"
          action={<span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: C.infoBg, color: C.info }}>{insights.length} alertas</span>}
        />
        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {insights.map((ins, i) => (
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
        <StatCard label="Órdenes abiertas"         value={openOTs.length}         sub={`${totalOTs} total en período`}             icon={ClipboardIcon}  color={C.mid}     trend="neutral" />
        <StatCard label="Órdenes vencidas"          value={overdueOTs.length}      sub="Requieren acción hoy"                       icon={AlertTriangle}  color={C.danger}  trend={overdueOTs.length > 0 ? "up" : "neutral"} />
        <StatCard label="Órdenes en ejecución"      value={inCurso.length}         sub="En proceso ahora"                           icon={Wrench}         color={C.info}    trend="neutral" />
        <StatCard label="Con OTs asignadas"          value={activeTechIds.size}     sub={`de ${techs.length} en el workspace`}       icon={Users}          color={C.success} trend="neutral" />
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

      {/* Team Performance */}
      <SectionLabel icon={Users} label="Rendimiento del Equipo" />
      <Card style={{ marginBottom: 24 }}>
        <CardHeader title="Carga por técnico" subtitle="Órdenes asignadas y tiempo promedio de resolución" />
        {techPerf.length === 0
          ? <div style={{ padding: 20 }}><p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Sin técnicos registrados</p></div>
          : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Técnico", "Rol", "Total OTs", "Activas", "Tiempo promedio", "Utilización relativa"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {techPerf.map(t => (
                    <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.brand}, ${C.mid})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {t.nombre.split(" ").map(p => p[0]).slice(0, 2).join("")}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{t.nombre}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: C.text2, textTransform: "capitalize" }}>{t.rol}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: C.text1 }}>{t.jobs}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: t.active >= 2 ? C.dangerBg : t.active === 1 ? C.warningBg : C.successBg, color: t.active >= 2 ? C.danger : t.active === 1 ? C.warning : C.success }}>
                          {t.active} activas
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: 12, color: C.text2 }}>{t.avgTime > 0 ? `${t.avgTime.toFixed(1)}h` : "—"}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 4, background: C.bg, overflow: "hidden", minWidth: 80 }}>
                            <div style={{ height: "100%", width: `${t.utilization}%`, background: t.utilization >= 80 ? C.danger : t.utilization >= 60 ? C.warning : C.success, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.text1, minWidth: 32 }}>{t.utilization}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
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
