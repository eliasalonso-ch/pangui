import { describe, expect, it } from "vitest";
import { aValor, calcularHoja, celdasConResultados, normalizar, referencias } from "@/lib/hoja-formulas";

// Columnas A (Ítem), B (Cantidad), C (Precio). Fila 1 = nombres; filas de la hoja desde la 2.
const columnas = [
  { id: "a", label: "Ítem" },
  { id: "b", label: "Cantidad" },
  { id: "c", label: "Precio" },
];
const hoja = (filas: Record<string, string>[]) => calcularHoja({ columnas, filas: filas.map((celdas) => ({ celdas })) });
const texto = (m: Map<string, { texto: string }>, k: string) => m.get(k)?.texto;

describe("normalizar", () => {
  it("pasa nombres en español, ';' y coma decimal a la forma del motor", () => {
    expect(normalizar("=SUMA(B2:B4;1,5)")).toBe("SUM(B2:B4,1.5)");
    expect(normalizar('=SI(B2>1;"sí, mucho";"no")')).toBe('IF(B2>1,"sí, mucho","no")');
    expect(normalizar("=redondear(B2,2)")).toBe("ROUND(B2,2)"); // referencia + argumento con coma inglesa
    expect(normalizar("=SUMAR.SI(B2:B4;\">1\")")).toBe('SUMIF(B2:B4,">1")');
    expect(normalizar("=20x20")).toBe("20*20");
    expect(normalizar("=B2×3÷2−1")).toBe("B2*3/2-1");
    expect(normalizar("=MAX(B2;3)")).toBe("MAX(B2,3)"); // la x de MAX no se toca
  });
});

describe("aValor", () => {
  it("lee números como se escriben en Chile", () => {
    expect(aValor("1,5")).toBe(1.5);
    expect(aValor("1.500")).toBe(1500);
    expect(aValor("1.234.567,8")).toBe(1234567.8);
    expect(aValor("2.5")).toBe(2.5);
    expect(aValor("hola")).toBe("hola");
    expect(aValor("")).toBeNull();
  });
});

describe("calcularHoja", () => {
  it("calcula referencias, rangos y fórmulas en cadena", () => {
    const m = hoja([
      { a: "Cable", b: "2", c: "1.500" },
      { a: "Tubo", b: "3,5", c: "=B3*2" },          // C3 = 7
      { b: "=SUMA(B2:B3)", c: "=C2+C3" },           // B4 = 5,5 · C4 = 1507
      { b: "=PROMEDIO(B2:B3)", c: "=A1" },          // B5 = 2,75 · C5 = nombre de columna
    ]);
    expect(texto(m, "2:2")).toBe("7");
    expect(texto(m, "3:1")).toBe("5,5");
    expect(texto(m, "3:2")).toBe("1.507");
    expect(texto(m, "4:1")).toBe("2,75");
    expect(texto(m, "4:2")).toBe("Ítem");
    expect(m.get("3:1")?.numero).toBe(true);
  });

  it("errores: división por cero, ciclo, función inexistente, mal escrita", () => {
    const m = hoja([
      { a: "=1/0", b: "=C2", c: "=B2" },
      { a: "=NOEXISTE(1)", b: "=SUMA(1" },
    ]);
    expect(texto(m, "1:0")).toBe("#DIV/0!");
    expect(texto(m, "1:1")).toBe("#¡REF!");
    expect(texto(m, "2:0")).toBe("#¿NOMBRE?");
    expect(texto(m, "2:1")).toBe("#¡ERROR!");
    expect(m.get("2:1")?.error).toBe(true);
  });

  it("un rango que incluye su propia celda es un error (circular)", () => {
    const m = hoja([{ b: "1" }, { b: "2" }, { b: "=SUMA(B2:B4)" }]);
    expect(m.get("3:1")).toMatchObject({ error: true, texto: "#¡REF!" });
    expect(hoja([{ b: "1" }, { b: "=SUMA(B2:B2)" }]).get("2:1")?.error).toBeUndefined();
  });

  it("columna entera y quita el ruido de coma flotante", () => {
    const m = hoja([{ b: "0,1" }, { b: "0,2" }, { c: "=SUMA(B:B)" }]);
    expect(texto(m, "3:2")).toBe("0,3");
  });
});

describe("referencias", () => {
  it("lee celdas y rangos en coordenadas del lienzo, sin funciones ni textos", () => {
    expect(referencias("=B2*B3")).toEqual([{ r0: 1, c0: 1, r1: 1, c1: 1, inicio: 1, fin: 3 }, { r0: 2, c0: 1, r1: 2, c1: 1, inicio: 4, fin: 6 }]);
    expect(referencias("=SUMA($C$5:A2)")).toMatchObject([{ r0: 1, c0: 0, r1: 4, c1: 2, inicio: 6, fin: 13 }]);
    expect(referencias('="x"&LOG10(A1)&"B2"')).toMatchObject([{ r0: 0, c0: 0, r1: 0, c1: 0, inicio: 11, fin: 13 }]);
  });
});

describe("celdasConResultados", () => {
  it("reemplaza fórmulas por su resultado: formateado, o crudo para leerlo como número", () => {
    const filas = [{ celdas: { b: "1.500", c: "=20x20" } }, { celdas: { b: "=B2*2,5", c: null } }];
    expect(celdasConResultados(columnas, filas)).toEqual([{ b: "1.500", c: "400" }, { b: "3.750", c: "" }]);
    expect(celdasConResultados(columnas, filas, true)[1].b).toBe("3750");
  });
});

describe("funciones que el motor trae vacías", () => {
  it("MIN, MAX, CONTARA y MAYUSC calculan (antes daban #¿NOMBRE?)", () => {
    // A: Ítem (texto), B: Cantidad. Fila 2: Cable/10, 3: Caja/2, 4: vacía/vacía.
    const m = hoja([
      { a: "Cable", b: "10", c: "=MIN(B2:B4)" },
      { a: "Caja", b: "2", c: "=MAX(A2:B4;3)" },
      { c: "=CONTARA(A2:B4)" },
      { c: "=MAYUSC(A2)" },
    ]);
    expect(texto(m, "1:2")).toBe("2");
    expect(texto(m, "2:2")).toBe("10"); // los textos del rango no cuentan
    expect(texto(m, "3:2")).toBe("4"); // las vacías tampoco
    expect(texto(m, "4:2")).toBe("CABLE");
  });
});
