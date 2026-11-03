import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import type { XlsxHoja } from "@/lib/hoja-excel";
import { lineasDeOt, pestanaCobros, libroCobros, type OtCobro, type HojaCobro } from "@/lib/cobros-excel";

const X = XLSX as unknown as XlsxHoja;
const COLS = [{ id: "a", label: "Ítem" }, { id: "b", label: "Cantidad" }, { id: "c", label: "Unidad" }];
// Filas como "ítem|cantidad|unidad", igual que en las hojas reales de julio.
const hoja = (tipo: string, ...filas: string[]): HojaCobro => ({
  tipo,
  columnas: COLS,
  filas: filas.map((f) => { const [a, b, c] = f.split("|"); return { a, b, c }; }),
});
const ot = (hojas: HojaCobro[], extra: Partial<OtCobro> = {}): OtCobro => ({
  numeroOt: "SF920260627830", solicitante: "", lugar: "Cabina 2", fecha: "2026-06-19",
  descripcion: "Instalar 3 proyectores", emergencia: false, hojas, ...extra,
});
const catalogo = new Map([["tubo led 18w", "tubled18"], ["apoyo en altura", "AA"]]);
const manoObra = (o: OtCobro) => lineasDeOt(o, catalogo)[0];

describe("lineasDeOt: mano de obra = personas × hh (regla de Claudio)", () => {
  it.each([
    ["|2|hh", "|2|pp", 4],                      // …803
    ["Hh|4|", "Personas|2|", 8],                // …804
    ["HH |1,5|Horas", "PP|2|Personas", 3],      // …948
    ["Escalera telescópica |2|hh", "|2|pp", 4], // …844
    ["Hh|2|Hr", "Persona |2|", 4],              // …909
  ])("%s + %s → %d", (a, b, esperado) => {
    expect(manoObra(ot([hoja("materiales_usados", a, b)]))).toEqual({ texto: "Revisión normal", codigo: "revnor", cantidad: esperado });
  });

  it("lee \"1 hh 2 personas\" escrito de corrido en una celda", () => {
    expect(manoObra(ot([hoja("materiales_usados", "Cobrar 1 hh 2 personas ||")]))?.cantidad).toBe(2);
    expect(manoObra(ot([hoja("general", "2 hh 2 personas ||")]))?.cantidad).toBe(4);
  });

  it("emergencia usa reveme", () => {
    expect(manoObra(ot([hoja("materiales_usados", "|1|hh", "|2|pp")], { emergencia: true })))
      .toEqual({ texto: "Revisión de emergencia", codigo: "reveme", cantidad: 2 });
  });

  it("sin cuenta segura la cantidad queda en blanco", () => {
    // dos trabajos en la misma OT (…791)
    expect(manoObra(ot([hoja("materiales_usados", "|4|hh", "|3|pp", "|5|hh", "|2|pp")]))).not.toHaveProperty("cantidad");
    // días, no horas (…527302)
    expect(manoObra(ot([hoja("materiales_usados", "Personas|4|", "Hh|2|Dias")]))).not.toHaveProperty("cantidad");
    // horas sin personas (…728175)
    expect(manoObra(ot([hoja("materiales_usados", "Hora|2|Hh")]))).not.toHaveProperty("cantidad");
  });
});

describe("lineasDeOt: materiales", () => {
  it("texto del técnico en E; código sólo si calza exacto con el catálogo", () => {
    const l = lineasDeOt(ot([hoja("materiales_usados", "Tubo LED 18W|2|un", "Caja chuqui|1|Uni", "Apoyo en altura||")]), catalogo);
    expect(l.slice(1)).toEqual([
      { texto: "2 un Tubo LED 18W", codigo: "tubled18", cantidad: 2 },
      { texto: "1 Uni Caja chuqui", cantidad: 1 },
      { texto: "Apoyo en altura", codigo: "AA" },
    ]);
  });

  it("personas y horas van al final como las escribe Claudio, con la nota que traían", () => {
    const l = lineasDeOt(ot([hoja("materiales_usados", "Alza-hombre|4|Hh", "|2|pp")]), catalogo);
    expect(l.map((x) => x.texto)).toEqual(["Revisión normal", "Alza-hombre", "2 personas", "4hh"]);
  });

  it("lo solicitado no se cobra; la hoja de cobro trae el código puesto", () => {
    const cobro: HojaCobro = {
      tipo: "cobro",
      columnas: [{ id: "a", label: "Código" }, { id: "b", label: "Cantidad" }, { id: "c", label: "Observación" }],
      filas: [{ a: "enctri10", b: "3", c: "" }],
    };
    const l = lineasDeOt(ot([hoja("materiales_solicitados", "Plafón|1|un"), cobro]), catalogo);
    expect(l.slice(1)).toEqual([{ texto: "3 enctri10", codigo: "enctri10", cantidad: 3 }]);
  });
});

describe("pestanaCobros: el dibujo de bloques del Excel de Claudio", () => {
  const celda = (ws: Record<string, unknown>, ref: string) => (ws[ref] as { v?: unknown } | undefined)?.v;

  it("cabecera en la fila 13, líneas debajo, TOTALES en la 34 y la OT siguiente en la 36", () => {
    const ws = pestanaCobros(X, [
      ot([hoja("materiales_usados", "Tubo LED 18W|2|un", "|1|hh", "|2|pp")]),
      ot([], { numeroOt: "SF920260627859", fecha: "2026-06-20" }),
    ], catalogo, false);
    expect(celda(ws, "D13")).toBe("SF920260627830");
    expect(celda(ws, "C13")).toBe(46192); // 19-06-2026 como fecha de Excel
    expect(celda(ws, "G13")).toBe("Instalar 3 proyectores");
    expect([celda(ws, "E14"), celda(ws, "F14"), celda(ws, "I14")]).toEqual(["Revisión normal", "revnor", 2]);
    expect([celda(ws, "F15"), celda(ws, "I15")]).toEqual(["tubled18", 2]);
    // G/H de las líneas quedan vacías: con "Saltar blancos" no pisan el BUSCARV
    expect(ws["G15"]).toBeUndefined();
    expect(celda(ws, "I34")).toBe("TOTALES");
    expect(celda(ws, "D36")).toBe("SF920260627859");
  });

  it("más de 20 líneas siguen en un bloque de continuación", () => {
    const muchas = Array.from({ length: 25 }, (_, i) => `Material ${i}|1|un`);
    const ws = pestanaCobros(X, [ot([hoja("materiales_usados", ...muchas)])], catalogo, false);
    expect(celda(ws, "E33")).toBe("1 un Material 18");
    expect(celda(ws, "D36")).toBe("Continuación");
    expect(celda(ws, "E37")).toBe("1 un Material 19");
  });

  it("SIN OT lleva el solicitante en la Solicitud", () => {
    const ws = pestanaCobros(X, [ot([], { numeroOt: "", solicitante: "Cristian Quijada" })], catalogo, true);
    expect(celda(ws, "D13")).toBe("Cristian Quijada");
  });

  it("el libro reparte CON OT y SIN OT y se puede volver a leer", () => {
    const bytes = libroCobros(X, [ot([]), ot([], { numeroOt: "" })], catalogo);
    const wb = XLSX.read(bytes, { type: "array" });
    expect(wb.SheetNames).toEqual(["CON OT", "SIN OT"]);
  });
});
