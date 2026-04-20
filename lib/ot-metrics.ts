/**
 * Shared lifecycle metric helpers for work orders.
 *
 * These functions work against the existing DB columns:
 *   iniciado_at   — when work actually started (set by iniciarOrden / reanudarOrden)
 *   pausado_at    — when work was last paused (cleared on resume)
 *   updated_at    — last row update; used as completedAt proxy when estado = "completado"
 *   created_at    — always present
 *   tiempo_total_segundos — accumulated working seconds from the timer
 *
 * No new DB columns are required.
 */

export interface OTLifecycle {
  id: string;
  estado: string;
  created_at: string;
  iniciado_at: string | null;
  pausado_at?: string | null;
  updated_at: string | null;
  tiempo_total_segundos?: number | null;
  fecha_termino: string | null;
  asignados_ids: string[] | null;
}

/**
 * Hours from OT creation to first work start.
 * Returns null if work has not been started yet.
 */
export function getResponseTime(ot: OTLifecycle): number | null {
  if (!ot.iniciado_at) return null;
  return msToHours(new Date(ot.iniciado_at).getTime() - new Date(ot.created_at).getTime());
}

/**
 * Hours from OT creation to completion.
 * Uses updated_at as completedAt proxy (only meaningful when estado = "completado").
 * Returns null if not yet completed.
 */
export function getResolutionTime(ot: OTLifecycle): number | null {
  if (ot.estado !== "completado" || !ot.updated_at) return null;
  return msToHours(new Date(ot.updated_at).getTime() - new Date(ot.created_at).getTime());
}

/**
 * Hours the OT has been in en_espera (blocked/paused).
 *
 * Uses tiempo_total_segundos (accumulated timer) as the source of actual
 * working time, then derives blocked time as:
 *   totalElapsed - workingTime
 *
 * Falls back to (resolution - working) when timer data is available and
 * the OT is completed.
 *
 * Returns null when there is insufficient data.
 */
export function getBlockedDuration(ot: OTLifecycle): number | null {
  const working = getWorkingTime(ot);
  if (working === null) return null;

  // If completed: total elapsed = created → completed
  if (ot.estado === "completado" && ot.updated_at) {
    const total = msToHours(new Date(ot.updated_at).getTime() - new Date(ot.created_at).getTime());
    return Math.max(0, total - working);
  }

  // If still open: total elapsed = created → now
  const total = msToHours(Date.now() - new Date(ot.created_at).getTime());
  return Math.max(0, total - working);
}

/**
 * Hours of actual work performed.
 *
 * Primary: tiempo_total_segundos (accumulated by the timer, most accurate).
 * Fallback: iniciado_at → updated_at (only reasonable for completed OTs
 * that were never paused).
 *
 * Returns null when no timing data is available at all.
 */
export function getWorkingTime(ot: OTLifecycle): number | null {
  if (ot.tiempo_total_segundos != null && ot.tiempo_total_segundos > 0) {
    return ot.tiempo_total_segundos / 3600;
  }
  if (ot.iniciado_at && ot.updated_at && ot.estado === "completado") {
    return msToHours(new Date(ot.updated_at).getTime() - new Date(ot.iniciado_at).getTime());
  }
  return null;
}

/**
 * True when the OT is open and past its due date.
 */
export function isOverdue(ot: Pick<OTLifecycle, "estado" | "fecha_termino">): boolean {
  if (ot.estado === "completado") return false;
  if (!ot.fecha_termino) return false;
  return new Date(ot.fecha_termino).getTime() < Date.now();
}

/**
 * True when the OT has no assigned technicians.
 */
export function isUnassigned(ot: Pick<OTLifecycle, "asignados_ids">): boolean {
  return !ot.asignados_ids || ot.asignados_ids.length === 0;
}

/**
 * Days an OT has been open past its due date (0 if not overdue).
 */
export function getOverdueDays(ot: Pick<OTLifecycle, "estado" | "fecha_termino">): number {
  if (!isOverdue(ot)) return 0;
  return Math.floor((Date.now() - new Date(ot.fecha_termino!).getTime()) / 86400000);
}

/**
 * Aggregate working / waiting / total hours across a list of OTs.
 * Used by both Analítica and Inicio dashboards.
 */
export function aggregateTimeDistribution(ots: OTLifecycle[]): {
  workingHours: number;
  waitingHours: number;
  totalHours: number;
  workingPct: number;
  waitingPct: number;
} {
  let workingHours = 0;
  let waitingHours = 0;

  for (const ot of ots) {
    const w = getWorkingTime(ot);
    const b = w !== null ? getBlockedDuration(ot) : null;
    if (w !== null) workingHours += w;
    if (b !== null) waitingHours += b;
  }

  const totalHours = workingHours + waitingHours;
  return {
    workingHours,
    waitingHours,
    totalHours,
    workingPct: totalHours > 0 ? Math.round((workingHours / totalHours) * 100) : 0,
    waitingPct: totalHours > 0 ? Math.round((waitingHours / totalHours) * 100) : 0,
  };
}

/**
 * Average response time across a list of OTs (hours).
 * Only OTs with iniciado_at are counted.
 */
export function avgResponseTime(ots: OTLifecycle[]): number {
  const vals = ots.map(getResponseTime).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

/**
 * Average resolution time across completed OTs (hours).
 */
export function avgResolutionTime(ots: OTLifecycle[]): number {
  const vals = ots.map(getResolutionTime).filter((v): v is number => v !== null);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
}

/**
 * First-Time Fix Rate: % of completed OTs whose asset had only one reactive
 * completion in the period (proxy for "resolved without repeat visit").
 */
export function calcFTFR(ots: (OTLifecycle & { activo_id: string | null; tipo_trabajo: string | null })[]): number {
  const completed = ots.filter(o => o.estado === "completado");
  if (completed.length === 0) return 0;
  const assetCount: Record<string, number> = {};
  completed.forEach(o => {
    if (o.activo_id) assetCount[o.activo_id] = (assetCount[o.activo_id] ?? 0) + 1;
  });
  const singleFix = completed.filter(o => !o.activo_id || assetCount[o.activo_id] === 1).length;
  return Math.round((singleFix / completed.length) * 100);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function msToHours(ms: number): number {
  return Math.abs(ms) / 3600000;
}
