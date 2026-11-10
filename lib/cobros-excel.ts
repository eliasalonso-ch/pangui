import { ajustarLibro, type XlsxHoja } from "@/lib/hoja-excel";
import { codigosDeTexto } from "@/lib/cobros-diccionario";

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
  /** Nombre de quien creó la hoja: en la práctica, el técnico que la llenó. */
  autor?: string;
}

export interface OtCobro {
  /** Id de la OT en Pangui: va oculto en el Excel para no repetirla al actualizar. */
  id?: string;
  /** El "#343" con que se ve la OT en Pangui. */
  numeroPangui?: number | null;
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

/**
 * Lo que Pangui sabe del cobro de la OT (tabla ot_cobros). Va en la columna T
 * de la cabecera: "COBRADA" si la marcaron en la card, o "YA SALIÓ" si es nueva
 * en este Excel pero ya salió en otro. Se calcula cada vez, no se lee del Excel.
 */
export interface EstadoCobro {
  exportadaAt: string | null;
  cobradaAt: string | null;
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

  // Si nadie llenó lo usado, lo solicitado es lo mejor que hay (marcado como tal).
  const conFilas = (h: HojaCobro) => h.filas.some((f) => Object.values(f).some((v) => String(v ?? "").trim()));
  const sinUsados = !ot.hojas.some((h) => (h.tipo === "materiales_usados" || h.tipo === "cobro") && conFilas(h));

  for (const hoja of ot.hojas) {
    const solicitud = hoja.tipo === "materiales_solicitados";
    if (solicitud && !sinUsados) continue; // lo pedido no es lo usado
    const sufijo = solicitud ? " (según solicitud)" : "";
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

      // El técnico ya eligió el código del catálogo (hoja de cobro o picker de materiales).
      if (cCodigo) {
        const codigo = String(f[cCodigo] ?? "").trim();
        if (codigo) {
          materiales.push({ texto: [cant, (obs || item || codigo) + sufijo].filter(Boolean).join(" "), codigo, cantidad: numero(cant) ?? undefined });
          continue;
        }
        if (hoja.tipo === "cobro") continue; // hoja de cobro sin código: como antes
      }
      if (!item && !cant) continue;

      const nItem = norm(item), nUnidad = norm(unidad);
      const n = numero(cant);
      // Una solicitud no trae horas ni personas que cobrar: sólo materiales.
      if (!solicitud) {
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
      }

      // Texto exacto del catálogo; si no, el diccionario ("caja chuky" → cajpla).
      // Un panel sobrepuesto son dos códigos (panel + base) con la misma cantidad.
      const exacto = catalogo.get(nItem);
      const codigos = exacto ? [exacto] : codigosDeTexto(nItem, (c) => catalogo.get(norm(c))) ?? [];
      const texto = [cant, unidad, item].filter(Boolean).join(" ") + sufijo;
      const cantidad = n != null ? { cantidad: n } : {};
      if (!codigos.length) materiales.push({ texto, ...cantidad });
      codigos.forEach((codigo, i) => materiales.push({ texto: i ? "" : texto, codigo, ...cantidad }));
    }
  }

  // El cronómetro a veces queda corriendo días: esas hh salen marcadas para revisar.
  const deLaApp = horas.length === 0 && !!ot.minutosApp && ot.minutosApp > 0;
  if (deLaApp) horas.push(Math.max(1, Math.ceil(ot.minutosApp! / 60)));
  // Se trabaja de a dos casi siempre; en la OT suele quedar asignado uno solo,
  // así que los asignados sólo cuentan cuando son más de dos.
  if (personas.length === 0) personas.push(Math.max(2, ot.asignados ?? 0));
  // La hh se cobra entera hacia arriba también cuando viene de la hoja: "1,5" → 2hh.
  for (let i = 0; i < horas.length; i++) horas[i] = Math.max(1, Math.ceil(horas[i]));

  // SIN OT son llamados: en julio Claudio cobró emergencia en 56 de 68. CON OT,
  // sólo si la OT está marcada como emergencia.
  const manoObra: Linea = ot.emergencia || !ot.numeroOt
    ? { texto: "Revisión de emergencia", codigo: "reveme" }
    : { texto: "Revisión normal", codigo: "revnor" };
  if (!dudoso && horas.length === 1 && personas.length === 1) {
    manoObra.cantidad = horas[0] * personas[0];
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
const VERDE = "00A65A";    // marca COBRADA
const ROJO = "C00000";     // marca YA SALIÓ EN OTRO EXCEL

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
// C..P de la plantilla (A y B son márgenes); Q y R, técnico y N° Pangui.
const ANCHOS = [4.6, 2, 10.6, 20, 72.9, 9.4, 70.4, 13.4, 15.3, 16.6, 15.6, 18.1, 15.4, 15.4, 13.9, 18.1, 24, 12];
const NUM_PANGUI = '"#"0'; // 343 se ve "#343" y sigue siendo número para ordenar

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
  for (const [c, v] of [["Q", "Técnico"], ["R", "N° OT \nPangui"]]) {
    p.put(12, c, { v, s: est({ fuente: "Aptos Display", tam: 12, negrita: true, h: "center", ajustar: true, bd: ["thin", c === "R" ? "medium" : "thin", "medium", "medium"] }) });
  }
  // Fuera de la tabla (entremedio va S, oculta): el aviso de cobro de cada OT.
  p.put(12, "T", { v: "Cobro", s: est({ fuente: "Aptos Display", tam: 12, negrita: true, h: "center", ajustar: true }) });
  [15.75, 18.75, 16.5, 24, 16.9, 24, 21.75, 8.65, 35.25, 24.95, 18.4, 54.75].forEach((h, i) => p.altura(i + 1, h));
}

/**
 * Lo que se dibuja en un bloque. Sale de una OT de Pangui (bloquesDeOt) o se
 * leyó del Excel de Claudio con sus correcciones (leerExcelCobros): por eso el
 * dibujo no depende de la OT, sólo de esto.
 */
export interface BloqueCobro {
  /** Id de la OT en Pangui, oculto en la columna S. Vacío en Excel viejos. */
  id: string;
  /** null = continuación de la OT anterior (más de 20 líneas). */
  cabecera: {
    fecha: string; solicitud: string; lugar: string; descripcion: string;
    /** Quién hizo la hoja (columna Q) y el N° de la OT en Pangui (columna R). */
    tecnico?: string; numeroPangui?: number | null;
  } | null;
  lineas: Linea[];
}

/** Una OT en bloques de 20 líneas; las que sobran siguen con "Continuación", como lo hace Claudio. */
export function bloquesDeOt(ot: OtCobro, catalogo: Map<string, string>, sinOt: boolean): BloqueCobro[] {
  const lineas = lineasDeOt(ot, catalogo);
  // Las mismas hojas que se cobran: la de materiales solicitados no cuenta.
  const tecnico = [...new Set(ot.hojas.filter((h) => h.tipo !== "materiales_solicitados").map((h) => h.autor?.trim()).filter(Boolean))].join(", ");
  const out: BloqueCobro[] = [];
  for (let i = 0; i < lineas.length; i += LINEAS_POR_BLOQUE) {
    out.push({
      id: ot.id ?? "",
      cabecera: i ? null : {
        fecha: ot.fecha, solicitud: sinOt ? ot.solicitante : ot.numeroOt, lugar: ot.lugar, descripcion: ot.descripcion,
        tecnico, numeroPangui: ot.numeroPangui ?? null,
      },
      lineas: lineas.slice(i, i + LINEAS_POR_BLOQUE),
    });
  }
  return out;
}

/** Un bloque de 23 filas desde `cab` (la fila de cabecera de la OT); `n` es su número en la columna A. */
function bloque(p: Pestana, cab: number, n: number, b: BloqueCobro, catalogo: Map<string, MaterialCobro>, alto: number, marca?: { v: string; rgb: string }) {
  const { cabecera, lineas } = b;
  p.put(cab, "A", { v: n, s: est({ negrita: true, h: "center" }) });
  if (b.id) p.put(cab, "S", { v: b.id });
  if (marca) {
    const s = est({ fuente: "Aptos Display", tam: 12, negrita: true, h: "center", ajustar: true });
    p.put(cab, "T", { v: marca.v, s: { ...s, font: { ...(s.font as object), color: { rgb: marca.rgb } } } });
  }
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
    if (cabecera) {
      if (c === "C" && cabecera.fecha) v = serieExcel(cabecera.fecha);
      if (c === "D") v = cabecera.solicitud;
      if (c === "E") v = cabecera.lugar;
      if (c === "G") v = cabecera.descripcion;
    } else if (c === "D") v = "Continuación";
    p.put(cab, c, { v, s });
  }
  // Técnico y N° Pangui después de Total, para no mover las fórmulas de Claudio,
  // con el mismo dibujo que el resto del bloque; R cierra la tabla con borde grueso.
  const der = (c: string): Borde => (c === "R" ? "medium" : "thin");
  const cabPangui = (c: string) => est({ fuente: "Aptos Display", tam: 12, negrita: true, relleno: CELESTE, h: "center", ajustar: true,
    fmt: c === "R" ? NUM_PANGUI : undefined, bd: ["thin", der(c), "medium", "thin"] });
  p.put(cab, "Q", { v: cabecera?.tecnico ?? "", s: cabPangui("Q") });
  p.put(cab, "R", { v: cabecera?.numeroPangui ?? undefined, s: cabPangui("R") });
  p.altura(cab, 27.75);

  // 20 líneas con las fórmulas de la plantilla: BUSCARV contra Materiales e IVA 19 %.
  const buscar = (fila: number, n: number) => `IFERROR(VLOOKUP($F${fila},Materiales!$G$2:$O$${alto},${n},FALSE),"-")`;
  for (let j = 0; j < LINEAS_POR_BLOQUE; j++) {
    const r = cab + 1 + j;
    const l = lineas[j];
    const mat = l?.codigo ? catalogo.get(norm(l.codigo)) : undefined;
    // Franjas grises en filas impares: lo que pinta el estilo de tabla de la plantilla.
    const b12 = (o: Parameters<typeof est>[0]) => est({ fuente: "Bahnschrift", tam: 12, h: "center", relleno: r % 2 ? FRANJA : undefined, ...o });
    for (const c of ["Q", "R"]) p.put(r, c, { s: b12({ negrita: true, fmt: "0", bd: ["thin", der(c), "thin", "thin"] }) });
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
  for (const c of ["Q", "R"]) {
    p.put(t, c, { s: est({ fuente: "Bahnschrift", tam: 12, negrita: true, relleno: DORADO, h: "center", bd: ["thin", der(c), "thin", "medium"] }) });
  }
  p.altura(t, 19.5);
  p.put(t + 1, "C", { s: est({ bd: ["medium", undefined, undefined, undefined] }) });
  p.altura(t + 1, 15.75);
}

/** "06-11" con el calendario local. */
function ddmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * El aviso de la columna T, sólo en la cabecera. COBRADA gana; "ya salió" sólo
 * en los bloques nuevos de este Excel: los que ya traía salieron justamente en él.
 */
function marcaCobro(b: BloqueCobro, nuevo: boolean, estados: Map<string, EstadoCobro>): { v: string; rgb: string } | undefined {
  const e = b.cabecera && b.id ? estados.get(b.id) : undefined;
  if (e?.cobradaAt) return { v: `COBRADA ${ddmm(e.cobradaAt)}`, rgb: VERDE };
  if (nuevo && e?.exportadaAt) return { v: `YA SALIÓ EN EXCEL DEL ${ddmm(e.exportadaAt)}`, rgb: ROJO };
}

/**
 * Una pestaña CON OT o SIN OT completa: primero los bloques que ya traía el
 * Excel (`previos`, tal como los dejó Claudio) y después las OTs nuevas.
 */
export function pestanaCobros(
  X: XlsxHoja, ots: OtCobro[], catalogo: Map<string, string>, sinOt: boolean,
  rango: { desde: string; hasta: string } = { desde: ots[0]?.fecha || "2026-01-01", hasta: ots.at(-1)?.fecha || "2026-01-01" },
  materiales: Map<string, MaterialCobro> = new Map(),
  alto = ALTO_MAT,
  previos: BloqueCobro[] = [],
  estados: Map<string, EstadoCobro> = new Map(),
): Record<string, unknown> {
  const p = new Pestana(X);
  const bloques = [...previos, ...ots.flatMap((ot) => bloquesDeOt(ot, catalogo, sinOt))];
  const ultima = PRIMERA_CABECERA + Math.max(bloques.length, 1) * FILAS_POR_BLOQUE - 1;
  encabezado(p, sinOt ? "TRABAJOS SIN OT" : "TRABAJOS CON OT", rango.desde, rango.hasta, ultima);
  bloques.forEach((b, k) => bloque(p, PRIMERA_CABECERA + k * FILAS_POR_BLOQUE, k + 1, b, materiales, alto,
    marcaCobro(b, k >= previos.length, estados)));
  const ws = p.cerrar(ultima, "T", ANCHOS);
  // S guarda el id de la OT: oculta, fuera de la tabla y de lo que se imprime. T, el aviso de cobro.
  ws["!cols"] = [...(ws["!cols"] as object[]), { wch: 38, hidden: true }, { wch: 26 }];
  ws["!autofilter"] = { ref: `C12:T${ultima}` }; // las flechas de filtro, también por técnico y por cobro
  return ws;
}

// ── Actualizar el mismo Excel ────────────────────────────────────────────────

/** Fecha de Excel (días desde 30-12-1899) → "YYYY-MM-DD". */
function ymdDeSerie(serie: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie) * 86400000).toISOString().slice(0, 10);
}

const PESTANAS_PANGUI = ["CON OT", "SIN OT", "Materiales"];

export interface ExcelCobros {
  conOt: BloqueCobro[];
  sinOt: BloqueCobro[];
  /** Su pestaña Materiales (con los precios, si ya se los pusieron). */
  precios: FilaPrecios[];
  /** Modificador general de su pestaña Materiales (L2 materiales, M2 mano de obra). */
  modificador: Modificador;
}

/** Multiplicador sobre todos los precios: [materiales, mano de obra]. 1 = 100 %. */
export type Modificador = [number, number];

/**
 * Lee un Excel de cobros exportado por Pangui para agregarle OTs sin perder lo
 * que Claudio ya corrigió (textos, códigos, cantidades). Devuelve null si no
 * es uno de Pangui: el COBROS original trae macros y otras pestañas (ASIG…)
 * que al reescribirlo se perderían.
 */
export function leerExcelCobros(X: XlsxHoja, libro: Uint8Array): ExcelCobros | null {
  const R = X as unknown as XlsxLectura;
  const wb = R.read(libro, { type: "array" });
  if (wb.SheetNames.length !== PESTANAS_PANGUI.length || !PESTANAS_PANGUI.every((n) => wb.SheetNames.includes(n))) return null;

  const pestana = (nombre: string): BloqueCobro[] => {
    const ws = wb.Sheets[nombre];
    const ultima = /(\d+)$/.exec(String(ws["!ref"] ?? ""))?.[1] ?? "1";
    const filas = R.utils.sheet_to_json(ws, { header: 1, range: `A1:S${ultima}`, defval: null, raw: true }) as (string | number | null)[][];
    const txt = (v: unknown) => (v == null ? "" : String(v).trim());
    const out: BloqueCobro[] = [];
    // Versiones ya exportadas: 3-nov sin técnico ni N° y el id en R; desde el
    // 4-nov técnico en Q, N° en R e id en S; y un rato del 4-nov con técnico y
    // N° en C/D y la tabla corrida a E. Dónde está "Fecha termino" (fila 12)
    // dice cuál es; `c` lleva una columna de la plantilla a la de este archivo.
    const corre = Math.max(0, (filas[11] ?? []).findIndex((v) => norm(v) === "fecha termino") - 2);
    const c = (i: number) => i + corre;
    for (let i = PRIMERA_CABECERA - 1; i < filas.length; i++) {
      const f = filas[i] ?? [];
      if (txt(f[c(5)]) !== "Codigo" || txt(f[c(8)]) === "TOTALES") continue;
      const lineas: Linea[] = [];
      for (let j = i + 1; j < filas.length; j++) {
        const l = filas[j] ?? [];
        if (txt(l[c(8)]) === "TOTALES" || txt(l[c(5)]) === "Codigo") break;
        // Cada línea en su fila, también las vacías: lo que Claudio escribió en E19 vuelve a E19.
        const linea: Linea = { texto: txt(l[c(4)]) };
        if (txt(l[c(5)])) linea.codigo = txt(l[c(5)]);
        const cant = l[c(8)];
        if (typeof cant === "number") linea.cantidad = cant;
        lineas.push(linea);
      }
      while (lineas.length && !lineas.at(-1)!.texto && !lineas.at(-1)!.codigo && lineas.at(-1)!.cantidad == null) lineas.pop();
      const solicitud = txt(f[c(3)]);
      const continuacion = norm(solicitud).startsWith("continuaci");
      const celdaFecha = f[c(2)];
      const fecha = typeof celdaFecha === "number" ? ymdDeSerie(celdaFecha) : txt(celdaFecha);
      if (!continuacion && !solicitud && !fecha && !txt(f[c(6)]) && lineas.length === 0) continue; // bloque vacío de plantilla
      // En los del 3-nov R trae el id (texto); desde el 4-nov, el N° (número).
      const idViejo = !corre && typeof f[17] === "string" ? txt(f[17]) : "";
      const [tec, num] = corre ? [f[2], f[3]] : [f[16], f[17]];
      out.push({
        id: txt(f[18]) || idViejo,
        cabecera: continuacion ? null : {
          fecha, solicitud, lugar: txt(f[c(4)]), descripcion: txt(f[c(6)]),
          tecnico: idViejo ? "" : txt(tec), numeroPangui: typeof num === "number" ? num : null,
        },
        lineas,
      });
    }
    return out;
  };
  // El modificador que haya puesto Claudio; los Excel de antes no lo traen (100 %).
  const mat = wb.Sheets["Materiales"] as Record<string, { v?: unknown } | undefined>;
  const pct = (ref: string) => (typeof mat[ref]?.v === "number" ? (mat[ref]!.v as number) : 1);
  return { conOt: pestana("CON OT"), sinOt: pestana("SIN OT"), precios: leerPrecios(X, libro), modificador: [pct("L2"), pct("M2")] };
}

/**
 * Las OTs que todavía no están en el Excel. Por id (columna S); los Excel sin
 * id se reconocen por N° OT (CON OT) o por fecha + solicitante + descripción
 * (SIN OT, que no tiene número).
 */
export function otsNuevas(ots: OtCobro[], previos: Pick<ExcelCobros, "conOt" | "sinOt">): OtCobro[] {
  const ids = new Set([...previos.conOt, ...previos.sinOt].map((b) => b.id).filter(Boolean));
  const clave = (fecha: string, sol: string, desc: string) => `${fecha}|${norm(sol)}|${norm(desc)}`;
  const numeros = new Set(previos.conOt.flatMap((b) => (b.cabecera ? [norm(b.cabecera.solicitud)] : [])));
  const sinOt = new Set(previos.sinOt.flatMap((b) => (b.cabecera ? [clave(b.cabecera.fecha, b.cabecera.solicitud, b.cabecera.descripcion)] : [])));
  return ots.filter((o) => {
    if (o.id && ids.has(o.id)) return false;
    return o.numeroOt ? !numeros.has(norm(o.numeroOt)) : !sinOt.has(clave(o.fecha, o.solicitante, o.descripcion));
  });
}

/** Una fila de la tabla Materiales de Patricio, columnas B..O (código en G, MAT FIN en N, MO FIN en O). */
export type FilaPrecios = (string | number | null)[];
const COLS_MAT = "BCDEFGHIJKLMNO".split("");

type XlsxLectura = {
  read: (datos: Uint8Array, opts: { type: "array"; sheets?: string[] }) => { SheetNames: string[]; Sheets: Record<string, Record<string, unknown>> };
  utils: { sheet_to_json: (ws: unknown, opts: { header: 1; range: string; defval: null; raw: true }) => unknown[][] };
};

/**
 * Lee la tabla de precios de un Excel de Electrilam: la base de materiales de
 * Patricio (pestaña "Valores", datos desde la fila 2) o la pestaña "Materiales"
 * de cualquier COBROS (desde la 4). Mismas columnas B..O en las dos. Corre en el
 * navegador de quien exporta: los precios no pasan por Pangui. [] si no la hay.
 */
export function leerPrecios(X: XlsxHoja, libro: Uint8Array): FilaPrecios[] {
  const R = X as unknown as XlsxLectura;
  const wb = R.read(libro, { type: "array", sheets: ["Materiales", "Valores"] });
  const nombre = wb.Sheets["Materiales"] ? "Materiales" : "Valores";
  const ws = wb.Sheets[nombre];
  if (!ws) return [];
  const desde = nombre === "Valores" ? 2 : 4;
  // Desde la columna A fija: la hoja de Patricio empieza en B, y un rango numérico
  // partiría desde su primera columna y correría todo una posición.
  const ultima = /(\d+)$/.exec(String(ws["!ref"] ?? ""))?.[1] ?? String(desde);
  return R.utils.sheet_to_json(ws, { header: 1, range: `A${desde}:O${ultima}`, defval: null, raw: true })
    .map((fila) => (fila as (string | number | null)[]).slice(1, 15))
    .filter((f) => String(f[5] ?? "").trim() !== "");
}

/**
 * Pestaña Materiales con el dibujo de la de Patricio. Con su tabla de precios,
 * va esa tal cual (y debajo los códigos del catálogo que no traiga); sin ella,
 * sólo el catálogo, para que al menos salgan descripción y unidad.
 */
function pestanaMateriales(X: XlsxHoja, catalogo: MaterialCobro[], precios: FilaPrecios[], [modMat, modMo]: Modificador = [1, 1]): Record<string, unknown> {
  const p = new Pestana(X);
  p.put(2, "G", {
    v: precios.length ? "   ESTA TABLA NO SE MODIFICA" : "   SIN PRECIOS: elige el Excel de precios al exportar, o pega la tabla desde B4.",
    s: est({ negrita: true }),
  });
  // Modificador general, como el de las planillas de presupuesto de Patricio:
  // subir el 100 % a 110 % acá sube MAT FIN / MO FIN de toda la tabla y, con
  // ellos, todos los cobros (el BUSCARV de CON OT / SIN OT lee N y O).
  p.put(2, "K", { v: "MODIFICADOR GENERAL", s: est({ negrita: true, h: "right" }) });
  for (const [c, v] of [["L", modMat], ["M", modMo]] as const) {
    p.put(2, c, { v, s: est({ negrita: true, relleno: AMARILLO, h: "center", fmt: "0%", bd: ["medium", "medium", "medium", "medium"] }) });
  }
  const rotulos = ["Clasificación", "Sub Clasificación", "Elemento", "Tamaño / potencia", "Caracteristica", "Codigo", "Descripción", "Un", "MATERIAL", "MO", "% MAT", "% MO", "MAT FIN", "MO FIN"];
  COLS_MAT.forEach((c, i) => p.put(3, c, { v: rotulos[i], s: est({ negrita: true, relleno: GRIS, h: "center", bd: ["thin", "thin", "thin", "thin"] }) }));
  const conPrecio = new Set(precios.map((f) => norm(f[5])));
  const filas: FilaPrecios[] = [
    ...precios,
    ...catalogo.filter((m) => !conPrecio.has(norm(m.codigo)))
      .map((m) => [m.clasificacion, null, null, null, null, m.codigo, m.descripcion, m.unidad, null, null, null, null, null, null]),
  ];
  filas.forEach((f, i) => {
    const r = 4 + i;
    COLS_MAT.forEach((c, j) => {
      const v = f[j];
      // J/K (MATERIAL, MO) y N/O (MAT FIN, MO FIN) son pesos.
      const pesos = [8, 9, 12, 13].includes(j);
      if (j < 12 && v != null && v !== "") p.put(r, c, { v, s: typeof v === "number" && pesos ? est({ fmt: PESOS }) : undefined });
    });
    // MAT FIN / MO FIN: base × % de la fila × modificador general. En la base de
    // Patricio vienen como números (siempre base × %); acá van como fórmula para
    // que cambiar un % recalcule. Con el resultado ya puesto, para leerse sin recalcular.
    for (const [fin, base, pct, mod] of [["N", 8, 10, modMat], ["O", 9, 11, modMo]] as const) {
      const b = f[base], fila = f[pct];
      if (typeof b !== "number") continue;
      const conPct = typeof fila === "number";
      p.put(r, fin, {
        f: `${COLS_MAT[base]}${r}*${conPct ? `${COLS_MAT[pct]}${r}*` : ""}$${fin === "N" ? "L" : "M"}$2`,
        v: b * (conPct ? fila : 1) * mod,
        s: est({ fmt: PESOS }),
      });
    }
  });
  return p.cerrar(Math.max(3 + filas.length, 3), "O", [4, 16, 16, 10, 10, 12, 16, 50, 6, 10, 10, 7, 7, 10, 10]);
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
  ots, catalogo, conOt, sinOt, logo, precios = [], previos, estados, modificador,
}: {
  /** Modificador general de precios (Materiales L2/M2). Al actualizar, el que ya tenía el Excel. */
  modificador?: Modificador;
  /** Cobro de cada OT (ot_cobros): el aviso de la columna T. */
  estados?: Map<string, EstadoCobro>;
  /** El Excel que se está actualizando: sus bloques van primero y sus OTs no se repiten. */
  previos?: Pick<ExcelCobros, "conOt" | "sinOt">;
  ots: OtCobro[];
  catalogo: MaterialCobro[];
  /** Período de cada pestaña: CON OT sigue el corte del ITO, SIN OT el mes calendario. */
  conOt: { desde: string; hasta: string };
  sinOt: { desde: string; hasta: string };
  /** PNG del logo de Electrilam; sin él el libro sale igual, sólo sin imagen. */
  logo?: Uint8Array;
  /** Tabla de precios de Patricio (leerPrecios). Sin ella, los montos salen en blanco. */
  precios?: FilaPrecios[];
}): Uint8Array {
  // Texto normalizado → código: se busca tanto por descripción como por código.
  const mapa = new Map<string, string>();
  for (const m of catalogo) mapa.set(norm(m.descripcion), m.codigo);
  for (const m of catalogo) mapa.set(norm(m.codigo), m.codigo);
  const porCodigo = new Map(catalogo.map((m) => [norm(m.codigo), m]));
  for (const f of precios) porCodigo.set(norm(f[5]), { codigo: String(f[5]), descripcion: String(f[6] ?? ""), unidad: String(f[7] ?? ""), clasificacion: String(f[0] ?? "") });
  // El BUSCARV de la plantilla llega hasta la fila 1912; si la tabla crece, el rango con ella.
  const alto = Math.max(ALTO_MAT, 3 + porCodigo.size);

  const enRango = (o: OtCobro, r: { desde: string; hasta: string }) => o.fecha >= r.desde && o.fecha <= r.hasta;
  const porFecha = (a: OtCobro, b: OtCobro) => a.fecha.localeCompare(b.fecha);
  const nuevas = previos ? otsNuevas(ots, previos) : ots;
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, pestanaCobros(X, nuevas.filter((o) => o.numeroOt && enRango(o, conOt)).sort(porFecha), mapa, false, conOt, porCodigo, alto, previos?.conOt, estados), "CON OT");
  X.utils.book_append_sheet(wb, pestanaCobros(X, nuevas.filter((o) => !o.numeroOt && enRango(o, sinOt)).sort(porFecha), mapa, true, sinOt, porCodigo, alto, previos?.sinOt, estados), "SIN OT");
  X.utils.book_append_sheet(wb, pestanaMateriales(X, catalogo, precios, modificador), "Materiales");
  const bytes = new Uint8Array(X.write(wb, { bookType: "xlsx", type: "array" }));
  const vista = { filas: 0, columnas: 0, sinCuadricula: true, zoom: 90 };
  return adornar(X as XlsxZip, ajustarLibro(X, bytes, [vista, vista, undefined]), [1, 2], logo);
}
