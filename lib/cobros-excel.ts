import { ajustarLibro, type XlsxHoja } from "@/lib/hoja-excel";

/**
 * Export de cobros de Electrilam: el libro "COBROS CON Y SIN OT <MES>" que
 * llena Claudio, con su mismo dibujo, formato y fórmulas, para que deje de
 * copiar OT por OT lo que los técnicos escribieron en las hojas.
 *
 * Cada OT es un bloque fijo de 23 filas: la cabecera (fecha, N° OT o
 * solicitante, facultad, descripción), 20 líneas y la fila de TOTALES. Cada
 * línea lleva el texto libre en E y, si ya se sabe, código en F y cantidad en
 * I; descripción, unidad y precios salen del BUSCARV contra la pestaña
 * Materiales. Pangui NO guarda precios: la pestaña Materiales sale con el
 * catálogo (código, descripción, unidad) y las columnas de precio vacías, para
 * que Claudio pegue encima la tabla de Patricio.
 */

export const PRIMERA_CABECERA = 13; // fila Excel (1-based) de la primera cabecera
export const FILAS_POR_BLOQUE = 23;
export const LINEAS_POR_BLOQUE = 20;

export interface HojaCobro {
  tipo: string;
  columnas: { id: string; label: string }[];
  /** Celdas ya con las fórmulas resueltas (celdasConResultados). */
  filas: Record<string, string>[];
}

export interface OtCobro {
  /** SF9… si la OT viene del portal del cliente; vacío = SIN OT. */
  numeroOt: string;
  solicitante: string;
  lugar: string;
  /** Fecha de término, YYYY-MM-DD. */
  fecha: string;
  descripcion: string;
  emergencia: boolean;
  /** Minutos que marcó el cronómetro de la app; respaldo si la hoja no trae las hh. */
  minutosApp?: number | null;
  /** Técnicos asignados en Pangui; respaldo si la hoja no dice cuántas personas fueron. */
  asignados?: number;
  hojas: HojaCobro[];
}

export interface Linea {
  texto: string;
  codigo?: string;
  cantidad?: number;
}

export interface MaterialCobro {
  codigo: string;
  descripcion: string;
  unidad: string;
  clasificacion: string;
}

export function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

function numero(s: string): number | null {
  const n = parseFloat(s.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const HH = /^(h|hh|h\.h\.?|hrs?|horas?)$/;
const UNIDAD_HH = /^(hh|h\.h\.?)$/;
const PP = /^(p|pp|personas?)$/;
const DIAS = /\bdias?\b/; // sobre texto ya normalizado (sin tildes)
const MENCIONA_HH = /(^|\s)(hh|h\.h\.?|horas?)(\s|$)/;
const HH_EN_TEXTO = /(\d+(?:[.,]\d+)?)\s*(?:hh|h\.h\.?|horas?)\b/;
const PP_EN_TEXTO = /(\d+)\s*(?:pp|personas?)\b/;

/**
 * Las líneas de una OT para el bloque: primero la mano de obra (revnor /
 * reveme), después lo que escribió el técnico, al final personas y horas.
 *
 * Mano de obra = personas × hh, la regla de Claudio. Las hh salen de la hoja
 * (es lo que él copia); si la hoja no las trae, del cronómetro de la app:
 * menos de 60 min es 1hh, hasta 120 son 2hh, etc. Las personas, de la hoja;
 * si no, 2 (o los asignados, si son más). Sólo se calcula si queda
 * exactamente un dato de cada uno: con dos trabajos dentro de la misma OT
 * (4hh 3pp y 5hh 2pp) o con "2 días" no hay una cuenta segura y la cantidad
 * queda en blanco para que la ponga él.
 *
 * `catalogo` es texto normalizado → código (por código y por descripción).
 * Sólo se sugiere código si el texto calza exacto: un código mal adivinado es
 * plata mal cobrada, uno en blanco sólo es una celda por llenar.
 */
export function lineasDeOt(ot: OtCobro, catalogo: Map<string, string>): Linea[] {
  const materiales: Linea[] = [];
  const notas: string[] = [];
  const horas: number[] = [];
  const personas: number[] = [];
  let dudoso = false;

  for (const hoja of ot.hojas) {
    if (hoja.tipo === "materiales_solicitados") continue; // lo pedido no es lo usado
    // Por etiqueta y no por posición: las hojas se renombran a gusto.
    const col = (...etiquetas: string[]) => hoja.columnas.find((c) => etiquetas.includes(norm(c.label)))?.id;
    const cItem = col("material", "item", "descripcion") ?? hoja.columnas[0]?.id;
    const cCodigo = col("codigo");
    const cCant = col("cantidad", "valor") ?? hoja.columnas[1]?.id;
    const cUnidad = col("unidad") ?? (hoja.tipo === "general" ? undefined : hoja.columnas[2]?.id);
    const cObs = col("observacion");

    for (const f of hoja.filas) {
      const item = String(f[cItem ?? ""] ?? "").trim();
      const cant = String(f[cCant ?? ""] ?? "").trim();
      const unidad = String(f[cUnidad ?? ""] ?? "").trim();
      const obs = String(f[cObs ?? ""] ?? "").trim();

      // Hoja de cobro: el técnico ya eligió el código del catálogo.
      if (hoja.tipo === "cobro" && cCodigo) {
        const codigo = String(f[cCodigo] ?? "").trim();
        if (!codigo) continue;
        materiales.push({ texto: [cant, obs || codigo].filter(Boolean).join(" "), codigo, cantidad: numero(cant) ?? undefined });
        continue;
      }
      if (!item && !cant) continue;

      const nItem = norm(item), nUnidad = norm(unidad);
      const n = numero(cant);
      const esHH = HH.test(nItem) || UNIDAD_HH.test(nUnidad);
      const esPP = PP.test(nItem) || PP.test(nUnidad);
      // "3 | Días", "Trabajo de 2 días completos": las hh no salen de la cuenta.
      if (DIAS.test(nItem) || DIAS.test(nUnidad)) dudoso = true;

      if ((esHH || esPP) && n != null) {
        (esHH ? horas : personas).push(n);
        // "Alza-hombre | 4 | hh": las horas cuentan, pero el texto también dice algo.
        if (item && !HH.test(nItem) && !PP.test(nItem)) notas.push(item);
        continue;
      }
      // "Horas de trabajo | 3 | 2 personas", "18 | horas revisión emergencia 3 personas".
      if (n != null && (MENCIONA_HH.test(nItem) || MENCIONA_HH.test(nUnidad))) {
        horas.push(n);
        const pp = `${nItem} ${nUnidad}`.match(PP_EN_TEXTO);
        if (pp) personas.push(numero(pp[1])!);
        continue;
      }
      // "1 hh 2 personas" escrito de corrido en una sola celda.
      const h = !cant && nItem.match(HH_EN_TEXTO);
      const p = !cant && nItem.match(PP_EN_TEXTO);
      if (h || p) {
        if (h) horas.push(numero(h[1])!);
        if (p) personas.push(numero(p[1])!);
        continue;
      }

      const codigo = catalogo.get(nItem);
      materiales.push({
        texto: [cant, unidad, item].filter(Boolean).join(" "),
        ...(codigo ? { codigo } : {}),
        ...(n != null ? { cantidad: n } : {}),
      });
    }
  }

  // El cronómetro a veces queda corriendo días: esas hh salen marcadas para revisar.
  const deLaApp = horas.length === 0 && !!ot.minutosApp && ot.minutosApp > 0;
  if (deLaApp) horas.push(Math.max(1, Math.ceil(ot.minutosApp! / 60)));
  // Se trabaja de a dos casi siempre; en la OT suele quedar asignado uno solo,
  // así que los asignados sólo cuentan cuando son más de dos.
  if (personas.length === 0) personas.push(Math.max(2, ot.asignados ?? 0));

  const manoObra: Linea = ot.emergencia
    ? { texto: "Revisión de emergencia", codigo: "reveme" }
    : { texto: "Revisión normal", codigo: "revnor" };
  if (!dudoso && horas.length === 1 && personas.length === 1) {
    manoObra.cantidad = Math.round(horas[0] * personas[0] * 100) / 100;
  }

  return [
    manoObra,
    ...materiales,
    ...notas.map((texto) => ({ texto })),
    ...personas.map((n) => ({ texto: `${n} ${n === 1 ? "persona" : "personas"}` })),
    ...horas.map((n) => ({ texto: deLaApp ? `${n}hh (según app)` : `${n}hh` })),
  ];
}

// ── Formato: copia del de la plantilla de Claudio ────────────────────────────

/** Días desde el 30-12-1899: así guarda Excel una fecha. */
function serieExcel(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

export const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const PESOS = "\\$\\ #,##0";
const PESOS_TOTAL = '_ [$$-340A]* #,##0_ ;_ [$$-340A]* \\-#,##0_ ;_ [$$-340A]* "-"??_ ;_ @_ ';
const AMARILLO = "FFFF00";
const CELESTE = "D0DFE6";  // acento 1 del tema de Office al 80 %: la cabecera de cada OT
const DORADO = "FFD757";   // fila de TOTALES
const GRIS = "F2F2F2";
const FRANJA = "D9D9D9";   // banda del TableStyleLight1
const ALTO_MAT = 1912;     // la plantilla busca en Materiales!$G$2:$O$1912

type Borde = "thin" | "medium" | undefined;
type Estilo = Record<string, unknown>;
const lado = (style: Borde) => (style ? { style, color: { rgb: "000000" } } : undefined);
function est(o: {
  fuente?: string; tam?: number; negrita?: boolean; relleno?: string;
  h?: "left" | "center" | "right"; v?: "top" | "center"; ajustar?: boolean; fmt?: string;
  bd?: [Borde, Borde, Borde, Borde]; // izquierda, derecha, arriba, abajo
}): Estilo {
  const s: Estilo = {
    font: { name: o.fuente ?? "Aptos Narrow", sz: o.tam ?? 11, bold: !!o.negrita, color: { rgb: "000000" } },
    alignment: { horizontal: o.h, vertical: o.v ?? "center", wrapText: !!o.ajustar },
  };
  if (o.relleno) s.fill = { patternType: "solid", fgColor: { rgb: o.relleno } };
  if (o.fmt) s.numFmt = o.fmt;
  if (o.bd) s.border = { left: lado(o.bd[0]), right: lado(o.bd[1]), top: lado(o.bd[2]), bottom: lado(o.bd[3]) };
  return s;
}

const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
type Celda = { v?: string | number; f?: string; s?: Estilo };

class Pestana {
  ws: Record<string, unknown> = {};
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  alto: { hpt: number }[] = [];
  constructor(private X: XlsxHoja) {}
  /** fila 1-based, columna "C". Fórmula sin "=". */
  put(fila: number, col: string, { v, f, s }: Celda) {
    const cell: Record<string, unknown> = {};
    if (f) cell.f = f;
    // xlsx-js-style no escribe una celda sin valor ni fórmula, aunque tenga
    // bordes: las vacías van como texto "" para que el dibujo no se pierda.
    if (v !== undefined) { cell.v = v; cell.t = typeof v === "number" ? "n" : "s"; }
    else if (f) cell.t = "n";
    else { cell.v = ""; cell.t = "s"; }
    if (s) { cell.s = s; if (typeof s.numFmt === "string") cell.z = s.numFmt; }
    this.ws[this.X.utils.encode_cell({ r: fila - 1, c: L.indexOf(col) })] = cell;
  }
  unir(desde: string, hasta: string) {
    const p = (ref: string) => ({ r: Number(ref.slice(1)) - 1, c: L.indexOf(ref[0]) });
    this.merges.push({ s: p(desde), e: p(hasta) });
  }
  altura(fila: number, hpt: number) { this.alto[fila - 1] = { hpt }; }
  cerrar(ultimaFila: number, ultimaCol: string, anchos: number[]) {
    this.ws["!ref"] = this.X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultimaFila - 1, c: L.indexOf(ultimaCol) } });
    this.ws["!merges"] = this.merges;
    this.ws["!rows"] = this.alto;
    this.ws["!cols"] = anchos.map((wch) => ({ wch }));
    return this.ws;
  }
}

const COLS_BLOQUE = "CDEFGHIJKLMNOP".split("");
// C..P de la plantilla (A y B son márgenes).
const ANCHOS = [4.6, 2, 10.6, 20, 72.9, 9.4, 70.4, 13.4, 15.3, 16.6, 15.6, 18.1, 15.4, 15.4, 13.9, 18.1];

/** Membrete, resumen del período (fila 9-10) y encabezados de columna (fila 12). */
function encabezado(p: Pestana, titulo: string, desde: string, hasta: string, ultima: number) {
  const box = (fila: number, col: string): [Borde, Borde, Borde, Borde] =>
    [col === "C" ? "medium" : undefined, col === "P" ? "medium" : undefined, fila === 2 ? "medium" : undefined, fila === 7 ? "medium" : undefined];
  // Sólo el borde del recuadro: una celda de más (aunque vacía) corta el texto
  // de contacto, que se extiende hacia la izquierda desde P.
  for (let fila = 2; fila <= 7; fila++) for (const col of COLS_BLOQUE) {
    if (box(fila, col).some(Boolean)) p.put(fila, col, { s: est({ bd: box(fila, col) }) });
  }

  p.put(2, "F", { v: "ELECTRILAMSPA", s: est({ fuente: "Aptos Display", tam: 44, negrita: true, h: "center", v: "top", bd: [undefined, undefined, "medium", undefined] }) });
  p.unir("F2", "L5");
  p.put(6, "F", { v: "   Ingeniería y construcción ", s: est({ tam: 16, negrita: true, h: "center" }) });
  p.unir("F6", "L6");
  p.unir("H7", "L7");
  const contacto = ["   Pasaje nueva concepción #402 , Concepción   ", "Empresaelectricalamana@gmail.com   ", "Rut: 77.078.563-4   ", "+569 9317 5038   "];
  contacto.forEach((t, i) => p.put(3 + i, "P", { v: t, s: est({ fuente: "Aptos Display", tam: 14, h: "right", bd: [undefined, "medium", undefined, undefined] }) }));

  const amarillo = (bd: [Borde, Borde, Borde, Borde], tam = 11) => est({ tam, negrita: true, relleno: AMARILLO, h: "center", ajustar: true, bd });
  p.put(9, "C", { v: "CANTIDAD TRABAJOS", s: est({ tam: 9, negrita: true, relleno: GRIS, h: "center", ajustar: true, bd: ["medium", "medium", "medium", "medium"] }) });
  // COUNT y no COUNTA (el de la plantilla): las celdas vacías llevan "" y COUNTA
  // las contaría; las fechas de cabecera son números, así que el resultado es el mismo.
  p.put(10, "C", { f: `COUNT(C${PRIMERA_CABECERA}:C${ultima})`, s: est({ tam: 12, negrita: true, h: "center", bd: ["medium", "medium", undefined, "medium"] }) });
  p.put(9, "D", { v: MESES[Number(hasta.slice(5, 7)) - 1] ?? "", s: amarillo([undefined, "medium", "medium", undefined], 18) });
  p.put(10, "D", { v: hasta.slice(0, 4), s: amarillo([undefined, "medium", undefined, "medium"], 18) });
  p.put(9, "E", { v: titulo, s: est({ tam: 20, negrita: true, h: "center", ajustar: true, bd: ["medium", "medium", "medium", "medium"] }) });
  for (const [f, c] of [[9, "F"], [9, "G"], [10, "E"], [10, "F"], [10, "G"]] as const) {
    p.put(f, c, { s: est({ bd: [c === "E" ? "medium" : undefined, c === "G" ? "medium" : undefined, f === 9 ? "medium" : undefined, f === 10 ? "medium" : undefined] }) });
  }
  p.unir("E9", "G10");
  p.put(9, "I", { v: "DESDE ", s: amarillo(["medium", "thin", "medium", undefined]) });
  p.put(10, "I", { v: "HASTA", s: amarillo(["medium", "thin", "medium", "medium"]) });
  p.put(9, "J", { v: serieExcel(desde), s: est({ tam: 14, negrita: true, h: "center", fmt: "d-mmm", bd: ["thin", "medium", "medium", undefined] }) });
  p.put(10, "J", { v: serieExcel(hasta), s: est({ tam: 14, negrita: true, h: "center", fmt: "d-mmm", bd: ["thin", "medium", "medium", "medium"] }) });

  // Totales del período: suman las filas TOTALES de cada bloque (J = "Materiales", L = "M.O").
  const rango = (c: string) => `${c}${PRIMERA_CABECERA}:${c}${ultima}`;
  const totales: [string, string, string][] = [
    ["L", "TOTAL MATERIALES", `SUMIF(${rango("J")},"materiales",${rango("K")})`],
    ["M", "TOTAL M.O", `SUMIF(${rango("L")},"m.o",${rango("M")})`],
    ["N", "NETO", "L10+M10"],
    ["O", "IVA", "N10*0.19"],
    ["P", "TOTAL", "O10+N10"],
  ];
  for (const [c, rotulo, f] of totales) {
    const izq: Borde = c === "N" ? undefined : "medium", der: Borde = c === "L" || c === "N" ? undefined : "medium";
    p.put(9, c, { v: rotulo, s: amarillo([izq, der, "medium", "thin"]) });
    p.put(10, c, { f, s: est({ tam: 13, negrita: true, h: "center", fmt: PESOS_TOTAL, bd: [izq, der, "thin", "medium"] }) });
  }
  for (const c of "CDEFGHIJKLM") p.put(11, c, { s: est({ bd: [undefined, undefined, undefined, "medium"] }) });
  p.unir("C11", "M11");

  const rotulos = ["Fecha termino", "Solicitud", "Notas/Facultad", "Codigo", "Descripción", "Unidad", "Cantidad",
    "Valor Unit. \nMaterial", "Total \nMateriales", "Valor Unit. \nMO", "Total \nM.O", "Total \nneto", "IVA", "Total"];
  COLS_BLOQUE.forEach((c, i) => p.put(12, c, {
    v: rotulos[i],
    s: est({ fuente: "Aptos Display", tam: 12, negrita: !"JKL".includes(c), h: "center", ajustar: true,
      bd: [c === "D" || c === "G" ? undefined : c === "C" || c === "E" || c === "F" ? "medium" : "thin",
        c === "D" || c === "G" ? undefined : c === "E" || c === "F" || c === "P" ? "medium" : "thin", "medium", "medium"] }),
  }));
  [15.75, 18.75, 16.5, 24, 16.9, 24, 21.75, 8.65, 35.25, 24.95, 18.4, 54.75].forEach((h, i) => p.altura(i + 1, h));
}

/** Un bloque de 23 filas desde `cab` (la fila de cabecera de la OT); `n` es su número en la columna A. */
function bloque(p: Pestana, cab: number, n: number, ot: OtCobro | null, lineas: Linea[], catalogo: Map<string, MaterialCobro>, sinOt: boolean) {
  p.put(cab, "A", { v: n, s: est({ negrita: true, h: "center" }) });
  const bd = (c: string, arriba: Borde = "thin", abajo: Borde = "thin"): [Borde, Borde, Borde, Borde] =>
    [c === "C" ? "medium" : "thin", c === "P" ? "medium" : "thin", arriba, abajo];

  // Cabecera: celeste, con los rótulos de la plantilla.
  const rotulos: Record<string, string> = { F: "Codigo", I: "Cantidad", J: "Materiales", K: "Total \nMateriales", L: "M.O", M: "Total \nM.O", N: "Total \nneto", O: "IVA", P: "Total" };
  for (const c of COLS_BLOQUE) {
    const display = "CDEFG".includes(c);
    const s = est({
      fuente: display ? "Aptos Display" : "Bahnschrift", tam: display ? 12 : 11, negrita: c !== "G", relleno: CELESTE,
      h: c === "G" ? "left" : "center", ajustar: c === "E" || c === "G" || !display, fmt: c === "C" ? "d-mmm" : undefined,
      bd: bd(c, "medium"),
    });
    let v: string | number | undefined = rotulos[c];
    if (ot) {
      if (c === "C" && ot.fecha) v = serieExcel(ot.fecha);
      if (c === "D") v = sinOt ? ot.solicitante : ot.numeroOt;
      if (c === "E") v = ot.lugar;
      if (c === "G") v = ot.descripcion;
    } else if (c === "D") v = "Continuación";
    p.put(cab, c, { v, s });
  }
  p.altura(cab, 27.75);

  // 20 líneas con las fórmulas de la plantilla: BUSCARV contra Materiales e IVA 19 %.
  const buscar = (fila: number, n: number) => `IFERROR(VLOOKUP($F${fila},Materiales!$G$2:$O$${ALTO_MAT},${n},FALSE),"-")`;
  for (let j = 0; j < LINEAS_POR_BLOQUE; j++) {
    const r = cab + 1 + j;
    const l = lineas[j];
    const mat = l?.codigo ? catalogo.get(norm(l.codigo)) : undefined;
    // Franjas grises en filas impares: lo que pinta el estilo de tabla de la plantilla.
    const b12 = (o: Parameters<typeof est>[0]) => est({ fuente: "Bahnschrift", tam: 12, h: "center", relleno: r % 2 ? FRANJA : undefined, ...o });
    p.put(r, "C", { s: b12({ negrita: true, fmt: "0", bd: bd("C") }) });
    p.put(r, "D", { s: b12({ negrita: true, fmt: "0", bd: bd("D") }) });
    p.put(r, "E", { v: l?.texto, s: b12({ h: "left", fmt: "0", bd: bd("E") }) });
    p.put(r, "F", { v: l?.codigo, s: b12({ negrita: true, fmt: "0", bd: bd("F") }) });
    // Con el resultado ya puesto, para que se lea igual antes de recalcular.
    p.put(r, "G", { f: buscar(r, 2), v: mat ? mat.descripcion : "-", s: b12({ h: undefined, ajustar: true, bd: bd("G") }) });
    p.put(r, "H", { f: buscar(r, 3), v: mat ? mat.unidad : "-", s: b12({ fmt: PESOS, bd: bd("H") }) });
    p.put(r, "I", { v: l?.cantidad, s: b12({ fmt: "0", bd: bd("I") }) });
    p.put(r, "J", { f: buscar(r, 8), s: b12({ fmt: PESOS, bd: bd("J") }) });
    p.put(r, "K", { f: `IFERROR(J${r}*I${r},"-")`, s: b12({ fmt: PESOS, bd: bd("K") }) });
    p.put(r, "L", { f: buscar(r, 9), s: b12({ fmt: PESOS, bd: bd("L") }) });
    p.put(r, "M", { f: `IFERROR(L${r}*I${r},"-")`, s: b12({ fmt: PESOS, bd: bd("M") }) });
    p.put(r, "N", { f: `IFERROR(M${r}+K${r},"-")`, s: b12({ fmt: PESOS, bd: bd("N") }) });
    p.put(r, "O", { f: `IFERROR(N${r}*0.19,"-")`, s: b12({ fmt: PESOS, bd: bd("O") }) });
    p.put(r, "P", { f: `IFERROR(O${r}+N${r},"-")`, s: b12({ fmt: PESOS, bd: bd("P") }) });
  }

  // TOTALES (dorado). Los rótulos J/L son los que suman los SUMIF del resumen.
  const t = cab + 1 + LINEAS_POR_BLOQUE, de = cab + 1, a = cab + LINEAS_POR_BLOQUE;
  const tot: Record<string, Celda> = {
    I: { v: "TOTALES" }, J: { v: "Materiales" }, L: { v: "M.O" },
    K: { f: `SUM(K${de}:K${a})` }, M: { f: `SUM(M${de}:M${a})` }, N: { f: `SUM(N${de}:N${a})` }, O: { f: `SUM(O${de}:O${a})` }, P: { f: `SUM(P${de}:P${a})` },
  };
  for (const c of COLS_BLOQUE) {
    p.put(t, c, { ...tot[c], s: est({
      fuente: c === "I" ? "Aptos Narrow" : "Bahnschrift", tam: 12, negrita: !"KMNOP".includes(c), relleno: DORADO, h: "center",
      fmt: "KLMNOPJ".includes(c) ? PESOS : "0", bd: bd(c, "thin", "FGHIJKLMNOP".includes(c) ? "medium" : "thin"),
    }) });
  }
  p.altura(t, 19.5);
  p.put(t + 1, "C", { s: est({ bd: ["medium", undefined, undefined, undefined] }) });
  p.altura(t + 1, 15.75);
}

/**
 * Una pestaña CON OT o SIN OT completa. Una OT con más de 20 líneas sigue en
 * el bloque siguiente con "Continuación" en la Solicitud, como ya lo hace
 * Claudio a mano.
 */
export function pestanaCobros(
  X: XlsxHoja, ots: OtCobro[], catalogo: Map<string, string>, sinOt: boolean,
  rango: { desde: string; hasta: string } = { desde: ots[0]?.fecha || "2026-01-01", hasta: ots.at(-1)?.fecha || "2026-01-01" },
  materiales: Map<string, MaterialCobro> = new Map(),
): Record<string, unknown> {
  const p = new Pestana(X);
  const bloques = ots.flatMap((ot) => {
    const lineas = lineasDeOt(ot, catalogo);
    const partes: { ot: OtCobro | null; lineas: Linea[] }[] = [];
    for (let i = 0; i < lineas.length; i += LINEAS_POR_BLOQUE) partes.push({ ot: i ? null : ot, lineas: lineas.slice(i, i + LINEAS_POR_BLOQUE) });
    return partes;
  });
  const ultima = PRIMERA_CABECERA + Math.max(bloques.length, 1) * FILAS_POR_BLOQUE - 1;
  encabezado(p, sinOt ? "TRABAJOS SIN OT" : "TRABAJOS CON OT", rango.desde, rango.hasta, ultima);
  bloques.forEach((b, k) => bloque(p, PRIMERA_CABECERA + k * FILAS_POR_BLOQUE, k + 1, b.ot, b.lineas, materiales, sinOt));
  const ws = p.cerrar(ultima, "P", ANCHOS);
  ws["!autofilter"] = { ref: `C12:P${ultima}` }; // las flechas de filtro de la tabla
  return ws;
}

/** Pestaña Materiales con el dibujo de la de Patricio, sin precios (los pega él). */
function pestanaMateriales(X: XlsxHoja, catalogo: MaterialCobro[]): Record<string, unknown> {
  const p = new Pestana(X);
  p.put(2, "G", { v: "   PEGAR AQUÍ LA TABLA CON PRECIOS (desde B4). Pangui no guarda precios.", s: est({ negrita: true }) });
  const rotulos = ["Clasificación", "Sub Clasificación", "Elemento", "Tamaño / potencia", "Caracteristica", "Codigo", "Descripción", "Un", "MATERIAL", "MO", "% MAT", "% MO", "MAT FIN", "MO FIN"];
  "BCDEFGHIJKLMNO".split("").forEach((c, i) => p.put(3, c, { v: rotulos[i], s: est({ negrita: true, relleno: GRIS, h: "center", bd: ["thin", "thin", "thin", "thin"] }) }));
  catalogo.forEach((m, i) => {
    p.put(4 + i, "B", { v: m.clasificacion || undefined });
    p.put(4 + i, "G", { v: m.codigo });
    p.put(4 + i, "H", { v: m.descripcion });
    p.put(4 + i, "I", { v: m.unidad });
  });
  return p.cerrar(Math.max(3 + catalogo.length, 3), "O", [4, 16, 16, 10, 10, 12, 16, 50, 6, 10, 10, 7, 7, 10, 10]);
}

// ── Lo que xlsx-js-style no escribe: logo y "SPA" chico ──────────────────────
// Igual que ajustarLibro, se edita el zip ya escrito.

type Zip = { FullPaths: string[]; FileIndex: { content: Uint8Array | number[] }[] };
type XlsxZip = XlsxHoja & { CFB: {
  utils: { cfb_add: (zip: Zip, ruta: string, datos: Uint8Array) => void };
  write: (zip: unknown, opts: { fileType: "zip"; type: "array"; compression?: boolean }) => ArrayBuffer | Uint8Array | number[];
} };

const LOGO_EMU = { col: 2, colOff: 1631, rowOff: 180341, cx: 1113728, cy: 1071832 }; // posición en la plantilla
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function adornar(X: XlsxZip, libro: Uint8Array, hojas: number[], logo?: Uint8Array): Uint8Array {
  const zip = X.CFB.read(libro, { type: "array" }) as Zip;
  const dec = new TextDecoder(), enc = new TextEncoder();
  const idx = (ruta: string) => zip.FullPaths.findIndex((p) => p.endsWith("/" + ruta));
  const leer = (ruta: string) => { const i = idx(ruta); return i < 0 ? null : dec.decode(Uint8Array.from(zip.FileIndex[i].content)); };
  const escribir = (ruta: string, xml: string | Uint8Array) => {
    const datos = typeof xml === "string" ? enc.encode(xml) : xml;
    const i = idx(ruta);
    if (i < 0) X.CFB.utils.cfb_add(zip, ruta, datos); else zip.FileIndex[i].content = datos;
  };

  if (logo) escribir("xl/media/electrilam-logo.png", logo);
  let tipos = leer("[Content_Types].xml")!;
  if (logo && !tipos.includes('Extension="png"')) tipos = tipos.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');

  for (const n of hojas) {
    const ruta = `xl/worksheets/sheet${n}.xml`;
    let xml = leer(ruta);
    if (!xml) continue;
    // "ELECTRILAM" grande y "SPA" chico, como en la plantilla.
    xml = xml.replace(/<c r="F2" s="(\d+)" t="str"><v>ELECTRILAMSPA<\/v><\/c>/,
      '<c r="F2" s="$1" t="inlineStr"><is><r><t>ELECTRILAM</t></r><r><rPr><b/><sz val="11"/><rFont val="Aptos Display"/></rPr><t>SPA</t></r></is></c>');
    if (logo) {
      xml = xml.replace("</worksheet>", '<drawing r:id="rIdLogo"/></worksheet>');
      const rels = leer(`xl/worksheets/_rels/sheet${n}.xml.rels`)
        ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
      escribir(`xl/worksheets/_rels/sheet${n}.xml.rels`, rels.replace("</Relationships>",
        `<Relationship Id="rIdLogo" Type="${NS_REL}/drawing" Target="../drawings/logo${n}.xml"/></Relationships>`));
      escribir(`xl/drawings/logo${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
        + `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${NS_REL}">`
        + `<xdr:oneCellAnchor><xdr:from><xdr:col>${LOGO_EMU.col}</xdr:col><xdr:colOff>${LOGO_EMU.colOff}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${LOGO_EMU.rowOff}</xdr:rowOff></xdr:from>`
        + `<xdr:ext cx="${LOGO_EMU.cx}" cy="${LOGO_EMU.cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo Electrilam"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>`
        + `<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>`
        + `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LOGO_EMU.cx}" cy="${LOGO_EMU.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
      escribir(`xl/drawings/_rels/logo${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `<Relationship Id="rId1" Type="${NS_REL}/image" Target="../media/electrilam-logo.png"/></Relationships>`);
      tipos = tipos.replace("</Types>", `<Override PartName="/xl/drawings/logo${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    }
    escribir(ruta, xml);
  }
  escribir("[Content_Types].xml", tipos);
  // Comprimido: sin esto un mes de SIN OT pesaba 6 MB (el XML de las celdas es muy repetitivo).
  return Uint8Array.from(X.CFB.write(zip, { fileType: "zip", type: "array", compression: true }) as ArrayLike<number>);
}

export function libroCobros(X: XlsxHoja, {
  ots, catalogo, conOt, sinOt, logo,
}: {
  ots: OtCobro[];
  catalogo: MaterialCobro[];
  /** Período de cada pestaña: CON OT sigue el corte del ITO, SIN OT el mes calendario. */
  conOt: { desde: string; hasta: string };
  sinOt: { desde: string; hasta: string };
  /** PNG del logo de Electrilam; sin él el libro sale igual, sólo sin imagen. */
  logo?: Uint8Array;
}): Uint8Array {
  // Texto normalizado → código: se busca tanto por descripción como por código.
  const mapa = new Map<string, string>();
  for (const m of catalogo) mapa.set(norm(m.descripcion), m.codigo);
  for (const m of catalogo) mapa.set(norm(m.codigo), m.codigo);
  const porCodigo = new Map(catalogo.map((m) => [norm(m.codigo), m]));

  const enRango = (o: OtCobro, r: { desde: string; hasta: string }) => o.fecha >= r.desde && o.fecha <= r.hasta;
  const porFecha = (a: OtCobro, b: OtCobro) => a.fecha.localeCompare(b.fecha);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, pestanaCobros(X, ots.filter((o) => o.numeroOt && enRango(o, conOt)).sort(porFecha), mapa, false, conOt, porCodigo), "CON OT");
  X.utils.book_append_sheet(wb, pestanaCobros(X, ots.filter((o) => !o.numeroOt && enRango(o, sinOt)).sort(porFecha), mapa, true, sinOt, porCodigo), "SIN OT");
  X.utils.book_append_sheet(wb, pestanaMateriales(X, catalogo), "Materiales");
  const bytes = new Uint8Array(X.write(wb, { bookType: "xlsx", type: "array" }));
  const vista = { filas: 0, columnas: 0, sinCuadricula: true, zoom: 90 };
  return adornar(X as XlsxZip, ajustarLibro(X, bytes, [vista, vista, undefined]), [1, 2], logo);
}
