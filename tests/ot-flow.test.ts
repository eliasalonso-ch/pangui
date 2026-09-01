import { describe, expect, it } from "vitest";
import { backlogPorAntiguedad, buildFlowSeries, completedAt, planificadoVsNo, type FlowOT } from "../lib/ot-flow";

const NOW = new Date("2026-09-01T12:00:00");

function ot(over: Partial<FlowOT> = {}): FlowOT {
  return {
    id: Math.random().toString(36).slice(2),
    estado: "pendiente",
    created_at: "2026-09-01T08:00:00Z",
    ...over,
  };
}

describe("completedAt", () => {
  it("es null mientras la OT no esté completada", () => {
    expect(completedAt(ot({ estado: "en_curso", completado_en: "2026-08-30T10:00:00Z" }))).toBeNull();
  });

  it("prefiere completado_en sobre los campos de respaldo", () => {
    const o = ot({
      estado: "completado",
      completado_en: "2026-08-30T10:00:00Z",
      fecha_termino: "2026-08-25",
      updated_at: "2026-08-20T10:00:00Z",
    });
    expect(completedAt(o)).toBe("2026-08-30T10:00:00Z");
  });

  it("cae en fecha_termino cuando no hay completado_en", () => {
    const o = ot({ estado: "completado", fecha_termino: "2026-08-25" });
    expect(completedAt(o)).toBe("2026-08-25");
  });
});

describe("buildFlowSeries", () => {
  it("emite un punto por día del rango", () => {
    expect(buildFlowSeries([], 14, 1, NOW)).toHaveLength(14);
  });

  it("cuenta creadas y completadas en su día", () => {
    const rows = buildFlowSeries([
      ot({ created_at: "2026-08-31T09:00:00Z" }),
      ot({ created_at: "2026-08-31T10:00:00Z" }),
      ot({ created_at: "2026-08-20T10:00:00Z", estado: "completado", completado_en: "2026-08-31T15:00:00Z" }),
    ], 14, 1, NOW);

    const ayer = rows.at(-2)!;
    expect(ayer.creadas).toBe(2);
    expect(ayer.completadas).toBe(1);
  });

  it("el backlog cuenta lo abierto al cierre del cubo, no lo creado", () => {
    // Creada hace 10 días y cerrada hace 2: pesa en el backlog de los días
    // intermedios y desaparece después.
    const rows = buildFlowSeries([
      ot({ created_at: "2026-08-22T10:00:00Z", estado: "completado", completado_en: "2026-08-30T10:00:00Z" }),
    ], 14, 1, NOW);

    expect(rows.at(-1)!.backlog).toBe(0);
    expect(rows.at(-5)!.backlog).toBe(1);
  });

  it("agrupa por semana cuando step es 7", () => {
    const rows = buildFlowSeries([], 28, 7, NOW);
    expect(rows.length).toBeLessThanOrEqual(5);
  });
});

describe("planificadoVsNo", () => {
  it("separa preventiva de reactiva y emergencia", () => {
    const r = planificadoVsNo([
      { tipo_trabajo: "preventiva" },
      { tipo_trabajo: "reactiva" },
      { tipo_trabajo: "emergencia" },
    ]);
    expect(r.planificadas).toBe(1);
    expect(r.noPlanificadas).toBe(2);
    expect(r.pctPlanificado).toBeCloseTo(33.3, 0);
  });

  it("ignora los tipos que no son mantenimiento", () => {
    const r = planificadoVsNo([
      { tipo_trabajo: "preventiva" },
      { tipo_trabajo: "levantamiento" },
      { tipo_trabajo: "presupuesto" },
    ]);
    expect(r.planificadas).toBe(1);
    expect(r.noPlanificadas).toBe(0);
    expect(r.pctPlanificado).toBe(100);
  });

  it("devuelve null en vez de 0% cuando no hay mantenciones", () => {
    // 0% sobre cero OTs se leería como "no planificamos nada", que es distinto
    // de "no hay datos".
    expect(planificadoVsNo([{ tipo_trabajo: "levantamiento" }]).pctPlanificado).toBeNull();
  });
});

describe("backlogPorAntiguedad", () => {
  const d = (dias: number) => new Date(NOW.getTime() - dias * 86_400_000).toISOString();

  it("reparte las abiertas en los cuatro tramos", () => {
    const r = backlogPorAntiguedad([
      { estado: "pendiente", created_at: d(1) },
      { estado: "en_curso",  created_at: d(5) },
      { estado: "en_espera", created_at: d(10) },
      { estado: "pendiente", created_at: d(40) },
    ], NOW);
    expect(r.map(b => b.count)).toEqual([1, 1, 1, 1]);
  });

  it("ignora las completadas: el backlog es lo que sigue abierto", () => {
    const r = backlogPorAntiguedad([
      { estado: "completado", created_at: d(40) },
      { estado: "pendiente",  created_at: d(40) },
    ], NOW);
    expect(r[3].count).toBe(1);
  });

  it("marca como preocupantes los tramos largos", () => {
    const r = backlogPorAntiguedad([], NOW);
    expect(r.map(b => b.tone)).toEqual(["ok", "ok", "warn", "bad"]);
  });
});
