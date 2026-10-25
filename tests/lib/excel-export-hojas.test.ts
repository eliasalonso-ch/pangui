// Las hojas de cálculo dentro del export general (bandeja de órdenes y el cron):
// como se ven en la app (lib/hoja-excel), no texto con colores propios.

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import { buildOrdenesWorkbook, type OrdenInput } from "@/lib/excel-export-shared";
import { calcularHoja } from "@/lib/hoja-formulas";

const ot: OrdenInput = {
  id: "ot-1", numero: 7, titulo: "Tablero", descripcion: null, estado: "en_curso", prioridad: "media",
  tipo_trabajo: null, fecha_termino: null, created_at: "2026-10-01T00:00:00Z", asignados_ids: null,
};
const columnas = [
  { id: "e", label: "", tipo: "texto" as const, encabezado: true },
  { id: "a", label: "Ítem", tipo: "texto" as const },
  { id: "b", label: "Cantidad", tipo: "numero" as const },
  { id: "c", label: "Total", tipo: "numero" as const },
];
const celdas = [{ e: "Zona 1", a: "Cable", b: "1.500", c: "=C2*2" }, { a: "Caja", b: "20" }, {}, {}, {}];

const libro = () => buildOrdenesWorkbook({
  ordenes: [ot],
  hojas: [{ id: "h1", orden_id: "ot-1", nombre: "Materiales", columnas }],
  filas: celdas.map((c, orden) => ({ hoja_id: "h1", orden, celdas: c as Record<string, string> })),
  usuarios: [],
  cols: { numero: true, hoja_calculo: true },
  XLSX: XLSX as unknown as Parameters<typeof buildOrdenesWorkbook>[0]["XLSX"],
  calcular: (cols, filas) => calcularHoja({ columnas: cols, filas: filas.map(f => ({ celdas: f.celdas })) }),
});
const xml = (bytes: Uint8Array, ruta: string) => {
  const zip = XLSX.CFB.read(bytes, { type: "array" });
  const i = zip.FullPaths.findIndex((p: string) => p.endsWith(ruta));
  return new TextDecoder().decode(zip.FileIndex[i].content as Uint8Array);
};

describe("export general: hojas de cálculo", () => {
  it("números y resultados de fórmulas van como números, sin las filas vacías del final", () => {
    const wb = XLSX.read(libro(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames.find(n => n.startsWith("OT-"))!];
    const todas = Object.entries(ws).filter(([k]) => !k.startsWith("!")) as [string, XLSX.CellObject][];
    const celda = (texto: string | number) => todas.find(([, c]) => c.v === texto);
    expect(celda(1500)?.[1].t).toBe("n");
    expect(celda(3000)?.[1]).toMatchObject({ t: "n" }); // =C2*2, solo el valor: apiladas, las direcciones no calzan
    expect(celda(3000)?.[1].f).toBeUndefined();
    // La fila de "Caja" es la última de la hoja: lo que sigue es la sección de fotos.
    const filaCaja = XLSX.utils.decode_cell(celda("Caja")![0]).r;
    const siguiente = todas.filter(([k]) => XLSX.utils.decode_cell(k).r > filaCaja && String((ws[k] as XLSX.CellObject).v ?? "").trim());
    expect(siguiente[0]?.[1].v).toBe("Fotos");
  });

  it("los nombres de columna y la columna de encabezado van en el gris de la app, no en azul", () => {
    const estilos = xml(libro(), "styles.xml");
    expect(estilos).toContain("F4F4F5");
  });

  it("la fila de títulos de Órdenes queda inmovilizada de verdad", () => {
    expect(xml(libro(), "worksheets/sheet1.xml")).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
  });
});
