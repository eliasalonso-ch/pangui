import { describe, it, expect } from "vitest";
import { describirTrigger } from "@/lib/automatizaciones-api";

describe("describirTrigger", () => {
  it("describe un mayor o igual", () => {
    expect(describirTrigger(
      { operador: "mayor_igual", valor: 10, valor_hasta: null } as never, "A",
    )).toBe("es mayor o igual a 10 A");
  });

  it("describe un rango", () => {
    expect(describirTrigger(
      { operador: "entre", valor: 5, valor_hasta: 9 } as never, "mm/s",
    )).toBe("está entre 5 y 9 mm/s");
  });

  it("no deja espacio colgando cuando el medidor no tiene unidad", () => {
    expect(describirTrigger(
      { operador: "igual", valor: 3, valor_hasta: null } as never, "",
    )).toBe("es igual a 3");
  });
});
