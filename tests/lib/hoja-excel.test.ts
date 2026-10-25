import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";
import { calcularHoja, normalizar } from "@/lib/hoja-formulas";
import { celdaExcel, libroDeHoja, nombreHojaExcel, type XlsxHoja } from "@/lib/hoja-excel";

const X = XLSX as unknown as XlsxHoja;
const texto = { id: "a", label: "Ítem", tipo: "texto" as const };
const numero = { id: "b", label: "Cantidad", tipo: "numero" as const };
const FECHA = "dd\\/mm\\/yyyy";
const serie = (y: number, m: number, d: number, h = 0, min = 0) => (Date.UTC(y, m - 1, d, h, min) - Date.UTC(1899, 11, 30)) / 86400000;

describe("celdaExcel: lo escrito, como número, fecha o texto de Excel", () => {
  it("los números escritos a la chilena son números, con el formato con que se escribieron", () => {
    expect(celdaExcel("1.500", numero)).toMatchObject({ t: "n", v: 1500, z: "#,##0" });
    expect(celdaExcel("1.234,5", numero)).toMatchObject({ t: "n", v: 1234.5, z: "#,##0.0" });
    expect(celdaExcel("3,25", numero)).toMatchObject({ t: "n", v: 3.25, z: "0.00" });
    expect(celdaExcel("2.5", numero)).toMatchObject({ t: "n", v: 2.5, z: "0.0" });
    expect(celdaExcel("-10", numero)).toMatchObject({ t: "n", v: -10, z: "0" });
  });
  it("códigos con cero adelante y números larguísimos siguen siendo texto (Excel los rompería)", () => {
    expect(celdaExcel("007", texto)).toMatchObject({ t: "s", v: "007" });
    expect(celdaExcel("12345678901234567", texto)).toMatchObject({ t: "s", v: "12345678901234567" });
    expect(celdaExcel("Cable 2x1,5", texto)).toMatchObject({ t: "s", v: "Cable 2x1,5" });
  });
  it("las fechas del teclado de fecha son fechas de Excel", () => {
    expect(celdaExcel("24/10/2026", texto)).toMatchObject({ t: "n", v: serie(2026, 10, 24), z: FECHA }); // "/" fija: en un Excel chileno "dd/mm" saldría con guiones
    const conHora = celdaExcel("24/10/2026 14:30", texto);
    expect(conHora).toMatchObject({ t: "n", z: `${FECHA} hh:mm` });
    expect(conHora.v).toBeCloseTo(serie(2026, 10, 24, 14, 30), 8);
    expect(celdaExcel("31/02/2026", texto)).toMatchObject({ t: "s" }); // no existe
  });
  it("una fórmula va viva, con su resultado ya calculado y el formato con que se ve en la app", () => {
    expect(celdaExcel("=SUMA(B2:B4)", numero, { calc: { texto: "60", numero: true, valor: 60 }, formula: "SUM(B2:B4)" }))
      .toMatchObject({ t: "n", v: 60, f: "SUM(B2:B4)", z: "#,##0" });
    expect(celdaExcel("=B2*1,5", numero, { calc: { texto: "1.507,5", numero: true, valor: 1507.5 }, formula: "B2*1.5" }))
      .toMatchObject({ t: "n", v: 1507.5, z: "#,##0.0#########" });
    expect(celdaExcel('=A2&"x"', texto, { calc: { texto: "Cablex", numero: false }, formula: 'A2&"x"' }))
      .toMatchObject({ t: "s", v: "Cablex", f: 'A2&"x"' });
    const hoy = celdaExcel("=HOY()", texto, { calc: { texto: "25/10/2026", numero: false }, formula: "TODAY()" });
    expect(hoy).toMatchObject({ t: "n", f: "TODAY()", z: FECHA });
  });
  it("sin fórmula viva (hojas apiladas del export general), queda solo el resultado", () => {
    const c = celdaExcel("=SUMA(B2:B4)", numero, { calc: { texto: "60", numero: true, valor: 60 } });
    expect(c).toMatchObject({ t: "n", v: 60 });
    expect(c.f).toBeUndefined();
  });
  it("un error se ve como en la app: el código, rojo y al centro", () => {
    const c = celdaExcel("=1/0", numero, { calc: { texto: "#DIV/0!", numero: false, error: true }, formula: "1/0" });
    expect(c).toMatchObject({ t: "s", v: "#DIV/0!", f: "1/0" });
    expect(c.s.font).toMatchObject({ color: { rgb: "DC2626" } });
    expect(c.s.alignment).toMatchObject({ horizontal: "center" });
  });
});

describe("celdaExcel: estilos de la app", () => {
  it("fila de nombres y columna de encabezado: gris y negrita; el resto, blanco con líneas grises", () => {
    const cab = celdaExcel("Cantidad", numero, { cabecera: true });
    expect(cab).toMatchObject({ t: "s", v: "Cantidad" });
    expect(cab.s).toMatchObject({ fill: { patternType: "solid", fgColor: { rgb: "F4F4F5" } }, font: { bold: true }, alignment: { horizontal: "left" } });
    expect(celdaExcel("Zona 1", { ...texto, encabezado: true }).s).toMatchObject({ fill: { fgColor: { rgb: "F4F4F5" } }, font: { bold: true } });
    const cuerpo = celdaExcel("Cable", texto);
    expect(cuerpo.s.fill).toBeUndefined();
    expect(cuerpo.s.border).toMatchObject({ top: { style: "thin", color: { rgb: "E4E4E7" } }, left: { style: "thin" } });
    expect(cuerpo.s.alignment).toMatchObject({ wrapText: true, vertical: "top", horizontal: "left" });
  });
  it("alinea como la app: números a la derecha solo en columnas de número o resultados numéricos", () => {
    expect(celdaExcel("10", numero).s.alignment).toMatchObject({ horizontal: "right" });
    expect(celdaExcel("10", texto)).toMatchObject({ t: "n", s: { alignment: { horizontal: "left" } } });
  });
});

describe("nombreHojaExcel", () => {
  it("quita lo que Excel no acepta y corta a 31", () => {
    expect(nombreHojaExcel("Cobro: OT/12 [a]?*")).toBe("Cobro OT 12 a");
    expect(nombreHojaExcel("x".repeat(40))).toHaveLength(31);
    expect(nombreHojaExcel("  ")).toBe("Hoja");
  });
});

describe("libroDeHoja: el .xlsx", () => {
  const columnas = [
    { id: "e", label: "", tipo: "texto" as const, encabezado: true },
    { id: "a", label: "Ítem", tipo: "texto" as const, ancho: 220 },
    { id: "b", label: "Cantidad", tipo: "numero" as const },
    { id: "c", label: "Total", tipo: "numero" as const, width: 90 },
  ];
  const filas: Record<string, string>[] = [
    { e: "Zona 1", a: "Cable", b: "1.500", c: "=C2*2" }, // con la columna de encabezado, Cantidad es la C
    { a: "Caja", b: "20" },
    {}, {}, // vacías del final: no van
  ];
  const libro = (cols = columnas) => {
    const calc = calcularHoja({ columnas: cols, filas: filas.map((celdas) => ({ celdas })) });
    return libroDeHoja(X, { nombre: "Materiales", columnas: cols, filas, calc, normalizar });
  };
  const xml = (bytes: Uint8Array, ruta: string) => {
    const zip = X.CFB.read(bytes, { type: "array" });
    const i = zip.FullPaths.findIndex((p: string) => p.endsWith(ruta));
    return new TextDecoder().decode(Uint8Array.from(zip.FileIndex[i].content));
  };

  it("se lee de vuelta con valores, números y fórmulas reales, sin las filas vacías del final", () => {
    const wb = XLSX.read(libro(), { type: "array" });
    const ws = wb.Sheets["Materiales"];
    expect(ws["!ref"]).toBe("A1:D3");
    expect(ws.B1.v).toBe("Ítem");
    expect(ws.C2).toMatchObject({ t: "n", v: 1500 });
    expect(ws.D2).toMatchObject({ t: "n", v: 3000, f: "C2*2" });
    expect(ws.A2.v).toBe("Zona 1");
  });

  it("inmoviliza la fila de nombres y la columna de encabezado, como la app", () => {
    expect(xml(libro(), "worksheets/sheet1.xml")).toContain('<pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>');
    // Sin columna de encabezado: solo la fila.
    expect(xml(libro(columnas.slice(1)), "worksheets/sheet1.xml")).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
  });

  it("lleva los anchos de la app y los formatos de número y colores", () => {
    const hoja = xml(libro(), "worksheets/sheet1.xml");
    expect(hoja).toMatch(/<col min="2" max="2" width="[\d.]+" customWidth="1"\/>/);
    const estilos = xml(libro(), "styles.xml");
    expect(estilos).toContain('numFmtId="3"'); // #,##0, de los que Excel trae incorporados
    expect(estilos).toContain("F4F4F5");
    expect(estilos).toContain("E4E4E7");
  });

  it("se imprime en horizontal y a una página de ancho (la tabla no se corta entre hojas)", () => {
    const hoja = xml(libro(), "worksheets/sheet1.xml");
    // sheetPr va antes de dimension; pageSetup después de pageMargins y antes de ignoredErrors (orden del esquema).
    expect(hoja).toMatch(/<worksheet[^>]*><sheetPr><pageSetUpPr fitToPage="1"\/><\/sheetPr><dimension /);
    expect(hoja).toMatch(/<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"\/>(<ignoredErrors|<\/worksheet>)/);
  });
});
