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
  /** El ITO de la OT (ordenes_trabajo.hito). No se ve en los bloques: es para Revisión. */
  ito?: string;
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

/** Código del catálogo para "Sin materiales" (OT sin materiales con hoja obligatoria): no se cobra. */
export const SIN_MATERIALES = "sinmat";
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
        // "Sin materiales": sólo deja constancia en la hoja obligatoria; no se cobra.
        if (codigo.toLowerCase() === SIN_MATERIALES) continue;
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
      if (codigos.some((c) => c.toLowerCase() === SIN_MATERIALES)) continue; // "Sin materiales" escrito a mano
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
  alto: { hpt?: number; hidden?: boolean }[] = [];
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
  altura(fila: number, hpt: number) { this.alto[fila - 1] = { ...this.alto[fila - 1], hpt }; }
  /** Fila fuera del filtro de su tabla (el mismo filtro va en la tabla: adornar). */
  ocultar(fila: number) { this.alto[fila - 1] = { ...this.alto[fila - 1], hidden: true }; }
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
  p.put(12, "U", { v: "ITO" }); // columna oculta
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
    /** El ITO de la OT, oculto en la columna U. Vacío en los Excel de antes del 13-nov. */
    ito?: string;
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
        tecnico, numeroPangui: ot.numeroPangui ?? null, ito: ot.ito?.trim() ?? "",
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
  if (cabecera?.ito) p.put(cab, "U", { v: cabecera.ito });
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

/** Los bloques de una pestaña, en orden: los que ya traía el Excel y después las OTs nuevas. */
function bloquesDePestana(ots: OtCobro[], catalogo: Map<string, string>, sinOt: boolean, previos: BloqueCobro[] = []): BloqueCobro[] {
  return [...previos, ...ots.flatMap((ot) => bloquesDeOt(ot, catalogo, sinOt))];
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
  const bloques = bloquesDePestana(ots, catalogo, sinOt, previos);
  const ultima = PRIMERA_CABECERA + Math.max(bloques.length, 1) * FILAS_POR_BLOQUE - 1;
  encabezado(p, sinOt ? "TRABAJOS SIN OT" : "TRABAJOS CON OT", rango.desde, rango.hasta, ultima);
  bloques.forEach((b, k) => bloque(p, PRIMERA_CABECERA + k * FILAS_POR_BLOQUE, k + 1, b, materiales, alto,
    marcaCobro(b, k >= previos.length, estados)));
  const ws = p.cerrar(ultima, "U", ANCHOS);
  // S guarda el id de la OT: oculta, fuera de la tabla y de lo que se imprime. T, el aviso de cobro.
  // U, el ITO: oculta también; los bloques se ven igual y Revisión lo lee de ahí.
  ws["!cols"] = [...(ws["!cols"] as object[]), { wch: 38, hidden: true }, { wch: 26 }, { wch: 24, hidden: true }];
  ws["!autofilter"] = { ref: `C12:T${ultima}` }; // las flechas de filtro, también por técnico y por cobro
  return ws;
}

// ── Actualizar el mismo Excel ────────────────────────────────────────────────

/** Fecha de Excel (días desde 30-12-1899) → "YYYY-MM-DD". */
function ymdDeSerie(serie: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serie) * 86400000).toISOString().slice(0, 10);
}

const PESTANAS_PANGUI = ["CON OT", "SIN OT", "Materiales"];
const REVISION = "Revisión";
const RESUMEN = "Resumen";

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
  // Revisión y Resumen se regeneran enteras desde los bloques: pueden venir o no (se borran antes de mandar el Excel al ITO).
  const propias = wb.SheetNames.filter((n) => n !== REVISION && n !== RESUMEN);
  if (propias.length !== PESTANAS_PANGUI.length || !PESTANAS_PANGUI.every((n) => propias.includes(n))) return null;

  const pestana = (nombre: string): BloqueCobro[] => {
    const ws = wb.Sheets[nombre];
    const ultima = /(\d+)$/.exec(String(ws["!ref"] ?? ""))?.[1] ?? "1";
    const filas = R.utils.sheet_to_json(ws, { header: 1, range: `A1:U${ultima}`, defval: null, raw: true }) as (string | number | null)[][];
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
          ito: corre ? "" : txt(f[20]),
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
// También son los nombres de las columnas de la tabla de Excel: tienen que calzar con la fila 3.
const ROTULOS_MAT = ["Clasificación", "Sub Clasificación", "Elemento", "Tamaño / potencia", "Caracteristica", "Codigo", "Descripción", "Un", "MATERIAL", "MO", "% MAT", "% MO", "MAT FIN", "MO FIN"];

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
  p.altura(1, 67); // ahí van las segmentaciones (adornar)
  COLS_MAT.forEach((c, i) => p.put(3, c, { v: ROTULOS_MAT[i], s: est({ negrita: true, relleno: GRIS, h: "center", bd: ["thin", "thin", "thin", "thin"] }) }));
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

// ── Revisión y Resumen: los datos para revisar, filtrar y sumar ──────────────
// CON OT y SIN OT son el informe que va al ITO (bloques para leer, no para
// filtrar). Revisión es lo mismo como tabla de datos: una fila celeste por OT
// con sus totales y, debajo, una fila por cada línea de su bloque. Cada celda
// apunta al bloque: lo que se rellene o corrija allá se ve acá. Es una tabla
// de Excel con segmentaciones (adornar). Resumen la suma por técnico, ITO y código.

// Tipos de celda de verdad (Excel los muestra como Moneda y Fecha), no formatos personalizados.
const MONEDA = "[$$-340A] #,##0";
const FECHA = "dd-mm-yyyy";
const SIN_TECNICO = "Sin técnico";
const SIN_ITO = "Sin ITO";
// Qué es cada fila de Revisión (columna "Ver"): la OT o una línea de su bloque.
const FILA_OT = "OT";
const VACIA = "(vacía)"; // línea del bloque sin nada escrito: va, pero filtrada, por si se rellena después
const FILAS_VISIBLES = [FILA_OT, "Material", "Mano de obra", "Sin código"];

// También son los nombres de las columnas de la tabla de Excel: tienen que calzar con la fila 3.
const ROTULOS_REV = ["Tipo", "Fecha", "Solicitud", "ITO", "Técnico", "Acompañantes", "N° OT Pangui", "Ver", "Notas/Facultad", "Detalle",
  "Codigo", "Descripción", "Unidad", "Cantidad", "Valor Unit. Material", "Total Materiales", "Valor Unit. M.O", "Total M.O", "Neto", "IVA", "Total", "Cobro"];
const MONTOS_REV = ["Total Materiales", "Total M.O", "Neto", "IVA", "Total"];
/** Letra de una columna de Revisión (la tabla parte en B). */
const colRev = (rotulo: string) => L[1 + ROTULOS_REV.indexOf(rotulo)];

/** Una OT: su cabecera y sus bloques (las continuaciones siguen a la cabecera). */
type FilaRevision = { hoja: string; cab: number; bloques: number[]; c: NonNullable<BloqueCobro["cabecera"]>; lineas: (Linea | undefined)[] };

function filasRevision(grupos: { hoja: string; bloques: BloqueCobro[] }[]): FilaRevision[] {
  const ots: FilaRevision[] = [];
  for (const { hoja, bloques } of grupos) bloques.forEach((b, k) => {
    const cab = PRIMERA_CABECERA + k * FILAS_POR_BLOQUE;
    if (b.cabecera) ots.push({ hoja, cab, bloques: [cab], c: b.cabecera, lineas: [] });
    else if (ots.at(-1)?.hoja === hoja) ots.at(-1)!.bloques.push(cab);
    else return;
    // Las 20 filas del bloque, también las vacías: lo que se escriba después tiene que tener dónde aparecer.
    for (let j = 0; j < LINEAS_POR_BLOQUE; j++) ots.at(-1)!.lineas.push(b.lineas[j]);
  });
  return ots;
}

/** "Juan, Ana" (columna Q del bloque) → ["Juan", "Ana"]. */
const tecnicosDe = (c: FilaRevision["c"]) => (c.tecnico ?? "").split(",").map((t) => t.trim()).filter(Boolean);
const escrita = (l?: Linea) => !!l && (!!l.texto || !!l.codigo || l.cantidad != null);

/** Filas de Revisión que ocupa cada OT: la suya y las 20 de cada uno de sus bloques. */
const filasDe = (o: FilaRevision) => 1 + o.bloques.length * LINEAS_POR_BLOQUE;

function pestanaRevision(X: XlsxHoja, ots: FilaRevision[], catalogo: Map<string, MaterialCobro>, manoDeObra: Set<string>): Record<string, unknown> {
  const p = new Pestana(X);
  const ultima = 3 + ots.reduce((n, o) => n + filasDe(o), 0);
  const hasta = Math.max(ultima, 4);
  const rango = (rotulo: string) => `${colRev(rotulo)}4:${colRev(rotulo)}${hasta}`;

  p.altura(1, 135); // ahí van las segmentaciones (adornar)
  // Sobre la tabla, lo que suma lo filtrado. Las filas de OT ya traen el total de sus líneas, así que
  // sólo se suman ellas (SUBTOTALES fila por fila = sólo las visibles); si se filtró dejando sólo líneas, las líneas.
  const visibles = (r: string) => `SUBTOTAL(109,OFFSET(${r.split(":")[0]},ROW(${r})-ROW(${r.split(":")[0]}),0))`;
  const esOt = `(${rango("Ver")}="${FILA_OT}")`;
  const otsVisibles = `SUMPRODUCT(SUBTOTAL(103,OFFSET(${colRev("Ver")}4,ROW(${rango("Ver")})-ROW(${colRev("Ver")}4),0))*${esOt})`;
  const amarillo = (fmt: string) => est({ negrita: true, relleno: AMARILLO, h: "center", fmt, bd: ["medium", "medium", "medium", "medium"] });
  p.put(2, "B", { v: "OTs", s: est({ negrita: true, h: "right" }) });
  p.put(2, "C", { f: otsVisibles, s: amarillo("0") });
  p.put(2, "E", { v: "¿Rellenaste líneas nuevas en CON OT / SIN OT? Datos → Volver a aplicar (Ctrl+Alt+L) para que aparezcan acá.", s: est({ tam: 9 }) });
  p.put(2, colRev("Valor Unit. Material"), { v: "TOTAL FILTRADO", s: est({ negrita: true, h: "right" }) });
  for (const m of MONTOS_REV) {
    p.put(2, colRev(m), { f: `IF(${otsVisibles}>0,SUMPRODUCT(${visibles(rango(m))}*${esOt}),SUBTOTAL(109,${rango(m)}))`, s: amarillo(MONEDA) });
  }
  ROTULOS_REV.forEach((v, i) => p.put(3, L[1 + i], { v, s: est({ negrita: true, relleno: GRIS, h: "center", ajustar: true, bd: ["thin", "thin", "thin", "thin"] }) }));

  let r = 4;
  for (const o of ots) {
    const { hoja, cab, c } = o;
    const [principal, ...acompanantes] = tecnicosDe(c);
    const q = `'${hoja}'!Q${cab}&""`, t = `'${hoja}'!T${cab}&""`;
    // Los datos de la OT van en todas sus filas: así el filtro por técnico, ITO o cobro trae la OT entera.
    const datosOt = (fila: number, s: (o?: Parameters<typeof est>[0]) => Estilo) => {
      const cabecera = (letra: string) => `'${hoja}'!${letra}${cab}`;
      p.put(fila, colRev("Tipo"), { v: hoja, s: s() });
      p.put(fila, colRev("Fecha"), { f: cabecera("C"), v: c.fecha ? serieExcel(c.fecha) : "", s: s({ h: "center", fmt: FECHA }) });
      // &"": una celda vacía allá no puede salir como 0 acá. Con el valor ya puesto, para leerse sin recalcular.
      p.put(fila, colRev("Solicitud"), { f: `${cabecera("D")}&""`, v: c.solicitud, s: s() });
      // El ITO de la OT en Pangui, que va oculto en la columna U del bloque (CON OT y SIN OT).
      p.put(fila, colRev("ITO"), { f: `IF(${cabecera("U")}&""="","${SIN_ITO}",${cabecera("U")}&"")`, v: c.ito || SIN_ITO, s: s() });
      // Un técnico por botón: el primero de la hoja acá, el resto en Acompañantes.
      p.put(fila, colRev("Técnico"), { f: `IF(${q}="","${SIN_TECNICO}",IFERROR(LEFT(${q},FIND(",",${q})-1),${q}))`, v: principal ?? SIN_TECNICO, s: s() });
      p.put(fila, colRev("Acompañantes"), { f: `IFERROR(MID(${q},FIND(",",${q})+2,200),"")`, v: acompanantes.join(", "), s: s() });
      p.put(fila, colRev("N° OT Pangui"), { f: cabecera("R"), v: c.numeroPangui ?? "", s: s({ h: "center", fmt: NUM_PANGUI }) });
      p.put(fila, colRev("Notas/Facultad"), { f: `${cabecera("E")}&""`, v: c.lugar, s: s() });
      // El aviso de la columna T ("COBRADA dd-mm", "YA SALIÓ EN EXCEL DEL dd-mm") lo pone Pangui en cada exportación.
      p.put(fila, colRev("Cobro"), { f: `IF(LEFT(${t},7)="COBRADA","Cobrada",IF(LEFT(${t},7)="YA SALI","Ya exportada","Nueva"))`, s: s({ h: "center" }) });
    };

    // La fila de la OT: celeste, con su descripción y los totales de sus bloques.
    const ot = (x: Parameters<typeof est>[0] = {}) => est({ negrita: true, relleno: CELESTE, bd: [undefined, undefined, "thin", undefined], ...x });
    datosOt(r, ot);
    p.put(r, colRev("Ver"), { v: FILA_OT, s: ot({ h: "center" }) });
    p.put(r, colRev("Detalle"), { f: `'${hoja}'!G${cab}&""`, v: c.descripcion, s: ot() });
    for (const m of ["Codigo", "Descripción", "Unidad", "Cantidad", "Valor Unit. Material", "Valor Unit. M.O"]) p.put(r, colRev(m), { s: ot() });
    "KMNOP".split("").forEach((letra, k) => p.put(r, colRev(MONTOS_REV[k]), {
      f: o.bloques.map((b) => `'${hoja}'!${letra}${b + 1 + LINEAS_POR_BLOQUE}`).join("+"), s: ot({ fmt: MONEDA }),
    }));
    r++;

    // Debajo, una fila por línea de sus bloques.
    const linea = (x: Parameters<typeof est>[0] = {}) => est(x);
    o.lineas.forEach((l, j) => {
      const fila = o.bloques[Math.floor(j / LINEAS_POR_BLOQUE)] + 1 + (j % LINEAS_POR_BLOQUE);
      const ref = (letra: string) => `'${hoja}'!${letra}${fila}`;
      const mat = l?.codigo ? catalogo.get(norm(l.codigo)) : undefined;
      // En el bloque, una línea sin precio muestra "-": acá es 0, para que sume.
      const monto = (letra: string) => ({ f: `IFERROR(${ref(letra)}+0,0)`, s: linea({ fmt: MONEDA }) });
      datosOt(r, linea);
      // Material, mano de obra (sólo tiene valor de M.O), una nota sin código ("2 personas", "3hh") o nada.
      p.put(r, colRev("Ver"), {
        f: `IF(${ref("E")}&${ref("F")}&${ref("I")}="","${VACIA}",IF(${ref("F")}&""="","Sin código",IF(AND(IFERROR(${ref("K")}+0,0)=0,IFERROR(${ref("M")}+0,0)>0),"Mano de obra","Material")))`,
        // Con el valor correcto ya puesto: Excel arma los botones de la segmentación con los valores guardados.
        v: !escrita(l) ? VACIA : !l!.codigo ? "Sin código" : manoDeObra.has(norm(l!.codigo)) ? "Mano de obra" : "Material", s: linea({ h: "center" }),
      });
      p.put(r, colRev("Detalle"), { f: `${ref("E")}&""`, v: l?.texto ?? "" });
      p.put(r, colRev("Codigo"), { f: `${ref("F")}&""`, v: l?.codigo ?? "", s: linea({ negrita: true, h: "center" }) });
      p.put(r, colRev("Descripción"), { f: `IF(${ref("G")}&""="-","",${ref("G")}&"")`, v: mat?.descripcion ?? "" });
      p.put(r, colRev("Unidad"), { f: `IF(${ref("H")}&""="-","",${ref("H")}&"")`, v: mat?.unidad ?? "", s: linea({ h: "center" }) });
      p.put(r, colRev("Cantidad"), { f: `IFERROR(${ref("I")}+0,"")`, v: l?.cantidad ?? "", s: linea({ h: "center" }) });
      "JKLMNOP".split("").forEach((letra, k) => p.put(r, L[1 + ROTULOS_REV.indexOf("Valor Unit. Material") + k], monto(letra)));
      // Las vacías van filtradas (adornar deja el mismo filtro en la tabla).
      if (!escrita(l)) p.ocultar(r);
      r++;
    });
  }
  return p.cerrar(Math.max(ultima, 3), L[ROTULOS_REV.length],
    [4, 9, 12, 26, 28, 22, 22, 11, 14, 34, 46, 18, 44, 8, 10, 14, 14, 14, 14, 14, 14, 14, 14]);
}

/**
 * Cuánto suma cada técnico, cada ITO y cada código, sin tener que filtrar.
 * Fórmulas sobre Revisión, así que sigue lo que se rellene en los bloques; los
 * nombres y códigos son los de la exportación (uno nuevo escrito a mano
 * aparece al actualizar el Excel).
 */
function pestanaResumen(X: XlsxHoja, ots: FilaRevision[], catalogo: Map<string, MaterialCobro>): Record<string, unknown> {
  const p = new Pestana(X);
  const hasta = Math.max(3 + ots.reduce((n, o) => n + filasDe(o), 0), 4);
  const rev = (rotulo: string) => `'${REVISION}'!$${colRev(rotulo)}$4:$${colRev(rotulo)}$${hasta}`;
  const titulo = est({ tam: 14, negrita: true });
  const cabecera = est({ negrita: true, relleno: GRIS, h: "center", ajustar: true, bd: ["thin", "thin", "thin", "thin"] });
  const amarillo = (fmt: string) => est({ negrita: true, relleno: AMARILLO, h: "center", fmt, bd: ["medium", "medium", "medium", "medium"] });
  const orden = (a: string, b: string) => a.localeCompare(b, "es");

  /** Título en la fila 2, rótulos en la 4 y una fila por nombre desde la 5. Devuelve la fila que sigue. */
  const tabla = (desde: number, nombre: string, rotulos: string[], filas: Celda[][]) => {
    p.put(2, L[desde], { v: nombre, s: titulo });
    rotulos.forEach((v, i) => p.put(4, L[desde + i], { v, s: cabecera }));
    filas.forEach((fila, k) => fila.forEach((celda, i) => p.put(5 + k, L[desde + i], celda)));
    return 5 + filas.length;
  };
  const total = (desde: number, fila: number, formatos: string[]) => {
    p.put(fila, L[desde], { v: "TOTAL", s: est({ negrita: true, h: "right" }) });
    formatos.forEach((fmt, i) => {
      const c = L[desde + 1 + i];
      if (fmt) p.put(fila, c, { f: `SUM(${c}5:${c}${fila - 1})`, s: amarillo(fmt) });
    });
  };
  const MONTOS = ["Materiales", "M.O", "Neto", "IVA", "Total"];
  const pesos = est({ fmt: MONEDA }), centro = est({ h: "center", fmt: "0" });
  // Sólo las filas de OT: ya traen el total de sus líneas.
  const esOt = `(${rev("Ver")}="${FILA_OT}")`;

  // Por técnico (B..H): la OT cuenta para todos los que fueron (principal o acompañante).
  const tecnicos = [...new Set(ots.flatMap((o) => tecnicosDe(o.c)))].sort(orden);
  if (ots.some((o) => !tecnicosDe(o.c).length)) tecnicos.push(SIN_TECNICO);
  const finTec = tabla(1, "POR TÉCNICO", ["Técnico", "OTs", ...MONTOS], tecnicos.map((nombre, k) => {
    const fue = `${esOt}*((${rev("Técnico")}=$B${5 + k})+ISNUMBER(SEARCH($B${5 + k},${rev("Acompañantes")}))>0)`;
    return [{ v: nombre }, { f: `SUMPRODUCT(${fue})`, s: centro }, ...MONTOS_REV.map((m) => ({ f: `SUMPRODUCT(${fue}*${rev(m)})`, s: pesos }))];
  }));
  p.put(finTec + 1, "B", { v: "Una OT hecha entre varios cuenta para cada uno: esta tabla no suma el total del mes.", s: est({ tam: 9 }) });

  // Por ITO (J..P): CON OT y SIN OT. Su total es el del período.
  const itos = [...new Set(ots.map((o) => o.c.ito?.trim()).filter((n): n is string => !!n))].sort(orden);
  if (ots.some((o) => !o.c.ito?.trim())) itos.push(SIN_ITO);
  const finIto = tabla(9, "POR ITO", ["ITO", "OTs", ...MONTOS], itos.map((nombre, k) => {
    const de = `${rev("Ver")},"${FILA_OT}",${rev("ITO")},$J${5 + k}`;
    return [{ v: nombre }, { f: `COUNTIFS(${de})`, s: centro }, ...MONTOS_REV.map((m) => ({ f: `SUMIFS(${rev(m)},${de})`, s: pesos }))];
  }));
  if (itos.length) total(9, finIto, ["0", MONEDA, MONEDA, MONEDA, MONEDA, MONEDA]);

  // Por código (R..X): qué se gastó en el período, materiales y mano de obra. Las filas de OT no llevan código.
  const codigos = new Map<string, string>(); // normalizado → como está escrito
  for (const o of ots) for (const l of o.lineas) if (l?.codigo && !codigos.has(norm(l.codigo))) codigos.set(norm(l.codigo), l.codigo);
  const lista = [...codigos.values()].sort(orden);
  const finCod = tabla(17, "POR CÓDIGO (materiales y mano de obra)", ["Codigo", "Descripción", "Unidad", "Cantidad", "Total Materiales", "Total M.O", "Neto"],
    lista.map((codigo, k) => {
      const n = `$R${5 + k}`, mat = catalogo.get(norm(codigo));
      const busca = (rotulo: string) => `IFERROR(INDEX(${rev(rotulo)},MATCH(${n},${rev("Codigo")},0))&"","")`;
      const suma = (rotulo: string) => `SUMIFS(${rev(rotulo)},${rev("Codigo")},${n})`;
      return [
        { v: codigo, s: est({ negrita: true, h: "center" }) },
        { f: busca("Descripción"), v: mat?.descripcion ?? "" },
        { f: busca("Unidad"), v: mat?.unidad ?? "", s: est({ h: "center" }) },
        { f: suma("Cantidad"), s: est({ h: "center" }) },
        { f: suma("Total Materiales"), s: pesos }, { f: suma("Total M.O"), s: pesos }, { f: suma("Neto"), s: pesos },
      ];
    }));
  if (lista.length) total(17, finCod, ["", "", "", MONEDA, MONEDA, MONEDA]);

  return p.cerrar(Math.max(finTec + 1, finIto, finCod, 4), "X",
    [4, 30, 7, 14, 14, 14, 14, 14, 4, 36, 7, 14, 14, 14, 14, 14, 4, 20, 46, 8, 10, 14, 14, 14]);
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

  // Tablas de Excel con segmentaciones en la fila 1 (se filtra con un clic):
  // Materiales, como la base de Patricio (Clasificación y Sub Clasificación), y Revisión.
  const NS_SL = "http://schemas.microsoft.com/office/spreadsheetml/2009/9/main";
  const NS_X15 = "http://schemas.microsoft.com/office/spreadsheetml/2010/11/main";
  const XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  // col = N° de columna dentro de la tabla; desde/hasta = columnas de la hoja que ocupa el botón; alto en EMU.
  const tablas = [
    { hoja: 3, archivo: "materiales", nombre: "Materiales", hasta: "O", columnas: ROTULOS_MAT, alto: 820000, titulo: false, filtro: undefined, segs: [
      { col: 1, cache: "Slicer_Clasificacion", botones: 5, desde: 1, hasta: 5 },     // B..E
      { col: 2, cache: "Slicer_Sub_Clasificacion", botones: 8, desde: 5, hasta: 8 }, // F..H
    ] },
    // Con título: ahí está el botón de borrar el filtro. col = posición en ROTULOS_REV.
    // Sale filtrada: sin las líneas vacías de los bloques (las mismas filas que oculta pestanaRevision).
    { hoja: 4, archivo: "revision", nombre: "Revision", hasta: L[ROTULOS_REV.length], columnas: ROTULOS_REV, alto: 1690000, titulo: true,
      filtro: { col: 8, valores: FILAS_VISIBLES }, segs: [
        { col: 8, cache: "Slicer_Ver", botones: 1, desde: 1, hasta: 3 },       // B..C
        { col: 1, cache: "Slicer_Tipo", botones: 1, desde: 3, hasta: 4 },      // D
        { col: 22, cache: "Slicer_Cobro", botones: 1, desde: 4, hasta: 5 },    // E
        { col: 4, cache: "Slicer_ITO", botones: 2, desde: 5, hasta: 8 },       // F..H
        { col: 5, cache: "Slicer_Tecnico", botones: 3, desde: 8, hasta: 11 },  // I..K
      ] },
  ];
  const caches: { archivo: string; cache: string }[] = []; // las de todo el libro: se listan una sola vez
  tablas.forEach((t, k) => {
    const ruta = `xl/worksheets/sheet${t.hoja}.xml`;
    const hoja = leer(ruta);
    const ultima = Number(/<dimension ref="[A-Z]+\d+:[A-Z]+(\d+)"/.exec(hoja ?? "")?.[1] ?? 0);
    if (!hoja || ultima < 4) return;
    const id = k + 1;
    const segs = t.segs.map((s, i) => ({ ...s, nombre: t.columnas[s.col - 1], archivo: `${t.archivo}${i + 1}` }));
    escribir(`xl/tables/${t.archivo}.xml`, `${XML}<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${t.nombre}" displayName="${t.nombre}" ref="B3:${t.hasta}${ultima}" totalsRowShown="0">`
      + `<autoFilter ref="B3:${t.hasta}${ultima}"${t.filtro
        ? `><filterColumn colId="${t.filtro.col - 1}"><filters>${t.filtro.valores.map((v) => `<filter val="${v}"/>`).join("")}</filters></filterColumn></autoFilter>`
        : "/>"}<tableColumns count="${t.columnas.length}">${t.columnas.map((n, i) => `<tableColumn id="${i + 1}" name="${n}"/>`).join("")}</tableColumns>`
      + `<tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`);
    segs.forEach((s) => escribir(`xl/slicerCaches/${s.archivo}.xml`,
      `${XML}<slicerCacheDefinition xmlns="${NS_SL}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="x" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="${s.cache}" sourceName="${s.nombre}">`
      + `<extLst><x:ext uri="{2F2917AC-EB37-4324-AD4E-5DD8C200BD13}" xmlns:x15="${NS_X15}"><x15:tableSlicerCache tableId="${id}" column="${s.col}"/></x:ext></extLst></slicerCacheDefinition>`));
    escribir(`xl/slicers/${t.archivo}.xml`, `${XML}<slicers xmlns="${NS_SL}">`
      + segs.map((s) => `<slicer name="${s.nombre}" cache="${s.cache}" caption="${s.nombre}" columnCount="${s.botones}"${t.titulo ? "" : ' showCaption="0"'} rowHeight="180000"/>`).join("") + `</slicers>`);
    const punto = (col: number, off: number) => `<xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>${off}</xdr:rowOff>`;
    escribir(`xl/drawings/segmentaciones-${t.archivo}.xml`, `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">`
      + segs.map((s, i) => `<xdr:twoCellAnchor editAs="absolute"><xdr:from>${punto(s.desde, 25400)}</xdr:from><xdr:to>${punto(s.hasta, t.alto)}</xdr:to>`
        + `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:sle15="http://schemas.microsoft.com/office/drawing/2012/slicer"><mc:Choice Requires="sle15">`
        + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="${s.nombre}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
        + `<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2010/slicer"><sle:slicer xmlns:sle="http://schemas.microsoft.com/office/drawing/2010/slicer" name="${s.nombre}"/></a:graphicData></a:graphic></xdr:graphicFrame>`
        + `</mc:Choice><mc:Fallback/></mc:AlternateContent><xdr:clientData/></xdr:twoCellAnchor>`).join("") + `</xdr:wsDr>`);
    escribir(`xl/worksheets/_rels/sheet${t.hoja}.xml.rels`, `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
      + `<Relationship Id="rIdSeg" Type="${NS_REL}/drawing" Target="../drawings/segmentaciones-${t.archivo}.xml"/>`
      + `<Relationship Id="rIdTabla" Type="${NS_REL}/table" Target="../tables/${t.archivo}.xml"/>`
      + `<Relationship Id="rIdSlicer" Type="http://schemas.microsoft.com/office/2007/relationships/slicer" Target="../slicers/${t.archivo}.xml"/></Relationships>`);
    escribir(ruta, hoja.replace("</worksheet>", `<drawing r:id="rIdSeg"/><tableParts count="1"><tablePart r:id="rIdTabla"/></tableParts>`
      + `<extLst><ext uri="{3A4CF648-6AED-40f4-86FF-DC5316D8AED3}" xmlns:x15="${NS_X15}"><x14:slicerList xmlns:x14="${NS_SL}"><x14:slicer r:id="rIdSlicer"/></x14:slicerList></ext></extLst></worksheet>`));
    caches.push(...segs.map((s) => ({ archivo: s.archivo, cache: s.cache })));
    tipos = tipos.replace("</Types>", `<Override PartName="/xl/tables/${t.archivo}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`
      + segs.map((s) => `<Override PartName="/xl/slicerCaches/${s.archivo}.xml" ContentType="application/vnd.ms-excel.slicerCache+xml"/>`).join("")
      + `<Override PartName="/xl/slicers/${t.archivo}.xml" ContentType="application/vnd.ms-excel.slicer+xml"/>`
      + `<Override PartName="/xl/drawings/segmentaciones-${t.archivo}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
  });
  if (caches.length) {
    const rels = leer("xl/_rels/workbook.xml.rels")!;
    escribir("xl/_rels/workbook.xml.rels", rels.replace("</Relationships>", caches.map((c, i) =>
      `<Relationship Id="rIdSc${i + 1}" Type="http://schemas.microsoft.com/office/2007/relationships/slicerCache" Target="slicerCaches/${c.archivo}.xml"/>`).join("") + "</Relationships>"));
    // Cada segmentación necesita su nombre definido (#N/A) y su caché listada en el libro.
    const nombres = caches.map((c) => `<definedName name="${c.cache}">#N/A</definedName>`).join("");
    let libroXml = leer("xl/workbook.xml")!;
    libroXml = libroXml.includes("</definedNames>") ? libroXml.replace("</definedNames>", nombres + "</definedNames>") : libroXml.replace("</sheets>", `</sheets><definedNames>${nombres}</definedNames>`);
    escribir("xl/workbook.xml", libroXml.replace("</workbook>", `<extLst><ext uri="{46BE6895-7355-4a93-B00E-2C351335B9C9}" xmlns:x15="${NS_X15}"><x15:slicerCaches xmlns:x14="${NS_SL}">`
      + caches.map((_, i) => `<x14:slicerCache r:id="rIdSc${i + 1}"/>`).join("") + `</x15:slicerCaches></ext></extLst></workbook>`));
  }
  escribir("[Content_Types].xml", tipos);
  // Comprimido: sin esto un mes de SIN OT pesaba 6 MB (el XML de las celdas es muy repetitivo).
  return Uint8Array.from(X.CFB.write(zip, { fileType: "zip", type: "array", compression: true }) as ArrayLike<number>);
}

export function libroCobros(X: XlsxHoja, {
  ots, catalogo, conOt, sinOt, logo, precios = [], previos, estados, modificador, itos,
}: {
  /** Modificador general de precios (Materiales L2/M2). Al actualizar, el que ya tenía el Excel. */
  modificador?: Modificador;
  /** Cobro de cada OT (ot_cobros): el aviso de la columna T. */
  estados?: Map<string, EstadoCobro>;
  /** El Excel que se está actualizando: sus bloques van primero y sus OTs no se repiten. */
  previos?: Pick<ExcelCobros, "conOt" | "sinOt">;
  /** Id de OT → ITO, para los bloques de un Excel de antes de que el ITO viajara en él. */
  itos?: Map<string, string>;
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
  // Los Excel de antes no traen el ITO en sus bloques: se completa con el de Pangui.
  const conIto = (bloques?: BloqueCobro[]) => bloques?.map((b) =>
    (b.cabecera && !b.cabecera.ito && itos?.get(b.id) ? { ...b, cabecera: { ...b.cabecera, ito: itos.get(b.id) } } : b));
  if (previos) previos = { conOt: conIto(previos.conOt)!, sinOt: conIto(previos.sinOt)! };
  const wb = X.utils.book_new();
  const otsCon = nuevas.filter((o) => o.numeroOt && enRango(o, conOt)).sort(porFecha);
  const otsSin = nuevas.filter((o) => !o.numeroOt && enRango(o, sinOt)).sort(porFecha);
  X.utils.book_append_sheet(wb, pestanaCobros(X, otsCon, mapa, false, conOt, porCodigo, alto, previos?.conOt, estados), "CON OT");
  X.utils.book_append_sheet(wb, pestanaCobros(X, otsSin, mapa, true, sinOt, porCodigo, alto, previos?.sinOt, estados), "SIN OT");
  X.utils.book_append_sheet(wb, pestanaMateriales(X, catalogo, precios, modificador), "Materiales");
  // Al final: Materiales tiene que seguir siendo la hoja 3 (adornar), y estas dos se borran antes de mandar el Excel.
  const revision = filasRevision([
    { hoja: "CON OT", bloques: bloquesDePestana(otsCon, mapa, false, previos?.conOt) },
    { hoja: "SIN OT", bloques: bloquesDePestana(otsSin, mapa, true, previos?.sinOt) },
  ]);
  // Códigos que sólo tienen precio de mano de obra (revnor, reveme, aa…).
  const precio = (f: FilaPrecios, fin: number, base: number) => Number(f[fin] ?? f[base]) || 0;
  const manoDeObra = new Set(precios.filter((f) => precio(f, 12, 8) === 0 && precio(f, 13, 9) > 0).map((f) => norm(f[5])));
  X.utils.book_append_sheet(wb, pestanaRevision(X, revision, porCodigo, manoDeObra), REVISION);
  X.utils.book_append_sheet(wb, pestanaResumen(X, revision, porCodigo), RESUMEN);
  const bytes = new Uint8Array(X.write(wb, { bookType: "xlsx", type: "array" }));
  const vista = { filas: 0, columnas: 0, sinCuadricula: true, zoom: 90 };
  return adornar(X as XlsxZip, ajustarLibro(X, bytes, [vista, vista, undefined, { filas: 3, columnas: 0 }, { filas: 4, columnas: 0 }]), [1, 2], logo);
}
