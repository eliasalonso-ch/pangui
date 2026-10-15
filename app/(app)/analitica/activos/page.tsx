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

import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Building2, MapPin, Package, User,
} from "lucide-react";
import { Engine } from "@/components/icons/Engine";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { esAdmin } from "@/lib/roles";
import { useSuscripcion } from "@/hooks/useSuscripcion";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Desplegable, FiltroFijo, FiltroRemoto, type Opcion } from "./FiltrosActivos";
import {
  derivarDisponibilidad, puntoDisponibilidad, resumirDisponibilidad, type SumasDisponibilidad,
} from "@/lib/activo-disponibilidad";
import {
  aFecha, deFecha, etiquetaTramo, granoPara, minimoDesde, rangoDeAtajo, type Atajo, type Grano, type Rango,
} from "@/lib/analitica-rango";
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

// ── Data ──────────────────────────────────────────────────────────────────────

/** Lo que devuelve la función SQL `analitica_activos` (ya agregado). */
interface Informe {
  activos_total: number;
  estado: { operativo: number; mantencion: number; fuera_servicio: number; baja: number };
  criticidad: Record<AssetCriticality, number>;
  serie: (SumasDisponibilidad & { clave: string; preventivas: number; correctivas: number })[];
  ranking: (SumasDisponibilidad & { id: string; nombre: string; criticidad: AssetCriticality | null; costo: number | null })[];
  pareto: { motivo: string; eventos: number; horas: number }[];
  costo_paradas: { imprevisto: number; planificado: number; horas_sin_tarifa: number; con_tarifa: number };
}

const ATAJOS: { value: Exclude<Atajo, "personalizado">; label: string; meses: number }[] = [
  { value: "30d", label: "Últimos 30 días", meses: 1 },
  { value: "3m", label: "Últimos 3 meses", meses: 3 },
  { value: "6m", label: "Últimos 6 meses", meses: 6 },
  { value: "12m", label: "Últimos 12 meses", meses: 12 },
  { value: "anio", label: "Este año", meses: 12 },
];

const GRANO_TEXTO: Record<Grano, string> = { dia: "día", semana: "semana", mes: "mes" };

/** Selección vacía = sin filtro en la función SQL. */
const ids = (sel: Opcion[]) => (sel.length ? sel.map(o => o.value) : null);

const CRIT_OPCIONES = (["critico", "semi_critico", "no_critico"] as AssetCriticality[])
  .map(k => ({ value: k, label: CRIT_LABEL[k] }));

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnaliticaActivosPage() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [perfilCargado, setPerfilCargado] = useState(false);
  /** "Hoy", fijado al montar: los atajos no cambian solos si la pestaña queda abierta de noche. */
  const [hoy] = useState(() => new Date());
  const [tz] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Santiago");

  const [atajo, setAtajo] = useState<Atajo>("12m");
  const [rango, setRango] = useState<Rango>(() => rangoDeAtajo("12m", new Date()));

  // Selección múltiple, como en /ordenes. Las opciones remotas guardan su
  // etiqueta para dibujar las fichas sin depender de la página cargada.
  const [critFilter, setCritFilter] = useState<string[]>([]);
  const [modeloFilter, setModeloFilter] = useState<Opcion[]>([]);
  const [activoFilter, setActivoFilter] = useState<Opcion[]>([]);
  const [ubicFilter, setUbicFilter] = useState<Opcion[]>([]);
  const [sociedadFilter, setSociedadFilter] = useState<Opcion[]>([]);
  const [responsableFilter, setResponsableFilter] = useState<Opcion[]>([]);
  const hayFiltros = critFilter.length + modeloFilter.length + activoFilter.length
    + ubicFilter.length + sociedadFilter.length + responsableFilter.length > 0;
  const limpiarFiltros = () => {
    setCritFilter([]); setModeloFilter([]); setActivoFilter([]);
    setUbicFilter([]); setSociedadFilter([]); setResponsableFilter([]);
  };

  const suscripcion = useSuscripcion();
  const maxRange = suscripcion.data?.plan_limits?.historial_meses ?? Infinity;
  const desdeMinimo = minimoDesde(hoy, maxRange);
  const hoyFecha = aFecha(hoy);

  const elegirAtajo = (a: Atajo) => {
    setAtajo(a);
    if (a !== "personalizado") setRango(rangoDeAtajo(a, hoy));
  };

  useEffect(() => {
    async function load() {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setPerfilCargado(true); return; }

      const { data: perfil } = await sb
        .from("usuarios").select("workspace_id, rol").eq("id", user.id).maybeSingle();

      // Same gate as the órdenes report: hiding the sidebar link is not enough,
      // the URL is still reachable and this reports across the whole workspace.
      if (perfil?.workspace_id && !esAdmin(perfil?.rol)) { router.replace("/inicio"); return; }
      setWorkspaceId(perfil?.workspace_id ?? null);
      setPerfilCargado(true);
    }
    load();
  }, [router]);

  /**
   * Todo se agrega en la base (funciones `analitica_activos*`). Antes la página
   * bajaba todos los activos, todas las OTs con activo y 400 días de períodos,
   * y PostgREST corta en 1000 filas: con un cliente grande las métricas salían
   * de una parte de los datos, sin aviso. Ahora la respuesta crece con los
   * puntos del gráfico, no con la historia.
   *
   * Caché: TanStack, una entrada por rango + filtros (5 min frescos, 30 en
   * memoria; ver QueryProvider). Volver a un filtro ya visto no consulta. Las
   * opciones de cada filtro se cargan aparte, paginadas (FiltrosActivos.tsx).
   */
  const grano = granoPara(rango);
  const filtros = {
    p_criticidades: critFilter.length ? critFilter : null,
    p_modelos: ids(modeloFilter),
    p_activos: ids(activoFilter),
    p_ubicaciones: ids(ubicFilter),
    p_sociedades: ids(sociedadFilter),
    p_responsables: ids(responsableFilter),
  };
  const informe = useQuery({
    queryKey: ["analitica-activos", workspaceId, rango.desde, rango.hasta, grano, tz, filtros],
    enabled: !!workspaceId,
    // Al cambiar un filtro se queda el informe anterior en pantalla (atenuado)
    // en vez de volver a "Cargando…".
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Informe> => {
      const { data, error } = await createClient().rpc("analitica_activos", {
        p_desde: rango.desde, p_hasta: rango.hasta, p_grano: grano, p_tz: tz, ...filtros,
      });
      if (error) throw error;
      return data as Informe;
    },
  });
  const d = informe.data;

  // ── Derived (cheap: the heavy lifting already happened in SQL) ──────────────
  const cruzaAnio = rango.desde.slice(0, 4) !== rango.hasta.slice(0, 4);

  const serieDisp = useMemo(
    () => (d?.serie ?? []).map(t => puntoDisponibilidad(t.clave, etiquetaTramo(t.clave, grano, cruzaAnio), t)),
    [d, grano, cruzaAnio],
  );
  const resumenDisp = useMemo(() => resumirDisponibilidad(serieDisp), [serieDisp]);

  const series = useMemo(
    () => (d?.serie ?? []).map((t, i) => ({
      key: t.clave, label: serieDisp[i]?.label ?? t.clave,
      preventives: Number(t.preventivas), failures: Number(t.correctivas),
    })),
    [d, serieDisp],
  );
  /** Share of completed maintenance that was planned. Null when there was none. */
  const preventiveSharePct = useMemo(() => {
    const prev = series.reduce((s, p) => s + p.preventives, 0);
    const corr = series.reduce((s, p) => s + p.failures, 0);
    return prev + corr > 0 ? (prev / (prev + corr)) * 100 : null;
  }, [series]);

  /** Horas detenidas por tramo, separando parada programada de avería. */
  const downtimeSplit = useMemo(
    () => serieDisp.map(p => ({ key: p.key, label: p.label, planificada: p.planificadaHoras, imprevista: p.imprevistaHoras })),
    [serieDisp],
  );
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
   * Lo que costó la parada, en plata. Las paradas solapadas (la jerarquía
   * propaga la detención: motor, máquina y línea) se cobran una sola vez, a la
   * tarifa más alta — eso lo resuelve la función SQL.
   */
  const costoParadas = useMemo(() => {
    const c = d?.costo_paradas;
    const imprevisto = Number(c?.imprevisto ?? 0);
    const planificado = Number(c?.planificado ?? 0);
    return {
      imprevisto, planificado, total: imprevisto + planificado,
      horasSinTarifa: Number(c?.horas_sin_tarifa ?? 0),
      conTarifa: Number(c?.con_tarifa ?? 0),
      totalActivos: d?.activos_total ?? 0,
    };
  }, [d]);

  /**
   * Pareto de motivos de parada imprevista, por CANTIDAD de eventos: lo que se
   * busca es la causa que más veces detiene la línea. La línea acumulada dice
   * qué porcentaje se resuelve atacando las primeras N causas.
   */
  const paretoMotivos = useMemo(() => {
    const filas = (d?.pareto ?? []).map(f => ({ motivo: f.motivo, eventos: Number(f.eventos), horas: Number(f.horas) }));
    const total = filas.reduce((s, f) => s + f.eventos, 0);
    return filas.map((f, i) => {
      // El acumulado se suma sobre las filas ya ordenadas hasta esta, en vez de
      // ir mutando un contador dentro del map.
      const acumulado = filas.slice(0, i + 1).reduce((s, x) => s + x.eventos, 0);
      return {
        motivo: f.motivo,
        eventos: f.eventos,
        horas: Number(f.horas.toFixed(1)),
        acumuladoPct: total > 0 ? Number(((acumulado / total) * 100).toFixed(1)) : 0,
      };
    });
  }, [d]);

  const critSplit = useMemo(() => {
    const counts = d?.criticidad ?? { critico: 0, semi_critico: 0, no_critico: 0 };
    return (["critico", "semi_critico", "no_critico"] as AssetCriticality[])
      .filter(k => Number(counts[k]) > 0)
      .map(k => ({ name: CRIT_LABEL[k], value: Number(counts[k]), key: k }));
  }, [d]);

  const CRIT_FILL: Record<string, string> = {
    critico: C.danger, semi_critico: C.warning, no_critico: C.success,
  };

  /** Peores actores, por HORAS DE PARADA IMPREVISTA (top 10, ordenado en SQL). */
  const rankedDisp = useMemo(
    () => (d?.ranking ?? []).map(r => ({
      asset: { id: r.id, nombre: r.nombre, criticidad: r.criticidad },
      m: derivarDisponibilidad(r),
      costo: r.costo == null ? null : Number(r.costo),
    })),
    [d],
  );

  /**
   * Live asset states — a snapshot of right now, not a period aggregate.
   * `baja` (retired) is excluded: a decommissioned asset is not "offline".
   */
  const statusCounts = d?.estado ?? { operativo: 0, mantencion: 0, fuera_servicio: 0, baja: 0 };
  const enServicio = statusCounts.operativo + statusCounts.mantencion + statusCounts.fuera_servicio;
  const disponibilidadActual = enServicio > 0
    ? (statusCounts.operativo / enServicio) * 100
    : null;
  const totalActivos = d?.activos_total ?? 0;

  // Fail-open mientras carga la suscripcion (ver analitica/ordenes).
  if (suscripcion.data?.plan_features && !suscripcion.data.plan_features.analytics_pro) {
    return (
      <UpgradePrompt
        variant="card"
        title="Analítica de activos"
        description="La disponibilidad, el MTBF y el costo por activo están disponibles en el plan Empresa."
        upgradeTo="Empresa"
      />
    );
  }

  if (perfilCargado && !workspaceId) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 14 }}>No se pudo cargar el workspace.</div>;
  }
  if (informe.error && !d) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 14 }}>No se pudo cargar la analítica. Intenta de nuevo en un momento.</div>;
  }
  if (!d) {
    return <div style={{ padding: 40, color: C.text3, fontSize: 14 }}>Cargando analítica...</div>;
  }

  return (
    <div style={{ padding: "28px 32px 64px", minHeight: "100vh", background: C.bg }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Personalizado: el mismo DatePicker de procedimientos. min/max
              impiden un rango invertido y respetan el historial del plan. */}
          {atajo === "personalizado" && (
            <>
              <div style={{ width: 150 }}>
                <DatePicker
                  value={deFecha(rango.desde)}
                  min={desdeMinimo ? deFecha(desdeMinimo) : undefined}
                  max={deFecha(rango.hasta)}
                  onChange={d => { if (d) setRango(r => ({ ...r, desde: aFecha(d) })); }}
                />
              </div>
              <span style={{ color: C.text3, fontSize: 14 }}>–</span>
              <div style={{ width: 150 }}>
                <DatePicker
                  value={deFecha(rango.hasta)}
                  min={deFecha(rango.desde)}
                  max={deFecha(hoyFecha)}
                  onChange={d => { if (d) setRango(r => ({ ...r, hasta: aFecha(d) })); }}
                />
              </div>
            </>
          )}
          <Desplegable<Atajo>
            ariaLabel="Período"
            value={atajo}
            onChange={elegirAtajo}
            opciones={[
              ...ATAJOS.map(a => ({ value: a.value, label: a.label, disabled: maxRange < a.meses })),
              { value: "personalizado" as const, label: "Personalizado" },
            ]}
          />
        </div>
      </div>

      {/* Filtros: las mismas piezas que /ordenes (components/filtros/primitivas). */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <FiltroFijo label="Criticidad" icon={<AlertTriangle size={16} />}
          opciones={CRIT_OPCIONES} seleccion={critFilter} onChange={setCritFilter} />
        {workspaceId && (
          <>
            <FiltroRemoto label="Tipo de activo" icon={<Package size={16} />} tipo="modelo"
              workspaceId={workspaceId} seleccion={modeloFilter} onChange={setModeloFilter} />
            <FiltroRemoto label="Activo" icon={<Engine size={16} />} tipo="activo"
              workspaceId={workspaceId} seleccion={activoFilter} onChange={setActivoFilter} />
            <FiltroRemoto label="Ubicación" icon={<MapPin size={16} />} tipo="ubicacion"
              workspaceId={workspaceId} seleccion={ubicFilter} onChange={setUbicFilter} />
            <FiltroRemoto label="Cliente" icon={<Building2 size={16} />} tipo="sociedad"
              workspaceId={workspaceId} seleccion={sociedadFilter} onChange={setSociedadFilter} />
            <FiltroRemoto label="Responsable" icon={<User size={16} />} tipo="responsable"
              workspaceId={workspaceId} seleccion={responsableFilter} onChange={setResponsableFilter} />
          </>
        )}
        {/* Igual que /ordenes: solo aparece cuando hay algo que limpiar. */}
        {hayFiltros && (
          <button
            type="button"
            onClick={limpiarFiltros}
            style={{
              display: "flex", alignItems: "center", height: 34, padding: 0, flexShrink: 0,
              border: "none", background: "none", color: "var(--brand)",
              fontSize: 14, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            Limpiar filtros
          </button>
        )}
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
            {totalActivos} {totalActivos === 1 ? "activo" : "activos"} en el filtro
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

      {/* Every chart card below is the same 460px Card `fixed` height.
          Atenuado mientras llega el informe del nuevo rango o filtro. */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14,
        opacity: informe.isPlaceholderData ? 0.55 : 1, transition: "opacity 120ms",
      }}>
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
            value={fmtPct(preventiveSharePct, 0)}
            tone={preventiveSharePct == null ? C.text3 : C.text1}
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
            subtitle={`Horas, por ${GRANO_TEXTO[grano]} · solo fallas imprevistas`}
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
            value={String(Number(d.criticidad.critico ?? 0))}
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
