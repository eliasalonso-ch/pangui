import { describe, expect, it } from "vitest";
import { derivarDisponibilidad, puntoDisponibilidad, resumirDisponibilidad } from "../lib/activo-disponibilidad";
import { diasDelRango, etiquetaTramo, granoPara, minimoDesde, rangoDeAtajo } from "../lib/analitica-rango";

const HOY = new Date(2026, 9, 12, 21, 30); // 12 oct 2026, 21:30 local

describe("rangoDeAtajo", () => {
  it("12 meses = meses calendario completos, incluido el actual", () => {
    expect(rangoDeAtajo("12m", HOY)).toEqual({ desde: "2025-11-01", hasta: "2026-10-12" });
  });
  it("30 días cuenta los dos extremos", () => {
    const r = rangoDeAtajo("30d", HOY);
    expect(r).toEqual({ desde: "2026-09-13", hasta: "2026-10-12" });
    expect(diasDelRango(r)).toBe(30);
  });
  it("este año parte el 1 de enero", () => {
    expect(rangoDeAtajo("anio", HOY).desde).toBe("2026-01-01");
  });
  it("no se corre de día de noche (sin toISOString)", () => {
    expect(rangoDeAtajo("3m", HOY).hasta).toBe("2026-10-12");
  });
});

describe("granoPara", () => {
  it("por día hasta 31 días, por semana hasta ~6 meses, si no por mes", () => {
    expect(granoPara({ desde: "2026-10-01", hasta: "2026-10-31" })).toBe("dia");
    expect(granoPara({ desde: "2026-10-01", hasta: "2026-11-01" })).toBe("semana");
    expect(granoPara(rangoDeAtajo("6m", HOY))).toBe("semana");
    expect(granoPara(rangoDeAtajo("12m", HOY))).toBe("mes");
  });
});

describe("etiquetaTramo", () => {
  it("meses con año solo si el rango cruza de año", () => {
    expect(etiquetaTramo("2025-11-01", "mes", true)).toBe("nov 25");
    expect(etiquetaTramo("2026-03-01", "mes", false)).toBe("mar");
  });
  it("días y semanas con número de día", () => {
    expect(etiquetaTramo("2026-10-05", "semana", false)).toBe("5 oct");
  });
});

describe("minimoDesde", () => {
  it("sin límite de plan no hay mínimo", () => {
    expect(minimoDesde(HOY, Infinity)).toBeNull();
  });
  it("6 meses de historial = desde el 1 de mayo", () => {
    expect(minimoDesde(HOY, 6)).toBe("2026-05-01");
  });
});

describe("derivarDisponibilidad", () => {
  it("sin historial es null, nunca 100%", () => {
    const r = derivarDisponibilidad({ operativo_h: 0, imprevista_h: 0, planificada_h: 0, fallas: 0 });
    expect(r.disponibilidadPct).toBeNull();
    expect(r.mtbfHoras).toBeNull();
    expect(r.mttrHoras).toBeNull();
  });
  it("sin fallas: disponibilidad sí, MTBF/MTTR no", () => {
    const r = derivarDisponibilidad({ operativo_h: 720, imprevista_h: 0, planificada_h: 0, fallas: 0 });
    expect(r.disponibilidadPct).toBe(100);
    expect(r.mtbfHoras).toBeNull();
  });
  it("la parada planificada descuenta disponibilidad pero no entra al MTTR", () => {
    // Septiembre 2026 del workspace de prueba, verificado contra el JS anterior.
    const p = puntoDisponibilidad("2026-09-01", "sep", {
      operativo_h: 6391.833333, imprevista_h: 59.166667, planificada_h: 20, fallas: 4,
    });
    expect(p.mttrHoras).toBe(14.79);
    expect(p.mtbfHoras).toBe(1598);
    expect(p.disponibilidadPct).toBe(98.78);
  });
  it("el resumen suma los tramos antes de dividir", () => {
    const serie = [
      puntoDisponibilidad("a", "a", { operativo_h: 100, imprevista_h: 10, planificada_h: 0, fallas: 1 }),
      puntoDisponibilidad("b", "b", { operativo_h: 300, imprevista_h: 30, planificada_h: 0, fallas: 3 }),
    ];
    expect(resumirDisponibilidad(serie).mttrHoras).toBe(10);
  });
});
