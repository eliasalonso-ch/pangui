"use client";

/**
 * Analítica de un medidor: la serie en el tiempo, con selector de rango y
 * lectura punto a punto.
 *
 * Contesta lo que el número en vivo no puede: no "cuánto vibra ahora" sino
 * "viene subiendo hace cuánto". Esa frase —"la vibración subió 42% en dos
 * semanas"— es lo que distingue mantenimiento predictivo de una alarma.
 *
 * TODO en este gráfico está indexado por `lectura.ts` (el instante de la
 * MEDICIÓN, no el de la inserción). Por eso una lectura que entra tarde —el
 * buffer de un gateway que reconectó, una ronda offline que sincronizó tres
 * horas después, o una respuesta de procedimiento— cae donde corresponde y no
 * al final. Ver `fn_paso_respuesta_a_lectura`, que copia `respondido_at`.
 *
 * Esto estuvo dibujado a mano en SVG con la idea de que recharts no valía sus
 * ~100 kB para una polilínea. Salía más caro igual: la escala, el recorte al
 * área, el agrupado del hover y la correspondencia entre el viewBox y los
 * marcadores en % eran todos código propio, y cada uno tuvo su bug (la serie
 * aplastada contra el eje, la línea pasando al lado de los puntos, el trazo
 * escapándose fuera del gráfico). recharts ya está en el bundle —lo usan
 * /inicio, /analitica y /ubicaciones— así que no cuesta nada nuevo y trae el
 * eje de tiempo, el tooltip y el clipping resueltos.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  fetchLecturas, nivelDeLectura,
  type Lectura, type MedidorConUltima,
} from "@/lib/medidores-api";
import { MS_POR_HORA, RANGOS, instantesDeTiempo } from "@/lib/eje-tiempo";

const ALTO = 240;

const COLOR_ADV = "var(--warning)";
const COLOR_CRIT = "var(--danger)";
const COLOR_SERIE = "var(--brand)";

function fmtFechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Dominio vertical.
 *
 * Se ajusta al RANGO de los datos y no se ancla en 0: una serie que vive entre
 * 7,5 y 7,6 contra un eje 0–8,5 se ve como una raya plana, y la variación —que
 * es justamente lo que se viene a mirar— desaparece.
 *
 * Los umbrales entran en la cuenta sólo si ya caen cerca de la serie. Meterlos
 * siempre era lo que aplastaba el gráfico cuando el crítico está diez veces por
 * encima de la operación normal; para eso están las `ReferenceLine`, que se
 * dibujan si el umbral cae dentro del dominio y si no, no.
 */
function dominio(valores: number[]): [number, number] {
  const vs = valores.filter(Number.isFinite);
  if (vs.length === 0) return [0, 1];

  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (max === min) { min -= 1; max += 1; }

  // Paso "usable" (progresión 1/2/5) para que las guías caigan en números
  // legibles y no en 137,4 — el eje se lee, no se descifra.
  const margen = (max - min) * 0.12;
  const crudo = (max - min + margen * 2) / 4;
  const magnitud = Math.pow(10, Math.floor(Math.log10(crudo || 1)));
  const norm = crudo / magnitud;
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitud;

  return [
    Math.floor((min - margen) / paso) * paso,
    Math.ceil((max + margen) / paso) * paso,
  ];
}

/** Decimales según lo fino que sea el tramo entre guías: con un dominio de 0,4
 *  los cortes caen en 7,5 / 7,6; con uno de 0,004 hacen falta más dígitos o las
 *  etiquetas salen todas iguales. */
function decimales([min, max]: [number, number]) {
  return Math.max(0, Math.min(6, -Math.floor(Math.log10((max - min) / 4 || 1)) + 1));
}

export interface MedidorAnaliticaProps {
  medidor: MedidorConUltima;
  /** Se avanza para forzar una relectura (después de registrar una lectura). */
  refrescar?: number;
  onVerTodas?: () => void;
}

export default function MedidorAnalitica({ medidor, refrescar = 0, onVerTodas }: MedidorAnaliticaProps) {
  const [rango, setRango] = useState<(typeof RANGOS)[number]["key"]>("1d");
  const [ahora, setAhora] = useState(() => Date.now());
  const [lecturas, setLecturas] = useState<Lectura[]>([]);
  const [cargando, setCargando] = useState(true);

  /**
   * El reloj se mueve acá dentro, junto con la consulta.
   *
   * Al cambiar de rango el borde derecho tiene que ser "ahora" y no el instante
   * en que se montó el panel; hacerlo en el mismo efecto que pide la serie deja
   * una sola fuente de verdad (y el cuerpo del componente puro, sin `Date.now()`
   * en render).
   */
  useEffect(() => {
    let vivo = true;
    const horas = RANGOS.find(r => r.key === rango)?.horas ?? 24;
    const hasta = Date.now();
    const desde = new Date(hasta - horas * MS_POR_HORA);

    fetchLecturas(medidor.id, desde, new Date(hasta))
      .then(l => {
        if (!vivo) return;
        // El reloj se fija junto con los datos, en el callback y no en el cuerpo
        // del efecto: así el borde derecho y la serie corresponden al mismo
        // instante, y no hay un setState suelto que dispare un render de más.
        setAhora(hasta);
        setLecturas(l);
      })
      .catch(() => { if (vivo) { setAhora(hasta); setLecturas([]); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [medidor.id, rango, refrescar]);

  function cambiarRango(k: (typeof RANGOS)[number]["key"]) {
    if (k === rango) return;
    setRango(k);
    setCargando(true);
  }

  const horas = RANGOS.find(r => r.key === rango)?.horas ?? 24;
  const t0 = ahora - horas * MS_POR_HORA;
  const t1 = ahora;

  /** La serie tal como la quiere recharts: `t` numérico para el eje de tiempo. */
  const datos = useMemo(() => lecturas
    .map(l => ({ t: new Date(l.ts).getTime(), valor: Number(l.valor), l }))
    .filter(d => Number.isFinite(d.t) && Number.isFinite(d.valor))
    // El eje de tiempo asume orden: una lectura que llegó tarde y quedó fuera de
    // secuencia dibuja la línea yendo y volviendo si no se ordena acá.
    .sort((a, b) => a.t - b.t),
  [lecturas]);

  const rangoY = useMemo(() => dominio(datos.map(d => d.valor)), [datos]);
  const dec = decimales(rangoY);
  const { ticks, rotular } = useMemo(() => instantesDeTiempo(t0, t1), [t0, t1]);

  const umbrales = [
    { v: Number(medidor.advertencia), color: COLOR_ADV },
    { v: Number(medidor.critico), color: COLOR_CRIT },
  ].filter(u => Number.isFinite(u.v) && u.v >= rangoY[0] && u.v <= rangoY[1]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>Lecturas</p>

        {/* Mismo selector de rango que /activos/[id]/estado, para que los dos
            gráficos de la app se manejen igual. */}
        <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {RANGOS.map(r => (
            <button
              key={r.key}
              type="button"
              onClick={() => cambiarRango(r.key)}
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

      <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--fg-4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {medidor.unidad}
      </p>

      {cargando ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: ALTO, gap: 8, color: "var(--fg-4)" }}>
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontSize: 14 }}>Cargando lecturas…</span>
        </div>
      ) : datos.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: ALTO }}>
          <span style={{ fontSize: 14, color: "var(--fg-4)" }}>Sin lecturas en este período.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={ALTO}>
          <LineChart data={datos} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            {/* Eje de TIEMPO real (no categórico): una lectura de las 15:04 y otra
                de las 15:06 tienen que quedar pegadas, no repartidas a lo ancho.
                `ticks` son las mismas marcas redondas que usa /activos. */}
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[t0, t1]}
              ticks={ticks}
              tickFormatter={rotular}
              tick={{ fontSize: 14, fill: "var(--fg-4)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={rangoY}
              tickFormatter={(v: number) => v.toFixed(dec)}
              tick={{ fontSize: 14, fill: "var(--fg-4)" }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
              labelFormatter={label => {
                const iso = new Date(Number(label)).toISOString();
                return `${fmtFechaCorta(iso)} ${fmtHora(iso)}`;
              }}
              formatter={value => [`${value} ${medidor.unidad}`, "Lectura"]}
            />

            {/* Umbrales: punteados, y sólo si caen dentro del dominio visible. */}
            {umbrales.map(u => (
              <ReferenceLine key={u.color} y={u.v} stroke={u.color} strokeDasharray="4 4" />
            ))}

            <Line
              type="monotone"
              dataKey="valor"
              stroke={COLOR_SERIE}
              strokeWidth={2}
              // El punto se tiñe por nivel: una lectura crítica tiene que verse
              // crítica aunque la serie entera sea azul.
              dot={({ cx, cy, payload, index }) => {
                const n = nivelDeLectura(payload.valor, medidor);
                const color = n === "critico" ? COLOR_CRIT : n === "advertencia" ? COLOR_ADV : COLOR_SERIE;
                return (
                  <circle
                    key={index}
                    cx={cx} cy={cy} r={3.5}
                    fill={color} stroke="var(--surface-1)" strokeWidth={1.5}
                  />
                );
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {onVerTodas && (
        <button
          type="button"
          onClick={onVerTodas}
          style={{
            marginTop: 18, height: 38, padding: "0 16px",
            display: "inline-flex", alignItems: "center", gap: 6,
            border: "1px solid var(--brand)", borderRadius: 8, background: "var(--brand)",
            fontSize: 14, fontWeight: 500, fontFamily: "inherit", color: "var(--fg-on-brand)", cursor: "pointer",
          }}
        >
          Ver todas las lecturas <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
