/**
 * Eje de tiempo compartido: rangos del selector y marcas en horas redondas.
 *
 * Vivía dentro de /activos/[id]/estado, que era su único consumidor. Al
 * aparecer el gráfico de lecturas de medidores —que necesita exactamente el
 * mismo eje y el mismo selector 1H…1A— se extrajo acá en vez de copiarlo: dos
 * ejes de tiempo con la misma lógica se separan en cuanto alguien toca uno, y
 * el resultado son dos gráficos de la misma pantalla que rotulan distinto.
 */

export const RANGOS = [
  { key: "1h", label: "1H", horas: 1 },
  { key: "1d", label: "1D", horas: 24 },
  { key: "1s", label: "1S", horas: 24 * 7 },
  { key: "1m", label: "1M", horas: 24 * 30 },
  { key: "3m", label: "3M", horas: 24 * 90 },
  { key: "6m", label: "6M", horas: 24 * 180 },
  { key: "1a", label: "1A", horas: 24 * 365 },
] as const;

export const MS_POR_HORA = 3_600_000;

/**
 * Los mismos instantes que `marcasDeTiempo`, pero como timestamps y con el
 * rotulador aparte.
 *
 * Es lo que necesita un eje de tiempo real (recharts con `scale="time"`): las
 * marcas son valores del dominio, no porcentajes de ancho. La lógica de elegir
 * el paso redondo es una sola y vive acá abajo; esta función y la de porcentajes
 * son dos vistas de la misma cuenta.
 */
export function instantesDeTiempo(t0: number, t1: number): { ticks: number[]; rotular: (t: number) => string } {
  const { paso, cursor, rotular } = escalaDeTiempo(t0, t1);
  const ticks: number[] = [];
  for (let t = cursor; t <= t1; t += paso) ticks.push(t);
  if (ticks.length === 0) ticks.push(t0, t1);
  return { ticks, rotular: (t: number) => rotular(new Date(t)) };
}

/** Paso redondo, primer múltiplo dentro de la ventana y formato de etiqueta. */
function escalaDeTiempo(t0: number, t1: number) {
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

  return { paso, cursor, rotular };
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
export function marcasDeTiempo(t0: number, t1: number): { pct: number; label: string }[] {
  const largo = Math.max(t1 - t0, 1);
  const { paso, cursor, rotular } = escalaDeTiempo(t0, t1);

  const out: { pct: number; label: string }[] = [];
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
