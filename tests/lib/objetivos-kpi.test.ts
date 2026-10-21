import { describe, it, expect } from "vitest";
import { KPIS, METAS_REFERENCIA, evaluar, metaVigente, validarObjetivo, type ObjetivoKpi } from "@/lib/objetivos-kpi";

const ws = (kpi: ObjetivoKpi["kpi"], bueno: number, malo: number, alerta: number | null = null): ObjetivoKpi =>
  ({ kpi, bueno, alerta, malo });

describe("evaluar", () => {
  it("más es mejor (disponibilidad): bordes cuentan como el nivel mejor", () => {
    const o = ws("disponibilidad", 98, 95);
    expect(evaluar("disponibilidad", 99, o)).toBe("bueno");
    expect(evaluar("disponibilidad", 98, o)).toBe("bueno");
    expect(evaluar("disponibilidad", 96.5, o)).toBe("aceptable");
    expect(evaluar("disponibilidad", 95, o)).toBe("malo");
  });

  it("menos es mejor (MTTR)", () => {
    const o = ws("mttr", 8, 24);
    expect(evaluar("mttr", 4, o)).toBe("bueno");
    expect(evaluar("mttr", 21.7, o)).toBe("aceptable");
    expect(evaluar("mttr", 28.5, o)).toBe("malo");
  });

  it("con alerta: entre alerta y malo es \"en riesgo\" (más es mejor)", () => {
    const o = ws("disponibilidad", 98, 95, 96.5);
    expect(evaluar("disponibilidad", 97, o)).toBe("aceptable");
    expect(evaluar("disponibilidad", 96.5, o)).toBe("aceptable");
    expect(evaluar("disponibilidad", 96, o)).toBe("riesgo");
    expect(evaluar("disponibilidad", 95, o)).toBe("malo");
  });

  it("con alerta en MTTR (menos es mejor)", () => {
    const o = ws("mttr", 8, 24, 16);
    expect(evaluar("mttr", 12, o)).toBe("aceptable");
    expect(evaluar("mttr", 21.7, o)).toBe("riesgo");
    expect(evaluar("mttr", 24, o)).toBe("malo");
  });

  it("sin valor o sin meta no hay nivel", () => {
    expect(evaluar("mtbf", null, ws("mtbf", 1000, 500))).toBeNull();
    expect(evaluar("mtbf", 956, null)).toBeNull();
  });
});

describe("validarObjetivo", () => {
  it("respeta la dirección de cada KPI (igual que el CHECK de la tabla)", () => {
    expect(validarObjetivo("mtbf", 1000, 500)).toBeNull();
    expect(validarObjetivo("mtbf", 500, 1000)).not.toBeNull();
    expect(validarObjetivo("mttr", 8, 24)).toBeNull();
    expect(validarObjetivo("mttr", 24, 8)).not.toBeNull();
  });
  it("la alerta es opcional, pero si está queda entre bueno y malo", () => {
    expect(validarObjetivo("mtbf", 1000, 500, 700)).toBeNull();
    expect(validarObjetivo("mtbf", 1000, 500, 1200)).not.toBeNull();
    expect(validarObjetivo("mttr", 8, 24, 16)).toBeNull();
    expect(validarObjetivo("mttr", 8, 24, 4)).not.toBeNull();
  });

  it("porcentajes entre 0 y 100, sin negativos ni vacíos", () => {
    expect(validarObjetivo("disponibilidad", 101, 95)).not.toBeNull();
    expect(validarObjetivo("planificada", 80, -1)).not.toBeNull();
    expect(validarObjetivo("mtbf", NaN, 500)).not.toBeNull();
  });
});

describe("metas de referencia", () => {
  it("todas pasan la misma validación que una meta guardada", () => {
    for (const k of KPIS) {
      const m = METAS_REFERENCIA[k];
      expect(validarObjetivo(k, m.bueno, m.malo, m.alerta), k).toBeNull();
    }
  });

  it("la meta guardada manda; sin ella, la de referencia (marcada como tal)", () => {
    const lista: ObjetivoKpi[] = [{ kpi: "mtbf", bueno: 1500, alerta: null, malo: 600, fuente: "guardada" }];
    expect(metaVigente("mtbf", lista).bueno).toBe(1500);
    const mttr = metaVigente("mttr", lista);
    expect(mttr.bueno).toBe(METAS_REFERENCIA.mttr.bueno);
    expect(mttr.fuente).toBe("referencia");
  });
});
