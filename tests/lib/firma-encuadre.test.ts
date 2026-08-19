import { describe, it, expect } from "vitest";
import { encuadrarFirma } from "@/lib/firma-encuadre";

describe("encuadrarFirma", () => {
  it("deja el alto base mientras no se conoce la proporcion", () => {
    expect(encuadrarFirma(null, 200)).toEqual({ alto: 200, posicion: "left center" });
  });

  it("deja el alto base para una firma apaisada", () => {
    // Canvas de escritorio: 560x200 -> 2,8
    expect(encuadrarFirma(2.8, 200)).toEqual({ alto: 200, posicion: "left center" });
  });

  it("agranda la caja para una firma vertical de telefono", () => {
    // ~390x780 de un telefono en vertical -> 0,5
    const { alto, posicion } = encuadrarFirma(0.5, 200);
    expect(alto).toBe(400);
    expect(posicion).toBe("center");
  });

  it("no deja que una firma muy alta desborde el formulario", () => {
    expect(encuadrarFirma(0.1, 200).alto).toBe(400);
  });

  it("centra una firma casi cuadrada", () => {
    expect(encuadrarFirma(1, 200)).toEqual({ alto: 200, posicion: "center" });
  });

  it("ignora proporciones invalidas en vez de romper el layout", () => {
    for (const malo of [0, -1, NaN, Infinity]) {
      expect(encuadrarFirma(malo, 200)).toEqual({ alto: 200, posicion: "left center" });
    }
  });
});
