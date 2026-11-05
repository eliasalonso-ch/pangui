// Hojas de cálculo en el informe PDF de la OT: solo lo que tiene datos, sin cobro.

import { describe, it, expect } from "vitest";
import { hojasParaInforme, type HojaCalculada } from "@/lib/hojas-api";

const columnas = [
  { id: "e", label: "" },
  { id: "a", label: "Material" },
  { id: "b", label: "Cantidad" },
  { id: "o", label: "Observación" },
];

describe("hojasParaInforme", () => {
  it("quita filas vacías y columnas sin ningún dato", () => {
    const hojas: HojaCalculada[] = [{
      nombre: "Materiales usados", tipo: "materiales_usados", columnas,
      filas: [{ a: "Cable", b: "3" }, {}, { e: " ", a: "Caja", b: "1" }],
    }];
    expect(hojasParaInforme(hojas)).toEqual([{
      nombre: "Materiales usados",
      columnas: ["Material", "Cantidad"],
      filas: [["Cable", "3"], ["Caja", "1"]],
    }]);
  });

  it("deja fuera la hoja de cobro y las hojas sin datos", () => {
    const hojas: HojaCalculada[] = [
      { nombre: "Cobro", tipo: "cobro", columnas, filas: [{ a: "X1", b: "2" }] },
      { nombre: "Hoja general", tipo: "general", columnas, filas: [{}, {}] },
    ];
    expect(hojasParaInforme(hojas)).toEqual([]);
  });
});
