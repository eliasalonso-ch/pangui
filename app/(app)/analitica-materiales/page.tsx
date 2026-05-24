"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Cell,
} from "recharts";
import {
  Package, AlertTriangle, TrendingUp, Star,
  ArrowUpRight, Boxes, Zap, LayoutGrid, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";

const C = {
  brand: "var(--brand)",        mid: "var(--brand)",          light: "var(--brand-tint)",
  success: "var(--success)",    successBg: "var(--success-bg)",
  warning: "var(--warning)",    warningBg: "var(--st-wait-bg)",
  danger: "var(--danger)",      dangerBg: "var(--danger-bg)",
  info: "var(--brand)",         infoBg: "var(--brand-tint)",
  purple: "var(--brand)",       purpleBg: "var(--brand-tint)",
  text1: "var(--fg-1)", text2: "var(--fg-2)", text3: "var(--fg-4)",
  border: "var(--border)", bg: "var(--surface-0)", surface: "var(--surface-1)",
};

// ── DB row shapes ─────────────────────────────────────────────────────────────
interface ParteRow {
  id: string;
  nombre: string;
  codigo: string | null;
  unidad: string | null;
  stock_actual: number;
  stock_minimo: number;
  precio_unitario: number | null;
  categoria: string | null;
  ubicacion_bodega: string | null;
}

interface HojaRow {
  id: string;
  nombre: string;
  orden_id: string;
  columnas: Array<{ id: string; label: string; tipo: string }>;
}

interface HojaFilaRow {
  id: string;
  hoja_id: string;
  celdas: Record<string, string>;
}

interface OTRow {
  id: string;
  titulo: string | null;
  created_at: string;
  activo_id: string | null;
  activos: { nombre: string } | null;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text1 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Icon size={15} color={C.mid} />
      <span style={{ fontSize: 11, fontWeight: 700, color: C.text2, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = C.mid }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string;
}) {
  return (
    <Card style={{ padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text1, lineHeight: 1 }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: C.text2, marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--surface-hover)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </Card>
  );
}

function AbcBadge({ cls }: { cls: "A" | "B" | "C" }) {
  const map = {
    A: { bg: C.dangerBg, color: C.danger, label: "A" },
    B: { bg: C.warningBg, color: C.warning, label: "B" },
    C: { bg: C.bg, color: C.text3, label: "C" },
  };
  const s = map[cls];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function StockBadge({ actual, minimo }: { actual: number; minimo: number }) {
  if (actual <= 0) return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: C.dangerBg, color: C.danger }}>Sin stock</span>;
  if (actual <= minimo) return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: C.warningBg, color: C.warning }}>Bajo mínimo</span>;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: C.successBg, color: C.success }}>OK</span>;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnaliticaMaterialesPage() {
  const suscripcion = useSuscripcion();
  if (suscripcion.loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", color: "var(--fg-4)" }}><Loader2 size={18} className="animate-spin" /></div>;
  }
  if (suscripcion.data && suscripcion.data.plan_features && !suscripcion.data.plan_features.analytics_pro) {
    return (
      <UpgradePrompt
        variant="card"
        title="Analítica de materiales está en Pro"
        description="Sube tu plan para acceder al análisis avanzado de consumo de materiales y partes."
        upgradeTo="Pro"
      />
    );
  }
  return <AnaliticaMaterialesPageInner />;
}

function AnaliticaMaterialesPageInner() {
  const [loading, setLoading] = useState(true);
  const [partes, setPartes] = useState<ParteRow[]>([]);
  const [hojas, setHojas] = useState<HojaRow[]>([]);
  const [hojaFilas, setHojaFilas] = useState<HojaFilaRow[]>([]);
  const [ots, setOTs] = useState<OTRow[]>([]);
  const [rangeMonths, setRangeMonths] = useState(3);

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: perfil } = await sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
      const wsId = perfil?.workspace_id;
      if (!wsId) { setLoading(false); return; }

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 12);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const [partesRes, hojasRes, otsRes] = await Promise.all([
        sb.from("partes").select("id, nombre, codigo, unidad, stock_actual, stock_minimo, precio_unitario, categoria, ubicacion_bodega").eq("workspace_id", wsId),
        sb.from("hojas_inventario").select("id, nombre, orden_id, columnas").eq("workspace_id", wsId).gte("created_at", cutoffStr),
        sb.from("ordenes_trabajo")
          .select("id, titulo, created_at, activo_id, activos(nombre)")
          .eq("workspace_id", wsId)
          .gte("created_at", cutoffStr)
          .limit(2000),
      ]);

      const normalizeJoin = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? (v[0] ?? null) : v;

      const hojasData = (hojasRes.data ?? []) as HojaRow[];
      setPartes((partesRes.data ?? []) as ParteRow[]);
      setHojas(hojasData);
      setOTs(((otsRes.data ?? []) as any[]).map(o => ({ ...o, activos: normalizeJoin(o.activos) as any })));

      if (hojasData.length > 0) {
        const hojaIds = hojasData.map(h => h.id);
        const { data: filasData } = await sb
          .from("hojas_inventario_filas")
          .select("id, hoja_id, celdas")
          .in("hoja_id", hojaIds);
        setHojaFilas((filasData ?? []) as HojaFilaRow[]);
      }

      setLoading(false);
    }
    load();
  }, []);

  // ── Date cutoff ───────────────────────────────────────────────────────────
  const cutoffDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - rangeMonths);
    return d.toISOString().slice(0, 10);
  }, [rangeMonths]);


  // ── Aggregate all items from hojas (the only data source) ───────────────
  const hojaConsumoMap = useMemo(() => {
    const map = new Map<string, { cantidad: number; frecuencia: number; otIds: Set<string>; unidad: string }>();
    for (const hoja of hojas) {
      const hojaOt = ots.find(o => o.id === hoja.orden_id);
      if (!hojaOt) continue;
      if (hojaOt.created_at.slice(0, 10) < cutoffDate) continue;
      const itemCol = hoja.columnas.find(c =>
        c.label.toLowerCase().includes("ítem") || c.label.toLowerCase().includes("item") ||
        c.label.toLowerCase().includes("material") || c.label.toLowerCase().includes("nombre")
      );
      const cantCol = hoja.columnas.find(c =>
        c.label.toLowerCase().includes("cantidad") || c.label.toLowerCase().includes("cant")
      );
      const unidCol = hoja.columnas.find(c =>
        c.label.toLowerCase().includes("unidad") || c.label.toLowerCase().includes("un")
      );
      if (!itemCol) continue;
      const filas = hojaFilas.filter(f => f.hoja_id === hoja.id);
      for (const fila of filas) {
        const nombre = fila.celdas[itemCol.id]?.trim();
        if (!nombre) continue;
        const rawQty = cantCol ? parseFloat(fila.celdas[cantCol.id] ?? "1") : 1;
        const qty = isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty;
        const unidad = unidCol ? (fila.celdas[unidCol.id]?.trim() ?? "") : "";
        const prev = map.get(nombre) ?? { cantidad: 0, frecuencia: 0, otIds: new Set<string>(), unidad };
        prev.cantidad += qty;
        if (hoja.orden_id && !prev.otIds.has(hoja.orden_id)) {
          prev.frecuencia += 1;
          prev.otIds.add(hoja.orden_id);
        }
        map.set(nombre, prev);
      }
    }
    return map;
  }, [hojas, hojaFilas, ots, cutoffDate]);

  // ── Flat sorted list ──────────────────────────────────────────────────────
  const allItems = useMemo(() =>
    Array.from(hojaConsumoMap.entries())
      .map(([nombre, v]) => ({ nombre, cantidad: v.cantidad, frecuencia: v.frecuencia, otIds: v.otIds, unidad: v.unidad, source: "hoja" as const }))
      .sort((a, b) => b.cantidad - a.cantidad),
  [hojaConsumoMap]);

  // ── ABC classification ────────────────────────────────────────────────────
  const abcItems = useMemo(() => {
    const total = allItems.reduce((s, i) => s + i.cantidad, 0);
    if (total === 0) return allItems.map(i => ({ ...i, abc: "C" as const, pct: 0, cumPct: 0 }));
    let cum = 0;
    return allItems.map(item => {
      const pct = (item.cantidad / total) * 100;
      cum += pct;
      const abc: "A" | "B" | "C" = cum - pct < 80 ? (cum - pct < 50 ? "A" : "B") : "C";
      return { ...item, abc, pct, cumPct: cum };
    });
  }, [allItems]);

  // ── Stock alerts from catalog ─────────────────────────────────────────────
  const stockAlerts = useMemo(() =>
    partes
      .filter(p => p.stock_actual <= p.stock_minimo)
      .sort((a, b) => (a.stock_actual / Math.max(a.stock_minimo, 1)) - (b.stock_actual / Math.max(b.stock_minimo, 1))),
  [partes]);

  // ── Monthly consumption trend (top 5 materials by qty) ───────────────────
  const top5Names = useMemo(() => abcItems.slice(0, 5).map(i => i.nombre), [abcItems]);

  const trendData = useMemo(() => {
    const months: Record<string, Record<string, number>> = {};
    for (const hoja of hojas) {
      const ot = ots.find(o => o.id === hoja.orden_id);
      if (!ot || ot.created_at.slice(0, 10) < cutoffDate) continue;
      const key = ot.created_at.slice(0, 7);
      const itemCol = hoja.columnas.find(c =>
        c.label.toLowerCase().includes("ítem") || c.label.toLowerCase().includes("item") ||
        c.label.toLowerCase().includes("material") || c.label.toLowerCase().includes("nombre")
      );
      const cantCol = hoja.columnas.find(c =>
        c.label.toLowerCase().includes("cantidad") || c.label.toLowerCase().includes("cant")
      );
      if (!itemCol) continue;
      for (const fila of hojaFilas.filter(f => f.hoja_id === hoja.id)) {
        const nombre = fila.celdas[itemCol.id]?.trim();
        if (!nombre || !top5Names.includes(nombre)) continue;
        const rawQty = cantCol ? parseFloat(fila.celdas[cantCol.id] ?? "1") : 1;
        const qty = isNaN(rawQty) ? 1 : rawQty;
        if (!months[key]) months[key] = {};
        months[key][nombre] = (months[key][nombre] ?? 0) + qty;
      }
    }
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        label: new Date(month + "-01").toLocaleDateString("es-CL", { month: "short", year: "2-digit" }),
        ...vals,
      }));
  }, [hojas, hojaFilas, ots, cutoffDate, top5Names]);

  // ── Per-material OT usage list ────────────────────────────────────────────
  const [selectedMaterial, setSelectedMaterial] = useState<string | null>(null);

  const materialOTs = useMemo(() => {
    if (!selectedMaterial) return [];
    const entry = hojaConsumoMap.get(selectedMaterial);
    if (!entry) return [];
    return Array.from(entry.otIds).map(otId => {
      const ot = ots.find(o => o.id === otId);
      // Sum qty for this material across all hojas belonging to this OT
      let qty = 0;
      for (const hoja of hojas.filter(h => h.orden_id === otId)) {
        const itemCol = hoja.columnas.find(c =>
          c.label.toLowerCase().includes("ítem") || c.label.toLowerCase().includes("item") ||
          c.label.toLowerCase().includes("material") || c.label.toLowerCase().includes("nombre")
        );
        const cantCol = hoja.columnas.find(c =>
          c.label.toLowerCase().includes("cantidad") || c.label.toLowerCase().includes("cant")
        );
        if (!itemCol) continue;
        for (const fila of hojaFilas.filter(f => f.hoja_id === hoja.id)) {
          if (fila.celdas[itemCol.id]?.trim() === selectedMaterial) {
            const rawQty = cantCol ? parseFloat(fila.celdas[cantCol.id] ?? "1") : 1;
            qty += isNaN(rawQty) ? 1 : rawQty;
          }
        }
      }
      return {
        id: otId,
        titulo: ot?.titulo ?? "Sin título",
        activo: ot?.activos?.nombre ?? null,
        created_at: ot?.created_at ?? "",
        qty,
      };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [selectedMaterial, hojaConsumoMap, hojas, hojaFilas, ots]);

  // ── Layout recommendation: fast movers (high freq + high qty) ────────────
  const layoutRec = useMemo(() => {
    const scored = abcItems.map(i => ({
      ...i,
      score: i.cantidad * 0.4 + i.frecuencia * 0.6,
    })).sort((a, b) => b.score - a.score);
    return {
      zona1: scored.slice(0, 3),   // Zona A — acceso inmediato
      zona2: scored.slice(3, 8),   // Zona B — acceso frecuente
      zona3: scored.slice(8, 15),  // Zona C — acceso normal
    };
  }, [abcItems]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalUnits = allItems.reduce((s, i) => s + i.cantidad, 0);
  const uniqueItems = allItems.length;
  const otsWithMats = new Set(allItems.flatMap(i => Array.from(i.otIds))).size;
  const hojaItems = hojaFilas.length;

  const TREND_COLORS = [C.mid, C.success, C.warning, C.danger, C.purple];

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ fontSize: 14, color: C.text3 }}>Cargando datos…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, padding: "24px 28px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text1, margin: 0 }}>Analítica de Materiales</h1>
          <p style={{ fontSize: 13, color: C.text3, margin: "4px 0 0" }}>Control de inventario, ABC y recomendaciones de layout</p>
        </div>
        <select
          value={rangeMonths}
          onChange={e => setRangeMonths(Number(e.target.value))}
          style={{ fontSize: 13, padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.text1, cursor: "pointer" }}
        >
          <option value={1}>Último mes</option>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Último año</option>
        </select>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <StatCard label="Materiales únicos" value={uniqueItems || "—"} sub="En OTs del período" icon={Package} color={C.mid} />
        <StatCard label="Unidades consumidas" value={totalUnits > 0 ? totalUnits : "—"} sub="Desde orden de trabajo" icon={Boxes} color={C.success} />
        <StatCard label="OTs con materiales" value={otsWithMats || "—"} sub={`De ${ots.length} OTs totales`} icon={TrendingUp} color={C.warning} />
        <StatCard label="Items en hojas" value={hojaItems > 0 ? Math.round(hojaItems) : "—"} sub="Desde planillas adjuntas" icon={ArrowUpRight} color={C.purple} />
      </div>

      {/* Stock alerts */}
      {stockAlerts.length > 0 && (
        <>
          <SectionLabel icon={AlertTriangle} label={`Alertas de stock — ${stockAlerts.length} material${stockAlerts.length > 1 ? "es" : ""} bajo mínimo`} />
          <Card style={{ marginBottom: 28 }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Material", "Código", "Categoría", "Stock actual", "Stock mínimo", "Estado", "Bodega"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stockAlerts.map(p => (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: p.stock_actual <= 0 ? C.dangerBg : C.warningBg }}>
                      <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 600, color: C.text1 }}>{p.nombre}</td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: C.text3, fontFamily: "monospace" }}>{p.codigo ?? "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: C.text2 }}>{p.categoria ?? "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: p.stock_actual <= 0 ? C.danger : C.warning }}>{p.stock_actual} {p.unidad ?? ""}</td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: C.text2 }}>{p.stock_minimo} {p.unidad ?? ""}</td>
                      <td style={{ padding: "11px 16px" }}><StockBadge actual={p.stock_actual} minimo={p.stock_minimo} /></td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: C.text2 }}>{p.ubicacion_bodega ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ABC Analysis */}
      <SectionLabel icon={Star} label="Análisis ABC — Clasificación de materiales" />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 28 }}>
        <Card>
          <CardHeader title="Top materiales por consumo" subtitle="Clasificación ABC: A = crítico (50% vol), B = importante, C = resto" />
          {abcItems.length === 0 ? (
            <div style={{ padding: 20 }}><p style={{ fontSize: 13, color: C.text3, margin: 0 }}>Sin consumo registrado en el período</p></div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Clase", "Material", "Cantidad", "Frecuencia", "% del total", "Fuente"].map(h => (
                      <th key={h} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {abcItems.slice(0, 20).map((item, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px 14px" }}><AbcBadge cls={item.abc} /></td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500, color: C.text1, maxWidth: 200 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.nombre}</div>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: C.text1 }}>{item.cantidad.toFixed(item.cantidad % 1 === 0 ? 0 : 1)}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: C.text2 }}>{item.frecuencia} OT{item.frecuencia !== 1 ? "s" : ""}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.bg, overflow: "hidden", minWidth: 60 }}>
                            <div style={{ height: "100%", width: `${Math.min(item.pct * 2, 100)}%`, background: item.abc === "A" ? C.danger : item.abc === "B" ? C.warning : C.text3, borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 11, color: C.text2, minWidth: 36 }}>{item.pct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 5, background: C.infoBg, color: C.info }}>
                          Planilla
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ABC summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(["A", "B", "C"] as const).map(cls => {
            const items = abcItems.filter(i => i.abc === cls);
            const qty = items.reduce((s, i) => s + i.cantidad, 0);
            const totalQty = abcItems.reduce((s, i) => s + i.cantidad, 0);
            const pct = totalQty > 0 ? Math.round((qty / totalQty) * 100) : 0;
            const desc = cls === "A"
              ? "Críticos — siempre en stock, acceso inmediato"
              : cls === "B"
              ? "Importantes — stock de seguridad moderado"
              : "Cola larga — stock mínimo suficiente";
            const color = cls === "A" ? C.danger : cls === "B" ? C.warning : C.text3;
            return (
              <Card key={cls} style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <AbcBadge cls={cls} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text1 }}>{items.length} material{items.length !== 1 ? "es" : ""}</span>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color }}>{pct}% del vol.</span>
                </div>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>{desc}</div>
                <div style={{ fontSize: 11, color: C.text2 }}>
                  {items.slice(0, 3).map(i => i.nombre.length > 22 ? i.nombre.slice(0, 20) + "…" : i.nombre).join(", ")}
                  {items.length > 3 && ` +${items.length - 3} más`}
                </div>
              </Card>
            );
          })}

          <Card style={{ padding: "14px 16px", background: C.infoBg, border: `1px solid ${C.info}30` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.info, marginBottom: 6 }}>Regla 80/20</div>
            <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
              Los materiales clase A representan el mayor volumen de consumo. Priorizá su reposición y ubicación en zona de fácil acceso.
            </div>
          </Card>
        </div>
      </div>

      {/* OT usage per material */}
      {abcItems.length > 0 && (
        <>
          <SectionLabel icon={Package} label="OTs donde se usó cada material" />
          <Card style={{ marginBottom: 28 }}>
            <CardHeader title="Trazabilidad por material" subtitle="Seleccioná un material para ver en qué OTs fue utilizado" />
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: 320 }}>
              {/* Material list */}
              <div style={{ borderRight: `1px solid ${C.border}`, overflowY: "auto", maxHeight: 480 }}>
                {abcItems.slice(0, 30).map((item, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedMaterial(selectedMaterial === item.nombre ? null : item.nombre)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px",
                      cursor: "pointer",
                      background: selectedMaterial === item.nombre ? C.light : "transparent",
                      border: "none", borderBottom: `1px solid ${C.border}`,
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    <AbcBadge cls={item.abc} />
                    <span style={{ fontSize: 12, fontWeight: selectedMaterial === item.nombre ? 600 : 400, color: selectedMaterial === item.nombre ? C.mid : C.text1, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.nombre}
                    </span>
                    <span style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>{item.frecuencia}x</span>
                  </button>
                ))}
              </div>

              {/* OT list */}
              <div style={{ overflowY: "auto", maxHeight: 480 }}>
                {!selectedMaterial ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: C.text3, padding: 32 }}>
                    <Package size={32} color={C.text3} />
                    <span style={{ fontSize: 13 }}>Seleccioná un material de la izquierda</span>
                  </div>
                ) : materialOTs.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: C.text3, padding: 32 }}>
                    <span style={{ fontSize: 13 }}>No hay OTs registradas para este material en el período</span>
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        {["OT", "Activo", "Cantidad usada", "Fecha"].map(h => (
                          <th key={h} style={{ padding: "9px 16px", fontSize: 11, fontWeight: 600, color: C.text3, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {materialOTs.map(ot => (
                        <tr key={ot.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 500, color: C.text1, maxWidth: 260 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ot.titulo}</div>
                          </td>
                          <td style={{ padding: "11px 16px", fontSize: 12, color: C.text2 }}>{ot.activo ?? "—"}</td>
                          <td style={{ padding: "11px 16px", fontSize: 13, fontWeight: 700, color: C.mid }}>{ot.qty}</td>
                          <td style={{ padding: "11px 16px", fontSize: 12, color: C.text3 }}>
                            {ot.created_at ? new Date(ot.created_at).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Consumption trend */}
      {trendData.length > 1 && top5Names.length > 0 && (
        <>
          <SectionLabel icon={TrendingUp} label="Tendencia de consumo mensual — Top 5 materiales" />
          <Card style={{ marginBottom: 28 }}>
            <CardHeader title="Evolución mensual por material" subtitle="Unidades consumidas por mes en órdenes de trabajo" />
            <div style={{ padding: "16px 8px" }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.text3 }} />
                  <YAxis tick={{ fontSize: 11, fill: C.text3 }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {top5Names.map((name, i) => (
                    <Line key={name} type="monotone" dataKey={name} stroke={TREND_COLORS[i]} strokeWidth={2} dot={false} name={name.length > 18 ? name.slice(0, 16) + "…" : name} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {/* Hoja aggregation */}
      {hojaConsumoMap.size > 0 && (
        <>
          <SectionLabel icon={Package} label="Items registrados en planillas" />
          <Card style={{ marginBottom: 28 }}>
            <CardHeader title="Materiales extraídos de hojas de trabajo" subtitle="Agregado de columnas Ítem/Cantidad de todas las planillas adjuntas a OTs" />
            <div style={{ padding: "16px 8px" }}>
              <ResponsiveContainer width="100%" height={Math.max(180, Math.min(hojaConsumoMap.size, 12) * 32)}>
                <BarChart
                  data={Array.from(hojaConsumoMap.entries()).sort((a, b) => b[1].cantidad - a[1].cantidad).slice(0, 12).map(([nombre, v]) => ({ name: nombre.length > 24 ? nombre.slice(0, 22) + "…" : nombre, cantidad: Math.round(v.cantidad * 10) / 10 }))}
                  layout="vertical"
                  margin={{ left: 10, right: 36 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: C.text3 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.text2 }} width={140} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={v => [`${v}`, "Cantidad"]} />
                  <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} name="Cantidad" fill={C.info}>
                    {Array.from(hojaConsumoMap.keys()).slice(0, 12).map((_, i) => <Cell key={i} fill={i === 0 ? C.mid : i < 3 ? C.info : C.text3} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}

      {/* Layout recommendations */}
      {allItems.length > 0 && (
        <>
          <SectionLabel icon={LayoutGrid} label="Recomendación de layout de bodega" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
            {[
              { zona: "Zona A — Acceso Inmediato", items: layoutRec.zona1, color: C.danger, desc: "Colocar a ≤2 pasos del área de trabajo. Reponer con urgencia." },
              { zona: "Zona B — Acceso Frecuente", items: layoutRec.zona2, color: C.warning, desc: "Estantería próxima. Revisar stock semanalmente." },
              { zona: "Zona C — Acceso Normal",   items: layoutRec.zona3, color: C.text3,  desc: "Almacén estándar. Control mensual suficiente." },
            ].map(({ zona, items, color, desc }) => (
              <Card key={zona} style={{ padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text1 }}>{zona}</span>
                </div>
                <p style={{ fontSize: 11, color: C.text3, margin: "0 0 12px", lineHeight: 1.4 }}>{desc}</p>
                {items.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.text3, margin: 0 }}>Sin datos suficientes</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: 6, background: C.bg, border: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 12, color: C.text1, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                          {item.nombre.length > 22 ? item.nombre.slice(0, 20) + "…" : item.nombre}
                        </span>
                        <span style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>{item.frecuencia}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card style={{ marginBottom: 28, padding: "14px 20px", background: `linear-gradient(135deg, ${C.light}, ${C.surface})`, border: `1px solid ${C.mid}30` }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <Zap size={16} color={C.mid} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text1, marginBottom: 4 }}>Recomendación de inventario</div>
                <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.6 }}>
                  {layoutRec.zona1.length > 0
                    ? `Mantén stock de seguridad de al menos 2 semanas para: ${layoutRec.zona1.map(i => i.nombre).join(", ")}. Estos materiales se usan con más frecuencia y su falta frena las OTs.`
                    : "Registrá consumo de materiales en las OTs para obtener recomendaciones personalizadas."}
                  {stockAlerts.length > 0 && ` Hay ${stockAlerts.length} material${stockAlerts.length > 1 ? "es" : ""} bajo stock mínimo que requieren reposición inmediata.`}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {allItems.length === 0 && !loading && (
        <Card style={{ padding: "48px 24px", textAlign: "center" }}>
          <Package size={40} color={C.text3} style={{ margin: "0 auto 12px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text2, marginBottom: 6 }}>Sin datos de materiales</div>
          <div style={{ fontSize: 13, color: C.text3 }}>Registrá materiales en las OTs o adjuntá planillas con columnas Ítem y Cantidad para ver el análisis.</div>
        </Card>
      )}

    </div>
  );
}
