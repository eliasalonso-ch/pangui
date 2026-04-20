import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getResponseTime,
  getResolutionTime,
  getWorkingTime,
  getBlockedDuration,
  isOverdue,
  isUnassigned,
  getOverdueDays,
  aggregateTimeDistribution,
  avgResponseTime,
  avgResolutionTime,
  calcFTFR,
  type OTLifecycle,
} from "@/lib/ot-metrics";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = new Date("2025-06-15T12:00:00Z");

type OTFull = OTLifecycle & { activo_id: string | null; tipo_trabajo: string | null };

function ot(overrides: Partial<OTFull> = {}): OTFull {
  return {
    id: "ot-1",
    estado: "pendiente",
    created_at: "2025-06-10T08:00:00Z",
    iniciado_at: null,
    pausado_at: null,
    updated_at: null,
    tiempo_total_segundos: null,
    fecha_termino: null,
    activo_id: null,
    tipo_trabajo: null,
    asignados_ids: ["user-1"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── getResponseTime ───────────────────────────────────────────────────────────

describe("getResponseTime", () => {
  it("returns null when not started", () => {
    expect(getResponseTime(ot())).toBeNull();
  });

  it("calculates hours from created to iniciado_at", () => {
    const o = ot({
      created_at:  "2025-06-10T08:00:00Z",
      iniciado_at: "2025-06-10T10:00:00Z",
    });
    expect(getResponseTime(o)).toBeCloseTo(2);
  });

  it("handles same-second start (response = 0)", () => {
    const ts = "2025-06-10T08:00:00Z";
    const o = ot({ created_at: ts, iniciado_at: ts });
    expect(getResponseTime(o)).toBe(0);
  });

  it("handles response time > 24h", () => {
    const o = ot({
      created_at:  "2025-06-10T08:00:00Z",
      iniciado_at: "2025-06-11T08:00:00Z",
    });
    expect(getResponseTime(o)).toBeCloseTo(24);
  });
});

// ── getResolutionTime ─────────────────────────────────────────────────────────

describe("getResolutionTime", () => {
  it("returns null when not completed", () => {
    expect(getResolutionTime(ot({ estado: "en_curso" }))).toBeNull();
  });

  it("returns null when completado but no updated_at", () => {
    expect(getResolutionTime(ot({ estado: "completado", updated_at: null }))).toBeNull();
  });

  it("calculates hours from created to completed", () => {
    const o = ot({
      estado:      "completado",
      created_at:  "2025-06-10T08:00:00Z",
      updated_at:  "2025-06-10T16:00:00Z",
    });
    expect(getResolutionTime(o)).toBeCloseTo(8);
  });

  it("resolution time > 24h is handled correctly", () => {
    const o = ot({
      estado:     "completado",
      created_at: "2025-06-10T08:00:00Z",
      updated_at: "2025-06-12T08:00:00Z",
    });
    expect(getResolutionTime(o)).toBeCloseTo(48);
  });
});

// ── getWorkingTime ────────────────────────────────────────────────────────────

describe("getWorkingTime", () => {
  it("returns null when no timing data", () => {
    expect(getWorkingTime(ot())).toBeNull();
  });

  it("prefers tiempo_total_segundos over date diff", () => {
    const o = ot({
      estado:                "completado",
      iniciado_at:           "2025-06-10T08:00:00Z",
      updated_at:            "2025-06-10T16:00:00Z",
      tiempo_total_segundos: 7200, // 2h timer, despite 8h date range
    });
    expect(getWorkingTime(o)).toBeCloseTo(2);
  });

  it("falls back to iniciado_at→updated_at for completed with no timer", () => {
    const o = ot({
      estado:      "completado",
      iniciado_at: "2025-06-10T08:00:00Z",
      updated_at:  "2025-06-10T10:00:00Z",
    });
    expect(getWorkingTime(o)).toBeCloseTo(2);
  });

  it("does not use date fallback for non-completed OTs", () => {
    const o = ot({
      estado:      "en_curso",
      iniciado_at: "2025-06-10T08:00:00Z",
      updated_at:  "2025-06-10T10:00:00Z",
    });
    // no timer, not completed → null
    expect(getWorkingTime(o)).toBeNull();
  });

  it("returns null when tiempo_total_segundos is 0", () => {
    const o = ot({ tiempo_total_segundos: 0 });
    expect(getWorkingTime(o)).toBeNull();
  });
});

// ── getBlockedDuration ────────────────────────────────────────────────────────

describe("getBlockedDuration", () => {
  it("returns null when working time is unavailable", () => {
    expect(getBlockedDuration(ot())).toBeNull();
  });

  it("returns ~0 for an OT where all time was working (completed, no pause)", () => {
    // created 8h ago, worked 8h, completed
    const o = ot({
      estado:                "completado",
      created_at:            "2025-06-15T04:00:00Z",
      updated_at:            "2025-06-15T12:00:00Z",
      tiempo_total_segundos: 28800, // exactly 8h in seconds
    });
    expect(getBlockedDuration(o)).toBeCloseTo(0, 0);
  });

  it("calculates blocked time as total minus working (completed)", () => {
    // total = 8h (created→completed), working = 5h (timer)
    const o = ot({
      estado:                "completado",
      created_at:            "2025-06-15T04:00:00Z",
      updated_at:            "2025-06-15T12:00:00Z",
      tiempo_total_segundos: 18000, // 5h
    });
    const blocked = getBlockedDuration(o)!;
    expect(blocked).toBeCloseTo(3, 0); // 8 - 5 = 3h
  });

  it("clamps to 0 — never negative", () => {
    // Pathological: timer says 10h but elapsed was only 8h (clock skew edge case)
    const o = ot({
      estado:                "completado",
      created_at:            "2025-06-15T04:00:00Z",
      updated_at:            "2025-06-15T12:00:00Z",
      tiempo_total_segundos: 36000, // 10h — more than elapsed
    });
    expect(getBlockedDuration(o)).toBeGreaterThanOrEqual(0);
  });
});

// ── isOverdue ─────────────────────────────────────────────────────────────────

describe("isOverdue", () => {
  it("returns false when no due date", () => {
    expect(isOverdue(ot())).toBe(false);
  });

  it("returns false when completed regardless of date", () => {
    expect(isOverdue(ot({ estado: "completado", fecha_termino: "2020-01-01" }))).toBe(false);
  });

  it("returns false when due in the future", () => {
    expect(isOverdue(ot({ fecha_termino: "2030-01-01" }))).toBe(false);
  });

  it("returns true when due in the past and open", () => {
    expect(isOverdue(ot({ fecha_termino: "2020-01-01" }))).toBe(true);
  });

  it("returns true on due date boundary (due exactly now - 1ms)", () => {
    const pastMs = NOW.getTime() - 1;
    const pastIso = new Date(pastMs).toISOString();
    expect(isOverdue(ot({ fecha_termino: pastIso }))).toBe(true);
  });
});

// ── isUnassigned ──────────────────────────────────────────────────────────────

describe("isUnassigned", () => {
  it("returns true for null asignados_ids", () => {
    expect(isUnassigned(ot({ asignados_ids: null }))).toBe(true);
  });

  it("returns true for empty array", () => {
    expect(isUnassigned(ot({ asignados_ids: [] }))).toBe(true);
  });

  it("returns false when at least one assignee", () => {
    expect(isUnassigned(ot({ asignados_ids: ["user-1"] }))).toBe(false);
  });

  it("returns false for multiple assignees", () => {
    expect(isUnassigned(ot({ asignados_ids: ["u1", "u2", "u3"] }))).toBe(false);
  });
});

// ── getOverdueDays ────────────────────────────────────────────────────────────

describe("getOverdueDays", () => {
  it("returns 0 when not overdue", () => {
    expect(getOverdueDays(ot({ fecha_termino: "2030-01-01" }))).toBe(0);
  });

  it("returns 0 when no due date", () => {
    expect(getOverdueDays(ot())).toBe(0);
  });

  it("returns 0 when completed even if past due", () => {
    expect(getOverdueDays(ot({ estado: "completado", fecha_termino: "2020-01-01" }))).toBe(0);
  });

  it("returns correct days overdue", () => {
    // NOW = 2025-06-15, due = 2025-06-10 → 5 days late
    const days = getOverdueDays(ot({ fecha_termino: "2025-06-10T00:00:00Z" }));
    expect(days).toBe(5);
  });

  it("returns 1 for exactly 1 day overdue", () => {
    const days = getOverdueDays(ot({ fecha_termino: "2025-06-14T00:00:00Z" }));
    expect(days).toBe(1);
  });
});

// ── aggregateTimeDistribution ─────────────────────────────────────────────────

describe("aggregateTimeDistribution", () => {
  it("returns zeros for empty list", () => {
    const r = aggregateTimeDistribution([]);
    expect(r.workingHours).toBe(0);
    expect(r.waitingHours).toBe(0);
    expect(r.totalHours).toBe(0);
    expect(r.workingPct).toBe(0);
    expect(r.waitingPct).toBe(0);
  });

  it("percentages sum to 100 when both values are non-zero", () => {
    const list = [
      ot({ estado: "completado", created_at: "2025-06-15T04:00:00Z", updated_at: "2025-06-15T12:00:00Z", tiempo_total_segundos: 18000 }),
      ot({ id: "ot-2", estado: "completado", created_at: "2025-06-15T00:00:00Z", updated_at: "2025-06-15T08:00:00Z", tiempo_total_segundos: 7200 }),
    ];
    const r = aggregateTimeDistribution(list);
    // workingPct + waitingPct should equal 100 (may differ by 1 due to rounding)
    expect(Math.abs(r.workingPct + r.waitingPct - 100)).toBeLessThanOrEqual(1);
  });

  it("working is 100% when all time is active (no blocked time)", () => {
    // 8h total, 8h working → 0% waiting
    const o = ot({
      estado:                "completado",
      created_at:            "2025-06-15T04:00:00Z",
      updated_at:            "2025-06-15T12:00:00Z",
      tiempo_total_segundos: 28800,
    });
    const r = aggregateTimeDistribution([o]);
    expect(r.workingPct).toBe(100);
    expect(r.waitingPct).toBe(0);
  });
});

// ── avgResponseTime / avgResolutionTime ───────────────────────────────────────

describe("avgResponseTime", () => {
  it("returns 0 for empty list", () => {
    expect(avgResponseTime([])).toBe(0);
  });

  it("returns 0 when no OTs have been started", () => {
    expect(avgResponseTime([ot(), ot({ id: "ot-2" })])).toBe(0);
  });

  it("averages response times across started OTs", () => {
    const list = [
      ot({ created_at: "2025-06-10T08:00:00Z", iniciado_at: "2025-06-10T10:00:00Z" }), // 2h
      ot({ id: "ot-2", created_at: "2025-06-10T08:00:00Z", iniciado_at: "2025-06-10T12:00:00Z" }), // 4h
    ];
    expect(avgResponseTime(list)).toBeCloseTo(3); // (2+4)/2
  });

  it("ignores OTs without iniciado_at in the average", () => {
    const list = [
      ot({ created_at: "2025-06-10T08:00:00Z", iniciado_at: "2025-06-10T10:00:00Z" }), // 2h
      ot({ id: "ot-2" }), // no start
    ];
    expect(avgResponseTime(list)).toBeCloseTo(2); // only first counts
  });
});

describe("avgResolutionTime", () => {
  it("returns 0 for empty list", () => {
    expect(avgResolutionTime([])).toBe(0);
  });

  it("returns 0 when no OTs are completed", () => {
    expect(avgResolutionTime([ot({ estado: "en_curso" })])).toBe(0);
  });

  it("averages resolution times", () => {
    const list = [
      ot({ estado: "completado", created_at: "2025-06-10T08:00:00Z", updated_at: "2025-06-10T16:00:00Z" }), // 8h
      ot({ id: "ot-2", estado: "completado", created_at: "2025-06-10T08:00:00Z", updated_at: "2025-06-10T12:00:00Z" }), // 4h
    ];
    expect(avgResolutionTime(list)).toBeCloseTo(6); // (8+4)/2
  });
});

// ── calcFTFR ──────────────────────────────────────────────────────────────────

describe("calcFTFR", () => {
  it("returns 0 for empty list", () => {
    expect(calcFTFR([])).toBe(0);
  });

  it("returns 0 when no completed OTs", () => {
    const list = [ot({ estado: "pendiente", activo_id: "a1", tipo_trabajo: "reactiva" })];
    expect(calcFTFR(list)).toBe(0);
  });

  it("returns 100% when every asset appears only once", () => {
    const list = [
      ot({ estado: "completado", activo_id: "asset-1", tipo_trabajo: "reactiva" }),
      ot({ id: "ot-2", estado: "completado", activo_id: "asset-2", tipo_trabajo: "reactiva" }),
    ];
    expect(calcFTFR(list)).toBe(100);
  });

  it("returns 0% when every completed OT is a repeat on the same asset", () => {
    const list = [
      ot({ estado: "completado", activo_id: "asset-1", tipo_trabajo: "reactiva" }),
      ot({ id: "ot-2", estado: "completado", activo_id: "asset-1", tipo_trabajo: "reactiva" }),
    ];
    expect(calcFTFR(list)).toBe(0);
  });

  it("counts OTs with no activo_id as first-time fixes", () => {
    const list = [
      ot({ estado: "completado", activo_id: null, tipo_trabajo: "reactiva" }),
    ];
    expect(calcFTFR(list)).toBe(100);
  });

  it("correctly splits a mixed list", () => {
    // asset-1 appears twice (repeat), asset-2 once (first-fix), no-asset once (first-fix)
    // total completed = 4, first-fix = 2 → 50%
    const list = [
      ot({ estado: "completado", activo_id: "asset-1", tipo_trabajo: "reactiva" }),
      ot({ id: "ot-2", estado: "completado", activo_id: "asset-1", tipo_trabajo: "reactiva" }),
      ot({ id: "ot-3", estado: "completado", activo_id: "asset-2", tipo_trabajo: "reactiva" }),
      ot({ id: "ot-4", estado: "completado", activo_id: null, tipo_trabajo: "reactiva" }),
    ];
    expect(calcFTFR(list)).toBe(50);
  });
});
