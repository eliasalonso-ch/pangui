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
  Activity, AlertTriangle, Building2, Check, MapPin, Package, User, Wrench,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { esAdmin } from "@/lib/roles";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { computeActivoMetrics, buildMonthlySeries } from "@/lib/activo-metrics";
import {
  construirSerieDisponibilidad, resumirDisponibilidad, resumirPorActivo,
} from "@/lib/activo-disponibilidad";
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

/** Etiquetas cortas de mes, en el mismo orden que usa el resto de la analítica. */
const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun",
                  "jul", "ago", "sep", "oct", "nov", "dic"];

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
  sociedad_id: string | null;
  responsable_id: string | null;
  /** Costo de una hora detenido. `null` = no informado. */
  costo_hora_parada: number | null;
  ubicacion: { id: string; edificio: string } | null;
  modelo: { id: string; nombre: string } | null;
  sociedad: { id: string; nombre: string } | null;
  responsable: { id: string; nombre: string } | null;
}

interface OTRow extends ActivoOTHistoryRow {
  activo_id: string | null;
}

/** Un intervalo de estado de un activo. `fin` null = el estado vigente. */
interface PeriodoRow {
  activo_id: string;
  estado: string;
  tipo_inactividad: "planeado" | "sin_planear" | null;
  inicio: string;
  fin: string | null;
  motivo_id: string | null;
  motivo: { id: string; nombre: string } | null;
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
        <div style={{ fontSize: 14, fontWeight: 400, color: C.text1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 14, color: C.text3, marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

/** Big number + caption shown above a chart, inside the same card. */
function ChartValue({ value, tone = C.text1 }: { value: string; tone?: string }) {
  return (
    <div style={{ padding: "12px 18px 4px" }}>
      <div style={{ fontSize: 14, fontWeight: 400, color: tone, lineHeight: 1.1 }}>{value}</div>
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
          fontSize: 14, fontWeight: 400,
          cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", color: "var(--brand)" }}><Icon size={15} /></span>
        {label}
        {active && (
          <span style={{ fontSize: 14, fontWeight: 400, background: "var(--brand)", color: "var(--fg-on-brand)", borderRadius: "50%", width: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>1</span>
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
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)", letterSpacing: "0.01em" }}>{label}</span>
            {active && (
              <button
                type="button"
                onClick={() => { onChange("all"); setOpen(false); }}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 400, color: "var(--brand)", fontFamily: "inherit" }}
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
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: "var(--fg-1)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
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
  fontSize: 14,
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
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([]);
  /**
   * "Ahora", fijado una sola vez al montar.
   *
   * Los períodos abiertos se cuentan hasta este instante. Leer el reloj dentro
   * del cálculo haría que las barras cambiaran solas en cada re-render.
   *
   * Va en `useState` con inicializador perezoso y no en `useRef`: el valor se
   * calcula una vez, fuera del render, y después es un dato común y corriente.
   * Con `useRef` habría que leer `.current` en pleno render, que es
   * justamente lo que no se debe hacer.
   */
  const [ahoraMs] = useState(() => Date.now());
  const [rangeMonths, setRangeMonths] = useState(12);

  const [critFilter, setCritFilter] = useState("all");
  const [modeloFilter, setModeloFilter] = useState("all");
  const [activoFilter, setActivoFilter] = useState("all");
  const [ubicFilter, setUbicFilter] = useState("all");
  const [sociedadFilter, setSociedadFilter] = useState("all");
  const [responsableFilter, setResponsableFilter] = useState("all");

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

      const [activosRes, otsRes, periodosRes] = await Promise.all([
        sb.from("activos")
          .select(`id, nombre, criticidad, estado, ubicacion_id, modelo_id,
                   sociedad_id, responsable_id, costo_hora_parada,
                   ubicacion:ubicaciones(id, edificio), modelo:modelos(id, nombre),
                   sociedad:sociedades(id, nombre),
                   responsable:usuarios!responsable_id(id, nombre)`)
          .eq("workspace_id", wsId)
          .eq("activo", true)
          .order("nombre"),
        sb.from("ordenes_trabajo")
          .select(`id, activo_id, estado, tipo_trabajo, fecha_termino, iniciado_at,
                   completado_en, tiempo_total_segundos, costo_total`)
          .eq("workspace_id", wsId)
          .is("deleted_at", null)
          .not("activo_id", "is", null),
        /**
         * Períodos de estado: la fuente del corte planificado vs no
         * planificado.
         *
         * El resto de la página mide desde las OTs, que solo conocen el tiempo
         * de reparación. Estos períodos miden la parada REAL —incluida la
         * espera de repuesto o de técnico— y además distinguen si fue
         * programada. Es la misma fuente que usan las herramientas del rubro
         * para disponibilidad y downtime.
         */
        sb.from("activo_estado_periodos")
          .select("activo_id, estado, tipo_inactividad, inicio, fin, motivo_id, motivo:motivos_inactividad(id, nombre)")
          .eq("workspace_id", wsId)
          .gte("inicio", new Date(Date.now() - 400 * 86_400_000).toISOString())
          .order("inicio"),
      ]);

      setAssets((activosRes.data ?? []) as unknown as AssetRow[]);
      setOTs((otsRes.data ?? []) as unknown as OTRow[]);
      setPeriodos((periodosRes.data ?? []) as unknown as PeriodoRow[]);
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

  /**
   * Cliente y responsable salen de los activos cargados, no de las tablas
   * completas: ofrecer un cliente que no tiene ningún activo deja al usuario
   * con un filtro que siempre devuelve vacío.
   *
   * El embed de PostgREST puede llegar como objeto o como arreglo, de ahí el
   * normalizado.
   */
  const sociedadOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) {
      const s = Array.isArray(a.sociedad) ? a.sociedad[0] : a.sociedad;
      if (s?.id) m.set(s.id, s.nombre);
    }
    return [...m].map(([value, label]) => ({ value, label }));
  }, [assets]);

  const responsableOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assets) {
      const r = Array.isArray(a.responsable) ? a.responsable[0] : a.responsable;
      if (r?.id) m.set(r.id, r.nombre);
    }
    return [...m].map(([value, label]) => ({ value, label }));
  }, [assets]);

  const filteredAssets = useMemo(() => assets.filter(a => {
    if (critFilter !== "all" && (a.criticidad ?? "no_critico") !== critFilter) return false;
    if (modeloFilter !== "all" && a.modelo_id !== modeloFilter) return false;
    if (ubicFilter !== "all" && a.ubicacion_id !== ubicFilter) return false;
    if (activoFilter !== "all" && a.id !== activoFilter) return false;
    if (sociedadFilter !== "all" && a.sociedad_id !== sociedadFilter) return false;
    if (responsableFilter !== "all" && a.responsable_id !== responsableFilter) return false;
    return true;
  }), [assets, critFilter, modeloFilter, ubicFilter, activoFilter, sociedadFilter, responsableFilter]);

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

  /**
   * Disponibilidad, MTBF y MTTR desde el historial de estados.
   *
   * Antes salían de las OTs, y por eso este gráfico mostraba un solo punto al
   * filtrar por un activo: `availabilityPct` era null en todo mes sin una OT
   * correctiva cerrada, y el MTBF acumulado dibujaba una rampa recta en vez de
   * una tendencia. La parada real —la que le importa a producción— es la que
   * mide `activo_estado_periodos`, y es la misma fuente que usan las
   * herramientas del rubro para estas tres métricas.
   */
  const periodosScoped = useMemo(
    () => periodos.filter(p => assetIds.has(p.activo_id)),
    [periodos, assetIds],
  );
  const serieDisp = useMemo(
    () => construirSerieDisponibilidad(periodosScoped, Math.min(rangeMonths, 12), ahoraMs),
    [periodosScoped, rangeMonths, ahoraMs],
  );
  const resumenDisp = useMemo(() => resumirDisponibilidad(serieDisp), [serieDisp]);

  /**
   * Peores actores, ordenados por HORAS DE PARADA IMPREVISTA.
   *
   * No por cantidad de fallas: diez microparadas de cinco minutos molestan
   * menos que una sola detención de ocho horas, y el que decide dónde invertir
   * mira las horas perdidas. El costo sale de las OTs —es el único lado que lo
   * sabe—; el resto, del historial de estados.
   */
  const rankedDisp = useMemo(() => {
    const desdeMs = ahoraMs - windowDays * 86_400_000;
    const costoPorActivo = new Map<string, number>();
    for (const o of scopedOTs) {
      if (!o.activo_id || o.costo_total == null) continue;
      costoPorActivo.set(o.activo_id,
        (costoPorActivo.get(o.activo_id) ?? 0) + Number(o.costo_total));
    }
    return filteredAssets
      .map(a => ({
        asset: a,
        m: resumirPorActivo(periodosScoped, a.id, desdeMs, ahoraMs),
        costo: costoPorActivo.get(a.id) ?? null,
      }))
      .filter(r => r.m.fallas > 0 || r.m.imprevistaHoras > 0)
      .sort((a, b) => b.m.imprevistaHoras - a.m.imprevistaHoras || b.m.fallas - a.m.fallas)
      .slice(0, 10);
  }, [filteredAssets, periodosScoped, scopedOTs, windowDays, ahoraMs]);

  /**
   * Horas detenidas por mes, separando parada programada de avería.
   *
   * Se calcula desde `activo_estado_periodos` y no desde las OTs: una OT solo
   * sabe cuánto duró la reparación, mientras que el período mide la parada
   * real, incluida la espera de repuesto o de técnico. Es la diferencia entre
   * disponibilidad inherente y disponibilidad operacional.
   *
   * Cada período se RECORTA al mes que se está sumando. Sin el recorte, una
   * parada que cruza de un mes a otro se contaría entera en los dos.
   */
  const downtimeSplit = useMemo(() => {
    const meses: { key: string; label: string; planificada: number; imprevista: number }[] = [];
    const ahora = new Date(ahoraMs);
    const n = Math.min(rangeMonths, 12);

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      meses.push({ key, label: MESES_ES[d.getMonth()], planificada: 0, imprevista: 0 });
    }

    for (const p of periodos) {
      if (p.estado === "operativo" || p.estado === "baja") continue;
      if (!assetIds.has(p.activo_id)) continue;

      const desde = new Date(p.inicio).getTime();
      // Un período abierto se cuenta hasta "ahora", y ese "ahora" es el mismo
      // para toda la pantalla: leer el reloj acá adentro haría que el gráfico
      // cambiara solo porque React volvió a renderizar.
      const hasta = p.fin ? new Date(p.fin).getTime() : ahoraMs;

      for (const mes of meses) {
        const [y, m] = mes.key.split("-").map(Number);
        const iniMes = new Date(y, m - 1, 1).getTime();
        const finMes = new Date(y, m, 1).getTime();
        const solape = Math.min(hasta, finMes) - Math.max(desde, iniMes);
        if (solape <= 0) continue;
        const horas = solape / 3_600_000;
        if (p.tipo_inactividad === "planeado") mes.planificada += horas;
        else mes.imprevista += horas;
      }
    }

    return meses.map(m => ({
      ...m,
      planificada: Number(m.planificada.toFixed(2)),
      imprevista: Number(m.imprevista.toFixed(2)),
    }));
  }, [periodos, assetIds, rangeMonths, ahoraMs]);

  /**
   * Lo que costó la parada, en plata.
   *
   * Es la traducción que faltaba: un gráfico puede decir "47 horas detenido" y
   * nadie mueve un peso; "47 horas costaron $40 millones" es lo que se lleva a
   * una reunión de presupuesto.
   *
   * Cada activo aporta sus horas por SU tarifa —una línea completa no cuesta lo
   * mismo que un ventilador redundante—, así que se suma activo por activo y no
   * con un promedio. Los que no tienen tarifa cargada quedan fuera del monto y
   * se cuentan aparte: mejor decir "de 5 activos, 3 tienen tarifa" que dar una
   * cifra que parece completa y no lo es.
   */
  const costoParadas = useMemo(() => {
    const tarifa = new Map<string, number>();
    for (const a of filteredAssets) {
      if (a.costo_hora_parada != null) tarifa.set(a.id, Number(a.costo_hora_parada));
    }

    let imprevisto = 0, planificado = 0, horasSinTarifa = 0;
    const desdeMs = ahoraMs - windowDays * 86_400_000;

    /**
     * Una parada se cobra UNA vez, no una por activo.
     *
     * La jerarquía propaga la detención: si se quema el motor de la tornamesa,
     * quedan tres períodos con el mismo horario —motor, CRP-180 y Finger 269—
     * porque los tres estuvieron detenidos de verdad. Pero la plata perdida es
     * una sola: la línea paró una vez. Sumar activo por activo cobraba esa
     * parada tres veces y casi duplicaba el total ($38,7M contra $19,9M reales).
     *
     * Por eso los períodos que se solapan se agrupan en un evento y se cobran a
     * la tarifa MÁS ALTA de los activos involucrados: la del equipo de nivel
     * superior, que es el que realmente dejó de producir.
     */
    interface Evento { ini: number; fin: number; rate: number; planeado: boolean }
    const eventos: Evento[] = [];

    for (const p of periodosScoped) {
      if (p.estado === "operativo" || p.estado === "baja") continue;
      const ini = Math.max(new Date(p.inicio).getTime(), desdeMs);
      const fin = Math.min(p.fin ? new Date(p.fin).getTime() : ahoraMs, ahoraMs);
      if (fin <= ini) continue;

      const rate = tarifa.get(p.activo_id);
      if (rate == null) { horasSinTarifa += (fin - ini) / 3_600_000; continue; }
      const planeado = p.tipo_inactividad === "planeado";

      // Se funde con un evento que ya se solape y sea del mismo tipo; si no,
      // es una parada nueva.
      const previo = eventos.find(e =>
        e.planeado === planeado && ini < e.fin && fin > e.ini);
      if (previo) {
        previo.ini = Math.min(previo.ini, ini);
        previo.fin = Math.max(previo.fin, fin);
        previo.rate = Math.max(previo.rate, rate);
      } else {
        eventos.push({ ini, fin, rate, planeado });
      }
    }

    for (const e of eventos) {
      const monto = ((e.fin - e.ini) / 3_600_000) * e.rate;
      if (e.planeado) planificado += monto;
      else imprevisto += monto;
    }

    return {
      imprevisto, planificado, total: imprevisto + planificado,
      horasSinTarifa,
      conTarifa: tarifa.size,
      totalActivos: filteredAssets.length,
    };
  }, [filteredAssets, periodosScoped, windowDays, ahoraMs]);

  /** Totales del período, para el número grande de la tarjeta. */
  const downtimeTotales = useMemo(() => {
    const planificada = downtimeSplit.reduce((s, m) => s + m.planificada, 0);
    const imprevista = downtimeSplit.reduce((s, m) => s + m.imprevista, 0);
    const total = planificada + imprevista;
    return {
      planificada, imprevista, total,
      // Qué parte de la parada fue programada. Es la lectura directa de si el
      // plan preventivo está mandando o si el equipo manda a los mantenedores.
      planificadaPct: total > 0 ? (planificada / total) * 100 : null,
    };
  }, [downtimeSplit]);

  /**
   * Pareto de motivos de parada imprevista.
   *
   * Las barras van por CANTIDAD de eventos y no por horas: lo que se busca es
   * la causa que más veces detiene la línea, que es la que hay que atacar con
   * el plan preventivo. Una sola parada larguísima no es un patrón; cinco
   * paradas cortas por la misma razón sí.
   *
   * La línea acumulada es lo que convierte el gráfico en una decisión: dice qué
   * porcentaje del total se resuelve atacando las primeras N causas.
   */
  const paretoMotivos = useMemo(() => {
    const conteo = new Map<string, { motivo: string; eventos: number; horas: number }>();

    for (const p of periodos) {
      if (p.tipo_inactividad !== "sin_planear") continue;
      if (!assetIds.has(p.activo_id)) continue;

      // El embed de PostgREST puede llegar como objeto o como arreglo.
      const m = Array.isArray(p.motivo) ? p.motivo[0] : p.motivo;
      const nombre = m?.nombre ?? "Sin clasificar";
      const horas = ((p.fin ? new Date(p.fin).getTime() : ahoraMs)
                     - new Date(p.inicio).getTime()) / 3_600_000;

      const actual = conteo.get(nombre);
      if (actual) { actual.eventos++; actual.horas += horas; }
      else conteo.set(nombre, { motivo: nombre, eventos: 1, horas });
    }

    const filas = [...conteo.values()].sort((a, b) => b.eventos - a.eventos || b.horas - a.horas);
    const total = filas.reduce((s, f) => s + f.eventos, 0);

    return filas.map((f, i) => {
      // El acumulado se suma sobre las filas ya ordenadas hasta esta, en vez de
      // ir mutando un contador dentro del map: el callback deja de depender del
      // orden en que se lo llame.
      const acumulado = filas.slice(0, i + 1).reduce((s, x) => s + x.eventos, 0);
      return {
        motivo: f.motivo,
        eventos: f.eventos,
        horas: Number(f.horas.toFixed(1)),
        acumuladoPct: total > 0 ? Number(((acumulado / total) * 100).toFixed(1)) : 0,
      };
    });
  }, [periodos, assetIds, ahoraMs]);

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
    return <div style={{ padding: 40, color: C.text3, fontSize: 14 }}>Cargando analítica...</div>;
  }
  if (!workspaceId) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 14 }}>No se pudo cargar el workspace.</div>;
  }

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
        <FilterChip icon={Building2} label="Cliente" value={sociedadFilter} onChange={setSociedadFilter} options={sociedadOptions} />
        <FilterChip icon={User} label="Responsable" value={responsableFilter} onChange={setResponsableFilter} options={responsableOptions} />
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
            <span style={{ fontSize: 14, fontWeight: 400, color: C.text1 }}>Estado actual</span>
          </div>
          <span style={{ fontSize: 14, color: C.text3 }}>
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
            <div style={{ fontSize: 14, color: C.text2, minWidth: 0 }}>
              <span style={{ fontWeight: 400, color: C.text1 }}>{cell.label}</span>
              {cell.qualifier && (
                <span style={{ color: C.text3 }}> ({cell.qualifier})</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              {cell.dot && (
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: cell.dot, flexShrink: 0 }} />
              )}
              <span style={{
                fontSize: 14, fontWeight: 400, lineHeight: 1.1,
                color: cell.muted ? C.text3 : C.text1,
              }}>{cell.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Every chart card below is the same 460px Card `fixed` height. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <Card fixed>
          <CardHeader
            title="Disponibilidad en el tiempo"
            subtitle="Desde el historial de estados · la parada planificada también descuenta"
          />
          <ChartValue
            value={fmtPct(resumenDisp.disponibilidadPct, 2)}
            tone={resumenDisp.disponibilidadPct == null ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {serieDisp.some(p => p.disponibilidadPct != null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serieDisp} margin={{ left: -10, right: 46, top: 8 }}>
                  <defs>
                    <linearGradient id="availFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.success} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={C.success} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false}
                         domain={["dataMin - 1", 100]} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}
                           formatter={(v) => [v == null ? "Sin datos" : `${Number(v)}%`, "Disponibilidad"]} />
                  <Area type="monotone" dataKey="disponibilidadPct" name="Disponibilidad"
                        stroke={C.success} strokeWidth={2} fill="url(#availFill)"
                        dot={{ r: 3 }} connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin historial de estados en el período." />}
          </div>
        </Card>

        {/* Acá vivía "Cumplimiento de preventivos". Se quitó: con pocos
            preventivos vencidos en la ventana dibujaba una recta en 100%, que
            se lee como "programa perfecto" cuando en realidad significa "casi
            sin medir". El cálculo sigue en activo-metrics.ts (con sus tests),
            así que volver a mostrarlo es agregar la tarjeta de nuevo.

            Al sacarla, esta fila quedó con una sola tarjeta y media fila vacía.
            En vez de reordenar bloques a mano, las tarjetas de gráficos viven
            todas en UNA grilla de dos columnas: al agregar o quitar una, el
            resto se reacomoda sola y nunca queda un hueco. */}
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
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }} />
                  <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="preventives" name="Preventivas" stackId="a" fill={C.success} />
                  <Bar dataKey="failures" name="Correctivas" stackId="a" fill={C.danger} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin mantenciones completadas en el período." />}
          </div>
        </Card>

        {/* MTBF y MTTR comparten gráfico a propósito: se leen juntos. El patrón
            sano es MTBF subiendo mientras MTTR se mantiene plano o baja —fallar
            menos seguido y recuperarse más rápido cuando pasa—. En gráficos
            separados esa relación no se ve.
            Dos ejes en Y, los dos en horas: las unidades coinciden pero las
            magnitudes no —cientos de horas entre fallas contra unas pocas de
            reparación—, y con un eje compartido el MTTR queda aplastado contra
            el piso, que es justo la serie donde interesa ver la tendencia. */}
        <Card fixed>
          <CardHeader
            title="MTBF vs MTTR"
            subtitle="Horas, por mes · solo fallas imprevistas"
          />
          {/* En horas las dos, como el eje del gráfico. `fmtHours` pasa a días
              sobre 48 h, y el número grande decía "35.9 d" al lado de un eje
              rotulado 380: el mismo dato en dos unidades distintas. */}
          <ChartValue
            value={resumenDisp.mtbfHoras == null
              ? SIN_DATOS
              : `${Math.round(resumenDisp.mtbfHoras)} h entre fallas · ${resumenDisp.mttrHoras!.toFixed(1)} h para reparar`}
            tone={resumenDisp.mtbfHoras == null ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {serieDisp.some(p => p.mtbfHoras != null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={serieDisp} margin={{ left: -10, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  {/* Dos ejes, los dos en horas. Compartir uno solo aplasta el
                      MTTR contra el piso —cientos de horas entre fallas contra
                      unas pocas de reparación— y justo lo que hay que mirar es
                      si el MTTR baja mes a mes. Cada eje va del color de su
                      línea para saber cuál es cuál sin adivinar. */}
                  <YAxis yAxisId="mtbf" tick={{ fontSize: 14, fill: C.brand }} axisLine={false} tickLine={false}
                         tickFormatter={(v) => `${v} h`}
                         label={{ value: "MTBF", angle: -90, position: "insideLeft", fontSize: 14, fill: C.brand }} />
                  <YAxis yAxisId="mttr" orientation="right" tick={{ fontSize: 14, fill: C.danger }} axisLine={false} tickLine={false}
                         tickFormatter={(v) => `${v} h`}
                         label={{ value: "MTTR", angle: 90, position: "insideRight", fontSize: 14, fill: C.danger }} />
                  <Tooltip
                    contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}
                    formatter={(v, name) => [v == null ? "Sin datos" : `${Number(v)} h`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" iconSize={8} />
                  {/* Con un solo mes con fallas no hay segmento que dibujar
                      —Recharts necesita dos puntos—, así que el punto tiene que
                      verse solo. De ahí el radio grande y el relleno: antes
                      quedaba un manchón gris que no se leía como un dato. */}
                  <Line yAxisId="mtbf" type="monotone" dataKey="mtbfHoras" name="MTBF"
                        stroke={C.brand} strokeWidth={2} connectNulls
                        dot={{ r: 5, fill: C.brand, stroke: C.surface, strokeWidth: 2 }} />
                  <Line yAxisId="mttr" type="monotone" dataKey="mttrHoras" name="MTTR"
                        stroke={C.danger} strokeWidth={2} connectNulls
                        dot={{ r: 5, fill: C.danger, stroke: C.surface, strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Se necesita al menos una falla registrada para calcular la tendencia." />}
          </div>
        </Card>

        <Card fixed>
          <CardHeader
            title="Tiempo detenido"
            subtitle={costoParadas.conTarifa > 0
              ? `Producción perdida · ${costoParadas.conTarifa} de ${costoParadas.totalActivos} activos con tarifa cargada`
              : "Parada real, no solo el tiempo de reparación"}
          />
          {/* Las horas y, si hay tarifa cargada, lo que costaron. El monto es
              lo que convierte este gráfico en un argumento de presupuesto. */}
          <ChartValue
            value={resumenDisp.imprevistaHoras + resumenDisp.planificadaHoras === 0
              ? SIN_DATOS
              : costoParadas.total > 0
                ? `${fmtHours(resumenDisp.imprevistaHoras + resumenDisp.planificadaHoras)} · $${Math.round(costoParadas.total).toLocaleString("es-CL")}`
                : fmtHours(resumenDisp.imprevistaHoras + resumenDisp.planificadaHoras)}
            tone={resumenDisp.imprevistaHoras + resumenDisp.planificadaHoras === 0 ? C.text3 : C.text1}
          />
          {costoParadas.imprevisto > 0 && (
            <div style={{ padding: "0 18px 4px", fontSize: 14, color: C.text3 }}>
              Imprevisto <strong style={{ color: C.danger, fontWeight: 400 }}>
                ${Math.round(costoParadas.imprevisto).toLocaleString("es-CL")}
              </strong>
              {costoParadas.planificado > 0 && <> · planificado ${Math.round(costoParadas.planificado).toLocaleString("es-CL")}</>}
              {costoParadas.horasSinTarifa > 0 && (
                <> · {costoParadas.horasSinTarifa.toFixed(0)} h sin tarifa, fuera del monto</>
              )}
            </div>
          )}
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {resumenDisp.imprevistaHoras + resumenDisp.planificadaHoras === 0
              ? <EmptyChart text="Sin paradas registradas en el período." /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serieDisp} margin={{ left: -10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}
                           formatter={(v) => [`${Number(v ?? 0)} h`, "Detenido"]} />
                  <Bar dataKey="imprevistaHoras" name="Horas" radius={[4, 4, 0, 0]}>
                    {serieDisp.map(p => (
                      <Cell key={p.key} fill={p.imprevistaHoras >= 6 ? C.danger : C.warning} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Parada programada vs avería.
            Sale de los períodos de estado, no de las OTs: mide la parada real
            —con espera de repuesto y de técnico incluidas—, que es siempre
            mayor que el tiempo de reparación. Lo que se lee acá es si el plan
            preventivo manda o si el equipo manda a los mantenedores. */}
        <Card fixed>
          <CardHeader
            title="Parada planificada vs imprevista"
            subtitle="Desde el historial de estados del activo"
          />
          <ChartValue
            value={downtimeTotales.total === 0
              ? SIN_DATOS
              : `${downtimeTotales.planificadaPct!.toFixed(0)}% planificada`}
            tone={downtimeTotales.total === 0 ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {downtimeTotales.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downtimeSplit} margin={{ left: -10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}
                    formatter={(v, name) => [`${Number(v ?? 0).toFixed(1)} h`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" iconSize={8} />
                  <Bar dataKey="planificada" name="Planificada" stackId="d" fill={C.brand} />
                  <Bar dataKey="imprevista" name="Imprevista" stackId="d" fill={C.danger} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin paradas registradas en el período." />}
          </div>
        </Card>

        {/* Pareto de motivos de parada.
            Barras por cantidad de eventos, línea azul con el acumulado. Se lee
            así: "las primeras dos causas explican el 73% de las detenciones",
            que es lo que decide dónde poner el esfuerzo preventivo. */}
        <Card fixed>
          <CardHeader
            title="Motivos de parada imprevista"
            subtitle="Ordenados por frecuencia, con acumulado"
          />
          <ChartValue
            value={paretoMotivos.length === 0
              ? SIN_DATOS
              : `${paretoMotivos[0].motivo} · ${paretoMotivos[0].eventos}`}
            tone={paretoMotivos.length === 0 ? C.text3 : C.text1}
          />
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {paretoMotivos.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={paretoMotivos} margin={{ left: -10, right: 8, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis
                    dataKey="motivo" tick={{ fontSize: 14, fill: C.text3 }}
                    axisLine={false} tickLine={false}
                    interval={0} angle={-20} textAnchor="end" height={52}
                    tickFormatter={(v: string) => v.length > 18 ? `${v.slice(0, 17)}…` : v}
                  />
                  <YAxis yAxisId="n" tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 14, fill: C.text3 }}
                         axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }}
                    formatter={(v, name) => [
                      name === "Acumulado" ? `${Number(v)}%` : `${Number(v)} detenciones`,
                      name,
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" iconSize={8} />
                  {/* El 80% del Pareto: por debajo de esta línea están las
                      pocas causas que explican la mayoría de las paradas. */}
                  <ReferenceLine yAxisId="pct" y={80} stroke={C.success} strokeDasharray="4 4"
                                 label={{ value: "80%", position: "insideTopRight", fontSize: 14, fill: C.success }} />
                  <Bar yAxisId="n" dataKey="eventos" name="Detenciones" fill={C.danger} radius={[4, 4, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="acumuladoPct" name="Acumulado"
                        stroke={C.brand} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin paradas imprevistas clasificadas en el período." />}
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
                  <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14 }} />
                  <Legend wrapperStyle={{ fontSize: 14 }} iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart text="Sin activos que coincidan con el filtro." />}
          </div>
        </Card>
      </div>

      {/* Worst offenders — the actionable table */}
      <Card style={{ marginTop: 14 }}>
        <CardHeader
          title="Activos más problemáticos"
          subtitle="Por horas de parada imprevista"
        />
        {rankedDisp.length === 0 ? (
          <div style={{ padding: 28, color: C.text3, fontSize: 14, textAlign: "center" }}>
            Sin fallas registradas en el período para los activos filtrados.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "var(--surface-hover)" }}>
                  {["Activo", "Criticidad", "Fallas", "MTBF", "MTTR", "Detenido", "Costo", "Disponibilidad"].map((h, i) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: i === 0 || i === 1 ? "left" : "right", fontWeight: 400, color: C.text3, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rankedDisp.map(({ asset, m, costo }) => (
                  <tr key={asset.id}
                      onClick={() => router.push(`/activos?id=${encodeURIComponent(asset.id)}`)}
                      style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <td style={{ padding: "10px 14px", color: C.text1, fontWeight: 400 }}>{asset.nombre}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ fontSize: 14, fontWeight: 400, padding: "2px 8px", borderRadius: 6,
                        background: asset.criticidad === "critico" ? C.dangerBg : asset.criticidad === "semi_critico" ? C.warningBg : C.successBg,
                        color: CRIT_FILL[asset.criticidad ?? "no_critico"] }}>
                        {CRIT_LABEL[asset.criticidad ?? "no_critico"]}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text1 }}>{m.fallas}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text2 }}>{fmtHours(m.mtbfHoras)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text2 }}>{fmtHours(m.mttrHoras)}</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text2 }}>{m.imprevistaHoras.toFixed(1)} h</td>
                    <td style={{ padding: "10px 14px", textAlign: "right", color: C.text2 }}>
                      {costo == null ? "—" : `$${Math.round(costo).toLocaleString("es-CL")}`}
                    </td>
                    <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 400,
                      color: m.disponibilidadPct == null ? C.text3 : m.disponibilidadPct >= 99 ? C.success : m.disponibilidadPct >= 95 ? C.warning : C.danger }}>
                      {fmtPct(m.disponibilidadPct, 2)}
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
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px", textAlign: "center", color: C.text3, fontSize: 14 }}>
      {text}
    </div>
  );
}
