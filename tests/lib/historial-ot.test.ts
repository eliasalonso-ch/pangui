import { describe, it, expect } from "vitest";
import {
  construirSerie,
  dentroDelRango,
  etiquetaPeriodo,
  etiquetaRango,
  inicioDeSemana,
  resolverRango,
  type OrdenHistorial,
  type RangoHistorial,
} from "@/lib/historial-ot";

// Fecha fija para que "hoy" no dependa del reloj de CI.
const HOY = new Date(2026, 7, 15); // 15/08/2026, sábado

function ot(created: string, completado?: string): OrdenHistorial {
  return { created_at: created, completado_en: completado ?? null };
}

describe("resolverRango", () => {
  it("modo entre: respeta los extremos", () => {
    const r: RangoHistorial = {
      modo: "entre",
      desde: new Date(2026, 6, 16),
      hasta: new Date(2026, 7, 15),
      agrupacion: "dia",
    };
    const { desde, hasta } = resolverRango(r, HOY);
    expect(desde).toEqual(new Date(2026, 6, 16));
    expect(hasta).toEqual(new Date(2026, 7, 15));
  });

  it("modo entre: endereza un rango invertido en vez de devolver vacío", () => {
    const r: RangoHistorial = {
      modo: "entre",
      desde: new Date(2026, 7, 15),
      hasta: new Date(2026, 6, 16),
      agrupacion: "dia",
    };
    const { desde, hasta } = resolverRango(r, HOY);
    expect(desde).toEqual(new Date(2026, 6, 16));
    expect(hasta).toEqual(new Date(2026, 7, 15));
  });

  it("últimos N días incluye hoy (30 días = hoy y 29 previos)", () => {
    const r: RangoHistorial = { modo: "ultimo", cantidad: 30, unidad: "dias", agrupacion: "dia" };
    const { desde, hasta } = resolverRango(r, HOY);
    expect(hasta).toEqual(new Date(2026, 7, 15));
    expect(desde).toEqual(new Date(2026, 6, 17));
  });

  it("últimos N meses parte el día 1 del mes más antiguo", () => {
    const r: RangoHistorial = { modo: "ultimo", cantidad: 3, unidad: "meses", agrupacion: "mes" };
    const { desde } = resolverRango(r, HOY);
    expect(desde).toEqual(new Date(2026, 5, 1));
  });

  it("una cantidad inválida cae a 1 periodo en vez de romper", () => {
    const r: RangoHistorial = { modo: "ultimo", cantidad: 0, unidad: "dias", agrupacion: "dia" };
    const { desde, hasta } = resolverRango(r, HOY);
    expect(desde).toEqual(hasta);
  });
});

describe("inicioDeSemana", () => {
  it("la semana parte el lunes", () => {
    // 15/08/2026 es sábado → lunes 10.
    expect(inicioDeSemana(new Date(2026, 7, 15))).toEqual(new Date(2026, 7, 10));
  });

  it("el domingo pertenece a la semana que arrancó el lunes anterior", () => {
    // 16/08/2026 es domingo → sigue siendo la semana del lunes 10.
    expect(inicioDeSemana(new Date(2026, 7, 16))).toEqual(new Date(2026, 7, 10));
  });
});

describe("construirSerie", () => {
  const rangoDia: RangoHistorial = {
    modo: "entre",
    desde: new Date(2026, 7, 10),
    hasta: new Date(2026, 7, 14),
    agrupacion: "dia",
  };

  it("incluye los periodos sin datos para no inventar continuidad", () => {
    const serie = construirSerie([ot("2026-08-10T09:00:00")], rangoDia, HOY);
    expect(serie).toHaveLength(5);
    expect(serie.map(p => p.creadas)).toEqual([1, 0, 0, 0, 0]);
  });

  it("cuenta creadas y completadas por separado", () => {
    const serie = construirSerie(
      [ot("2026-08-10T09:00:00", "2026-08-12T17:00:00")],
      rangoDia,
      HOY,
    );
    expect(serie[0].creadas).toBe(1);
    expect(serie[0].completadas).toBe(0);
    expect(serie[2].completadas).toBe(1);
  });

  it("ignora OTs fuera del rango", () => {
    const serie = construirSerie(
      [ot("2026-01-01T09:00:00"), ot("2026-08-11T09:00:00")],
      rangoDia,
      HOY,
    );
    expect(serie.reduce((n, p) => n + p.creadas, 0)).toBe(1);
  });

  it("agrupa por mes juntando los días del mismo mes", () => {
    const serie = construirSerie(
      [ot("2026-07-02T09:00:00"), ot("2026-07-28T09:00:00"), ot("2026-08-01T09:00:00")],
      { modo: "entre", desde: new Date(2026, 6, 1), hasta: new Date(2026, 7, 15), agrupacion: "mes" },
      HOY,
    );
    expect(serie).toHaveLength(2);
    expect(serie[0].creadas).toBe(2);
    expect(serie[1].creadas).toBe(1);
  });

  it("acumulable suma cada periodo al anterior", () => {
    const serie = construirSerie(
      [ot("2026-08-10T09:00:00"), ot("2026-08-11T09:00:00"), ot("2026-08-13T09:00:00")],
      { ...rangoDia, acumulable: true },
      HOY,
    );
    expect(serie.map(p => p.creadas)).toEqual([1, 2, 2, 3, 3]);
  });

  it("sin acumulable cada periodo cuenta solo lo suyo", () => {
    const serie = construirSerie(
      [ot("2026-08-10T09:00:00"), ot("2026-08-11T09:00:00"), ot("2026-08-13T09:00:00")],
      rangoDia,
      HOY,
    );
    expect(serie.map(p => p.creadas)).toEqual([1, 1, 0, 1, 0]);
  });

  it("descarta fechas inválidas sin romper la serie", () => {
    const serie = construirSerie([ot("no-es-fecha"), ot("2026-08-10T09:00:00")], rangoDia, HOY);
    expect(serie.reduce((n, p) => n + p.creadas, 0)).toBe(1);
  });

  it("acota la cantidad de puntos en un rango absurdo", () => {
    const serie = construirSerie(
      [],
      { modo: "entre", desde: new Date(2000, 0, 1), hasta: new Date(2026, 0, 1), agrupacion: "dia" },
      HOY,
    );
    expect(serie.length).toBeLessThanOrEqual(750);
  });
});

describe("etiquetas", () => {
  it("día usa dd/mm/aaaa como el eje del gráfico", () => {
    expect(etiquetaPeriodo(new Date(2026, 6, 20), "dia")).toBe("20/07/2026");
  });

  it("mes usa mes corto en español", () => {
    expect(etiquetaPeriodo(new Date(2026, 7, 1), "mes")).toBe("ago 2026");
  });

  it("el encabezado resume el rango", () => {
    expect(etiquetaRango(new Date(2026, 6, 25), new Date(2026, 7, 15))).toBe("jul 25 - ago 15");
  });
});

describe("dentroDelRango", () => {
  const rango: RangoHistorial = {
    modo: "entre",
    desde: new Date(2026, 7, 10),
    hasta: new Date(2026, 7, 14),
    agrupacion: "dia",
  };

  it("incluye los extremos", () => {
    expect(dentroDelRango(ot("2026-08-10T00:30:00"), rango, HOY)).toBe(true);
    expect(dentroDelRango(ot("2026-08-14T23:30:00"), rango, HOY)).toBe(true);
  });

  it("excluye lo de afuera", () => {
    expect(dentroDelRango(ot("2026-08-09T23:59:00"), rango, HOY)).toBe(false);
    expect(dentroDelRango(ot("2026-08-15T00:01:00"), rango, HOY)).toBe(false);
  });
});
