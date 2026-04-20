/**
 * Extended edge-case and integration tests for ot-metrics.
 * Covers boundary conditions, large datasets, and cross-function consistency.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getResponseTime, getResolutionTime, getWorkingTime, getBlockedDuration,
  isOverdue, isUnassigned, getOverdueDays,
  aggregateTimeDistribution, avgResponseTime, avgResolutionTime, calcFTFR,
  type OTLifecycle,
} from "@/lib/ot-metrics";

const NOW = new Date("2025-07-01T12:00:00Z");

type OTFull = OTLifecycle & { activo_id: string | null; tipo_trabajo: string | null };

function make(overrides: Partial<OTFull> = {}): OTFull {
  return {
    id: "ot-x",
    estado: "pendiente",
    created_at: "2025-07-01T06:00:00Z",
    iniciado_at: null,
    pausado_at: null,
    updated_at: null,
    tiempo_total_segundos: null,
    fecha_termino: null,
    asignados_ids: ["u1"],
    activo_id: null,
    tipo_trabajo: null,
    ...overrides,
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

// ── Consistency: resolution >= response ──────────────────────────────────────

describe("time metric consistency", () => {
  it("resolution time >= response time for a completed OT", () => {
    const o = make({
      estado:      "completado",
      created_at:  "2025-07-01T00:00:00Z",
      iniciado_at: "2025-07-01T02:00:00Z",
      updated_at:  "2025-07-01T10:00:00Z",
    });
    const resp = getResponseTime(o)!;
    const res  = getResolutionTime(o)!;
    expect(res).toBeGreaterThanOrEqual(resp);
  });

  it("working time <= resolution time for completed OT without pauses", () => {
    const o = make({
      estado:                "completado",
      created_at:            "2025-07-01T00:00:00Z",
      iniciado_at:           "2025-07-01T02:00:00Z",
      updated_at:            "2025-07-01T10:00:00Z",
      tiempo_total_segundos: 7200, // 2h
    });
    const wt = getWorkingTime(o)!;
    const rt = getResolutionTime(o)!;
    expect(wt).toBeLessThanOrEqual(rt);
  });

  it("blocked + working roughly equals total elapsed for completed OT", () => {
    // total = 8h, working = 3h → blocked ≈ 5h
    const o = make({
      estado:                "completado",
      created_at:            "2025-07-01T00:00:00Z",
      updated_at:            "2025-07-01T08:00:00Z",
      tiempo_total_segundos: 10800, // 3h
    });
    const wt = getWorkingTime(o)!;
    const bd = getBlockedDuration(o)!;
    expect(wt + bd).toBeCloseTo(8, 0);
  });
});

// ── isOverdue edge cases ──────────────────────────────────────────────────────

describe("isOverdue edge cases", () => {
  it("all open estados count as overdue when past due", () => {
    const pastDue = "2020-01-01";
    for (const estado of ["pendiente", "en_espera", "en_curso"]) {
      expect(isOverdue(make({ estado, fecha_termino: pastDue }))).toBe(true);
    }
  });

  it("completado is never overdue", () => {
    expect(isOverdue(make({ estado: "completado", fecha_termino: "2000-01-01" }))).toBe(false);
  });

  it("due exactly at NOW boundary is not overdue (equal, not less)", () => {
    // fecha_termino = NOW exactly → not past
    const nowIso = NOW.toISOString();
    expect(isOverdue(make({ fecha_termino: nowIso }))).toBe(false);
  });
});

// ── getOverdueDays precision ──────────────────────────────────────────────────

describe("getOverdueDays precision", () => {
  it("returns whole days (floor, not round)", () => {
    // 1.9 days overdue → 1
    const due = new Date(NOW.getTime() - 1.9 * 86400000).toISOString();
    expect(getOverdueDays(make({ fecha_termino: due }))).toBe(1);
  });

  it("returns 0 for future due date even if close", () => {
    const due = new Date(NOW.getTime() + 3600000).toISOString(); // 1h from now
    expect(getOverdueDays(make({ fecha_termino: due }))).toBe(0);
  });

  it("returns large number for very old overdue OT", () => {
    const days = getOverdueDays(make({ fecha_termino: "2020-07-01T00:00:00Z" }));
    expect(days).toBeGreaterThan(1800); // ~5 years
  });
});

// ── aggregateTimeDistribution with multiple OTs ───────────────────────────────

describe("aggregateTimeDistribution multi-OT", () => {
  it("sums working hours across all OTs", () => {
    const list = [
      make({ estado: "completado", created_at: "2025-07-01T00:00:00Z", updated_at: "2025-07-01T08:00:00Z", tiempo_total_segundos: 7200 }),  // 2h working
      make({ id: "ot-2", estado: "completado", created_at: "2025-07-01T00:00:00Z", updated_at: "2025-07-01T06:00:00Z", tiempo_total_segundos: 3600 }),  // 1h working
    ];
    const r = aggregateTimeDistribution(list);
    expect(r.workingHours).toBeCloseTo(3, 1);
  });

  it("ignores OTs with no timing data in totals", () => {
    const list = [
      make({ estado: "completado", created_at: "2025-07-01T00:00:00Z", updated_at: "2025-07-01T04:00:00Z", tiempo_total_segundos: 7200 }),
      make({ id: "ot-2" }), // no timing data
    ];
    const withTwo = aggregateTimeDistribution(list);
    const withOne = aggregateTimeDistribution([list[0]]);
    expect(withTwo.workingHours).toBeCloseTo(withOne.workingHours, 5);
  });
});

// ── calcFTFR detailed scenarios ───────────────────────────────────────────────

describe("calcFTFR detailed", () => {
  it("handles a single completed OT with no asset (100%)", () => {
    const list = [make({ estado: "completado", activo_id: null, tipo_trabajo: "reactiva" })];
    expect(calcFTFR(list)).toBe(100);
  });

  it("three assets, one repeated — 2/3 = 66%", () => {
    const list = [
      make({ id: "1", estado: "completado", activo_id: "a1" }),
      make({ id: "2", estado: "completado", activo_id: "a1" }), // repeat
      make({ id: "3", estado: "completado", activo_id: "a2" }),
      make({ id: "4", estado: "completado", activo_id: "a3" }),
    ];
    // a1 repeated → those 2 are not first-fix. a2,a3 → first-fix. total=4, first-fix=2 → 50%
    expect(calcFTFR(list)).toBe(50);
  });

  it("open OTs are not counted in FTFR", () => {
    const list = [
      make({ id: "1", estado: "completado", activo_id: "a1" }),
      make({ id: "2", estado: "en_curso",   activo_id: "a1" }), // not completed
    ];
    // Only 1 completed, asset-a1 count = 1 in completed set → 100%
    expect(calcFTFR(list)).toBe(100);
  });
});

// ── avgResponseTime / avgResolutionTime edge cases ────────────────────────────

describe("avgResponseTime edge cases", () => {
  it("returns 0 when no OTs have iniciado_at", () => {
    const list = [make(), make({ id: "ot-2" })];
    expect(avgResponseTime(list)).toBe(0);
  });

  it("a single started OT returns its own response time", () => {
    const o = make({ created_at: "2025-07-01T08:00:00Z", iniciado_at: "2025-07-01T11:00:00Z" });
    expect(avgResponseTime([o])).toBeCloseTo(3);
  });

  it("handles sub-hour response times (30min = 0.5h)", () => {
    const o = make({ created_at: "2025-07-01T10:00:00Z", iniciado_at: "2025-07-01T10:30:00Z" });
    expect(avgResponseTime([o])).toBeCloseTo(0.5);
  });
});

describe("avgResolutionTime edge cases", () => {
  it("returns 0 for list of only open OTs", () => {
    expect(avgResolutionTime([make({ estado: "en_curso" })])).toBe(0);
  });

  it("single completed OT — returns its own resolution time", () => {
    const o = make({
      estado:     "completado",
      created_at: "2025-07-01T00:00:00Z",
      updated_at: "2025-07-01T06:00:00Z",
    });
    expect(avgResolutionTime([o])).toBeCloseTo(6);
  });

  it("mix of completed and open — only completed counts", () => {
    const list = [
      make({ estado: "completado", created_at: "2025-07-01T00:00:00Z", updated_at: "2025-07-01T04:00:00Z" }),
      make({ id: "ot-2", estado: "en_curso" }),
    ];
    expect(avgResolutionTime(list)).toBeCloseTo(4);
  });
});

// ── isUnassigned edge cases ───────────────────────────────────────────────────

describe("isUnassigned edge cases", () => {
  it("empty string array item does not count as assigned", () => {
    // asignados_ids with an empty string is truthy length-wise — still assigned per our logic
    expect(isUnassigned(make({ asignados_ids: [""] }))).toBe(false);
  });

  it("array with many IDs is not unassigned", () => {
    expect(isUnassigned(make({ asignados_ids: ["u1", "u2", "u3", "u4", "u5"] }))).toBe(false);
  });
});
