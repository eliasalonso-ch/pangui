import { describe, expect, it } from "vitest";
import { buildMonthlySeries, computeActivoMetrics } from "../lib/activo-metrics";
import type { ActivoOTHistoryRow } from "../lib/activos-api";

/**
 * These expectations are pinned to the seeded demo asset
 * (scripts/demo/seed-activo-reliability-demo.sql), whose values were verified
 * directly in SQL: 6 failures, 25.17 repair hours, MTBF 1456 h, MTTR 4.19 h,
 * availability 99.71%, PM compliance 90.9% (10 of 11 due).
 */

const NOW = new Date("2026-08-31T00:00:00");
const day = (offset: number) => new Date(NOW.getTime() - offset * 86_400_000);
const iso = (d: Date) => d.toISOString();
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

function ot(partial: Partial<ActivoOTHistoryRow>): ActivoOTHistoryRow {
  return {
    id: Math.random().toString(36).slice(2),
    titulo: null, numero: null, estado: "completado", tipo_trabajo: null,
    fecha_inicio: null, fecha_termino: null, iniciado_at: null,
    completado_en: null, tiempo_total_segundos: null, parent_id: null,
    costo_total: null, asignados_ids: null, creado_por: null,
    completado_por: null,
    ...partial,
  };
}

/** The six seeded failures: [days ago, repair minutes]. */
const FAILURES: Array<[number, number]> = [
  [338, 145], [270, 260], [188, 95], [150, 410], [132, 520], [46, 80],
];

function seededHistory(): ActivoOTHistoryRow[] {
  const rows = FAILURES.map(([ago, min], i) =>
    ot({
      tipo_trabajo: i === 1 || i === 3 || i === 4 ? "emergencia" : "reactiva",
      completado_en: iso(day(ago)),
      iniciado_at: iso(day(ago)),
      tiempo_total_segundos: min * 60,
      costo_total: 100_000,
    }),
  );

  // 11 PMs already due: 10 on time, 1 late by 9 days.
  for (let i = 0; i < 11; i++) {
    const due = day(365 - i * 30);
    const late = i === 4;
    rows.push(ot({
      tipo_trabajo: "preventiva",
      fecha_termino: dateOnly(due),
      completado_en: iso(new Date(due.getTime() + (late ? 9 : 0) * 86_400_000)),
      tiempo_total_segundos: 130 * 60,
      costo_total: 87_500,
    }));
  }

  // One PM scheduled in the future — must NOT count against compliance.
  rows.push(ot({
    tipo_trabajo: "preventiva",
    estado: "pendiente",
    fecha_termino: dateOnly(new Date(NOW.getTime() + 13 * 86_400_000)),
  }));

  return rows;
}

describe("computeActivoMetrics", () => {
  const m = computeActivoMetrics(seededHistory(), { now: NOW });

  it("counts every failure and its repair time", () => {
    expect(m.failures).toBe(6);
    expect(m.repairHours).toBeCloseTo(25.17, 1);
  });

  it("matches the SQL-verified MTBF and MTTR", () => {
    expect(m.mtbfHours).toBeCloseTo(1455.8, 0);
    expect(m.mttrHours).toBeCloseTo(4.19, 1);
  });

  it("derives availability from MTBF and MTTR", () => {
    expect(m.availabilityPct).toBeCloseTo(99.71, 1);
  });

  it("excludes future-scheduled PMs from compliance", () => {
    // The whole point: 11 due, not 12. Counting the upcoming PM as due would
    // report 83.3% instead of 90.9%.
    expect(m.pmDue).toBe(11);
    expect(m.pmUpcoming).toBe(1);
    expect(m.pmOnTime).toBe(10);
    expect(m.pmCompliancePct).toBeCloseTo(90.9, 1);
  });

  it("splits preventive vs corrective work", () => {
    expect(m.preventiveCount).toBe(11);
    expect(m.correctiveCount).toBe(6);
    expect(m.preventiveSharePct).toBeCloseTo(64.7, 1);
  });
});

describe("computeActivoMetrics — insufficient data", () => {
  it("returns null rather than a flattering zero when nothing is logged", () => {
    const m = computeActivoMetrics([], { now: NOW });
    // A brand-new asset must not read as 100% available with 0 failures.
    expect(m.mtbfHours).toBeNull();
    expect(m.mttrHours).toBeNull();
    expect(m.availabilityPct).toBeNull();
    expect(m.pmCompliancePct).toBeNull();
    expect(m.preventiveSharePct).toBeNull();
    expect(m.failures).toBe(0);
  });

  it("has no MTBF when an asset has only preventive work", () => {
    const rows = [ot({
      tipo_trabajo: "preventiva",
      fecha_termino: dateOnly(day(10)),
      completado_en: iso(day(10)),
    })];
    const m = computeActivoMetrics(rows, { now: NOW });
    expect(m.failures).toBe(0);
    expect(m.mtbfHours).toBeNull();
    expect(m.availabilityPct).toBeNull();
    expect(m.pmCompliancePct).toBe(100);
  });

  it("ignores work older than the window", () => {
    const rows = [ot({
      tipo_trabajo: "reactiva",
      completado_en: iso(day(400)),
      tiempo_total_segundos: 3600,
    })];
    expect(computeActivoMetrics(rows, { now: NOW }).failures).toBe(0);
  });

  it("falls back to the start→end span when no timer was run", () => {
    const start = day(30);
    const rows = [ot({
      tipo_trabajo: "reactiva",
      iniciado_at: iso(start),
      completado_en: iso(new Date(start.getTime() + 2 * 3_600_000)),
    })];
    expect(computeActivoMetrics(rows, { now: NOW }).repairHours).toBeCloseTo(2, 2);
  });
});

describe("buildMonthlySeries", () => {
  const series = buildMonthlySeries(seededHistory(), 12, NOW);

  it("emits one point per month, including empty ones", () => {
    expect(series).toHaveLength(12);
    expect(series.every(p => typeof p.label === "string")).toBe(true);
  });

  it("places failures in the right months and tracks rolling MTBF", () => {
    expect(series.reduce((n, p) => n + p.failures, 0)).toBe(6);
    // Rolling MTBF is undefined until the first failure lands.
    const firstWithMtbf = series.findIndex(p => p.mtbfDays != null);
    expect(firstWithMtbf).toBeGreaterThanOrEqual(0);
    expect(series.at(-1)!.mtbfDays).toBeGreaterThan(0);
  });

  it("reports per-month MTTR and availability only for months with failures", () => {
    for (const p of series) {
      if (p.failures === 0) {
        // A quiet month must not claim 100% availability — it was never measured.
        expect(p.mttrHours).toBeNull();
        expect(p.availabilityPct).toBeNull();
      } else {
        expect(p.mttrHours).toBeGreaterThan(0);
        expect(p.availabilityPct).toBeGreaterThan(0);
        expect(p.availabilityPct).toBeLessThanOrEqual(100);
      }
    }
  });

  it("buckets PM compliance by the month the PM was due, not when it closed", () => {
    // The seeded late PM is due in one month and completed 9 days later, which
    // can fall in the NEXT month. It must still count against its due month.
    const withPM = series.filter(p => p.pmDue > 0);
    expect(withPM.length).toBeGreaterThan(0);
    const missed = series.filter(p => p.pmCompliancePct != null && p.pmCompliancePct < 100);
    expect(missed).toHaveLength(1);
    expect(missed[0].pmDue).toBe(1);
    expect(missed[0].pmOnTime).toBe(0);
  });

  it("computes preventive share per month", () => {
    const active = series.filter(p => p.failures + p.preventives > 0);
    expect(active.length).toBeGreaterThan(0);
    for (const p of active) {
      expect(p.preventiveSharePct).not.toBeNull();
      expect(p.preventiveSharePct).toBeGreaterThanOrEqual(0);
      expect(p.preventiveSharePct).toBeLessThanOrEqual(100);
    }
    // Idle months stay null rather than reporting 0% preventive.
    for (const p of series.filter(x => x.failures + x.preventives === 0)) {
      expect(p.preventiveSharePct).toBeNull();
    }
  });
});
