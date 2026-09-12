"use client";

/**
 * Gráfico de lecturas de un medidor en el tiempo.
 *
 * Es la pantalla que contesta la pregunta que el número en vivo no puede: no
 * "cuánto vibra ahora" sino "viene subiendo hace cuánto". Esa frase —"la
 * vibración subió 42% en dos semanas"— es la que distingue mantenimiento
 * predictivo de una alarma, y sin serie histórica no se puede decir.
 *
 * SVG y no una librería de gráficos: es una polilínea, dos líneas de umbral y
 * un eje que ya está escrito en `lib/eje-tiempo`. Meter Recharts (~100 kB) para
 * esto agregaría peso al bundle y una API que aprender, a cambio de nada que no
 * sean treinta líneas de path.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchLecturas, type Lectura, type Medidor } from "@/lib/medidores-api";
import { marcasDeTiempo } from "@/lib/eje-tiempo";

/** Alto del área de trazado. El eje de abajo va aparte. */
const ALTO = 170;
const ANCHO_ETIQUETAS = 52;

const COLOR_ADV = "#F59E0B";
const COLOR_CRIT = "#EF4444";

function fmtHora(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * Escala vertical del gráfico.
 *
 * Incluye los umbrales a propósito aunque ninguna lectura los alcance: si el
 * eje se ajustara solo a los datos, una máquina sana llenaría el alto completo
 * y parecería al borde del colapso. Viendo la línea roja arriba y la serie
 * abajo, el estado se lee de un vistazo.
 *
 * El 8% de aire evita que la serie toque el techo y que un valor quede pegado
 * al borde donde no se distingue del marco.
 */
function escala(lecturas: Lectura[], medidor: Pick<Medidor, "advertencia" | "critico">) {
  const valores = lecturas.map(l => Number(l.valor));
  const candidatos = [...valores];
  if (medidor.advertencia != null) candidatos.push(Number(medidor.advertencia));
  if (medidor.critico != null) candidatos.push(Number(medidor.critico));

  if (candidatos.length === 0) return { min: 0, max: 1 };

  let min = Math.min(...candidatos, 0);
  let max = Math.max(...candidatos);
  if (max === min) max = min + 1;

  const aire = (max - min) * 0.08;
  return { min: min - (min < 0 ? aire : 0), max: max + aire };
}

export default function LecturasChart({
  medidor, desde, hasta, refrescar,
}: {
  medidor: Medidor;
  desde: Date;
  hasta: Date;
  /** Cambiar este valor fuerza una recarga (lo usa el realtime del panel). */
  refrescar?: number;
}) {
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<{ l: Lectura; xPct: number; yPct: number } | null>(null);

  const t0 = desde.getTime();
  const t1 = hasta.getTime();
  const span = Math.max(t1 - t0, 1);

  // Se depende de los milisegundos y NO de los objetos `Date`: React compara las
  // dependencias por identidad, y la ventana crea un `Date` nuevo en cada
  // render. Con los objetos, el efecto se redispara aunque la ventana sea la
  // misma —una consulta por render— y el `setLoading(true)` de cada pasada deja
  // el gráfico parpadeando en vez de dibujar.
  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    fetchLecturas(medidor.id, new Date(t0), new Date(t1))
      .then(l => { if (!cancelado) setLecturas(l); })
      .catch(() => { if (!cancelado) setLecturas([]); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [medidor.id, t0, t1, refrescar]);

  const marcas = useMemo(() => marcasDeTiempo(t0, t1), [t0, t1]);
  const { min, max } = useMemo(() => escala(lecturas, medidor), [lecturas, medidor]);

  /** Valor → % desde arriba (el SVG crece hacia abajo). */
  const yPct = (v: number) => ((max - v) / (max - min)) * 100;
  const xPct = (iso: string) => ((new Date(iso).getTime() - t0) / span) * 100;

  const puntos = useMemo(
    () => lecturas.map(l => ({ l, x: xPct(l.ts), y: yPct(Number(l.valor)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lecturas, min, max, t0, span],
  );

  const path = useMemo(() => {
    if (puntos.length === 0) return "";
    return puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  }, [puntos]);

  /** Etiquetas del eje vertical: mínimo, medio y máximo bastan para leer escala. */
  const marcasY = useMemo(() => {
    const medio = (min + max) / 2;
    // `yPct` se recalcula acá en vez de usar el de arriba: depende solo de
    // min/max, así que incluirlo como dependencia del memo lo invalidaría en
    // cada render sin que cambie nada.
    const pctDe = (v: number) => ((max - v) / (max - min)) * 100;
    return [max, medio, min].map(v => ({
      v,
      // Sin decimales cuando el rango es grande: "1.234,567 rpm" no se lee.
      label: Math.abs(max - min) >= 20 ? Math.round(v).toString() : v.toFixed(1),
      pct: pctDe(v),
    }));
  }, [min, max]);

  return (
    <div>
      <div style={{ display: "flex" }}>
        {/* Eje vertical, fuera del área de trazado para que la grilla no lo cruce. */}
        <div style={{ flex: `0 0 ${ANCHO_ETIQUETAS}px`, position: "relative", height: ALTO }}>
          {marcasY.map((m, i) => (
            <span key={i} style={{
              position: "absolute", right: 8, top: `${m.pct}%`,
              transform: "translateY(-50%)", fontSize: 14, color: "var(--fg-4)",
              whiteSpace: "nowrap",
            }}>{m.label}</span>
          ))}
        </div>

        <div
          style={{ position: "relative", flex: 1, minWidth: 0, height: ALTO, borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Verticales del eje de tiempo */}
          {marcas.map((m, i) => (
            <span key={`v-${i}`} aria-hidden="true"
              style={{ position: "absolute", left: `${m.pct}%`, top: 0, bottom: 0, width: 1, background: "var(--border)" }} />
          ))}

          {/* Bandas de umbral: pintar la ZONA y no solo la línea hace que
              "está en rojo" se vea sin leer números. */}
          {medidor.critico != null && (
            <span aria-hidden="true" style={{
              position: "absolute", left: 0, right: 0, top: 0,
              height: `${Math.max(0, Math.min(100, yPct(Number(medidor.critico))))}%`,
              background: COLOR_CRIT + "10",
            }} />
          )}

          {[
            { v: medidor.advertencia, color: COLOR_ADV, label: "Advertencia" },
            { v: medidor.critico, color: COLOR_CRIT, label: "Alarma" },
          ].filter(u => u.v != null).map(u => {
            const pct = yPct(Number(u.v));
            if (pct < 0 || pct > 100) return null;
            return (
              <span key={u.label} aria-hidden="true" style={{
                position: "absolute", left: 0, right: 0, top: `${pct}%`,
                height: 0, borderTop: `1px dashed ${u.color}`,
              }} />
            );
          })}

          {/* La serie. `preserveAspectRatio=none` deja que el viewBox 100×100 se
              estire al tamaño real: así el path se escribe en porcentajes y no
              hay que medir el contenedor. `vectorEffect` mantiene el grosor de
              la línea constante pese a ese estirado. */}
          {puntos.length > 0 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
              <path d={path} fill="none" stroke="var(--brand)" strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}

          {/* Puntos: solo si son pocos. Con cientos de lecturas se convierten en
              una mancha y además cuestan un nodo del DOM cada uno. */}
          {puntos.length <= 60 && puntos.map(p => (
            <span key={p.l.id} aria-hidden="true" style={{
              position: "absolute", left: `${p.x}%`, top: `${p.y}%`,
              width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5,
              borderRadius: 999, background: "var(--brand)",
            }} />
          ))}

          {/* Capa de hover: una franja por lectura, para que el tooltip salga
              sin tener que apuntar al punto exacto de 5 px. */}
          {puntos.map(p => (
            <span
              key={`h-${p.l.id}`}
              onMouseEnter={() => setHover({ l: p.l, xPct: p.x, yPct: p.y })}
              style={{
                position: "absolute", top: 0, bottom: 0,
                left: `${p.x}%`, width: 14, marginLeft: -7, cursor: "crosshair",
              }}
            />
          ))}

          {hover && (
            <div style={{
              position: "absolute", left: `${hover.xPct}%`, top: `${hover.yPct}%`,
              transform: `translate(${hover.xPct > 70 ? "-105%" : "8px"}, -120%)`,
              background: "var(--surface-1)", border: "1px solid var(--border)",
              borderRadius: 8, padding: "6px 9px", boxShadow: "var(--shadow-md)",
              pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2,
            }}>
              <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>
                {Number(hover.l.valor)} {medidor.unidad}
              </span>
              <span style={{ display: "block", fontSize: 14, color: "var(--fg-4)" }}>
                {fmtHora(hover.l.ts)}
              </span>
              <span style={{ display: "block", fontSize: 14, color: "var(--fg-4)" }}>
                {hover.l.creado_por ? "Carga manual" : "Dispositivo"}
              </span>
            </div>
          )}

          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          )}

          {!loading && puntos.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--fg-4)" }}>Sin lecturas en este rango.</span>
            </div>
          )}
        </div>
      </div>

      {/* Eje horizontal, alineado con el área de trazado. */}
      <div style={{ display: "flex" }}>
        <div style={{ flex: `0 0 ${ANCHO_ETIQUETAS}px` }} />
        <div style={{ position: "relative", flex: 1, minWidth: 0, height: 20 }}>
          {marcas.map((m, i) => (
            <span key={i} style={{
              position: "absolute", left: `${m.pct}%`, top: 4,
              transform: "translateX(-50%)", fontSize: 14, color: "var(--fg-4)",
              whiteSpace: "nowrap",
            }}>{m.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
