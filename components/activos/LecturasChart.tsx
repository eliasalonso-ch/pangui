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
 *
 * Los datos vienen ya reducidos de la base (`medidor_serie`): a lo más ~400
 * puntos por ventana, sea una hora o un año. Si un tramo agrupa varias
 * lecturas, se dibuja su promedio como línea y su mínimo/máximo como banda,
 * para que un pico que cruza el umbral no desaparezca en el promedio.
 */

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchSerie, type Medidor, type PuntoSerie } from "@/lib/medidores-api";
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

const fmtValor = (v: number) => v.toLocaleString("es-CL", { maximumFractionDigits: 3 });

/**
 * Escala vertical del gráfico.
 *
 * Incluye los umbrales a propósito aunque ninguna lectura los alcance: si el
 * eje se ajustara solo a los datos, una máquina sana llenaría el alto completo
 * y parecería al borde del colapso. Viendo la línea roja arriba y la serie
 * abajo, el estado se lee de un vistazo.
 *
 * Usa el mínimo y el máximo de cada tramo, no el promedio: la banda tiene que
 * caber entera en el alto.
 */
function escala(serie: PuntoSerie[], medidor: Pick<Medidor, "advertencia" | "critico">) {
  const candidatos = serie.flatMap(p => [p.valor_min, p.valor_max]);
  if (medidor.advertencia != null) candidatos.push(Number(medidor.advertencia));
  if (medidor.critico != null) candidatos.push(Number(medidor.critico));

  if (candidatos.length === 0) return { min: 0, max: 1 };

  // El eje sigue el RANGO de los datos y no se ancla en 0: una serie entre 7,5 y
  // 7,6 contra un eje 0–8,5 se ve como una raya plana y la variación desaparece.
  let min = Math.min(...candidatos);
  let max = Math.max(...candidatos);
  if (max === min) { min = min - 1; max = max + 1; }

  const aire = (max - min) * 0.12;
  return { min: min - aire, max: max + aire };
}

export default function LecturasChart({ medidor, desde, hasta }: {
  medidor: Medidor;
  /**
   * La ventana. Quien la arma la redondea a un paso fijo (ver la página de
   * estado): así la clave de caché es estable, volver a la pantalla no consulta
   * y la serie se renueva sola cada vez que la ventana avanza un paso.
   */
  desde: Date;
  hasta: Date;
}) {
  const [hover, setHover] = useState<{ p: PuntoSerie; x: number; y: number } | null>(null);

  const t0 = desde.getTime();
  const t1 = hasta.getTime();
  const span = Math.max(t1 - t0, 1);

  // La clave lleva los milisegundos y no los `Date`: la ventana crea objetos
  // nuevos en cada render, pero mientras no avance un paso es la misma.
  const { data: serie = [], isPending, isPlaceholderData } = useQuery({
    queryKey: ["medidor-serie", medidor.id, t0, t1],
    queryFn: () => fetchSerie(medidor.id, new Date(t0), new Date(t1)),
    // No `Infinity`: un gateway que estuvo sin red manda su buffer con el `ts`
    // de cada medición, así que una ventana ya cargada (sobre todo un rango
    // personalizado del pasado, cuya clave no cambia) puede recibir lecturas
    // tarde. Con 2 min se vuelven a pedir al volver a la pestaña; mientras se
    // mira, la ventana igual avanza de clave a su propio paso.
    staleTime: 2 * 60_000,
    // Al avanzar la ventana se sigue viendo la serie anterior mientras llega la
    // nueva, en vez de un spinner cada pocos minutos.
    placeholderData: keepPreviousData,
  });

  const marcas = useMemo(() => marcasDeTiempo(t0, t1), [t0, t1]);
  const { min, max } = useMemo(() => escala(serie, medidor), [serie, medidor]);

  /** Valor → % desde arriba (el SVG crece hacia abajo). */
  const yPct = (v: number) => ((max - v) / (max - min)) * 100;

  const puntos = useMemo(
    () => serie
      .map(p => ({
        p,
        x: ((new Date(p.ts).getTime() - t0) / span) * 100,
        y: ((max - p.valor) / (max - min)) * 100,
        yMin: ((max - p.valor_min) / (max - min)) * 100,
        yMax: ((max - p.valor_max) / (max - min)) * 100,
      }))
      // Con la serie anterior en pantalla (placeholder) puede haber puntos que
      // ya quedaron fuera de la ventana nueva.
      .filter(q => q.x >= 0 && q.x <= 100),
    [serie, min, max, t0, span],
  );

  const path = useMemo(
    () => puntos.map((q, i) => `${i === 0 ? "M" : "L"} ${q.x} ${q.y}`).join(" "),
    [puntos],
  );

  /** Banda mín–máx: solo si algún tramo agrupa más de una lectura. */
  const banda = useMemo(() => {
    if (!puntos.some(q => q.p.n > 1)) return "";
    const ida = puntos.map((q, i) => `${i === 0 ? "M" : "L"} ${q.x} ${q.yMax}`).join(" ");
    const vuelta = [...puntos].reverse().map(q => `L ${q.x} ${q.yMin}`).join(" ");
    return `${ida} ${vuelta} Z`;
  }, [puntos]);

  /** Etiquetas del eje vertical: mínimo, medio y máximo bastan para leer escala. */
  const marcasY = useMemo(() => {
    const medio = (min + max) / 2;
    const pctDe = (v: number) => ((max - v) / (max - min)) * 100;
    return [max, medio, min].map(v => ({
      v,
      // Decimales según lo fino que sea el rango: con el eje ajustado a los datos
      // un tramo de 0,1 necesita más de un decimal o las tres etiquetas salen
      // iguales; uno de miles no necesita ninguno ("1.234,567 rpm" no se lee).
      label: v.toFixed(Math.max(0, Math.min(6, -Math.floor(Math.log10(Math.abs(max - min) / 2 || 1)) + 1))),
      pct: pctDe(v),
    }));
  }, [min, max]);

  /**
   * Hover con una sola capa: busca el punto más cercano en X (los puntos vienen
   * ordenados por tiempo). Antes era una franja por punto, un nodo del DOM por
   * lectura.
   */
  function alMover(e: React.MouseEvent<HTMLDivElement>) {
    if (puntos.length === 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    let lo = 0, hi = puntos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (puntos[mid].x < x) lo = mid + 1; else hi = mid;
    }
    const cerca = lo > 0 && Math.abs(puntos[lo - 1].x - x) < Math.abs(puntos[lo].x - x) ? puntos[lo - 1] : puntos[lo];
    setHover({ p: cerca.p, x: cerca.x, y: cerca.y });
  }

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
          style={{ position: "relative", flex: 1, minWidth: 0, height: ALTO, borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)", cursor: puntos.length ? "crosshair" : undefined }}
          onMouseMove={alMover}
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
              la línea constante pese a ese estirado. Atenuada mientras se
              muestra la serie anterior y llega la de la ventana nueva. */}
          {puntos.length > 0 && (
            <svg viewBox="0 0 100 100" preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", opacity: isPlaceholderData ? 0.4 : 1, transition: "opacity 0.15s" }}>
              {banda && <path d={banda} fill="var(--brand)" fillOpacity={0.12} stroke="none" />}
              <path d={path} fill="none" stroke="var(--brand)" strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}

          {/* Puntos: solo si son pocos y crudos. Con cientos se convierten en
              una mancha y además cuestan un nodo del DOM cada uno. */}
          {puntos.length <= 60 && puntos.filter(q => q.p.n === 1).map(q => (
            <span key={q.p.ts} aria-hidden="true" style={{
              position: "absolute", left: `${q.x}%`, top: `${q.y}%`,
              width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5,
              borderRadius: 999, background: "var(--brand)",
            }} />
          ))}

          {hover && (
            <>
              <span aria-hidden="true" style={{ position: "absolute", left: `${hover.x}%`, top: 0, bottom: 0, width: 1, background: "var(--border-strong)" }} />
              <div style={{
                position: "absolute", left: `${hover.x}%`, top: `${hover.y}%`,
                transform: `translate(${hover.x > 70 ? "-105%" : "8px"}, -120%)`,
                background: "var(--surface-1)", border: "1px solid var(--border)",
                borderRadius: 8, padding: "6px 9px", boxShadow: "var(--shadow-md)",
                pointerEvents: "none", whiteSpace: "nowrap", zIndex: 2,
              }}>
                <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>
                  {fmtValor(hover.p.valor)} {medidor.unidad}{hover.p.n > 1 && " promedio"}
                </span>
                {hover.p.n > 1 && (
                  <span style={{ display: "block", fontSize: 14, color: "var(--fg-3)" }}>
                    mín {fmtValor(hover.p.valor_min)} · máx {fmtValor(hover.p.valor_max)}
                  </span>
                )}
                <span style={{ display: "block", fontSize: 14, color: "var(--fg-4)" }}>
                  {fmtHora(hover.p.ts)}
                </span>
                <span style={{ display: "block", fontSize: 14, color: "var(--fg-4)" }}>
                  {hover.p.n > 1 ? `${hover.p.n} lecturas` : hover.p.creado_por ? "Carga manual" : "Dispositivo"}
                </span>
              </div>
            </>
          )}

          {isPending && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--fg-4)" }} />
            </div>
          )}

          {!isPending && puntos.length === 0 && (
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
