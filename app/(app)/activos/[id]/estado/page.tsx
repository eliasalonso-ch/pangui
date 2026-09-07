"use client";

/**
 * /activos/[id]/estado — historial de estado y tiempo de inactividad.
 *
 * Responde la pregunta que `activo-metrics.ts` no puede: cuánto estuvo parado
 * de verdad este activo. Ese módulo mide el tiempo de reparación de las OTs
 * —disponibilidad inherente, optimista por definición—; acá el dato sale de
 * `activo_estado_periodos`, que registra el intervalo real de cada estado y
 * distingue la parada planificada de la avería.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, ChevronRight, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  cambiarEstadoActivo, fetchEstadoPeriodos, fetchEstadoPeriodosTodos, formatDuracion, resumirInactividad,
  type EstadoPeriodo, type TipoInactividad,
} from "@/lib/activo-estado-api";
import type { AssetStatus } from "@/types/ordenes";

const ESTADO_LABEL: Record<AssetStatus, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

const ESTADO_COLOR: Record<AssetStatus, string> = {
  operativo: "#10B981",
  fuera_servicio: "#EF4444",
  mantencion: "#F59E0B",
  baja: "#6B7280",
};

/**
 * Las filas del gráfico, de arriba hacia abajo: una por estado, en el mismo
 * orden que el selector.
 *
 * `baja` no tiene carril: dejó de ofrecerse como estado porque retirar un
 * activo ya es la acción "Eliminar" (activos.activo = false). Las filas
 * históricas que lo tengan siguen apareciendo en la tabla de abajo, pero no
 * cuentan como inactividad — ver `resumirInactividad`.
 */
const FILAS: { estados: AssetStatus[]; label: string }[] = [
  { estados: ["operativo"], label: "Operativo" },
  { estados: ["mantencion"], label: "En mantención" },
  { estados: ["fuera_servicio"], label: "Fuera de servicio" },
];

const RANGOS = [
  { key: "1h", label: "1H", horas: 1 },
  { key: "1d", label: "1D", horas: 24 },
  { key: "1s", label: "1S", horas: 24 * 7 },
  { key: "1m", label: "1M", horas: 24 * 30 },
  { key: "3m", label: "3M", horas: 24 * 90 },
  { key: "6m", label: "6M", horas: 24 * 180 },
  { key: "1a", label: "1A", horas: 24 * 365 },
] as const;

const MS_POR_HORA = 3_600_000;

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Marcas del eje en instantes REDONDOS de reloj, no en fracciones de la ventana.
 *
 * Antes el eje partia el rango en seis pedazos iguales desde "ahora", asi que
 * en la vista de 1 hora salian etiquetas como 05:18, 05:28, 05:38: numeros
 * exactos pero imposibles de usar para ubicar algo. Un eje temporal se lee por
 * los bordes conocidos —y cuarto, en punto, medianoche—, no por sextos.
 *
 * Se elige el primer paso de la escala que no produzca mas de ~8 marcas, y
 * despues se avanza desde el primer multiplo de ese paso dentro de la ventana.
 * Con eso, 1H cae de 15 en 15 minutos, 1D de 3 en 3 horas, 1S dia por dia.
 */
function marcasDeTiempo(t0: number, t1: number): { pct: number; label: string }[] {
  const largo = Math.max(t1 - t0, 1);
  const MIN = 60_000;
  const MAX_MARCAS = 8;

  // Escala de pasos "redondos". `mes` es aproximado a propósito: para rangos de
  // medio año en adelante el eje se rotula por mes y da igual que unos midan 30
  // días y otros 31.
  const PASOS = [
    5 * MIN, 15 * MIN, 30 * MIN,
    MS_POR_HORA, 3 * MS_POR_HORA, 6 * MS_POR_HORA, 12 * MS_POR_HORA,
    24 * MS_POR_HORA, 7 * 24 * MS_POR_HORA, 14 * 24 * MS_POR_HORA,
    30 * 24 * MS_POR_HORA, 90 * 24 * MS_POR_HORA,
  ];
  const paso = PASOS.find(p => largo / p <= MAX_MARCAS) ?? PASOS[PASOS.length - 1];

  // Formato segun cuanto abarca la ventana: dentro de dos días interesa la hora;
  // más allá, la fecha; más de un año, el mes.
  const conHora = largo <= 48 * MS_POR_HORA;
  const conAnio = largo > 300 * 24 * MS_POR_HORA;
  const rotular = (t: Date) =>
    conHora ? t.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : conAnio ? t.toLocaleDateString("es-CL", { month: "short", year: "2-digit" })
    : t.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });

  const out: { pct: number; label: string }[] = [];

  // Para pasos de un día o más se arranca desde la medianoche local, porque un
  // múltiplo del epoch cae a una hora arbitraria segun la zona horaria.
  let cursor: number;
  if (paso >= 24 * MS_POR_HORA) {
    const d = new Date(t0);
    d.setHours(0, 0, 0, 0);
    cursor = d.getTime();
    while (cursor < t0) cursor += paso;
  } else {
    cursor = Math.ceil(t0 / paso) * paso;
  }

  for (let t = cursor; t <= t1; t += paso) {
    out.push({ pct: ((t - t0) / largo) * 100, label: rotular(new Date(t)) });
  }

  // Una ventana muy corta puede no contener ningun multiplo: se rotulan los
  // extremos antes que dejar el eje mudo.
  if (out.length === 0) {
    return [
      { pct: 0, label: rotular(new Date(t0)) },
      { pct: 100, label: rotular(new Date(t1)) },
    ];
  }
  return out;
}

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};

export default function EstadoActivoPage() {
  const params = useParams<{ id: string }>();
  const activoId = params?.id;

  const [nombre, setNombre] = useState("");
  const [estadoActual, setEstadoActual] = useState<AssetStatus | null>(null);
  const [periodos, setPeriodos] = useState<EstadoPeriodo[]>([]);
  // Historial completo, para los totales de por vida (los de arriba).
  const [todosPeriodos, setTodosPeriodos] = useState<EstadoPeriodo[]>([]);
  const [rango, setRango] = useState<(typeof RANGOS)[number]["key"]>("1s");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Diálogo de cambio de estado.
  const [dlgOpen, setDlgOpen] = useState(false);
  const [dlgEstado, setDlgEstado] = useState<AssetStatus>("fuera_servicio");
  const [dlgTipo, setDlgTipo] = useState<TipoInactividad | "">("");
  const [dlgDesde, setDlgDesde] = useState<"ahora" | "1h" | "ayer" | "custom">("ahora");
  const [dlgCustom, setDlgCustom] = useState("");
  const [dlgNotas, setDlgNotas] = useState("");
  const [dlgBusy, setDlgBusy] = useState(false);
  const [dlgErr, setDlgErr] = useState<string | null>(null);

  // `ahora` se fija una vez por carga en vez de leerse en cada render: si no,
  // los totales y el borde derecho del grafico se calcularian con instantes
  // distintos dentro del mismo pintado. Se refresca al cambiar de rango y
  // despues de guardar un cambio de estado.
  const [ahora, setAhora] = useState(() => Date.now());

  const ventana = useMemo(() => {
    const horas = RANGOS.find(r => r.key === rango)?.horas ?? 24 * 7;
    const hasta = new Date(ahora);
    return { desde: new Date(ahora - horas * MS_POR_HORA), hasta };
  }, [rango, ahora]);

  const cargar = useCallback(async () => {
    if (!activoId) return;
    setErr(null);
    try {
      const sb = createClient();
      const [{ data: activo }, filas, todas] = await Promise.all([
        sb.from("activos").select("nombre, estado").eq("id", activoId).maybeSingle(),
        fetchEstadoPeriodos(activoId, ventana.desde, ventana.hasta),
        fetchEstadoPeriodosTodos(activoId),
      ]);
      if (!activo) { setErr("No se encontró este activo."); setLoading(false); return; }
      setNombre(activo.nombre ?? "");
      setEstadoActual((activo.estado ?? "operativo") as AssetStatus);
      setPeriodos(filas);
      setTodosPeriodos(todas);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar el historial.");
    }
    setLoading(false);
  }, [activoId, ventana.desde, ventana.hasta]);

  useEffect(() => {
    let vivo = true;
    void (async () => { if (vivo) await cargar(); })();
    return () => { vivo = false; };
  }, [cargar]);

  // Los totales son de por vida y NO siguen al selector de rango: ver "tiempo
  // de funcionamiento" cambiar al mover el zoom del gráfico confunde, porque
  // sugiere que el activo estuvo menos tiempo operativo cuando lo unico que se
  // achico fue la ventana. El grafico si es del rango — por eso los totales van
  // rotulados "historico".
  const resumen = useMemo(() => {
    if (todosPeriodos.length === 0) {
      return resumirInactividad([], ventana.desde, ventana.hasta);
    }
    // `ahora` en vez de Date.now(): el memo tiene que ser puro, y esta pagina
    // ya mantiene el reloj en estado por la misma razon.
    const inicio = todosPeriodos.reduce(
      (min, p) => Math.min(min, new Date(p.inicio).getTime()),
      ahora,
    );
    return resumirInactividad(todosPeriodos, new Date(inicio), new Date(ahora));
  }, [todosPeriodos, ventana.desde, ventana.hasta, ahora]);

  /** Convierte la elección del diálogo en la fecha real de inicio. */
  function resolverDesde(): Date | null {
    if (dlgDesde === "ahora") return null;
    if (dlgDesde === "1h") return new Date(Date.now() - MS_POR_HORA);
    if (dlgDesde === "ayer") return new Date(Date.now() - 24 * MS_POR_HORA);
    return dlgCustom ? new Date(dlgCustom) : null;
  }

  async function guardarEstado() {
    setDlgErr(null);
    if (dlgEstado !== "operativo" && !dlgTipo) {
      setDlgErr("Elige el tipo de tiempo de inactividad.");
      return;
    }
    if (dlgDesde === "custom" && !dlgCustom) {
      setDlgErr("Elige la fecha y hora de inicio.");
      return;
    }
    setDlgBusy(true);
    try {
      await cambiarEstadoActivo({
        activoId: activoId!,
        estado: dlgEstado,
        tipoInactividad: dlgEstado === "operativo" ? null : (dlgTipo as TipoInactividad),
        desde: resolverDesde(),
        notas: dlgNotas.trim() || null,
      });
      setDlgOpen(false);
      setDlgNotas("");
      setDlgTipo("");
      setDlgDesde("ahora");
      setDlgCustom("");
      setAhora(Date.now());
      await cargar();
    } catch (e) {
      setDlgErr(e instanceof Error ? e.message : "No se pudo actualizar el estado.");
    }
    setDlgBusy(false);
  }

  function abrirDialogo() {
    // Se propone el estado opuesto al actual: lo más probable es que quien
    // entra acá venga a marcar un cambio, no a reconfirmar lo mismo.
    setDlgEstado(estadoActual === "operativo" ? "fuera_servicio" : "operativo");
    setDlgTipo("");
    setDlgDesde("ahora");
    setDlgCustom("");
    setDlgNotas("");
    setDlgErr(null);
    setDlgOpen(true);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 64, color: "var(--fg-3)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 14 }}>Cargando historial…</span>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: "28px 28px", display: "grid", gap: 10 }}>
        <p style={{ fontSize: 14, color: "var(--danger)", margin: 0 }}>{err}</p>
        <Link href="/activos/activos" style={{ fontSize: 14, color: "var(--brand)" }}>Volver a Activos</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 28px 64px" }}>

      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, color: "var(--fg-3)", marginBottom: 14 }}>
        <Link href="/activos/activos" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--brand)", textDecoration: "none" }}>
          <ArrowLeft size={14} /> Activos
        </Link>
        <ChevronRight size={13} style={{ color: "var(--fg-4)" }} />
        <span style={{ color: "var(--fg-1)", fontWeight: 400 }}>{nombre || "Activo"}</span>
        <ChevronRight size={13} style={{ color: "var(--fg-4)" }} />
        <span style={{ color: "var(--fg-1)", fontWeight: 400 }}>Estado</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <button
          type="button"
          onClick={abrirDialogo}
          style={{
            height: 38, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8,
            border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)",
            fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)", cursor: "pointer",
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: estadoActual ? ESTADO_COLOR[estadoActual] : "var(--fg-4)",
          }} />
          {estadoActual ? ESTADO_LABEL[estadoActual] : "Sin estado"}
          <ChevronRight size={14} style={{ color: "var(--fg-4)", transform: "rotate(90deg)" }} />
        </button>
      </div>

      {/* Tarjeta del historial */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-1)", padding: 20, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>Historial de estado</h2>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {RANGOS.map(r => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRango(r.key)}
                style={{
                  minHeight: 30, padding: "0 11px", border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 14,
                  background: rango === r.key ? "var(--brand)" : "var(--surface-1)",
                  color: rango === r.key ? "var(--fg-on-brand)" : "var(--fg-3)",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Totales arriba, como fila de indicadores: al costado le quitaban
            ancho justo al grafico, que es lo que mejora con el espacio. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Total valor={formatDuracion(resumen.operativoHoras)} label="Tiempo de funcionamiento · histórico" color={ESTADO_COLOR.operativo} />
          <Total valor={formatDuracion(resumen.imprevistoHoras)} label="Inactividad imprevista · histórico" color={ESTADO_COLOR.fuera_servicio} />
          <Total valor={formatDuracion(resumen.planificadoHoras)} label="Inactividad planificada · histórico" color={ESTADO_COLOR.mantencion} />
          <Total
            valor={resumen.disponibilidadPct !== null ? `${resumen.disponibilidadPct.toFixed(1)}%` : "—"}
            label="Disponibilidad medida · histórico"
          />
        </div>

        <Timeline periodos={periodos} desde={ventana.desde} hasta={ventana.hasta} ahora={ahora} />

        {resumen.cubiertoHoras > 0 && (
          <p style={{ margin: "16px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
            Calculado sobre {formatDuracion(resumen.cubiertoHoras)} con registro en el período seleccionado.
          </p>
        )}
      </div>

      {/* Tabla */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-1)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                {["Estado", "Duración", "Inactividad", "Desde", "Hasta", "Notas"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 14, fontWeight: 400, color: "var(--fg-4)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periodos.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: "center", color: "var(--fg-4)", fontSize: 14 }}>
                    No hay cambios de estado en este período.
                  </td>
                </tr>
              ) : periodos.map(p => {
                const fin = p.fin ? new Date(p.fin).getTime() : ahora;
                const horas = (fin - new Date(p.inicio).getTime()) / MS_POR_HORA;
                return (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--fg-1)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: ESTADO_COLOR[p.estado] }} />
                        {ESTADO_LABEL[p.estado]}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--fg-2)" }}>
                      {formatDuracion(horas)}{p.fin ? "" : " (en curso)"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--fg-2)" }}>
                      {p.tipo_inactividad === "planeado" ? "Planificada"
                        : p.tipo_inactividad === "sin_planear" ? "Imprevista" : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--fg-2)" }}>{fmtFecha(p.inicio)}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--fg-2)" }}>{p.fin ? fmtFecha(p.fin) : "—"}</td>
                    <td style={{ padding: "12px 16px", fontSize: 14, color: "var(--fg-3)" }}>{p.notas || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Diálogo: actualizar estado ─────────────────────────────────────── */}
      {dlgOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 500,
          background: "rgba(15,23,42,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div style={{
            width: "100%", maxWidth: 460, background: "var(--surface-1)",
            border: "1px solid var(--border)", borderRadius: 12,
            boxShadow: "var(--shadow-lg)", overflow: "hidden",
          }}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>Actualizar estado del activo</h2>
              <button type="button" onClick={() => setDlgOpen(false)} disabled={dlgBusy}
                style={{ background: "none", border: "none", cursor: dlgBusy ? "default" : "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 20, display: "grid", gap: 16 }}>
              <div>
                <label style={labelStyle}>Estado</label>
                <select value={dlgEstado} disabled={dlgBusy} style={inputStyle}
                  onChange={e => {
                    const v = e.target.value as AssetStatus;
                    setDlgEstado(v);
                    // Operativo no lleva tipo: dejarlo cargado mandaría un
                    // valor que la función rechaza.
                    if (v === "operativo") setDlgTipo("");
                  }}>
                  {/* Solo los estados a los que se puede pasar: el actual no
                      se ofrece porque cambiar a lo mismo no es una acción —la
                      función lo rechaza con "ya está en ese estado"—. `baja`
                      quedó fuera del selector (ver FILAS). */}
                  {FILAS.map(f => f.estados[0]).filter(e => e !== estadoActual).map(e => (
                    <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                  ))}
                </select>
              </div>

              {/* Solo tiene sentido clasificar una parada. */}
              {dlgEstado !== "operativo" && (
                <div>
                  <label style={labelStyle}>Tipo de tiempo de inactividad</label>
                  <select value={dlgTipo} disabled={dlgBusy} style={inputStyle}
                    onChange={e => setDlgTipo(e.target.value as TipoInactividad | "")}>
                    <option value="">Elige tipo de tiempo de inactividad</option>
                    <option value="planeado">Planeado — mantención o inspección prevista</option>
                    <option value="sin_planear">Sin planear — avería o falla inesperada</option>
                  </select>
                </div>
              )}

              <div>
                <label style={labelStyle}>
                  {dlgEstado === "operativo" ? "Operativo desde" : "Fuera de línea desde"}
                </label>
                <select value={dlgDesde} disabled={dlgBusy} style={inputStyle}
                  onChange={e => setDlgDesde(e.target.value as typeof dlgDesde)}>
                  <option value="ahora">Ahora</option>
                  <option value="1h">Hace una hora</option>
                  <option value="ayer">Ayer</option>
                  <option value="custom">Elige fecha y hora</option>
                </select>
              </div>

              {dlgDesde === "custom" && (
                <div>
                  <label style={labelStyle}>Fecha y hora de inicio</label>
                  <input type="datetime-local" value={dlgCustom} disabled={dlgBusy} style={inputStyle}
                    max={new Date(ahora - new Date(ahora).getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                    onChange={e => setDlgCustom(e.target.value)} />
                </div>
              )}

              <div>
                <label style={labelStyle}>Notas (opcional)</label>
                <input type="text" value={dlgNotas} disabled={dlgBusy} style={inputStyle}
                  placeholder="Ej. Falla en el motor principal"
                  onChange={e => setDlgNotas(e.target.value)} />
              </div>

              {dlgErr && (
                <p style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0, fontSize: 14, color: "var(--danger)", lineHeight: 1.5 }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {dlgErr}
                </p>
              )}
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setDlgOpen(false)} disabled={dlgBusy}
                style={{ height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", cursor: dlgBusy ? "default" : "pointer" }}>
                Cancelar
              </button>
              <button type="button" onClick={guardarEstado} disabled={dlgBusy}
                style={{
                  height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", borderRadius: 8,
                  border: `1px solid ${dlgBusy ? "var(--border)" : "var(--brand)"}`,
                  background: dlgBusy ? "var(--surface-2)" : "var(--brand)",
                  color: dlgBusy ? "var(--fg-4)" : "var(--fg-on-brand)",
                  cursor: dlgBusy ? "default" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}>
                {dlgBusy && <Loader2 size={13} className="animate-spin" />}
                {dlgBusy ? "Guardando…" : "Actualizar estado"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Indicador. El numero va en tinta normal, no en el color de la serie: el color
 * lo lleva el punto, que es lo que lo ata a su banda del grafico. Texto de
 * color sobre fondo claro no llega a contraste y ademas compite con el dato.
 */
function Total({ valor, label, color }: { valor: string; label: string; color?: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", background: "var(--surface-1)" }}>
      <p style={{ margin: 0, fontSize: 24, fontWeight: 500, color: "var(--fg-1)", lineHeight: 1.15 }}>{valor}</p>
      <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--fg-4)", display: "inline-flex", alignItems: "center", gap: 6 }}>
        {color && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />}
        {label}
      </p>
    </div>
  );
}

/**
 * Linea de tiempo de estado: una banda por estado, cada periodo dibujado como
 * un bloque en su carril.
 *
 * Por que esta forma y no otra: el dato es UN estado discreto en cada instante,
 * no una magnitud. Una linea o un area sugerirían valores intermedios entre
 * "operativo" y "fuera de servicio", que no existen; un grafico de barras
 * perderia CUANDO paso cada cosa, que es justamente lo que se viene a mirar.
 * La banda por estado deja leer las dos cosas a la vez —cuanto y cuando— y es
 * lo mismo que hacen los CMMS del rubro.
 *
 * El color nunca va solo: cada carril lleva su etiqueta a la izquierda y hay
 * leyenda debajo, porque los colores de estado no distinguen por si solos bajo
 * daltonismo.
 */
function Timeline({ periodos, desde, hasta, ahora }: { periodos: EstadoPeriodo[]; desde: Date; hasta: Date; ahora: number }) {
  const t0 = desde.getTime();
  const t1 = Math.min(hasta.getTime(), ahora);
  const span = Math.max(t1 - t0, 1);

  // Periodo bajo el puntero. El tooltip acompana, no reemplaza: la tabla de
  // abajo tiene los mismos datos en texto.
  const [hover, setHover] = useState<{ p: EstadoPeriodo; x: number; y: number } | null>(null);

  const marcas = useMemo(() => marcasDeTiempo(t0, t1), [t0, t1]);

  const ALTO_FILA = 30;
  const ANCHO_ETIQUETAS = 136;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex" }}>
        {/* Columna de etiquetas: fuera del área de trazado, para que las líneas
            de la grilla no la crucen. */}
        <div style={{ flex: `0 0 ${ANCHO_ETIQUETAS}px` }}>
          {FILAS.map(fila => (
            <div key={fila.label} style={{ height: ALTO_FILA, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 12 }}>
              <span style={{ fontSize: 14, color: "var(--fg-3)", whiteSpace: "nowrap" }}>{fila.label}</span>
            </div>
          ))}
        </div>

        {/* Área de trazado: UNA sola caja para todos los carriles. La grilla
            vive acá y no dentro de cada fila — asi las verticales son continuas
            de arriba abajo (el eje de tiempo es comun a todos los estados) y las
            horizontales separan un carril del siguiente. Antes cada fila tenia
            su propia grilla, que reiniciaba las verticales y no dibujaba
            ninguna horizontal. */}
        <div style={{ position: "relative", flex: 1, minWidth: 0, height: FILAS.length * ALTO_FILA }}>

          {/* Horizontales: una por carril, como separador inferior. Filete
              solido, un tono sobre la superficie. */}
          {FILAS.map((fila, i) => (
            <span
              key={`h-${fila.label}`}
              aria-hidden="true"
              style={{ position: "absolute", left: 0, right: 0, top: (i + 1) * ALTO_FILA - 1, height: 1, background: "var(--border)" }}
            />
          ))}

          {/* Verticales: el eje de tiempo, continuo sobre todos los carriles. */}
          {marcas.map((m, i) => (
            <span
              key={`v-${i}`}
              aria-hidden="true"
              style={{ position: "absolute", left: `${m.pct}%`, top: 0, bottom: 0, width: 1, background: "var(--border)" }}
            />
          ))}

          {/* Barras */}
          {FILAS.map((fila, i) => {
            const barras = periodos.filter(p => fila.estados.includes(p.estado));
            return barras.map(p => {
              const ini = Math.max(new Date(p.inicio).getTime(), t0);
              const fin = Math.min(p.fin ? new Date(p.fin).getTime() : t1, t1);
              if (fin <= ini) return null;
              const left = ((ini - t0) / span) * 100;
              const width = ((fin - ini) / span) * 100;
              const abierto = p.fin === null;
              return (
                <div
                  key={p.id}
                  role="img"
                  aria-label={`${ESTADO_LABEL[p.estado]} desde ${fmtFecha(p.inicio)}${p.fin ? ` hasta ${fmtFecha(p.fin)}` : ", en curso"}`}
                  onMouseEnter={e => {
                    const caja = e.currentTarget.getBoundingClientRect();
                    const padre = e.currentTarget.offsetParent?.getBoundingClientRect();
                    setHover({ p, x: caja.left + caja.width / 2 - (padre?.left ?? 0), y: caja.top - (padre?.top ?? 0) });
                  }}
                  onMouseLeave={() => setHover(null)}
                  style={{
                    position: "absolute",
                    left: `${left}%`,
                    // Minimo visible: un corte de dos minutos en una ventana de
                    // un ano daria ancho 0 y desapareceria del grafico.
                    width: `max(${width}%, 3px)`,
                    // La barra no llena el carril: deja aire arriba y abajo para
                    // que se lea la grilla por detras.
                    top: i * ALTO_FILA + 7,
                    height: ALTO_FILA - 15,
                    borderRadius: 4,
                    background: ESTADO_COLOR[p.estado],
                    // El periodo abierto no termina: se corta al borde derecho
                    // en vez de cerrar con esquina redondeada.
                    borderTopRightRadius: abierto ? 0 : 4,
                    borderBottomRightRadius: abierto ? 0 : 4,
                    cursor: "default",
                  }}
                />
              );
            });
          })}
        </div>
      </div>

      {/* Eje */}
      <div style={{ display: "flex", marginTop: 8 }}>
        <span style={{ flex: `0 0 ${ANCHO_ETIQUETAS}px` }} />
        <div style={{ position: "relative", flex: 1, minWidth: 0, height: 18 }}>
          {marcas.map((m, i) => (
            <span key={i} style={{
              position: "absolute", left: `${m.pct}%`,
              // Los extremos se alinean al borde en vez de centrarse, o se
              // salen del grafico y quedan cortados.
              transform: m.pct < 4 ? "none" : m.pct > 96 ? "translateX(-100%)" : "translateX(-50%)",
              fontSize: 14, color: "var(--fg-4)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
            }}>
              {m.label}
            </span>
          ))}
        </div>
      </div>

      {/* Leyenda: el color de estado no distingue solo, asi que siempre va
          acompanado de su nombre. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 14, paddingLeft: ANCHO_ETIQUETAS }}>
        {FILAS.map(fila => (
          <span key={fila.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-3)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: ESTADO_COLOR[fila.estados[0]], flexShrink: 0 }} />
            {fila.label}
          </span>
        ))}
      </div>

      {/* Tooltip */}
      {hover && (
        <div
          role="tooltip"
          style={{
            position: "absolute", left: hover.x, top: hover.y,
            transform: "translate(-50%, calc(-100% - 8px))",
            zIndex: 5, pointerEvents: "none", whiteSpace: "nowrap",
            background: "var(--surface-1)", border: "1px solid var(--border-strong)",
            borderRadius: 8, boxShadow: "var(--shadow-lg)", padding: "8px 10px",
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-1)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: ESTADO_COLOR[hover.p.estado], flexShrink: 0 }} />
            {ESTADO_LABEL[hover.p.estado]}
            {hover.p.tipo_inactividad && (
              <span style={{ color: "var(--fg-4)" }}>
                · {hover.p.tipo_inactividad === "planeado" ? "Planificada" : "Imprevista"}
              </span>
            )}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>
            {fmtFecha(hover.p.inicio)} → {hover.p.fin ? fmtFecha(hover.p.fin) : "en curso"}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--fg-3)" }}>
            {formatDuracion(((hover.p.fin ? new Date(hover.p.fin).getTime() : ahora) - new Date(hover.p.inicio).getTime()) / MS_POR_HORA)}
          </p>
          {hover.p.notas && (
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--fg-4)", maxWidth: 260, whiteSpace: "normal" }}>{hover.p.notas}</p>
          )}
        </div>
      )}
    </div>
  );
}
