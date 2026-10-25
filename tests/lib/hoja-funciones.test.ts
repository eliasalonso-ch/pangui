import { describe, expect, it } from "vitest";
import { calcularHoja } from "@/lib/hoja-formulas";
import {
  CATALOGO, alternarAbsoluta, argumentoActual, buscarFunciones, completarFuncion, explicarError,
  funcionEscribiendo, puedeApuntar,
} from "@/lib/hoja-funciones";

// Hoja de ejemplo de la guía: A Ítem, B Cantidad, C Precio (fila 1 = nombres).
const columnas = [{ id: "a", label: "Ítem" }, { id: "b", label: "Cantidad" }, { id: "c", label: "Precio" }];
const datos = [
  { a: "Cable", b: "10", c: "1500" },
  { a: "Caja", b: "2", c: "3000" },
  { a: "Cinta", b: "5", c: "800" },
];
const calcular = (formula: string) =>
  calcularHoja({ columnas: [...columnas, { id: "x", label: "X" }], filas: [{ celdas: { ...datos[0], x: formula } }, ...datos.slice(1).map((celdas) => ({ celdas }))] }).get("1:3");

describe("CATALOGO", () => {
  it.each(CATALOGO.map((f) => [f.nombre, f] as const))("el ejemplo de %s calcula lo que dice la guía", (_, f) => {
    const r = calcular(f.ejemplo);
    expect(r?.error, `${f.ejemplo} → ${r?.texto}`).toBeFalsy();
    if (f.resultado !== undefined) expect(r?.texto).toBe(f.resultado);
  });
});

describe("funcionEscribiendo", () => {
  it("reconoce el nombre que se está escribiendo", () => {
    expect(funcionEscribiendo("=SU", 3)).toEqual({ inicio: 1, prefijo: "SU" });
    expect(funcionEscribiendo("=B2+prom", 8)).toEqual({ inicio: 4, prefijo: "prom" });
    expect(funcionEscribiendo("=SUMA(1;sum", 11)).toEqual({ inicio: 8, prefijo: "sum" });
  });
  it("no ofrece nada en una referencia, un texto o fuera de una fórmula", () => {
    expect(funcionEscribiendo("=B2", 3)).toBeNull();
    expect(funcionEscribiendo('="SU', 4)).toBeNull();
    expect(funcionEscribiendo("SU", 2)).toBeNull();
    expect(funcionEscribiendo("=SUMA(", 6)).toBeNull();
  });
});

describe("buscarFunciones / completarFuncion", () => {
  it("busca sin mayúsculas ni tildes", () => {
    expect(buscarFunciones("su").map((f) => f.nombre)).toContain("SUMAR.SI");
    expect(buscarFunciones("ano").map((f) => f.nombre)).toEqual(["AÑO"]);
  });
  it("deja el cursor dentro del paréntesis (o después, si no lleva argumentos)", () => {
    const suma = CATALOGO.find((f) => f.nombre === "SUMA")!;
    const hoy = CATALOGO.find((f) => f.nombre === "HOY")!;
    expect(completarFuncion("=1+su*2", 5, suma)).toEqual({ texto: "=1+SUMA(*2", caret: 8 });
    expect(completarFuncion("=ho", 3, hoy)).toEqual({ texto: "=HOY()", caret: 6 });
  });
});

describe("argumentoActual", () => {
  it("sabe en qué función y argumento va el cursor", () => {
    expect(argumentoActual("=SUMA(", 6)).toEqual({ nombre: "SUMA", indice: 0 });
    expect(argumentoActual('=SI(B2>1;"a;b";', 15)).toEqual({ nombre: "SI", indice: 2 });
    expect(argumentoActual("=SUMA(REDONDEAR(B2;", 19)).toEqual({ nombre: "REDONDEAR", indice: 1 });
    expect(argumentoActual("=SUMA(REDONDEAR(B2;1);", 22)).toEqual({ nombre: "SUMA", indice: 1 });
    expect(argumentoActual("=SUMA((1+2", 10)).toEqual({ nombre: "SUMA", indice: 0 });
  });
  it("fuera de un paréntesis, nada", () => {
    expect(argumentoActual("=SUMA(1)", 8)).toBeNull();
    expect(argumentoActual("=B2+1", 5)).toBeNull();
  });
});

describe("puedeApuntar", () => {
  it("un clic inserta referencia solo donde una referencia tiene sentido", () => {
    expect(puedeApuntar("=", 1)).toBe(true);
    expect(puedeApuntar("=SUMA(", 6)).toBe(true);
    expect(puedeApuntar("=B2+", 4)).toBe(true);
    expect(puedeApuntar("=B2:", 4)).toBe(true);
    expect(puedeApuntar("=SUMA(1;", 8)).toBe(true);
    expect(puedeApuntar("=B2", 3)).toBe(false);
    expect(puedeApuntar("=1,", 3)).toBe(false); // coma decimal
    expect(puedeApuntar("hola", 4)).toBe(false);
  });
});

describe("alternarAbsoluta (F4)", () => {
  it("rota B2 → $B$2 → B$2 → $B2 → B2", () => {
    const pasos = ["=B2+1", "=$B$2+1", "=B$2+1", "=$B2+1", "=B2+1"];
    for (let i = 0; i < 4; i++) expect(alternarAbsoluta(pasos[i], 2)?.texto).toBe(pasos[i + 1]);
  });
  it("en un rango cambia las dos puntas y deja el cursor al final", () => {
    expect(alternarAbsoluta("=SUMA(B2:C5)", 8)).toEqual({ texto: "=SUMA($B$2:$C$5)", caret: 15 });
  });
  it("sin referencia en el cursor, nada", () => {
    expect(alternarAbsoluta("=SUMA(1)", 3)).toBeNull();
  });
});

describe("explicarError", () => {
  it("explica en palabras los códigos del motor", () => {
    expect(explicarError("#DIV/0!")).toMatch(/cero/);
    expect(explicarError("#¿NOMBRE?")).toMatch(/función/i);
    expect(explicarError("#XYZ")).toBe("No se puede calcular");
  });
});
