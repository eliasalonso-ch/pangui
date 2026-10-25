// Mismo archivo en la web (pangui: lib/hoja-excel.ts), en la app (pangui-native:
// lib/hoja-excel.ts) y en el cron de exportaciones (supabase/functions/_shared/
// hoja-excel.ts): las tres exportan las hojas igual. Si se cambia uno, copiar a
// los otros tal cual (y su test: tests/lib/hoja-excel.test.ts).
//
// ── Hojas de cálculo a Excel, como se ven en la app ──────────────────────────
// No es solo pintar: cada celda va como lo que es. Un número escrito a la
// chilena ("1.500", "3,25") es un número de Excel con el formato con que se
// escribió; una fecha del teclado de fecha es una fecha; una fórmula va viva
// (en la forma en inglés que guarda .xlsx) con su resultado ya calculado. Los
// colores, bordes, alineación y anchos son los de la grilla, y la fila de
// nombres (y la columna de encabezado, si hay) quedan inmovilizadas.
//
// Sin imports: el módulo xlsx-js-style se recibe (su ruta cambia entre Next,
// React Native y Deno), y los resultados de las fórmulas y su forma en inglés
// también (lib/hoja-formulas: calcularHoja y normalizar).

export type ColumnaExcel = {
  id: string;
  label: string;
  tipo?: "texto" | "numero";
  /** Columna de encabezado (la A gris de las hojas hechas en la app). */
  encabezado?: boolean;
  /** Ancho en px: `ancho` lo guarda la web y `width` la app. */
  ancho?: number;
  width?: number;
};
/** El resultado de una fórmula (lib/hoja-formulas → Resultado). */
export type ResultadoExcel = { texto: string; numero: boolean; valor?: number; error?: boolean };
export type EstiloExcel = {
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  border?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
};
export type CeldaExcel = { t: "s" | "n"; v: string | number; z?: string; f?: string; s: EstiloExcel };

/** Lo que se usa de xlsx-js-style (se recibe: la ruta del módulo cambia por entorno). */
export interface XlsxHoja {
  utils: {
    book_new: () => unknown;
    book_append_sheet: (wb: unknown, ws: unknown, nombre: string) => void;
    encode_cell: (c: { r: number; c: number }) => string;
    encode_range: (r: { s: { r: number; c: number }; e: { r: number; c: number } }) => string;
  };
  write: (wb: unknown, opts: { bookType: "xlsx"; type: "array" }) => ArrayBuffer | Uint8Array;
  CFB: {
    read: (data: Uint8Array, opts: { type: "array" }) => { FullPaths: string[]; FileIndex: { content: Uint8Array | number[] }[] };
    write: (zip: unknown, opts: { fileType: "zip"; type: "array" }) => ArrayBuffer | Uint8Array | number[];
  };
}

// Colores de la grilla en modo claro (constants/colors de la app: muted, border, foreground).
const GRIS = "F4F4F5";
const LINEA = "E4E4E7";
const TINTA = "18181B";
const ROJO = "DC2626";
const ANCHO = 160; // px, el de una columna sin ancho elegido

const linea = { style: "thin", color: { rgb: LINEA } };
const BORDES = { top: linea, bottom: linea, left: linea, right: linea };

// Días desde el 30/12/1899: así cuenta Excel las fechas.
const serie = (y: number, m: number, d: number, h = 0, min = 0) => (Date.UTC(y, m - 1, d, h, min) - Date.UTC(1899, 11, 30)) / 86400000;

const MILES = /^-?\d{1,3}(\.\d{3})+(,(\d+))?$/;
const SIMPLE = /^-?(\d+)([.,](\d+))?$/;
const FECHA = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}))?$/;

/** "1.500" → 1500 con "#,##0"; "3,25" → 3.25 con "0.00". Códigos ("007") y números larguísimos no. */
function numeroEscrito(t: string): { v: number; z: string } | null {
  const miles = MILES.exec(t);
  if (miles) {
    const d = miles[3]?.length ?? 0;
    return { v: Number(t.replace(/\./g, "").replace(",", ".")), z: `#,##0${d ? `.${"0".repeat(d)}` : ""}` };
  }
  const m = SIMPLE.exec(t);
  if (!m || (m[1].length > 1 && m[1].startsWith("0")) || m[1].length > 15) return null;
  const d = m[3]?.length ?? 0;
  return { v: Number(t.replace(",", ".")), z: d ? `0.${"0".repeat(d)}` : "0" };
}

/** "24/10/2026" o "24/10/2026 14:30" (como los escribe el teclado de fecha) → fecha de Excel. */
function fechaEscrita(t: string): { v: number; z: string } | null {
  const m = FECHA.exec(t);
  if (!m) return null;
  const [d, mes, y, h, min] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0"].map(Number);
  const f = new Date(Date.UTC(y, mes - 1, d));
  if (f.getUTCDate() !== d || f.getUTCMonth() !== mes - 1 || h > 23 || min > 59) return null; // 31/02 no existe
  // "\/": barra fija. Una "/" sola es el separador de fecha del Excel que abre el
  // archivo, y en uno en español de Chile sale "24-10-2026".
  return { v: serie(y, mes, d, h, min), z: m[4] ? "dd\\/mm\\/yyyy hh:mm" : "dd\\/mm\\/yyyy" };
}

/**
 * Una celda de la hoja como celda de Excel. `calc`: su resultado si es fórmula;
 * `formula`: la fórmula en la forma del .xlsx (sin ella, va solo el resultado:
 * así en las hojas apiladas del export general, donde las direcciones no calzan).
 * `cabecera`: la fila de nombres de columna.
 */
export function celdaExcel(
  raw: string,
  col: ColumnaExcel,
  { calc, formula, cabecera = false }: { calc?: ResultadoExcel; formula?: string; cabecera?: boolean } = {},
): CeldaExcel {
  const gris = cabecera || !!col.encabezado;
  // Alineación como la grilla: a la derecha los números de columnas de número y los resultados numéricos.
  const derecha = !cabecera && (col.tipo === "numero" || !!calc?.numero);
  const s: EstiloExcel = {
    font: { sz: 11, color: { rgb: calc?.error ? ROJO : TINTA }, ...(gris && { bold: true }) },
    ...(gris && { fill: { patternType: "solid", fgColor: { rgb: GRIS } } }),
    border: BORDES,
    alignment: { vertical: "top", wrapText: true, horizontal: calc?.error ? "center" : derecha ? "right" : "left" },
  };
  const f = formula ? { f: formula } : {};

  if (cabecera) return { t: "s", v: raw, s };
  if (calc) {
    if (calc.error) return { t: "s", v: calc.texto, ...f, s };
    if (calc.numero && calc.valor != null) {
      return { t: "n", v: calc.valor, z: Number.isInteger(calc.valor) ? "#,##0" : "#,##0.0#########", ...f, s };
    }
    // HOY(), AHORA(): la app muestra la fecha; en Excel, fecha también.
    const fecha = fechaEscrita(calc.texto);
    return fecha ? { t: "n", ...fecha, ...f, s } : { t: "s", v: calc.texto, ...f, s };
  }
  const t = raw.trim();
  const valor = numeroEscrito(t) ?? fechaEscrita(t);
  return valor ? { t: "n", ...valor, s } : { t: "s", v: raw, s };
}

/** Nombre de pestaña válido para Excel: sin \ / ? * [ ] :, hasta 31 caracteres. */
export function nombreHojaExcel(nombre: string): string {
  return nombre.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31).trim() || "Hoja";
}

type DatosHoja = {
  columnas: ColumnaExcel[];
  /** Las celdas de cada fila, en su orden (`orden`): la primera es la fila 2 de las fórmulas. */
  filas: Record<string, string | null | undefined>[];
  /** calcularHoja: resultado de cada fórmula, por `${fila}:${columna}` (fila 1 = primera fila). */
  calc?: Map<string, ResultadoExcel>;
  /** normalizar: "=SUMA(B2;1,5)" → "SUM(B2,1.5)". Sin él, las fórmulas van solo como resultado. */
  normalizar?: (formula: string) => string;
};

/** La hoja como pestaña de Excel (sin las filas vacías del final). */
export function hojaExcel(X: XlsxHoja, { columnas, filas, calc, normalizar }: DatosHoja): Record<string, unknown> {
  let n = filas.length;
  while (n > 0 && !columnas.some((c) => String(filas[n - 1][c.id] ?? "").trim())) n--;
  const ws: Record<string, unknown> = {};
  columnas.forEach((col, c) => {
    ws[X.utils.encode_cell({ r: 0, c })] = celdaExcel(col.label, col, { cabecera: true });
    for (let r = 0; r < n; r++) {
      const raw = String(filas[r][col.id] ?? "");
      const resultado = raw.startsWith("=") ? calc?.get(`${r + 1}:${c}`) : undefined;
      ws[X.utils.encode_cell({ r: r + 1, c })] = celdaExcel(raw, col, {
        calc: resultado,
        formula: resultado && normalizar ? normalizar(raw) : undefined,
      });
    }
  });
  ws["!cols"] = columnas.map((c) => ({ wpx: c.ancho ?? c.width ?? ANCHO }));
  ws["!ref"] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: n, c: Math.max(columnas.length - 1, 0) } });
  return ws;
}

// ── Lo que xlsx-js-style no escribe ──────────────────────────────────────────
// Paneles inmovilizados y ajuste de impresión: se agregan al XML de cada pestaña,
// dentro del zip ya escrito. Se busca y reemplaza en bytes (las etiquetas son
// ASCII), sin decodificar el resto (los textos van en UTF-8).

/** Por pestaña, en el orden en que se agregaron al libro. */
export type AjustePestana = {
  /** Filas y columnas inmovilizadas arriba y a la izquierda. */
  filas: number;
  columnas: number;
  /** Imprimir en horizontal y a una página de ancho. */
  imprimir?: boolean;
};

const bytesAscii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));
function buscar(datos: Uint8Array, patron: Uint8Array): number {
  fuera: for (let i = 0; i <= datos.length - patron.length; i++) {
    for (let j = 0; j < patron.length; j++) if (datos[i + j] !== patron[j]) continue fuera;
    return i;
  }
  return -1;
}
/** Reemplaza la primera aparición de `de` por `por`; null si no está. */
function reemplazar(datos: Uint8Array, de: string, por: string): Uint8Array | null {
  const patron = bytesAscii(de);
  const k = buscar(datos, patron);
  if (k < 0) return null;
  const nuevo = bytesAscii(por);
  const out = new Uint8Array(datos.length - patron.length + nuevo.length);
  out.set(datos.subarray(0, k));
  out.set(nuevo, k);
  out.set(datos.subarray(k + patron.length), k + nuevo.length);
  return out;
}

const letra = (c: number): string => (c < 26 ? "" : letra(Math.floor(c / 26) - 1)) + String.fromCharCode(65 + (c % 26));

function vista({ filas, columnas }: AjustePestana): string {
  if (!filas && !columnas) return '<sheetView workbookViewId="0"/>';
  const celda = `${letra(columnas)}${filas + 1}`;
  const panel = filas && columnas ? "bottomRight" : filas ? "bottomLeft" : "topRight";
  return `<sheetView workbookViewId="0"><pane${columnas ? ` xSplit="${columnas}"` : ""}${filas ? ` ySplit="${filas}"` : ""}`
    + ` topLeftCell="${celda}" activePane="${panel}" state="frozen"/><selection pane="${panel}" activeCell="${celda}" sqref="${celda}"/></sheetView>`;
}

/** Aplica a cada pestaña del libro (sheet1.xml, sheet2.xml… en orden) su ajuste. */
export function ajustarLibro(X: XlsxHoja, libro: Uint8Array, ajustes: (AjustePestana | undefined)[]): Uint8Array<ArrayBuffer> {
  const zip = X.CFB.read(libro, { type: "array" });
  zip.FullPaths.forEach((ruta, i) => {
    const n = /xl\/worksheets\/sheet(\d+)\.xml$/.exec(ruta);
    const ajuste = n && ajustes[Number(n[1]) - 1];
    if (!ajuste) return;
    let datos: Uint8Array = Uint8Array.from(zip.FileIndex[i].content);
    datos = reemplazar(datos, '<sheetView workbookViewId="0"/>', vista(ajuste)) ?? datos;
    if (ajuste.imprimir) {
      // Orden del esquema: sheetPr antes de dimension; pageSetup después de pageMargins y antes de ignoredErrors.
      const pagina = '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>';
      datos = reemplazar(datos, "<dimension ", '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ') ?? datos;
      datos = reemplazar(datos, "<ignoredErrors", `${pagina}<ignoredErrors`) ?? reemplazar(datos, "</worksheet>", `${pagina}</worksheet>`) ?? datos;
    }
    zip.FileIndex[i].content = datos;
  });
  return Uint8Array.from(X.CFB.write(zip, { fileType: "zip", type: "array" }) as ArrayLike<number>);
}

/** Un .xlsx con una sola hoja, lista para descargar o compartir. */
export function libroDeHoja(X: XlsxHoja, { nombre, ...datos }: DatosHoja & { nombre: string }): Uint8Array<ArrayBuffer> {
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, hojaExcel(X, datos), nombreHojaExcel(nombre));
  const bytes = new Uint8Array(X.write(wb, { bookType: "xlsx", type: "array" }));
  // Como la grilla: fija la fila de nombres y, si hay, la columna de encabezado.
  return ajustarLibro(X, bytes, [{ filas: 1, columnas: datos.columnas[0]?.encabezado ? 1 : 0, imprimir: true }]);
}
