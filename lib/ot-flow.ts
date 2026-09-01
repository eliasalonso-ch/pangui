/**
 * Serie de flujo de OTs: creadas / completadas / backlog por período.
 *
 * Vive acá y no dentro de una página porque la usan dos: el gráfico "Flujo de
 * OTs" de /analitica/ordenes y la tarjeta de flujo de /inicio. Tenerla
 * duplicada garantizaba que las dos vistas terminaran discrepando en cuanto
 * alguien tocara una.
 */

/** Los únicos campos que necesita el cálculo. */
export interface FlowOT {
  id: string;
  estado: string;
  created_at: string;
  updated_at?: string | null;
  fecha_termino?: string | null;
  completado_en?: string | null;
}

export interface FlowPoint {
  label: string;
  creadas: number;
  completadas: number;
  /** OTs abiertas al cierre del período: es lo que dice si el backlog crece. */
  backlog: number;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Cuándo se cerró la OT.
 *
 * Prefiere `completado_en` (el sello real de cierre) y cae en
 * `fecha_termino`/`updated_at` para registros viejos que no lo tienen.
 */
export function completedAt(o: FlowOT): string | null {
  if (o.estado !== "completado") return null;
  return o.completado_en ?? o.fecha_termino ?? o.updated_at ?? null;
}

/**
 * Agrupa las OTs en `days` días hacia atrás, en cubos de `step` días.
 *
 * `step` mayor a 1 agrupa por semana, que es lo que hace legible un rango
 * largo: 90 barras diarias no se leen.
 */
export function buildFlowSeries(
  ots: FlowOT[],
  days: number,
  step = 1,
  now: Date = new Date(),
): FlowPoint[] {
  const start = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -days + 1);
  const rows: FlowPoint[] = [];

  for (let d = new Date(start); d <= now; d = addDays(d, step)) {
    const end = addDays(d, step);
    const startStr = dayKey(d);
    const endStr = dayKey(end > now ? addDays(now, 1) : end);

    let creadas = 0;
    let completadas = 0;
    let backlog = 0;

    for (const o of ots) {
      const created = o.created_at.slice(0, 10);
      if (created >= startStr && created < endStr) creadas++;

      const done = completedAt(o);
      const doneKey = done?.slice(0, 10);
      if (doneKey && doneKey >= startStr && doneKey < endStr) completadas++;

      // Abierta al cierre del cubo: creada antes y todavía sin cerrar entonces.
      if (created < endStr && (!doneKey || doneKey >= endStr)) backlog++;
    }

    rows.push({
      label: d.toLocaleDateString("es-CL", { day: "numeric", month: "short" }),
      creadas,
      completadas,
      backlog,
    });
  }

  return rows;
}

/**
 * Reparto planificado (preventiva) vs no planificado (reactiva + emergencia).
 *
 * Los demás tipos (levantamiento, presupuesto) quedan fuera a propósito: no
 * son mantenimiento, y mezclarlos distorsiona el indicador.
 */
export function planificadoVsNo(ots: Array<{ tipo_trabajo?: string | null }>): {
  planificadas: number;
  noPlanificadas: number;
  pctPlanificado: number | null;
} {
  let planificadas = 0;
  let noPlanificadas = 0;
  for (const o of ots) {
    if (o.tipo_trabajo === "preventiva") planificadas++;
    else if (o.tipo_trabajo === "reactiva" || o.tipo_trabajo === "emergencia") noPlanificadas++;
  }
  const total = planificadas + noPlanificadas;
  return {
    planificadas,
    noPlanificadas,
    // Null y no 0 cuando no hay mantenciones: "0% planificado" sobre cero OTs
    // es una lectura falsa, igual que en las métricas de activos.
    pctPlanificado: total > 0 ? (planificadas / total) * 100 : null,
  };
}

export interface BacklogBucket {
  label: string;
  count: number;
  /** Cuánto preocupa: alimenta el color de la barra. */
  tone: "ok" | "warn" | "bad";
}

/**
 * Antigüedad de la cola abierta.
 *
 * Dice algo que el flujo no: no cuántas OTs hay, sino cuánto llevan esperando.
 * Una cola estable de 80 con la mitad sobre 14 días es un problema distinto a
 * una de 80 recién abiertas.
 */
export function backlogPorAntiguedad(
  ots: Array<{ estado: string; created_at: string }>,
  now: Date = new Date(),
): BacklogBucket[] {
  const abiertas = ots.filter(o => o.estado !== "completado");
  const dias = (iso: string) => (now.getTime() - new Date(iso).getTime()) / 86_400_000;
  return [
    { label: "< 3 días",  tone: "ok",   count: abiertas.filter(o => dias(o.created_at) < 3).length },
    { label: "3-7 días",  tone: "ok",   count: abiertas.filter(o => dias(o.created_at) >= 3 && dias(o.created_at) < 7).length },
    { label: "7-14 días", tone: "warn", count: abiertas.filter(o => dias(o.created_at) >= 7 && dias(o.created_at) < 14).length },
    { label: "> 14 días", tone: "bad",  count: abiertas.filter(o => dias(o.created_at) >= 14).length },
  ];
}
