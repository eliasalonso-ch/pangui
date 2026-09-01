"use client";

/**
 * Analítica de activos — asset reliability reporting.
 *
 * Deliberately mirrors the layout language of /analitica/ordenes: same Card
 * radius/shadow, same 460px fixed chart cards, same StatCard metrics, same
 * 4-column KPI grids. The two reports sit in one section, so they must not
 * look like they came from different apps.
 *
 * The core rule here: a metric with no data reads "Sin datos", never 0 or 100%.
 * An asset with no logged failures is unmeasured, not perfect, and a
 * reliability report that cannot tell those apart misleads the people making
 * repair-or-replace calls.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, Check, MapPin, Package, Wrench,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { esAdmin } from "@/lib/roles";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { computeActivoMetrics, buildMonthlySeries } from "@/lib/activo-metrics";
import type { ActivoOTHistoryRow } from "@/lib/activos-api";
import type { AssetCriticality } from "@/types/ordenes";

// Same palette object as /analitica/ordenes so both reports stay in step.
const C = {
  brand: "var(--brand)",
  success: "var(--success)",
  successBg: "var(--success-bg)",
  warning: "var(--warning)",
  warningBg: "var(--warning-bg)",
  danger: "var(--danger)",
  dangerBg: "var(--danger-bg)",
  info: "var(--info)",
  infoBg: "var(--brand-tint)",
  text1: "var(--fg-1)",
  text2: "var(--fg-2)",
  text3: "var(--fg-4)",
  border: "var(--border)",
  bg: "var(--surface-canvas)",
  surface: "var(--surface-1)",
};

const CRIT_LABEL: Record<AssetCriticality, string> = {
  critico: "Crítico",
  semi_critico: "Semi-crítico",
  no_critico: "No crítico",
};

interface AssetRow {
  id: string;
  nombre: string;
  criticidad: AssetCriticality | null;
  estado: string | null;
  ubicacion_id: string | null;
  modelo_id: string | null;
  ubicacion: { id: string; edificio: string } | null;
  modelo: { id: string; nombre: string } | null;
}

interface OTRow extends ActivoOTHistoryRow {
  activo_id: string | null;
}

// ── Shared primitives (kept byte-identical in spirit to /analitica/ordenes) ────

function Card({ children, style, fixed }: { children: React.ReactNode; style?: React.CSSProperties; fixed?: boolean }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
      ...(fixed ? { display: "flex", flexDirection: "column", height: 460, minWidth: 0, position: "relative" as const, overflow: "hidden" } : {}),
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ padding: "15px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/** Big number + caption shown above a chart, inside the same card. */
function ChartValue({ value, tone = C.text1 }: { value: string; tone?: string }) {
  return (
    <div style={{ padding: "12px 18px 4px" }}>
      <div style={{ fontSize: 26, fontWeight: 850, color: tone, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

// ── Filter chip ───────────────────────────────────────────────────────────────

interface ChipOption { value: string; label: string }

/**
 * Filter chip. Metrics are copied from the Órdenes FilterBar
 * (app/(app)/ordenes/OTFiltrosPanel.tsx) so both screens' filter rows are the
 * same control: 32px tall, 12.5px text, radius 7, 1.5px brand border when
 * active, and — the detail that identifies a filter at a glance — the icon
 * always rendered in brand blue, active or not.
 */
function FilterChip({ icon: Icon, label, value, options, onChange }: {
  icon: React.ElementType;
  label: string;
  value: string;
  options: ChipOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = value !== "all";

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 32, padding: "0 11px",
          border: active ? "1.5px solid var(--brand)" : "1px solid var(--border)",
          borderRadius: 7,
          background: active ? "var(--brand-tint)" : "var(--surface-1)",
          color: active ? "var(--brand)" : "var(--fg-2)",
          fontSize: 12.5, fontWeight: active ? 600 : 500,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", color: "var(--brand)" }}><Icon size={15} /></span>
        {label}
        {active && (
          <span style={{ fontSize: 10, fontWeight: 700, background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          minWidth: 280, maxWidth: 360, background: "var(--surface-1)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "var(--shadow-md)", overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 12px 6px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--fg-3)", letterSpacing: "0.01em" }}>{label}</span>
            {active && (
              <button
                type="button"
                onClick={() => { onChange("all"); setOpen(false); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "var(--brand)", fontFamily: "inherit" }}
              >
                Limpiar
              </button>
            )}
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", padding: "2px 0 4px" }}>
            {[{ value: "all", label: "Todos" }, ...options].map(o => {
              const selected = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 12px", background: "transparent", border: "none",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--fg-1)", fontWeight: selected ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  {selected && <Check size={13} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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

// ── Formatting ────────────────────────────────────────────────────────────────

/** Single wording for a metric that cannot be computed from the data. */
const SIN_DATOS = "Sin datos";

function fmtHours(h: number | null): string {
  if (h == null) return SIN_DATOS;
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  if (h >= 1) return `${h.toFixed(1)} h`;
  return `${Math.round(h * 60)} min`;
}

function fmtPct(p: number | null, d = 1): string {
  return p == null ? SIN_DATOS : `${p.toFixed(d)}%`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnaliticaActivosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [ots, setOTs] = useState<OTRow[]>([]);
  const [rangeMonths, setRangeMonths] = useState(12);

  const [critFilter, setCritFilter] = useState("all");
  const [modeloFilter, setModeloFilter] = useState("all");
  const [activoFilter, setActivoFilter] = useState("all");
  const [ubicFilter, setUbicFilter] = useState("all");

  const suscripcion = useSuscripcion();
  const maxRange = suscripcion.data?.plan_limits?.historial_meses ?? Infinity;
  const setRangeSafe = (n: number) => setRangeMonths(Number.isFinite(maxRange) && n > maxRange ? maxRange : n);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: perfil } = await sb
        .from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();

      const wsId = perfil?.workspace_id;
      if (!wsId) { setLoading(false); return; }
      // Same gate as the órdenes report: hiding the sidebar link is not enough,
      // the URL is still reachable and this reports across the whole workspace.
      if (!esAdmin(perfil?.rol)) { router.replace("/inicio"); return; }
      setWorkspaceId(wsId);

      const [activosRes, otsRes] = await Promise.all([
        sb.from("activos")
          .select("id, nombre, criticidad, estado, ubicacion_id, modelo_id, ubicacion:ubicaciones(id, edificio), modelo:modelos(id, nombre)")
          .eq("workspace_id", wsId)
          .eq("activo", true)
          .order("nombre"),
        sb.from("ordenes_trabajo")
          .select(`id, activo_id, estado, tipo_trabajo, fecha_termino, iniciado_at,
                   completado_en, tiempo_total_segundos, costo_total`)
          .eq("workspace_id", wsId)
          .is("deleted_at", null)
          .not("activo_id", "is", null),
      ]);

      setAssets((activosRes.data ?? []) as unknown as AssetRow[]);
      setOTs((otsRes.data ?? []) as unknown as OTRow[]);
      setLoading(false);
    }
    load();
  }, [router]);

  // ── Filter options ──────────────────────────────────────────────────────────
  const ubicOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) if (a.ubicacion) m.set(a.ubicacion.id, a.ubicacion.edificio);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [assets]);

  const modeloOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) if (a.modelo) m.set(a.modelo.id, a.modelo.nombre);
    return [...m].map(([value, label]) => ({ value, label }));
  }, [assets]);

  const filteredAssets = useMemo(() => assets.filter(a => {
    if (critFilter !== "all" && (a.criticidad ?? "no_critico") !== critFilter) return false;
    if (modeloFilter !== "all" && a.modelo_id !== modeloFilter) return false;
    if (ubicFilter !== "all" && a.ubicacion_id !== ubicFilter) return false;
    if (activoFilter !== "all" && a.id !== activoFilter) return false;
    return true;
  }), [assets, critFilter, modeloFilter, ubicFilter, activoFilter]);

  const activoOptions = useMemo(
    () => assets.map(a => ({ value: a.id, label: a.nombre })),
    [assets],
  );

  // ── Metrics ─────────────────────────────────────────────────────────────────
  const assetIds = useMemo(() => new Set(filteredAssets.map(a => a.id)), [filteredAssets]);
  const scopedOTs = useMemo(
    () => ots.filter(o => o.activo_id && assetIds.has(o.activo_id)),
    [ots, assetIds],
  );

  const windowDays = rangeMonths * 30;
  const fleet = useMemo(
    () => computeActivoMetrics(scopedOTs, { windowDays }),
    [scopedOTs, windowDays],
  );
  const series = useMemo(
    () => buildMonthlySeries(scopedOTs, Math.min(rangeMonths, 12)),
    [scopedOTs, rangeMonths],
  );

  /** Per-asset metrics, worst reliability first — the actual worklist. */
  const perAsset = useMemo(() => {
    const byAsset = new Map<string, OTRow[]>();
    for (const o of scopedOTs) {
      if (!o.activo_id) continue;
      const list = byAsset.get(o.activo_id);
      if (list) list.push(o); else byAsset.set(o.activo_id, [o]);
    }
    return filteredAssets.map(a => ({
      asset: a,
      m: computeActivoMetrics(byAsset.get(a.id) ?? [], { windowDays }),
    }));
  }, [filteredAssets, scopedOTs, windowDays]);

  const ranked = useMemo(
    () => [...perAsset]
      .filter(r => r.m.failures > 0)
      .sort((a, b) => b.m.failures - a.m.failures || b.m.repairHours - a.m.repairHours)
      .slice(0, 10),
    [perAsset],
  );

  const critSplit = useMemo(() => {
    const counts: Record<string, number> = { critico: 0, semi_critico: 0, no_critico: 0 };
    for (const a of filteredAssets) counts[a.criticidad ?? "no_critico"]++;
    return (Object.keys(counts) as AssetCriticality[])
      .filter(k => counts[k] > 0)
      .map(k => ({ name: CRIT_LABEL[k], value: counts[k], key: k }));
  }, [filteredAssets]);

  const CRIT_FILL: Record<string, string> = {
    critico: C.danger, semi_critico: C.warning, no_critico: C.success,
  };


  /**
   * Live asset states. Unlike everything else on this page these are current
   * values, not period aggregates — `activos.estado` has no history table, so
   * this is a snapshot of right now, which is exactly what a status bar should
   * show. `baja` (retired) is excluded: a decommissioned asset is not "offline",
   * it is gone, and counting it would drag availability down forever.
   */
  const statusCounts = useMemo(() => {
    const c = { operativo: 0, mantencion: 0, fuera_servicio: 0, baja: 0 };
    for (const a of filteredAssets) {
      const k = (a.estado ?? "operativo") as keyof typeof c;
      if (k in c) c[k]++;
    }
    return c;
  }, [filteredAssets]);

  const enServicio = statusCounts.operativo + statusCounts.mantencion + statusCounts.fuera_servicio;
  const disponibilidadActual = enServicio > 0
    ? (statusCounts.operativo / enServicio) * 100
    : null;

  if (loading) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 13 }}>Cargando analítica...</div>;
  }
  if (!workspaceId) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 13 }}>No se pudo cargar el workspace.</div>;
  }

  const availTone = fleet.availabilityPct == null ? "neutral"
    : fleet.availabilityPct >= 99 ? "good" : fleet.availabilityPct >= 95 ? "warn" : "bad";
  const pmTone = fleet.pmCompliancePct == null ? "neutral"
    : fleet.pmCompliancePct >= 90 ? "good" : fleet.pmCompliancePct >= 75 ? "warn" : "bad";
  const prevTone = fleet.preventiveSharePct == null ? "neutral"
    : fleet.preventiveSharePct >= 70 ? "good" : fleet.preventiveSharePct >= 50 ? "warn" : "bad";

  const noFailures = fleet.failures === 0;


  return (
    <div style={{ padding: "28px 32px 64px", minHeight: "100vh", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div />
        <select value={rangeMonths} onChange={e => setRangeSafe(Number(e.target.value))} style={selectStyle}>
          <option value={3} disabled={maxRange < 3}>Últimos 3 meses</option>
          <option value={6} disabled={maxRange < 6}>Últimos 6 meses</option>
          <option value={12} disabled={maxRange < 12}>Últimos 12 meses</option>
        </select>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <FilterChip icon={AlertTriangle} label="Criticidad" value={critFilter} onChange={setCritFilter}
          options={(["critico", "semi_critico", "no_critico"] as AssetCriticality[]).map(k => ({ value: k, label: CRIT_LABEL[k] }))} />
        <FilterChip icon={Package} label="Tipo de activo" value={modeloFilter} onChange={setModeloFilter} options={modeloOptions} />
        <FilterChip icon={Wrench} label="Activo" value={activoFilter} onChange={setActivoFilter} options={activoOptions} />
        <FilterChip icon={MapPin} label="Ubicación" value={ubicFilter} onChange={setUbicFilter} options={ubicOptions} />
      </div>

      {/* Estado actual: a live snapshot of asset states, not a period
          aggregate like the charts below. Each cell is its own card, with the
          qualifier in parentheses so "Fuera de servicio (no planificado)" reads
          as one label rather than two competing ones. */}
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(190px, 1.1fr) repeat(4, minmax(0, 1fr))",
        gap: 10, marginTop: 14, alignItems: "stretch",
      }}>
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
          boxShadow: "0 1px 3px rgba(15,23,42,0.06)", padding: "14px 16px",
          display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Activity size={15} style={{ color: C.brand, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text1 }}>Estado actual</span>
          </div>
          <span style={{ fontSize: 12, color: C.text3 }}>
            {filteredAssets.length} {filteredAssets.length === 1 ? "activo" : "activos"} en el filtro
          </span>
        </div>

        {[
          {
            label: "Disponibilidad",
            qualifier: "ahora",
            value: disponibilidadActual == null ? SIN_DATOS : `${disponibilidadActual.toFixed(0)}%`,
            dot: null as string | null,
            muted: disponibilidadActual == null,
          },
          {
            label: "Operativos",
            qualifier: null,
            value: String(statusCounts.operativo),
            dot: C.success,
            muted: false,
          },
          {
            label: "Fuera de servicio",
            qualifier: "no planificado",
            value: String(statusCounts.fuera_servicio),
            dot: C.danger,
            muted: false,
          },
          {
            label: "En mantención",
            qualifier: "planificado",
            value: String(statusCounts.mantencion),
            dot: C.brand,
            muted: false,
          },
        ].map(cell => (
          <div key={cell.label} style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)", padding: "14px 16px",
            display: "flex", flexDirection: "column", justifyContent: "center", gap: 8,
            minWidth: 0,
          }}>
            <div style={{ fontSize: 12.5, color: C.text2, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: C.text1 }}>{cell.label}</span>
              {cell.qualifier && (
                <span style={{ color: C.text3 }}> ({cell.qualifier})</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {cell.dot && (
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: cell.dot, flexShrink: 0 }} />
              )}
              <span style={{
                fontSize: cell.muted ? 15 : 23, fontWeight: 850, lineHeight: 1.1,
                color: cell.muted ? C.text3 : C.text1,
              }}>{cell.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Every chart card below is the same 460px Card `fixed` height. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <Card fixed>
          <CardHeader title="Disponibilidad en el tiempo" />
          <ChartValue
            value={fmtPct(fleet.availabilityPct, 2)}
            tone={fleet.availabilityPct == null ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {series.some(p => p.availabilityPct != null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: -10, right: 46, top: 8 }}>
                  <defs>
                    <linearGradient id="availFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.success} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.success} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false}
                         domain={["dataMin - 1", 100]} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                           formatter={(v) => [v == null ? "Sin datos" : `${Number(v)}%`, "Disponibilidad"]} />
                  <Area type="monotone" dataKey="availabilityPct" name="Disponibilidad"
                        stroke={C.success} strokeWidth={2} fill="url(#availFill)"
                        dot={{ r: 3 }} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Se necesita al menos una falla registrada para medir disponibilidad." />}
          </div>
        </Card>

        <Card fixed>
          <CardHeader title="Cumplimiento de preventivos" />
          <ChartValue
            value={fmtPct(fleet.pmCompliancePct)}
            tone={fleet.pmCompliancePct == null ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {series.some(p => p.pmCompliancePct != null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ left: -10, right: 20, top: 8 }}>
                  <defs>
                    <linearGradient id="pmFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.brand} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.brand} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false}
                         tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                           formatter={(v) => [v == null ? "Sin datos" : `${Number(v)}%`, "Cumplimiento"]} />
                  {/* The 90% "world class" benchmark, drawn so a month can be
                      read against the goal and not just against itself. */}
                  <ReferenceLine y={90} yAxisId={0} stroke={C.success} strokeDasharray="4 4"
                                 label={{ value: "meta 90%", position: "insideTopRight", fontSize: 10, fill: C.success }} />
                  <Area type="monotone" dataKey="pmCompliancePct" name="Cumplimiento"
                        stroke={C.brand} strokeWidth={2} fill="url(#pmFill)" dot={{ r: 3 }} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin preventivos vencidos en el período." />}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <Card fixed>
          <CardHeader title="Preventivo vs correctivo" />
          <ChartValue
            value={fmtPct(fleet.preventiveSharePct, 0)}
            tone={fleet.preventiveSharePct == null ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {series.some(p => p.failures || p.preventives) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ left: -10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="preventives" name="Preventivas" stackId="a" fill={C.success} />
                  <Bar dataKey="failures" name="Correctivas" stackId="a" fill={C.danger} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin mantenciones completadas en el período." />}
          </div>
        </Card>

        {/* MTBF and MTTR share one chart on purpose: they are read together.
            The healthy pattern is MTBF rising while MTTR stays flat or falls —
            failing less often, and recovering faster when it does. Separate
            charts hide that relationship. Two axes because the units differ by
            orders of magnitude (days between failures vs hours to repair). */}
        <Card fixed>
          <CardHeader title="MTBF y MTTR" />
          <ChartValue
            value={fleet.mtbfHours == null ? SIN_DATOS : `${fmtHours(fleet.mtbfHours)} / ${fmtHours(fleet.mttrHours)}`}
            tone={fleet.mtbfHours == null ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {series.some(p => p.mtbfDays != null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="mtbf" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="mttr" orientation="right" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [
                      v == null ? "Sin datos" : `${Number(v)} ${name === "MTBF" ? "días" : "h"}`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Line yAxisId="mtbf" type="monotone" dataKey="mtbfDays" name="MTBF"
                        stroke={C.brand} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="mttr" type="monotone" dataKey="mttrHours" name="MTTR"
                        stroke={C.text2} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Se necesita al menos una falla registrada para calcular la tendencia." />}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <Card fixed>
          <CardHeader title="Tiempo detenido" />
          <ChartValue
            value={noFailures ? SIN_DATOS : fmtHours(fleet.repairHours)}
            tone={noFailures ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {noFailures ? <EmptyChart text="Sin fallas registradas en el período." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ left: -10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                           formatter={(v) => [`${Number(v ?? 0)} h`, "Detenido"]} />
                  <Bar dataKey="downtimeHours" name="Horas" radius={[4, 4, 0, 0]}>
                    {series.map(p => (
                      <Cell key={p.key} fill={p.downtimeHours >= 6 ? C.danger : C.warning} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card fixed>
          <CardHeader title="Activos por criticidad" />
          <ChartValue
            value={String(filteredAssets.filter(a => a.criticidad === "critico").length)}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {critSplit.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={critSplit} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={2}>
                    {critSplit.map(s => <Cell key={s.key} fill={CRIT_FILL[s.key]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin activos que coincidan con el filtro." />}
          </div>
        </Card>
      </div>

      {/* Worst offenders — the actionable table */}
      <Card style={{ marginTop: 14 }}>
        <CardHeader title="Activos con más fallas" />
        {ranked.length === 0 ? (
          <div style={{ padding: 28, color: C.text3, fontSize: 13, textAlign: "center" }}>
            Sin fallas registradas en el período para los activos filtrados.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-hover)" }}>
                  {["Activo", "Criticidad", "Fallas", "MTBF", "MTTR", "Detenido", "Disponibilidad"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: i === 0 || i === 1 ? "left" : "right", fontWeight: 700, color: C.text3, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ asset, m }) => (
                  <tr key={asset.id}
                      onClick={() => router.push(`/activos?id=${encodeURIComponent(asset.id)}`)}
                      style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <td style={{ padding: "10px 14px", color: C.text1, fontWeight: 600 }}>{asset.nombre}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                        background: asset.criticidad === "critico" ? C.dangerBg : asset.criticidad === "semi_critico" ? C.warningBg : C.successBg,
                        color: CRIT_FILL[asset.criticidad ?? "no_critico"] }}>
                        {CRIT_LABEL[asset.criticidad ?? "no_critico"]}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text1 }}>{m.failures}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text2 }}>{fmtHours(m.mtbfHours)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text2 }}>{fmtHours(m.mttrHours)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text2 }}>{m.repairHours.toFixed(1)} h</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700,
                      color: m.availabilityPct == null ? C.text3 : m.availabilityPct >= 99 ? C.success : m.availabilityPct >= 95 ? C.warning : C.danger }}>
                      {fmtPct(m.availabilityPct, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px", textAlign: "center", color: C.text3, fontSize: 13 }}>
      {text}
    </div>
  );
}
