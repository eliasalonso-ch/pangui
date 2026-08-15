import { describe, it, expect } from "vitest";
import { collectItos, matchesIto } from "@/app/(app)/ordenes/ito-filter";

/**
 * The ITO lives inside `descripcion` as a " | "-separated meta header, e.g.
 *   "N° OT: 123 | Solicitante: Ana | Hito: ITO 2\n\nel cuerpo"
 * so these helpers are exercised through real descripcion strings rather than a
 * fabricated shape — that is exactly what the bandeja passes them.
 */
function ot(descripcion: string | null) {
  return { descripcion };
}

const withIto = (hito: string, body = "cuerpo") =>
  ot(`N° OT: 100 | Solicitante: Ana | Hito: ${hito}\n\n${body}`);

describe("collectItos", () => {
  it("devuelve los ITOs distintos presentes", () => {
    expect(collectItos([withIto("ITO 1"), withIto("ITO 2"), withIto("ITO 1")]))
      .toEqual(["ITO 1", "ITO 2"]);
  });

  it("ignora OTs sin ITO, sin descripcion o con ITO vacio", () => {
    expect(collectItos([
      ot(null),
      ot("N° OT: 5 | Solicitante: Ana\n\nsin hito"),
      ot("texto suelto sin cabecera"),
      withIto("   "),
      withIto("ITO 3"),
    ])).toEqual(["ITO 3"]);
  });

  it("deduplica ignorando mayusculas y espacios, conservando la primera forma", () => {
    expect(collectItos([withIto("ITO Alfa"), withIto("  ito alfa  ")]))
      .toEqual(["ITO Alfa"]);
  });

  it("ordena numericamente, no lexicograficamente", () => {
    // El bug clasico: "ITO 10" antes que "ITO 2" con un sort de strings.
    expect(collectItos([withIto("ITO 10"), withIto("ITO 2"), withIto("ITO 1")]))
      .toEqual(["ITO 1", "ITO 2", "ITO 10"]);
  });

  it("no explota con una lista vacia", () => {
    expect(collectItos([])).toEqual([]);
  });
});

describe("matchesIto", () => {
  it("sin seleccion, el filtro esta inactivo y todo pasa", () => {
    expect(matchesIto(withIto("ITO 1"), [])).toBe(true);
    expect(matchesIto(ot(null), [])).toBe(true);
  });

  it("deja pasar solo los ITOs seleccionados", () => {
    expect(matchesIto(withIto("ITO 1"), ["ITO 1"])).toBe(true);
    expect(matchesIto(withIto("ITO 2"), ["ITO 1"])).toBe(false);
  });

  it("acepta varios ITOs seleccionados", () => {
    expect(matchesIto(withIto("ITO 2"), ["ITO 1", "ITO 2"])).toBe(true);
  });

  it("compara ignorando mayusculas y espacios", () => {
    expect(matchesIto(withIto("  ito alfa "), ["ITO Alfa"])).toBe(true);
  });

  it("una OT sin ITO no pasa cuando hay seleccion activa", () => {
    expect(matchesIto(ot(null), ["ITO 1"])).toBe(false);
    expect(matchesIto(ot("N° OT: 5\n\nsin hito"), ["ITO 1"])).toBe(false);
  });
});
