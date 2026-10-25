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
  Activity, AlertTriangle, Annoyed, Building2, Circle, Frown, MapPin, Meh, RefreshCw, Settings, Smile, User, Wrench,
  type LucideIcon,
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
import {
  KPI_META, NIVEL_LABEL, evaluar, fetchObjetivosKpi, metaVigente,
  type KpiObjetivo, type NivelObjetivo, type ObjetivoKpi,
} from "@/lib/objetivos-kpi";
import ObjetivosKpiDialog from "@/components/analitica/ObjetivosKpiDialog";
import {
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
  type ColumnDef, type PaginationState, type SortingState,
} from "@tanstack/react-table";
import { BuscadorTabla, EncabezadoTabla, PaginacionTabla } from "@/components/tabla/DataTable";
import { ESTADO_COLOR, ESTADO_LABEL } from "@/lib/activo-estado-ui";
import { fetchMotivosInactividad } from "@/lib/activo-estado-api";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { DatePicker } from "@/components/ui/date-time-picker";
import { Desplegable, FiltroFijo, FiltroRemoto, type Opcion } from "./FiltrosActivos";
import { BarraFiltros } from "@/components/filtros/primitivas";
import {
  derivarDisponibilidad, puntoDisponibilidad, resumirDisponibilidad, type PuntoDisponibilidad, type SumasDisponibilidad,
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

const CRIT_FILL: Record<string, string> = {
  critico: C.danger, semi_critico: C.warning, no_critico: C.success,
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
    // Alto fijo (el de título + subtítulo): con y sin subtítulo, y con o sin
    // engranaje, los encabezados de una misma fila quedan parejos y los
    // gráficos arrancan a la misma altura.
    <div style={{ padding: "15px 18px", minHeight: 72, boxSizing: "border-box", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
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

/**
 * Metas: carita por nivel (como MaintainX, con un nivel más: "en riesgo", la
 * alerta antes de llegar a malo) y siempre con palabra al lado o en el tooltip:
 * un color o un gesto solos no se leen.
 */
const NIVEL_UI: Record<NivelObjetivo, { icono: LucideIcon; fg: string; bg: string }> = {
  bueno: { icono: Smile, fg: C.success, bg: C.successBg },
  aceptable: { icono: Meh, fg: C.text3, bg: "var(--surface-hover)" },
  riesgo: { icono: Annoyed, fg: C.warning, bg: C.warningBg },
  malo: { icono: Frown, fg: C.danger, bg: C.dangerBg },
};

function CaraNivel({ nivel, size = 16 }: { nivel: NivelObjetivo; size?: number }) {
  const { icono: Icono, fg } = NIVEL_UI[nivel];
  return <Icono size={size} style={{ color: fg, flexShrink: 0 }} aria-label={NIVEL_LABEL[nivel]} />;
}

const unidadDe = (kpi: KpiObjetivo) => (KPI_META[kpi].unidad === "%" ? "%" : " h");

/** "MTBF: bueno ≥ 2000 h · en riesgo bajo 1500 h · malo ≤ 1000 h". */
function textoMeta(kpi: KpiObjetivo, o: ObjetivoKpi) {
  const m = KPI_META[kpi];
  const u = unidadDe(kpi);
  const partes = [`bueno ${m.menosEsMejor ? "≤" : "≥"} ${o.bueno}${u}`];
  if (o.alerta != null) partes.push(`en riesgo ${m.menosEsMejor ? "sobre" : "bajo"} ${o.alerta}${u}`);
  partes.push(`malo ${m.menosEsMejor ? "≥" : "≤"} ${o.malo}${u}`);
  return `${m.label}: ${partes.join(" · ")}`;
}

/** Nivel del período completo, bajo el número grande de una tarjeta. */
function IndicadorMeta({ kpi, valor, objetivo }: {
  kpi: KpiObjetivo;
  valor: number | null;
  objetivo: ObjetivoKpi | null;
}) {
  const nivel = evaluar(kpi, valor, objetivo);
  if (!objetivo || !nivel) return null;
  return (
    <span title={textoMeta(kpi, objetivo)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: C.text3 }}>
      {(kpi === "mtbf" || kpi === "mttr") && `${KPI_META[kpi].label}:`}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "1px 8px 1px 6px", borderRadius: 999, background: NIVEL_UI[nivel].bg, color: NIVEL_UI[nivel].fg }}>
        <CaraNivel nivel={nivel} size={14} />
        {NIVEL_LABEL[nivel]}
      </span>
    </span>
  );
}

/**
 * Pie del tooltip con las metas, como el "Your organization aims for" de
 * MaintainX: el valor del punto se lee contra el número al que se apunta.
 */
function PieMetas({ items, alcance }: { items: { kpi: KpiObjetivo; objetivo: ObjetivoKpi | null }[]; alcance: string }) {
  const con = items.filter(i => i.objetivo);
  if (con.length === 0) return null;
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, color: C.text3 }}>
      <div>Meta {alcance}:</div>
      {con.map(i => <div key={i.kpi}>· {textoMeta(i.kpi, i.objetivo!)}</div>)}
    </div>
  );
}

/** Valor de una métrica en el tooltip, con su carita contra la meta. */
function FilaTooltip({ kpi, nombre, valor, color, objetivo, sufijo = "" }: {
  kpi: KpiObjetivo; nombre: string; valor: number | null; color: string; objetivo: ObjetivoKpi | null; sufijo?: string;
}) {
  const nivel = evaluar(kpi, valor, objetivo);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
      {nivel && <CaraNivel nivel={nivel} />}
      <span style={{ color }}>{nombre}:</span>
      <strong style={{ color: C.text1, fontWeight: 500 }}>{valor == null ? "Sin datos" : `${valor}${unidadDe(kpi)}`}</strong>
      {sufijo && <span style={{ color: C.text3 }}>{sufijo}</span>}
      {nivel && <span style={{ color: NIVEL_UI[nivel].fg }}>· {NIVEL_LABEL[nivel]}</span>}
    </div>
  );
}

const cajaTooltip: React.CSSProperties = {
  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px",
  fontSize: 14, boxShadow: "0 4px 12px rgba(15,23,42,0.08)", maxWidth: 360,
};

/** Líneas de meta: bueno verde, alerta ámbar, malo rojo, punteadas. */
function lineasMeta(objetivo: ObjetivoKpi | null) {
  if (!objetivo) return null;
  return [
    <ReferenceLine key="bueno" y={objetivo.bueno} stroke={C.success} strokeDasharray="6 4" ifOverflow="extendDomain" />,
    objetivo.alerta != null
      ? <ReferenceLine key="alerta" y={objetivo.alerta} stroke={C.warning} strokeDasharray="6 4" ifOverflow="extendDomain" />
      : null,
    <ReferenceLine key="malo" y={objetivo.malo} stroke={C.danger} strokeDasharray="6 4" strokeOpacity={0.7} ifOverflow="extendDomain" />,
  ];
}

/** Engranaje para configurar las metas de un gráfico. */
function BotonMetas({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Metas de este gráfico" aria-label="Configurar metas"
      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, flexShrink: 0, border: "none", borderRadius: "var(--r-sm)", background: "transparent", color: C.text3, cursor: "pointer" }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; e.currentTarget.style.color = C.brand; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.text3; }}>
      <Settings size={16} />
    </button>
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

interface EventoFalla {
  inicio: string;
  /** null = sigue detenido. */
  fin: string | null;
  activo: string;
  motivo: string | null;
  horas: number | null;
}

/** Fecha local (Chile) "YYYY-MM-DD" de un instante: así se compara con las claves de los tramos. */
const fechaLocal = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

/** Lo que devuelve la función SQL `analitica_activos` (ya agregado). */
interface Informe {
  activos_total: number;
  estado: { operativo: number; mantencion: number; fuera_servicio: number; baja: number };
  criticidad: Record<AssetCriticality, number>;
  serie: (SumasDisponibilidad & { clave: string; preventivas: number; correctivas: number })[];
  ranking: (SumasDisponibilidad & { id: string; nombre: string; criticidad: AssetCriticality | null; costo: number | null })[];
  pareto: { motivo: string; eventos: number; horas: number }[];
  /** Fallas del rango (eventos: de la detención a la vuelta a operar), para marcarlas. */
  eventos_falla?: EventoFalla[];
  costo_paradas: { imprevisto: number; planificado: number; horas_sin_tarifa: number; con_tarifa: number };
}

const ATAJOS: { value: Exclude<Atajo, "personalizado">; label: string; meses: number }[] = [
  { value: "30d", label: "Últimos 30 días", meses: 1 },
  { value: "3m", label: "Últimos 3 meses", meses: 3 },
  { value: "6m", label: "Últimos 6 meses", meses: 6 },
  { value: "12m", label: "Últimos 12 meses", meses: 12 },
  { value: "anio", label: "Este año", meses: 12 },
];


/** Selección vacía = sin filtro en la función SQL. */
const ids = (sel: Opcion[]) => (sel.length ? sel.map(o => o.value) : null);

const CRIT_OPCIONES = (["critico", "semi_critico", "no_critico"] as AssetCriticality[])
  .map(k => ({ value: k, label: CRIT_LABEL[k] }));

/** Los filtros de la función SQL sin ninguno puesto (misma forma que `filtros`). */
const SIN_FILTROS = {
  p_criticidades: null, p_estados: null, p_motivos: null, p_activos: null,
  p_ubicaciones: null, p_sociedades: null, p_responsables: null,
};

/** Estado actual del activo (los de baja no entran en la analítica). */
const ESTADO_OPCIONES = (["operativo", "mantencion", "fuera_servicio"] as const)
  .map(k => ({ value: k, label: ESTADO_LABEL[k] }));

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
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [motivoFilter, setMotivoFilter] = useState<string[]>([]);
  const [activoFilter, setActivoFilter] = useState<Opcion[]>([]);
  const [ubicFilter, setUbicFilter] = useState<Opcion[]>([]);
  const [sociedadFilter, setSociedadFilter] = useState<Opcion[]>([]);
  const [responsableFilter, setResponsableFilter] = useState<Opcion[]>([]);
  const hayFiltros = critFilter.length + estadoFilter.length + motivoFilter.length + activoFilter.length
    + ubicFilter.length + sociedadFilter.length + responsableFilter.length > 0;
  const limpiarFiltros = () => {
    setCritFilter([]); setEstadoFilter([]); setMotivoFilter([]); setActivoFilter([]);
    setUbicFilter([]); setSociedadFilter([]); setResponsableFilter([]);
  };

  // Catálogo de motivos del workspace: pocos, así que va en un filtro fijo.
  const motivosQ = useQuery({ queryKey: ["motivos-inactividad"], queryFn: fetchMotivosInactividad, staleTime: 5 * 60_000 });
  const motivoOpciones = (motivosQ.data ?? []).map(m => ({ value: m.id, label: m.nombre }));

  const suscripcion = useSuscripcion();
  // Objetivos de KPI: solo plan Empresa. Los edita owner/admin (la RLS exige lo mismo).
  const esEmpresa = suscripcion.data?.effective_plan === "enterprise";
  const puedeEditarObjetivos = esEmpresa && esAdmin(suscripcion.data?.rol);
  // Metas de qué gráfico se están editando (cada gráfico tiene su engranaje).
  const [metasDe, setMetasDe] = useState<KpiObjetivo[] | null>(null);
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
    p_estados: estadoFilter.length ? estadoFilter : null,
    p_motivos: motivoFilter.length ? motivoFilter : null,
    p_activos: ids(activoFilter),
    p_ubicaciones: ids(ubicFilter),
    p_sociedades: ids(sociedadFilter),
    p_responsables: ids(responsableFilter),
  };
  const consultaInforme = (f: typeof filtros) => ({
    queryKey: ["analitica-activos", workspaceId, rango.desde, rango.hasta, grano, tz, f],
    enabled: !!workspaceId,
    // Al cambiar un filtro se queda el informe anterior en pantalla (atenuado)
    // en vez de volver a "Cargando…".
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Informe> => {
      const { data, error } = await createClient().rpc("analitica_activos", {
        p_desde: rango.desde, p_hasta: rango.hasta, p_grano: grano, p_tz: tz, ...f,
      });
      if (error) throw error;
      return data as Informe;
    },
  });
  const informe = useQuery(consultaInforme(filtros));
  const d = informe.data;
  // La tabla de "más problemáticos" es el ranking de TODO el workspace en el
  // período: los filtros son para los gráficos. Sin filtros activos la clave es
  // la misma que la de arriba, así que TanStack hace una sola consulta.
  const informeTabla = useQuery(consultaInforme(SIN_FILTROS));

  // ── Derived (cheap: the heavy lifting already happened in SQL) ──────────────
  const cruzaAnio = rango.desde.slice(0, 4) !== rango.hasta.slice(0, 4);

  const serieDisp = useMemo(
    () => (d?.serie ?? []).map(t => puntoDisponibilidad(t.clave, etiquetaTramo(t.clave, grano, cruzaAnio), t)),
    [d, grano, cruzaAnio],
  );
  const resumenDisp = useMemo(() => resumirDisponibilidad(serieDisp), [serieDisp]);

  const objetivosQ = useQuery({
    queryKey: ["objetivos-kpi", workspaceId],
    queryFn: fetchObjetivosKpi,
    enabled: esEmpresa && !!workspaceId,
    staleTime: 5 * 60_000,
    // Si la tabla no existe todavía (migración 20261021180000 sin aplicar), no
    // insistir: se usan las metas de referencia y el engranaje se esconde.
    retry: false,
  });
  const objetivos = objetivosQ.data ?? [];
  // Una meta por KPI para todo el workspace (como MaintainX); si no hay, la de referencia.
  const meta = (kpi: KpiObjetivo) => (esEmpresa ? metaVigente(kpi, objetivos) : null);
  const alcanceMeta = (kpi: KpiObjetivo) =>
    meta(kpi)?.fuente === "referencia" ? "de referencia de la industria (ajústala con el engranaje)" : "del workspace";
  const engranaje = (kpis: KpiObjetivo[]) =>
    puedeEditarObjetivos && workspaceId && !objetivosQ.isError ? <BotonMetas onClick={() => setMetasDe(kpis)} /> : undefined;

  /**
   * Fallas por tramo (clave), para marcarlas en la tendencia de MTBF/MTTR: un
   * salto en la media móvil solo se entiende viendo qué falla lo causó. Cada
   * falla va al último tramo que empieza en o antes de su fecha local.
   */
  const fallasPorTramo = useMemo(() => {
    const m = new Map<string, EventoFalla[]>();
    const claves = serieDisp.map(p => p.key);
    for (const f of d?.eventos_falla ?? []) {
      const dia = fechaLocal(f.inicio);
      const clave = claves.filter(c => c <= dia).at(-1);
      if (clave) m.set(clave, [...(m.get(clave) ?? []), f]);
    }
    return m;
  }, [d, serieDisp]);
  // Con más de un activo en las fallas, el tooltip dice de cuál es cada una.
  const variosActivosConFallas = new Set((d?.eventos_falla ?? []).map(f => f.activo)).size > 1;

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

  /** Todos los activos del workspace con sus métricas del período (la tabla los ordena y pagina). */
  const rankingTabla = informeTabla.data?.ranking;
  const rankedDisp = useMemo(
    () => (rankingTabla ?? []).map(r => ({
      asset: { id: r.id, nombre: r.nombre, criticidad: r.criticidad },
      m: derivarDisponibilidad(r),
      costo: r.costo == null ? null : Number(r.costo),
    })),
    [rankingTabla],
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
      {/* Filtros: las mismas piezas que /ordenes (components/filtros/primitivas).
          El período va primero, del mismo alto que los chips: antes vivía solo
          en una fila de arriba, más grande y con un hueco vacío a su izquierda. */}
      <BarraFiltros hayFiltros={hayFiltros} onLimpiar={limpiarFiltros} style={{ marginBottom: 16 }}>
        <Desplegable<Atajo>
          ariaLabel="Período"
          alto={34}
          value={atajo}
          onChange={elegirAtajo}
          opciones={[
            ...ATAJOS.map(a => ({ value: a.value, label: a.label, disabled: maxRange < a.meses })),
            { value: "personalizado" as const, label: "Personalizado" },
          ]}
        />
        {/* Personalizado: el mismo DatePicker de procedimientos. min/max
            impiden un rango invertido y respetan el historial del plan. */}
        {atajo === "personalizado" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 150 }}>
              <DatePicker
                alto={34}
                value={deFecha(rango.desde)}
                min={desdeMinimo ? deFecha(desdeMinimo) : undefined}
                max={deFecha(rango.hasta)}
                onChange={d => { if (d) setRango(r => ({ ...r, desde: aFecha(d) })); }}
              />
            </div>
            <span style={{ color: C.text3, fontSize: 14 }}>–</span>
            <div style={{ width: 150 }}>
              <DatePicker
                alto={34}
                value={deFecha(rango.hasta)}
                min={deFecha(rango.desde)}
                max={deFecha(hoyFecha)}
                onChange={d => { if (d) setRango(r => ({ ...r, hasta: aFecha(d) })); }}
              />
            </div>
          </div>
        )}
        <FiltroFijo label="Criticidad" icon={<AlertTriangle size={16} />}
          opciones={CRIT_OPCIONES} seleccion={critFilter} onChange={setCritFilter} />
        <FiltroFijo label="Estado" icon={<Circle size={16} />}
          opciones={ESTADO_OPCIONES} seleccion={estadoFilter} onChange={setEstadoFilter} />
        <FiltroFijo label="Razón de inactividad" icon={<Wrench size={16} />}
          opciones={motivoOpciones} seleccion={motivoFilter} onChange={setMotivoFilter} />
        {workspaceId && (
          <>
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
      </BarraFiltros>

      {/* Estado actual: a live snapshot of asset states, not a period
          aggregate like the charts below. Each cell is its own card, with the
          qualifier in parentheses so "Fuera de servicio (no planificado)" reads
          as one label rather than two competing ones. */}
      <div style={{
        display: "grid", gridTemplateColumns: "minmax(190px, 1.1fr) repeat(4, minmax(0, 1fr))",
        gap: 10, marginTop: 14, alignItems: "stretch",
        padding: 10, borderRadius: 12, background: C.infoBg, border: `1px solid ${C.border}`,
      }}>
        {/* Qué tan recientes son los datos de la pantalla: cuándo se calcularon
            (dataUpdatedAt de la consulta), no la hora del reloj. */}
        <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Activity size={15} style={{ color: C.brand, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: C.text1 }}>Estado actual</span>
            <button type="button" onClick={() => void informe.refetch()} disabled={informe.isFetching}
              title="Actualizar ahora" aria-label="Actualizar ahora"
              style={{ display: "flex", marginLeft: "auto", padding: 0, border: "none", background: "none", cursor: informe.isFetching ? "wait" : "pointer", color: C.text3 }}>
              <RefreshCw size={14} className={informe.isFetching ? "animate-spin" : undefined} />
            </button>
          </div>
          <span style={{ fontSize: 14, color: C.text2 }}>Última actualización:</span>
          <span style={{ fontSize: 14, color: C.text1 }}>
            {informe.dataUpdatedAt
              ? new Date(informe.dataUpdatedAt).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
              : SIN_DATOS}
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
            // El mismo naranjo de "En mantención" en el cambio de estado del activo.
            dot: ESTADO_COLOR.mantencion,
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
            action={engranaje(["disponibilidad"])}
          />
          <ChartValue
            value={fmtPct(resumenDisp.disponibilidadPct, 2)}
            tone={resumenDisp.disponibilidadPct == null ? C.text3 : C.text1}
          />
          {meta("disponibilidad") && (
            <div style={{ padding: "2px 18px 0" }}>
              <IndicadorMeta kpi="disponibilidad" valor={resumenDisp.disponibilidadPct} objetivo={meta("disponibilidad")} />
            </div>
          )}
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
                  <Tooltip content={({ active, payload, label }) => {
                    const p = payload?.[0]?.payload as PuntoDisponibilidad | undefined;
                    if (!active || !p) return null;
                    return (
                      <div style={cajaTooltip}>
                        <div style={{ color: C.text1 }}>{label}</div>
                        <FilaTooltip kpi="disponibilidad" nombre="Disponibilidad" valor={p.disponibilidadPct} color={C.success} objetivo={meta("disponibilidad")} />
                        <PieMetas items={[{ kpi: "disponibilidad", objetivo: meta("disponibilidad") }]} alcance={alcanceMeta("disponibilidad")} />
                      </div>
                    );
                  }} />
                  {lineasMeta(meta("disponibilidad"))}
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

        {/* MTBF y MTTR se leen juntos —el patrón sano es MTBF subiendo y MTTR
            plano o bajando—, pero en dos gráficos apilados con el mismo eje de
            fechas y tooltip sincronizado, no en uno con doble eje: ahí el cruce
            de las líneas parecía un evento y solo dependía de las escalas.

            Escalonados (stepAfter) y no curvas: la media móvil cambia SOLO
            cuando entra o sale una falla de la ventana; una curva suave dibujaba
            subidas graduales que no ocurrieron. Las líneas rojas punteadas son
            las fallas, con motivo y duración en el tooltip: explican cada salto. */}
        <Card fixed>
          <CardHeader
            title="MTBF y MTTR"
            subtitle="Media móvil de 90 días · solo fallas imprevistas · línea punteada = falla"
            action={engranaje(["mtbf", "mttr"])}
          />
          {/* En horas, como los ejes; el MTBF además en días, que es como se
              piensa ("una falla cada 40 días", no "cada 956 h"). */}
          <ChartValue
            value={resumenDisp.mtbfHoras == null
              ? SIN_DATOS
              // El MTTR puede faltar aunque haya MTBF: fallas todavía abiertas.
              : `${Math.round(resumenDisp.mtbfHoras)} h entre fallas (~${Math.round(resumenDisp.mtbfHoras / 24)} días) · ${resumenDisp.mttrHoras == null ? "en reparación" : `${resumenDisp.mttrHoras.toFixed(1)} h para restaurar`}`}
            tone={resumenDisp.mtbfHoras == null ? C.text3 : C.text1}
          />
          {/* Cuántas fallas sostienen el número: con pocas, un MTBF es frágil y
              no alcanza para hablar de tendencia. Siempre a la vista, no solo
              en el tooltip. */}
          {resumenDisp.fallas > 0 && (
            <div style={{ padding: "2px 18px 0", fontSize: 14, color: resumenDisp.fallas < 3 ? C.warning : C.text3 }}>
              Basado en {resumenDisp.fallas} {resumenDisp.fallas === 1 ? "falla" : "fallas"} del período
              {resumenDisp.fallas < 3 && " · muestra chica: tómalo como referencia, no como tendencia"}
            </div>
          )}
          {(meta("mtbf") || meta("mttr")) && (
            <div style={{ padding: "4px 18px 0", display: "flex", gap: 14, flexWrap: "wrap" }}>
              <IndicadorMeta kpi="mtbf" valor={resumenDisp.mtbfHoras == null ? null : Math.round(resumenDisp.mtbfHoras)} objetivo={meta("mtbf")} />
              <IndicadorMeta kpi="mttr" valor={resumenDisp.mttrHoras} objetivo={meta("mttr")} />
            </div>
          )}
          <div style={{ padding: "8px 8px 12px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {serieDisp.some(p => p.mtbfMovilHoras != null) ? (
              <>
                {([
                  { key: "mtbfMovilHoras", nombre: "MTBF", color: C.brand, ultimo: false },
                  { key: "mttrMovilHoras", nombre: "MTTR", color: C.danger, ultimo: true },
                ] as const).map(g => (
                  <div key={g.key} style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={serieDisp} syncId="mtbf-mttr" margin={{ left: 0, right: 12, top: 6, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                        {/* Fechas solo abajo: arriba repetirían lo mismo. */}
                        <XAxis dataKey="label" hide={!g.ultimo} tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                        {/* Ancho fijo: con el automático, "2200 h" se cortaba. */}
                        <YAxis width={78} tick={{ fontSize: 14, fill: g.color }} axisLine={false} tickLine={false}
                               tickFormatter={(v) => `${v} h`}
                               label={{ value: g.nombre, angle: -90, position: "insideLeft", fontSize: 14, fill: g.color, dx: -2 }} />
                        {lineasMeta(meta(g.key === "mtbfMovilHoras" ? "mtbf" : "mttr"))}
                        {serieDisp.filter(p => fallasPorTramo.has(p.key)).map(p => (
                          <ReferenceLine key={p.key} x={p.label} stroke={C.danger} strokeDasharray="4 3" strokeOpacity={0.6} />
                        ))}
                        <Tooltip
                          content={({ active, payload, label }) => {
                            const p = payload?.[0]?.payload as PuntoDisponibilidad | undefined;
                            if (!active || !p) return null;
                            // Con el tooltip sincronizado sale en los dos gráficos:
                            // el de abajo muestra solo su métrica, sin repetir el resto.
                            if (g.ultimo) {
                              return (
                                <div style={cajaTooltip}>
                                  <FilaTooltip kpi="mttr" nombre="MTTR" valor={p.mttrMovilHoras} color={C.danger} objetivo={meta("mttr")} />
                                </div>
                              );
                            }
                            const fallas = fallasPorTramo.get(p.key) ?? [];
                            return (
                              <div style={cajaTooltip}>
                                <div style={{ color: C.text1 }}>{label} · {p.fallasMovil} {p.fallasMovil === 1 ? "falla" : "fallas"} en 90 días</div>
                                <FilaTooltip kpi="mtbf" nombre="MTBF" valor={p.mtbfMovilHoras} color={C.brand} objetivo={meta("mtbf")}
                                  sufijo={p.mtbfMovilHoras == null ? "" : `(~${Math.round(p.mtbfMovilHoras / 24)} días)`} />
                                <FilaTooltip kpi="mttr" nombre="MTTR" valor={p.mttrMovilHoras} color={C.danger} objetivo={meta("mttr")} />
                                {fallas.slice(0, 3).map(f => (
                                  <div key={f.inicio + f.activo} style={{ color: C.text2, marginTop: 4 }}>
                                    <span style={{ color: C.danger }}>● </span>
                                    {new Date(f.inicio).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" })}
                                    {" · "}{f.motivo ?? "Sin motivo"}
                                    {" · "}{f.horas == null ? "sigue detenido" : `${Number(f.horas).toFixed(1)} h`}
                                    {variosActivosConFallas && <span style={{ color: C.text3 }}> · {f.activo}</span>}
                                  </div>
                                ))}
                                {fallas.length > 3 && <div style={{ color: C.text3, marginTop: 4 }}>y {fallas.length - 3} más</div>}
                                <PieMetas items={[{ kpi: "mtbf", objetivo: meta("mtbf") }, { kpi: "mttr", objetivo: meta("mttr") }]} alcance={alcanceMeta("mtbf")} />
                              </div>
                            );
                          }}
                        />
                        <Line type="stepAfter" dataKey={g.key} name={g.nombre}
                              stroke={g.color} strokeWidth={2} connectNulls={false} isAnimationActive={false}
                              dot={{ r: 3, fill: g.color, stroke: C.surface, strokeWidth: 1.5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ))}
              </>
            ) : <EmptyChart text="Sin fallas imprevistas en los 90 días previos a ningún punto del rango." />}
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
            action={engranaje(["planificada"])}
          />
          <ChartValue
            value={downtimeTotales.total === 0
              ? SIN_DATOS
              : `${downtimeTotales.planificadaPct!.toFixed(0)}% planificada`}
            tone={downtimeTotales.total === 0 ? C.text3 : C.text1}
          />
          {meta("planificada") && (
            <div style={{ padding: "2px 18px 0" }}>
              <IndicadorMeta kpi="planificada" valor={downtimeTotales.planificadaPct} objetivo={meta("planificada")} />
            </div>
          )}
          <div style={{ padding: "4px 8px 16px", flex: 1, minHeight: 0 }}>
            {downtimeTotales.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downtimeSplit} margin={{ left: -10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 14, fill: C.text3 }} axisLine={false} tickLine={false} />
                  <Tooltip content={({ active, payload, label }) => {
                    const p = payload?.[0]?.payload as { planificada: number; imprevista: number } | undefined;
                    if (!active || !p) return null;
                    const total = p.planificada + p.imprevista;
                    const pct = total > 0 ? Number(((p.planificada / total) * 100).toFixed(0)) : null;
                    return (
                      <div style={cajaTooltip}>
                        <div style={{ color: C.text1 }}>{label}</div>
                        <div style={{ color: C.brand, marginTop: 2 }}>Planificada: {p.planificada.toFixed(1)} h</div>
                        <div style={{ color: C.danger }}>Imprevista: {p.imprevista.toFixed(1)} h</div>
                        {pct != null && <FilaTooltip kpi="planificada" nombre="Planificada" valor={pct} color={C.text2} objetivo={meta("planificada")} />}
                        <PieMetas items={[{ kpi: "planificada", objetivo: meta("planificada") }]} alcance={alcanceMeta("planificada")} />
                      </div>
                    );
                  }} />
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

      {/* Todos los activos del workspace con sus métricas del período: Data
          Table (buscar, ordenar, paginar). No sigue los filtros de arriba (esos
          son para los gráficos), solo el período. */}
      <Card style={{ marginTop: 14 }}>
        <CardHeader
          title="Activos más problemáticos"
          subtitle="Por horas de parada imprevista · todos los activos del período, sin filtros"
        />
        {informeTabla.data ? (
          <TablaActivos filas={rankedDisp} onAbrir={id => router.push(`/activos?id=${encodeURIComponent(id)}`)} />
        ) : (
          <div style={{ padding: 28, color: C.text3, fontSize: 14, textAlign: "center" }}>
            {informeTabla.error ? "No se pudo cargar la tabla." : "Cargando…"}
          </div>
        )}
      </Card>

      {metasDe && workspaceId && (
        <ObjetivosKpiDialog kpis={metasDe} workspaceId={workspaceId}
          objetivos={objetivos} onClose={() => setMetasDe(null)} />
      )}
    </div>
  );
}

type FilaActivo = {
  asset: { id: string; nombre: string; criticidad: AssetCriticality | null };
  m: ReturnType<typeof derivarDisponibilidad>;
  costo: number | null;
};

const CRIT_ORDEN: Record<AssetCriticality, number> = { critico: 3, semi_critico: 2, no_critico: 1 };
const celdaActivo: React.CSSProperties = { padding: "10px 16px", fontSize: 14, color: C.text2, whiteSpace: "nowrap" };
const COLUMNAS_NUMERICAS = ["fallas", "mtbf", "mttr", "detenido", "costo", "disponibilidad"];

/**
 * Activos del workspace con sus métricas del período, como el "Reporting Details" de
 * MaintainX: buscar por nombre, ordenar por cualquier columna (por defecto,
 * más horas detenido primero) y paginar de a 10. Todo en el cliente: las filas
 * ya vienen del informe en caché, así que ordenar o cambiar de página no
 * consulta.
 */
function TablaActivos({ filas, onAbrir }: { filas: FilaActivo[]; onAbrir: (id: string) => void }) {
  const [busqueda, setBusqueda] = useState("");
  // Sin orden elegido: el ranking ya llega de la base por horas detenido y
  // fallas, y así ninguna columna aparece marcada de entrada.
  const [orden, setOrden] = useState<SortingState>([]);
  const [pagina, setPagina] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const columnas = useMemo<ColumnDef<FilaActivo>[]>(() => [
    {
      id: "activo", header: "Activo", accessorFn: f => f.asset.nombre,
      cell: ({ getValue }) => <span style={{ color: C.text1 }}>{getValue<string>()}</span>,
    },
    {
      id: "criticidad", header: "Criticidad",
      accessorFn: f => CRIT_ORDEN[f.asset.criticidad ?? "no_critico"],
      cell: ({ row }) => {
        const c = row.original.asset.criticidad ?? "no_critico";
        return (
          <span style={{ fontSize: 14, padding: "2px 8px", borderRadius: 6,
            background: c === "critico" ? C.dangerBg : c === "semi_critico" ? C.warningBg : C.successBg,
            color: CRIT_FILL[c] }}>
            {CRIT_LABEL[c]}
          </span>
        );
      },
    },
    { id: "fallas", header: "Fallas", accessorFn: f => f.m.fallas, cell: ({ getValue }) => <span style={{ color: C.text1 }}>{getValue<number>()}</span> },
    // Sin dato (sin fallas) va al final al ordenar, no como 0.
    { id: "mtbf", header: "MTBF", accessorFn: f => f.m.mtbfHoras ?? undefined, sortUndefined: "last", cell: ({ row }) => fmtHours(row.original.m.mtbfHoras) },
    { id: "mttr", header: "MTTR", accessorFn: f => f.m.mttrHoras ?? undefined, sortUndefined: "last", cell: ({ row }) => fmtHours(row.original.m.mttrHoras) },
    { id: "detenido", header: "Detenido", accessorFn: f => f.m.imprevistaHoras, cell: ({ getValue }) => `${getValue<number>().toFixed(1)} h` },
    {
      id: "costo", header: "Costo", accessorFn: f => f.costo ?? undefined, sortUndefined: "last",
      cell: ({ row }) => (row.original.costo == null ? "—" : `$${Math.round(row.original.costo).toLocaleString("es-CL")}`),
    },
    {
      id: "disponibilidad", header: "Disponibilidad", accessorFn: f => f.m.disponibilidadPct ?? undefined, sortUndefined: "last",
      cell: ({ row }) => {
        const v = row.original.m.disponibilidadPct;
        return <span style={{ color: v == null ? C.text3 : v >= 99 ? C.success : v >= 95 ? C.warning : C.danger }}>{fmtPct(v, 2)}</span>;
      },
    },
  ], []);

  const tabla = useReactTable({
    data: filas,
    columns: columnas,
    state: { globalFilter: busqueda, sorting: orden, pagination: pagina },
    onGlobalFilterChange: (u: unknown) => {
      setBusqueda(typeof u === "function" ? (u as (v: string) => string)(busqueda) : String(u ?? ""));
      setPagina(p => ({ ...p, pageIndex: 0 }));
    },
    onSortingChange: u => { setOrden(u); setPagina(p => ({ ...p, pageIndex: 0 })); },
    onPaginationChange: setPagina,
    // A mano (arriba): el reinicio automático también salta al refrescarse el informe.
    autoResetPageIndex: false,
    globalFilterFn: (row, _id, texto: string) => row.original.asset.nombre.toLowerCase().includes(texto.trim().toLowerCase()),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Si el informe se achica (otro filtro) y la página actual ya no existe, a la última.
  const totalPaginas = tabla.getPageCount();
  if (pagina.pageIndex > 0 && pagina.pageIndex >= totalPaginas) {
    setPagina(p => ({ ...p, pageIndex: Math.max(0, totalPaginas - 1) }));
  }

  if (filas.length === 0) {
    return (
      <div style={{ padding: 28, color: C.text3, fontSize: 14, textAlign: "center" }}>
        Sin historial de estados en el período.
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
        <BuscadorTabla value={busqueda} onChange={v => tabla.setGlobalFilter(v)} placeholder="Buscar activo…" />
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
          <EncabezadoTabla tabla={tabla} derecha={COLUMNAS_NUMERICAS} />
          <tbody>
            {tabla.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columnas.length} style={{ padding: 28, textAlign: "center", color: C.text3, fontSize: 14 }}>
                  Ningún activo coincide con la búsqueda.
                </td>
              </tr>
            ) : tabla.getRowModel().rows.map(r => (
              <tr key={r.id} onClick={() => onAbrir(r.original.asset.id)}
                style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                {r.getVisibleCells().map(c => (
                  <td key={c.id} style={{ ...celdaActivo, textAlign: COLUMNAS_NUMERICAS.includes(c.column.id) ? "right" : "left" }}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PaginacionTabla tabla={tabla} />
    </>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 28px", textAlign: "center", color: C.text3, fontSize: 14 }}>
      {text}
    </div>
  );
}
