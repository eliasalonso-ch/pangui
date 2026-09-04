"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Settings, Filter, Inbox, Loader2, ChevronDown,
  Minus, Pause, Check, RotateCw, UserRoundX,
  ArrowUp, ArrowDown, AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import type { Estado, Prioridad } from "@/types/ordenes";
import {
  construirSerie, etiquetaRango, resolverRango,
  type Agrupacion, type RangoHistorial, type UnidadUltimo,
} from "@/lib/historial-ot";
import {
  fetchHistorialPagina, fetchHistorialFechas, HISTORIAL_PAGE_SIZE,
  type HistorialTarget, type FechaHistorial,
} from "@/lib/catalogo-historial-api";
import OTModal from "./OTModal";

/**
 * "Historial de Orden de Trabajo": el bloque que comparten las fichas de
 * Categoría e ITO. Gráfico de creadas vs completadas, controles de rango y
 * filtros, y debajo la lista de OTs paginada.
 *
 * El estilo sale de Órdenes y Procedimientos —mismos tokens, mismos tamaños de
 * texto, mismas tarjetas— y no de la referencia externa, para que la app se lea
 * como una sola pieza.
 *
 * La lista se pide de a 20 con scroll infinito, igual que la bandeja, y el
 * gráfico va por separado pidiendo solo fechas: traer las OTs completas de un
 * ITO con 200+ órdenes era exactamente el patrón de egress que hay que evitar.
 */

export interface OrdenHistorialItem {
  id: string;
  titulo: string | null;
  estado: Estado;
  prioridad: Prioridad;
  numero: number | null;
  created_at: string;
  completado_en?: string | null;
  solicitante: string | null;
}

// Mismas etiquetas que OTRow: el ícono lleva el color, el texto queda neutro.
const ESTADO: Record<Estado, { label: string; icon: LucideIcon; color: string }> = {
  pendiente:  { label: "Sin asignar", icon: UserRoundX, color: "var(--st-open-dot)" },
  en_espera:  { label: "En espera",   icon: Pause,      color: "var(--st-wait-dot)" },
  en_curso:   { label: "En curso",    icon: RotateCw,   color: "var(--st-progress-dot)" },
  completado: { label: "Completada",  icon: Check,      color: "var(--st-done-dot)" },
};

const PRIORIDAD: Record<Prioridad, { label: string; icon: LucideIcon; color: string }> = {
  ninguna: { label: "",        icon: Minus,         color: "transparent" },
  baja:    { label: "Baja",    icon: ArrowDown,     color: "var(--pr-low)" },
  media:   { label: "Media",   icon: Minus,         color: "var(--pr-medium)" },
  alta:    { label: "Alta",    icon: ArrowUp,       color: "var(--pr-high)" },
  urgente: { label: "Urgente", icon: AlertTriangle, color: "var(--pr-urgent)" },
};

const RANGO_INICIAL: RangoHistorial = {
  modo: "ultimo",
  cantidad: 30,
  unidad: "dias",
  agrupacion: "dia",
  acumulable: false,
};

function useClickFuera(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

const popoverStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  right: 0,
  zIndex: 50,
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-lg)",
  boxShadow: "var(--shadow-md)",
  padding: 14,
  width: 300,
};

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  color: "var(--fg-3)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  height: 32,
  padding: "0 8px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  background: "var(--surface-1)",
  color: "var(--fg-1)",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

function toInputDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fromInputDate(v: string): Date | undefined {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function RangoPopover({ rango, onChange, onClose }: {
  rango: RangoHistorial;
  onChange: (r: RangoHistorial) => void;
  onClose: () => void;
}) {
  const ref = useClickFuera(onClose);
  const { desde, hasta } = resolverRango(rango);

  const tab = (modo: "entre" | "ultimo", label: string) => {
    const activo = rango.modo === modo;
    return (
      <button
        onClick={() => onChange({ ...rango, modo })}
        style={{
          flex: 1, height: 30, borderRadius: "var(--r-md)", cursor: "pointer",
          fontSize: 14, fontWeight: 400, fontFamily: "inherit",
          border: `1px solid ${activo ? "var(--brand)" : "var(--border)"}`,
          background: activo ? "var(--brand-tint)" : "var(--surface-1)",
          color: activo ? "var(--brand-fg)" : "var(--fg-2)",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div ref={ref} style={popoverStyle}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {tab("entre", "Entre")}
        {tab("ultimo", "Último")}
      </div>

      {rango.modo === "entre" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <input
            type="date"
            value={toInputDate(desde)}
            onChange={e => onChange({ ...rango, desde: fromInputDate(e.target.value), hasta })}
            style={{ ...inputStyle, flex: 1 }}
          />
          <span style={{ color: "var(--fg-4)", fontSize: 14 }}>–</span>
          <input
            type="date"
            value={toInputDate(hasta)}
            onChange={e => onChange({ ...rango, desde, hasta: fromInputDate(e.target.value) })}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            <input
              type="number"
              min={1}
              value={rango.cantidad ?? 30}
              onChange={e => onChange({ ...rango, cantidad: Math.max(1, Number(e.target.value) || 1) })}
              style={{ ...inputStyle, width: 80 }}
            />
            <select
              value={rango.unidad ?? "dias"}
              onChange={e => onChange({ ...rango, unidad: e.target.value as UnidadUltimo })}
              style={{ ...inputStyle, flex: 1, cursor: "pointer" }}
            >
              <option value="dias">Días</option>
              <option value="semanas">Semanas</option>
              <option value="meses">Meses</option>
            </select>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rango.acumulable ?? false}
              onChange={e => onChange({ ...rango, acumulable: e.target.checked })}
              style={{ accentColor: "var(--brand)", cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, color: "var(--fg-2)" }}>Fechas acumulables</span>
          </label>
        </>
      )}

      <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 10 }}>
        <div style={labelStyle}>Agrupar por</div>
        <div style={{ display: "flex", gap: 6 }}>
          {([["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]] as [Agrupacion, string][]).map(([key, label]) => {
            const activo = rango.agrupacion === key;
            return (
              <button
                key={key}
                onClick={() => onChange({ ...rango, agrupacion: key })}
                style={{
                  flex: 1, height: 30, borderRadius: "var(--r-md)", cursor: "pointer",
                  fontSize: 14, fontWeight: 400, fontFamily: "inherit",
                  border: `1px solid ${activo ? "var(--brand)" : "var(--border)"}`,
                  background: activo ? "var(--brand-tint)" : "var(--surface-1)",
                  color: activo ? "var(--brand-fg)" : "var(--fg-2)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface FiltrosHistorial {
  estado: Estado | "todos";
  prioridad: Prioridad | "todas";
}

const FILTROS_INICIALES: FiltrosHistorial = { estado: "todos", prioridad: "todas" };

function FiltrosPopover({ filtros, onChange, onClose }: {
  filtros: FiltrosHistorial;
  onChange: (f: FiltrosHistorial) => void;
  onClose: () => void;
}) {
  const ref = useClickFuera(onClose);
  return (
    <div ref={ref} style={popoverStyle}>
      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Estado</div>
        <select
          value={filtros.estado}
          onChange={e => onChange({ ...filtros, estado: e.target.value as Estado | "todos" })}
          style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
        >
          <option value="todos">Todos</option>
          {(Object.keys(ESTADO) as Estado[]).map(k => (
            <option key={k} value={k}>{ESTADO[k].label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={labelStyle}>Prioridad</div>
        <select
          value={filtros.prioridad}
          onChange={e => onChange({ ...filtros, prioridad: e.target.value as Prioridad | "todas" })}
          style={{ ...inputStyle, width: "100%", cursor: "pointer" }}
        >
          <option value="todas">Todas</option>
          {(["urgente", "alta", "media", "baja", "ninguna"] as Prioridad[]).map(k => (
            <option key={k} value={k}>{PRIORIDAD[k].label || "Sin prioridad"}</option>
          ))}
        </select>
      </div>

      <button
        onClick={() => onChange(FILTROS_INICIALES)}
        style={{
          width: "100%", height: 30, borderRadius: "var(--r-md)", cursor: "pointer",
          border: "1px solid var(--border)", background: "var(--surface-1)",
          fontSize: 14, fontWeight: 400, color: "var(--fg-2)", fontFamily: "inherit",
        }}
      >
        Limpiar filtros
      </button>
    </div>
  );
}

function IconBtn({ active, onClick, label, children }: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "var(--r-md)", cursor: "pointer", padding: 0,
        border: `1px solid ${active ? "var(--brand)" : "transparent"}`,
        background: active ? "var(--brand-tint)" : "transparent",
        color: active ? "var(--brand-fg)" : "var(--fg-3)",
      }}
    >
      {children}
    </button>
  );
}

export default function HistorialOT({ workspaceId, target }: {
  workspaceId: string | null;
  target: HistorialTarget;
}) {
  // La OT se abre en el mismo modal que usan calendario y kanban, para no
  // perder el contexto del catálogo que se está mirando.
  const [ordenAbierta, setOrdenAbierta] = useState<string | null>(null);
  const [rango, setRango] = useState<RangoHistorial>(RANGO_INICIAL);
  const [filtros, setFiltros] = useState<FiltrosHistorial>(FILTROS_INICIALES);
  const [abierto, setAbierto] = useState<"rango" | "filtros" | null>(null);

  const [filas, setFilas] = useState<OrdenHistorialItem[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [fechas, setFechas] = useState<FechaHistorial[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // `target` es un objeto nuevo en cada render del padre: se serializa para que
  // los efectos dependan del valor y no de la identidad, y no recarguen en loop.
  const targetKey =
    target.tipo === "categoria" ? `cat:${target.categoriaId}`
    : target.tipo === "ubicacion" ? `ubi:${target.ubicacionId}`
    : target.tipo === "lugar"     ? `lug:${target.lugarId}`
    : target.tipo === "sociedad"  ? `soc:${target.sociedadId}`
    : `ito:${target.nombre}`;
  const { desde, hasta } = resolverRango(rango);
  const desdeKey = desde.getTime();

  // Primera página. Se reinicia al cambiar de ficha.
  useEffect(() => {
    if (!workspaceId) return;
    let ignorar = false;
    setCargando(true);
    setError(null);
    fetchHistorialPagina(workspaceId, target, 0)
      .then(p => {
        if (ignorar) return;
        setFilas(p.filas);
        setHayMas(p.hayMas);
      })
      .catch(e => { if (!ignorar) setError((e as Error).message); })
      .finally(() => { if (!ignorar) setCargando(false); });
    return () => { ignorar = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, targetKey]);

  // Fechas del gráfico: solo dos columnas, acotadas al inicio del rango.
  useEffect(() => {
    if (!workspaceId) return;
    let ignorar = false;
    fetchHistorialFechas(workspaceId, target, new Date(desdeKey))
      .then(f => { if (!ignorar) setFechas(f); })
      .catch(() => { /* el gráfico vacío no debe tapar la lista */ });
    return () => { ignorar = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, targetKey, desdeKey]);

  const cargarMas = useCallback(async () => {
    if (!workspaceId || cargandoMas || !hayMas) return;
    setCargandoMas(true);
    try {
      const p = await fetchHistorialPagina(workspaceId, target, filas.length);
      setFilas(prev => [...prev, ...p.filas]);
      setHayMas(p.hayMas);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargandoMas(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, targetKey, filas.length, hayMas, cargandoMas]);

  // Scroll infinito, igual que la bandeja: sentinela + margen de 240px.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hayMas) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) void cargarMas(); },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hayMas, cargarMas]);

  const serie = useMemo(() => construirSerie(fechas, rango), [fechas, rango]);

  // Los filtros acotan lo ya cargado. El gráfico sigue mostrando el total del
  // periodo: es un resumen del catálogo, no de la página visible.
  const visibles = useMemo(
    () => filas.filter(o =>
      (filtros.estado === "todos" || o.estado === filtros.estado) &&
      (filtros.prioridad === "todas" || o.prioridad === filtros.prioridad)),
    [filas, filtros],
  );

  const filtrosActivos = filtros.estado !== "todos" || filtros.prioridad !== "todas";

  return (
    <div>
      {/* Encabezado del bloque */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
          Historial de Orden de Trabajo
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative" }}>
          <span style={{ fontSize: 14, color: "var(--fg-3)" }}>{etiquetaRango(desde, hasta)}</span>
          <IconBtn
            active={abierto === "rango"}
            onClick={() => setAbierto(abierto === "rango" ? null : "rango")}
            label="Rango y agrupación"
          >
            <Settings size={14} />
          </IconBtn>
          <IconBtn
            active={abierto === "filtros" || filtrosActivos}
            onClick={() => setAbierto(abierto === "filtros" ? null : "filtros")}
            label="Filtros"
          >
            <Filter size={14} />
          </IconBtn>

          {abierto === "rango" && (
            <RangoPopover rango={rango} onChange={setRango} onClose={() => setAbierto(null)} />
          )}
          {abierto === "filtros" && (
            <FiltrosPopover filtros={filtros} onChange={setFiltros} onClose={() => setAbierto(null)} />
          )}
        </div>
      </div>

      {/* Gráfico */}
      <div style={{ height: 240, marginBottom: 8 }}>
        {cargando ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={18} className="animate-spin" style={{ color: "var(--fg-4)" }} />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ left: -14, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 14, fill: "var(--fg-4)" }}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis tick={{ fontSize: 14, fill: "var(--fg-4)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-md)",
                  fontSize: 14,
                  color: "var(--fg-1)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 14 }} />
              <Line type="monotone" dataKey="creadas" name="Creadas" stroke="var(--brand)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="completadas" name="Completadas" stroke="var(--success)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {error && (
        <div style={{ padding: "8px 0", fontSize: 14, color: "var(--danger)" }}>{error}</div>
      )}

      {/* Lista de OTs */}
      <div style={{ borderTop: "1px solid var(--divider)" }}>
        {cargando ? null : visibles.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 6, padding: "32px 16px", color: "var(--fg-4)", textAlign: "center",
          }}>
            <Inbox size={26} style={{ opacity: 0.6 }} />
            <div style={{ fontSize: 14, fontWeight: 400, color: "var(--fg-3)" }}>Sin órdenes</div>
            <div style={{ fontSize: 14 }}>
              {filtrosActivos ? "Ajusta los filtros" : "Todavía no hay órdenes asociadas"}
            </div>
          </div>
        ) : (
          visibles.map(o => {
            const est = ESTADO[o.estado];
            const pri = PRIORIDAD[o.prioridad];
            const EstIcon = est.icon;
            const PriIcon = pri.icon;
            return (
              <div
                key={o.id}
                onClick={() => setOrdenAbierta(o.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 2px", cursor: "pointer",
                  borderBottom: "1px solid var(--divider)",
                }}
              >
                <div style={{
                  width: 32, height: 32, flexShrink: 0, borderRadius: "var(--r-md)",
                  background: "var(--brand-tint)", color: "var(--brand)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Inbox size={15} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 400, color: "var(--fg-1)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {o.titulo?.trim() || "Sin título"}
                  </div>
                  {o.solicitante && (
                    <div style={{ fontSize: 14, color: "var(--fg-4)", marginTop: 2 }}>
                      Solicitada por {o.solicitante}
                    </div>
                  )}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                    <EstIcon size={13} color={est.color} strokeWidth={2.25} style={{ display: "block" }} />
                    <span style={{ fontSize: 14, color: "var(--fg-2)" }}>{est.label}</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                  {o.numero != null && (
                    <span style={{ fontSize: 14, color: "var(--fg-4)" }}>#{o.numero}</span>
                  )}
                  {pri.label && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 5,
                      fontSize: 14, fontWeight: 400,
                      padding: "2px 7px",
                      border: "1px solid var(--border-strong)",
                      borderRadius: "var(--r-sm)",
                      color: "var(--fg-1)",
                    }}>
                      <PriIcon size={13} color={pri.color} strokeWidth={2.25} style={{ display: "block" }} />
                      {pri.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Sentinela + botón de respaldo, igual que la bandeja de Órdenes. */}
        {hayMas && (
          <div ref={sentinelRef} style={{ padding: "14px 0 4px", display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => void cargarMas()}
              disabled={cargandoMas}
              style={{
                height: 34, padding: "0 14px", border: "1px solid var(--border)",
                borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-2)",
                fontSize: 14, fontWeight: 400, cursor: cargandoMas ? "default" : "pointer",
                fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 7,
              }}
            >
              {cargandoMas
                ? <><Loader2 size={12} className="animate-spin" />Cargando…</>
                : <><ChevronDown size={12} />Cargar {HISTORIAL_PAGE_SIZE} más</>}
            </button>
          </div>
        )}
      </div>

      {ordenAbierta && (
        <OTModal ordenId={ordenAbierta} onClose={() => setOrdenAbierta(null)} />
      )}
    </div>
  );
}
