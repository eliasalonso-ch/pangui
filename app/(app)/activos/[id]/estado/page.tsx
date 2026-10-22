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

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfDay, startOfDay } from "date-fns";
import { AlertCircle, ChevronRight, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  fetchEstadoPeriodosTodos, formatDuracion, resumirInactividad,
  type EstadoPeriodo,
} from "@/lib/activo-estado-api";
import type { AssetStatus } from "@/types/ordenes";
import CambiarEstadoDialog from "@/components/activos/CambiarEstadoDialog";
import { MS_POR_HORA, RANGOS, marcasDeTiempo } from "@/lib/eje-tiempo";
import LecturasChart from "@/components/activos/LecturasChart";
import HistorialEstadoTabla from "@/components/activos/HistorialEstadoTabla";
import { ESTADO_COLOR, ESTADO_LABEL, colorPeriodo, fmtDisponibilidad, fmtFecha } from "@/lib/activo-estado-ui";
import { fetchMedidoresBase } from "@/lib/medidores-api";
import { Desplegable } from "@/components/Desplegable";
import { DateRangePicker, type DateRange } from "@/components/ui/date-time-picker";

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

/** Leyenda de colores de la línea de tiempo: los mismos nombres que los totales. */
const LEYENDA = [
  { label: "Operativo", color: ESTADO_COLOR.operativo },
  { label: "Inactividad imprevista", color: ESTADO_COLOR.fuera_servicio },
  { label: "Inactividad planificada", color: ESTADO_COLOR.mantencion },
];

type RangoKey = (typeof RANGOS)[number]["key"] | "personalizado";

const RANGO_LABEL: Record<(typeof RANGOS)[number]["key"], string> = {
  "1h": "Última hora",
  "1d": "Últimas 24 horas",
  "1s": "Últimos 7 días",
  "1m": "Últimos 30 días",
  "3m": "Últimos 3 meses",
  "6m": "Últimos 6 meses",
  "1a": "Último año",
};

/**
 * Cada cuánto avanza la ventana, según su largo.
 *
 * El borde derecho se redondea hacia arriba a este paso. Dos efectos, los dos
 * buscados: la ventana (y con ella la clave de caché de cada gráfico) es la
 * misma durante todo el paso, así que volver a la pantalla o re-renderizar no
 * consulta; y al cumplirse el paso la clave cambia sola, que es el refresco.
 * Una ventana de una hora se renueva cada minuto; una de un año, cada 6 h.
 */
function pasoPara(spanMs: number) {
  if (spanMs <= MS_POR_HORA) return 60_000;
  if (spanMs <= 24 * MS_POR_HORA) return 5 * 60_000;
  if (spanMs <= 7 * 24 * MS_POR_HORA) return 15 * 60_000;
  if (spanMs <= 31 * 24 * MS_POR_HORA) return MS_POR_HORA;
  return 6 * MS_POR_HORA;
}
const redondearArriba = (t: number, paso: number) => Math.ceil(t / paso) * paso;

/** Referencia estable para "sin datos todavía" (los memos dependen de ella). */
const SIN_PERIODOS: EstadoPeriodo[] = [];

export default function EstadoActivoPage() {
  const params = useParams<{ id: string }>();
  const activoId = params?.id;

  const qc = useQueryClient();
  const [rango, setRango] = useState<RangoKey>("1s");
  // Lo que muestra el selector de fechas, y el último rango COMPLETO: entre el
  // primer y el segundo clic el rango está a medias y la ventana no se mueve.
  const [personalizado, setPersonalizado] = useState<DateRange | undefined>();
  const [rangoAplicado, setRangoAplicado] = useState<{ from: Date; to: Date } | null>(null);

  /**
   * Reloj de la pantalla. Avanzarlo solo re-renderiza: no consulta nada. Las
   * consultas salen cuando la ventana redondea a otro paso (ver `pasoPara`).
   * Con la pestaña oculta no avanza; al volver, al tiro.
   */
  const [reloj, setReloj] = useState(() => Date.now());
  useEffect(() => {
    const tic = () => { if (!document.hidden) setReloj(Date.now()); };
    const id = setInterval(tic, 30_000);
    document.addEventListener("visibilitychange", tic);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tic); };
  }, []);

  // La ventana en milisegundos: los memos y las claves de caché dependen de
  // números, que no cambian mientras la ventana sea la misma.
  let t0: number, t1: number;
  if (rango === "personalizado" && rangoAplicado) {
    t0 = startOfDay(rangoAplicado.from).getTime();
    const fin = endOfDay(rangoAplicado.to).getTime();
    // Si el rango llega hasta hoy, el borde derecho avanza como en los otros.
    t1 = fin > reloj ? Math.min(fin, redondearArriba(reloj, pasoPara(fin - t0))) : fin;
  } else {
    const span = (RANGOS.find(r => r.key === rango)?.horas ?? 24 * 7) * MS_POR_HORA;
    t1 = redondearArriba(reloj, pasoPara(span));
    t0 = t1 - span;
  }
  const ventana = useMemo(() => ({ desde: new Date(t0), hasta: new Date(t1) }), [t0, t1]);

  function elegirRango(v: RangoKey) {
    if (v === "personalizado") {
      // Arranca con la ventana que se estaba mirando: el gráfico no salta.
      const inicial = { from: new Date(t0), to: new Date(Math.min(t1, reloj)) };
      setPersonalizado(inicial);
      setRangoAplicado(inicial);
    }
    setRango(v);
  }

  /**
   * Activo + historial completo de estados, en caché por activo. Una sola
   * consulta de períodos: la ventana del gráfico se recorta acá abajo, así que
   * cambiar de rango no pide nada (un activo tiene decenas de períodos, no miles).
   */
  const estadoQ = useQuery({
    queryKey: ["activo-estado", activoId],
    enabled: !!activoId,
    staleTime: 30_000,
    queryFn: async () => {
      const [{ data: activo, error }, periodos] = await Promise.all([
        createClient().from("activos").select("nombre, estado").eq("id", activoId!).maybeSingle(),
        fetchEstadoPeriodosTodos(activoId!),
      ]);
      if (error) throw error;
      return { activo, periodos };
    },
  });
  const medidoresQ = useQuery({
    queryKey: ["medidores-activo", activoId],
    enabled: !!activoId,
    staleTime: 5 * 60_000,
    queryFn: () => fetchMedidoresBase(activoId!),
  });

  const activo = estadoQ.data?.activo;
  const nombre = activo?.nombre ?? "";
  const estadoActual = activo ? ((activo.estado ?? "operativo") as AssetStatus) : null;
  const todosPeriodos = estadoQ.data?.periodos ?? SIN_PERIODOS;
  const medidores = medidoresQ.data ?? [];
  // Los que tocan la ventana (mismo criterio que hacía la consulta aparte).
  const periodos = useMemo(
    () => todosPeriodos.filter(p =>
      new Date(p.inicio).getTime() <= t1 && (!p.fin || new Date(p.fin).getTime() >= t0)),
    [todosPeriodos, t0, t1],
  );

  // Diálogo de cambio de estado (el formulario vive en CambiarEstadoDialog).
  const [dlgOpen, setDlgOpen] = useState(false);

  // Los totales son de por vida y NO siguen al selector de rango: ver "tiempo
  // de funcionamiento" cambiar al mover el zoom del gráfico confunde, porque
  // sugiere que el activo estuvo menos tiempo operativo cuando lo unico que se
  // achico fue la ventana. El grafico si es del rango — por eso los totales van
  // rotulados "historico".
  const resumen = useMemo(() => {
    if (todosPeriodos.length === 0) {
      return resumirInactividad([], ventana.desde, ventana.hasta);
    }
    // `reloj` en vez de Date.now(): el memo tiene que ser puro.
    const inicio = todosPeriodos.reduce(
      (min, p) => Math.min(min, new Date(p.inicio).getTime()),
      reloj,
    );
    return resumirInactividad(todosPeriodos, new Date(inicio), new Date(reloj));
  }, [todosPeriodos, ventana.desde, ventana.hasta, reloj]);

  // El diálogo se monta desde cero cada vez (va tras `dlgOpen`), así que
  // arranca con los campos limpios sin resetear nada acá.
  function abrirDialogo() {
    setDlgOpen(true);
  }

  if (estadoQ.isPending) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 64, color: "var(--fg-3)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 14 }}>Cargando historial…</span>
      </div>
    );
  }

  if (estadoQ.isError || !activo) {
    return (
      <div style={{ padding: "28px 28px", display: "grid", gap: 10 }}>
        <p style={{ fontSize: 14, color: "var(--danger)", margin: 0 }}>
          {estadoQ.error instanceof Error ? estadoQ.error.message : "No se encontró este activo."}
        </p>
        <Link href="/activos/activos" style={{ fontSize: 14, color: "var(--brand)" }}>Volver a Activos</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 28px 64px" }}>

      {/* La ruta (Operaciones › Activos › Estado) la da el GlobalTopBar; acá
          solo el nombre, para saber de qué activo es el historial. */}
      <h1 style={{ fontSize: 20, fontWeight: 500, color: "var(--fg-1)", margin: "0 0 14px" }}>{nombre || "Activo"}</h1>

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
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, color: "var(--fg-1)" }}>Historial de estado</h2>
          {/* Mismo selector que /analitica/activos. "Personalizado" abre debajo
              el selector de rango de fechas. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <Desplegable<RangoKey>
              ariaLabel="Período"
              value={rango}
              onChange={elegirRango}
              opciones={[
                ...RANGOS.map(r => ({ value: r.key as RangoKey, label: RANGO_LABEL[r.key] })),
                { value: "personalizado" as const, label: "Personalizado" },
              ]}
            />
            {rango === "personalizado" && (
              <div style={{ width: 250 }}>
                <DateRangePicker
                  defaultOpen
                  value={personalizado}
                  max={new Date(reloj)}
                  onChange={r => {
                    setPersonalizado(r);
                    if (r?.from && r.to) setRangoAplicado({ from: r.from, to: r.to });
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Totales arriba, como fila de indicadores: al costado le quitaban
            ancho justo al grafico, que es lo que mejora con el espacio. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Total valor={formatDuracion(resumen.operativoHoras)} label="Tiempo de funcionamiento · histórico" color={ESTADO_COLOR.operativo} />
          <Total valor={formatDuracion(resumen.imprevistoHoras)} label="Inactividad imprevista · histórico" color={ESTADO_COLOR.fuera_servicio} />
          <Total valor={formatDuracion(resumen.planificadoHoras)} label="Inactividad planificada · histórico" color={ESTADO_COLOR.mantencion} />
          <Total
            valor={resumen.disponibilidadPct !== null ? fmtDisponibilidad(resumen.disponibilidadPct) : "—"}
            label="Disponibilidad medida · histórico"
          />
        </div>

        <Timeline periodos={periodos} desde={ventana.desde} hasta={ventana.hasta} ahora={reloj} />

        {resumen.cubiertoHoras > 0 && (
          <p style={{ margin: "16px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
            Calculado sobre {formatDuracion(resumen.cubiertoHoras)} con registro en el período seleccionado.
          </p>
        )}
      </div>

      {/* Lecturas de medidores: misma ventana que el historial de arriba, para
          poder cruzar "vibró alto" con "estuvo fuera de servicio" mirando dos
          gráficos alineados en el mismo eje. Si el activo no tiene medidores la
          sección no aparece. */}
      {medidores.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface-1)", padding: 20, marginBottom: 18 }}>
          <h2 style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
            Lecturas de medidores
          </h2>
          <div style={{ display: "grid", gap: 26 }}>
            {medidores.map(m => (
              <div key={m.id}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, color: "var(--fg-2)" }}>
                    {m.nombre} <span style={{ color: "var(--fg-4)" }}>({m.unidad})</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12, fontSize: 14, color: "var(--fg-4)" }}>
                    {m.advertencia != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 0, borderTop: "1px dashed #F59E0B" }} />
                        Advertencia {m.advertencia}
                      </span>
                    )}
                    {m.critico != null && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 0, borderTop: "1px dashed #EF4444" }} />
                        Alarma {m.critico}
                      </span>
                    )}
                  </span>
                </div>
                <LecturasChart medidor={m} desde={ventana.desde} hasta={ventana.hasta} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de cambios de estado (Data Table: buscar, filtrar, ordenar,
          paginar). Es el registro completo: NO sigue al rango del gráfico, que
          es un zoom. Sale de la misma consulta en caché que los totales. */}
      <HistorialEstadoTabla periodos={todosPeriodos} ahora={reloj} />

      {/* El formulario vive en components/activos/CambiarEstadoDialog: el
          desplegable de estado en la OT (OTDetail) abre este mismo diálogo, y
          mantener dos copias las dejaba divergir. */}
      {dlgOpen && (
        <CambiarEstadoDialog
          activoId={activoId!}
          estadoActual={estadoActual}
          onClose={() => setDlgOpen(false)}
          onSaved={async () => {
            setReloj(Date.now());
            await qc.invalidateQueries({ queryKey: ["activo-estado", activoId] });
          }}
        />
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
                    // El carril dice el estado; el color, cómo cuenta (ver colorPeriodo).
                    background: colorPeriodo(p),
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

      {/* Leyenda: los carriles ya dicen el estado a la izquierda; los colores
          dicen cómo cuenta cada tramo, con los mismos nombres que los totales.
          El color nunca va solo. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 14, paddingLeft: ANCHO_ETIQUETAS }}>
        {LEYENDA.map(l => (
          <span key={l.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-3)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, flexShrink: 0 }} />
            {l.label}
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
            <span style={{ width: 8, height: 8, borderRadius: 2, background: colorPeriodo(hover.p), flexShrink: 0 }} />
            {ESTADO_LABEL[hover.p.estado]}
            {hover.p.tipo_inactividad && (
              <span style={{ color: "var(--fg-4)" }}>
                · {hover.p.tipo_inactividad === "planeado" ? "Planificada" : "Imprevista"}
              </span>
            )}
          </p>
          {hover.p.motivo && (
            <p style={{ margin: "4px 0 0", fontSize: 14, color: "var(--fg-2)" }}>Motivo: {hover.p.motivo.nombre}</p>
          )}
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
