/**
 * Reliability metrics for a single asset (MTBF, MTTR, availability, PM
 * compliance) derived from its work-order history.
 *
 * Formulas follow standard CMMS convention:
 *   MTBF         = operating time / failure count
 *   MTTR         = total repair time / failure count
 *   Availability = MTBF / (MTBF + MTTR)   [inherent availability]
 *   PM compliance = on-time PMs / PMs that were actually due
 *
 * Two things this module deliberately does NOT do:
 *
 *  1. It never invents a number. Every metric can come back `null`, meaning
 *     "not enough data" — an asset with zero recorded failures has no MTBF, and
 *     rendering 0 or 100% there would read as "flawless" when it actually means
 *     "nothing was logged". The UI must show the empty state, not a zero.
 *
 *  2. Downtime counts active repair time only, because that is all the schema
 *     records. Real downtime also includes waiting for parts and technicians,
 *     so availability here is *inherent* availability and is optimistic by
 *     nature. Labels in the UI say so.
 */

import type { ActivoOTHistoryRow } from "./activos-api";

/** Work types that represent an unplanned failure of the asset. */
const FAILURE_TYPES = new Set(["reactiva", "emergencia"]);

/**
 * Grace period for calling a PM "on time". The common CMMS rule is 10% of the
 * interval; for a monthly PM that is ~3 days, which is what we use. Without a
 * per-asset interval in the schema, a flat 3 days is the honest approximation.
 */
const PM_GRACE_DAYS = 3;

const HOURS_PER_DAY = 24;
const MS_PER_DAY = 86_400_000;

export interface ActivoMetrics {
  /** Hours of asset uptime in the window (window minus repair time). */
  operatingHours: number;
  /** Count of unplanned failures (reactiva + emergencia). */
  failures: number;
  /** Total active repair hours across those failures. */
  repairHours: number;
  /** Mean time between failures, in hours. Null when there are no failures. */
  mtbfHours: number | null;
  /** Mean time to repair, in hours. Null when nothing was repaired. */
  mttrHours: number | null;
  /** Inherent availability 0–100. Null when there are no failures. */
  availabilityPct: number | null;
  /** Failures per 1.000 operating hours. Null when the window is empty. */
  failureRatePer1000h: number | null;
  /** PMs whose scheduled date has passed (or that are already done). */
  pmDue: number;
  /** Of those, how many were completed within the grace window. */
  pmOnTime: number;
  /** PMs scheduled in the future — not yet a compliance opportunity. */
  pmUpcoming: number;
  /** On-time PM percentage 0–100. Null when no PM has come due yet. */
  pmCompliancePct: number | null;
  /** Completed preventive count, for the PM-vs-corrective split. */
  preventiveCount: number;
  /** Completed corrective count, for the PM-vs-corrective split. */
  correctiveCount: number;
  /** Share of maintenance work that was planned, 0–100. Null when no work. */
  preventiveSharePct: number | null;
  /** Every OT linked to the asset, planned or not. */
  totalOTs: number;
  /** Sum of costo_total across linked OTs. Null when nothing is costed. */
  totalCost: number | null;
  /** Days covered by the analysis window. */
  windowDays: number;
}

export interface MetricsOptions {
  /** Size of the analysis window in days. Defaults to 365. */
  windowDays?: number;
  /** "Now" — injectable so tests are not clock-dependent. */
  now?: Date;
}

function repairHoursOf(ot: ActivoOTHistoryRow): number {
  // tiempo_total_segundos is the tracked timer and is the most reliable signal.
  if (ot.tiempo_total_segundos != null && ot.tiempo_total_segundos > 0) {
    return ot.tiempo_total_segundos / 3600;
  }
  // Fall back to the start→completion span when the timer was never run.
  if (ot.iniciado_at && ot.completado_en) {
    const ms = new Date(ot.completado_en).getTime() - new Date(ot.iniciado_at).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms / 3_600_000;
  }
  return 0;
}

/** Local YYYY-MM-DD midnight for a date-only column, avoiding UTC drift. */
function parseDateOnly(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function computeActivoMetrics(
  history: ActivoOTHistoryRow[],
  options: MetricsOptions = {},
): ActivoMetrics {
  const windowDays = options.windowDays ?? 365;
  const now = options.now ?? new Date();
  const windowStart = new Date(now.getTime() - windowDays * MS_PER_DAY);

  // An OT counts toward the window by when the work happened, falling back to
  // its scheduled date so pending PMs are still placed on the timeline.
  const inWindow = history.filter(ot => {
    const stamp = ot.completado_en ?? ot.iniciado_at ?? ot.fecha_termino;
    if (!stamp) return false;
    return new Date(stamp).getTime() >= windowStart.getTime();
  });

  const failures = inWindow.filter(
    ot => FAILURE_TYPES.has(ot.tipo_trabajo ?? "") && ot.estado === "completado",
  );
  const repairHours = failures.reduce((sum, ot) => sum + repairHoursOf(ot), 0);

  const windowHours = windowDays * HOURS_PER_DAY;
  const operatingHours = Math.max(0, windowHours - repairHours);

  const failureCount = failures.length;
  const mtbfHours = failureCount > 0 ? operatingHours / failureCount : null;
  const mttrHours = failureCount > 0 ? repairHours / failureCount : null;
  const availabilityPct =
    mtbfHours != null && mttrHours != null && mtbfHours + mttrHours > 0
      ? (mtbfHours / (mtbfHours + mttrHours)) * 100
      : null;
  const failureRatePer1000h =
    operatingHours > 0 ? (failureCount / operatingHours) * 1000 : null;

  // ── PM compliance ───────────────────────────────────────────────────────────
  // A PM scheduled in the future is NOT a miss. Counting it as due is the
  // classic off-by-one here: it silently drags compliance down and makes a
  // healthy program look like it is failing.
  const pms = inWindow.filter(ot => ot.tipo_trabajo === "preventiva");
  let pmDue = 0;
  let pmOnTime = 0;
  let pmUpcoming = 0;

  for (const pm of pms) {
    const done = pm.estado === "completado";
    const scheduled = pm.fecha_termino ? parseDateOnly(pm.fecha_termino) : null;
    const isPast = scheduled != null && scheduled.getTime() < now.getTime();

    if (!done && !isPast) { pmUpcoming++; continue; }

    pmDue++;
    if (done && scheduled && pm.completado_en) {
      const deadline = scheduled.getTime() + PM_GRACE_DAYS * MS_PER_DAY;
      if (new Date(pm.completado_en).getTime() <= deadline) pmOnTime++;
    } else if (done && !scheduled) {
      // Completed with no scheduled date — no way to call it late.
      pmOnTime++;
    }
  }

  const pmCompliancePct = pmDue > 0 ? (pmOnTime / pmDue) * 100 : null;

  const preventiveCount = pms.filter(p => p.estado === "completado").length;
  const correctiveCount = failureCount;
  const maintenanceTotal = preventiveCount + correctiveCount;
  const preventiveSharePct =
    maintenanceTotal > 0 ? (preventiveCount / maintenanceTotal) * 100 : null;

  const costed = inWindow.filter(ot => ot.costo_total != null);
  const totalCost = costed.length > 0
    ? costed.reduce((sum, ot) => sum + Number(ot.costo_total ?? 0), 0)
    : null;

  return {
    operatingHours, failures: failureCount, repairHours,
    mtbfHours, mttrHours, availabilityPct, failureRatePer1000h,
    pmDue, pmOnTime, pmUpcoming, pmCompliancePct,
    preventiveCount, correctiveCount, preventiveSharePct,
    totalOTs: inWindow.length, totalCost, windowDays,
  };
}

// ── Monthly series (for the trend charts) ─────────────────────────────────────

export interface MonthlyPoint {
  /** "2026-03" */
  key: string;
  /** Short localized label, e.g. "mar". */
  label: string;
  failures: number;
  preventives: number;
  /** Repair hours logged that month. */
  downtimeHours: number;
  /** Rolling MTBF in days at that month, or null before any failure. */
  mtbfDays: number | null;
  /** Mean repair hours for that month's failures; null when none occurred. */
  mttrHours: number | null;
  /**
   * Inherent availability for the month, 0–100. Null when no failure happened:
   * a quiet month is not evidence of 100% availability, and charting it as such
   * would draw a flat perfect line through months that were never measured.
   */
  availabilityPct: number | null;
  /** PMs that came due that month, and how many were done on time. */
  pmDue: number;
  pmOnTime: number;
  /** On-time PM share for the month; null when nothing came due. */
  pmCompliancePct: number | null;
  /** Preventive share of that month's completed work; null when idle. */
  preventiveSharePct: number | null;
}

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun",
                   "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Buckets the history into the last `months` calendar months. Months with no
 * work are still emitted so the chart keeps an even time axis instead of
 * silently compressing gaps.
 */
export function buildMonthlySeries(
  history: ActivoOTHistoryRow[],
  months = 12,
  now: Date = new Date(),
): MonthlyPoint[] {
  const buckets = new Map<string, MonthlyPoint>();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, {
      key, label: MONTHS_ES[d.getMonth()],
      failures: 0, preventives: 0, downtimeHours: 0, mtbfDays: null,
      mttrHours: null, availabilityPct: null,
      pmDue: 0, pmOnTime: 0, pmCompliancePct: null, preventiveSharePct: null,
    });
  }

  const monthKeyOf = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  for (const ot of history) {
    const isPM = ot.tipo_trabajo === "preventiva";

    // PM compliance is bucketed by the month the PM was DUE, not the month it
    // was completed. A PM due in March and closed in April is March's miss;
    // filing it under April would move the failure to an innocent month.
    if (isPM && ot.fecha_termino) {
      const due = parseDateOnly(ot.fecha_termino);
      const bucket = buckets.get(monthKeyOf(due));
      if (bucket) {
        const done = ot.estado === "completado";
        const isPast = due.getTime() < now.getTime();
        if (done || isPast) {
          bucket.pmDue++;
          if (done && ot.completado_en) {
            const deadline = due.getTime() + PM_GRACE_DAYS * MS_PER_DAY;
            if (new Date(ot.completado_en).getTime() <= deadline) bucket.pmOnTime++;
          }
        }
      }
    }

    if (ot.estado !== "completado") continue;
    const stamp = ot.completado_en ?? ot.iniciado_at;
    if (!stamp) continue;
    const bucket = buckets.get(monthKeyOf(new Date(stamp)));
    if (!bucket) continue;

    if (FAILURE_TYPES.has(ot.tipo_trabajo ?? "")) {
      bucket.failures++;
      bucket.downtimeHours += repairHoursOf(ot);
    } else if (isPM) {
      bucket.preventives++;
    }
  }

  // Rolling MTBF: uptime accumulated so far divided by failures so far. This is
  // what makes a degrading asset visible — the line falls as failures cluster.
  const series = [...buckets.values()];
  const monthHours = 30 * HOURS_PER_DAY;
  let cumulativeFailures = 0;
  let cumulativeHours = 0;

  for (const point of series) {
    cumulativeHours += monthHours - point.downtimeHours;
    cumulativeFailures += point.failures;
    point.mtbfDays = cumulativeFailures > 0
      ? Number((cumulativeHours / cumulativeFailures / HOURS_PER_DAY).toFixed(1))
      : null;

    if (point.failures > 0) {
      const mttr = point.downtimeHours / point.failures;
      point.mttrHours = Number(mttr.toFixed(2));
      // Uptime share of the month. Null when nothing failed, so a quiet month
      // never draws a fake 100% line.
      point.availabilityPct = Number(
        (((monthHours - point.downtimeHours) / monthHours) * 100).toFixed(2),
      );
    }

    if (point.pmDue > 0) {
      point.pmCompliancePct = Number(((point.pmOnTime / point.pmDue) * 100).toFixed(1));
    }

    const work = point.failures + point.preventives;
    if (work > 0) {
      point.preventiveSharePct = Number(((point.preventives / work) * 100).toFixed(1));
    }

    point.downtimeHours = Number(point.downtimeHours.toFixed(2));
  }

  return series;
}
