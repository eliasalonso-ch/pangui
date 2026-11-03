import type { XlsxHoja } from "@/lib/hoja-excel";

/**
 * Export de cobros de Electrilam: arma las pestañas CON OT / SIN OT con el
 * mismo dibujo del Excel "COBROS CON Y SIN OT <MES>" que llena Claudio, para
 * que deje de copiar OT por OT lo que los técnicos escribieron en las hojas.
 *
 * Ese Excel tiene un bloque fijo de 23 filas por OT: la cabecera (fecha, N° OT
 * o solicitante, facultad, descripción), 20 filas de líneas y la de TOTALES.
 * Cada línea lleva el texto libre en E y, si ya se sabe, código en F y
 * cantidad en I. Descripción, unidad y precios los pone su propio BUSCARV
 * contra la pestaña Materiales (de Patricio): acá NO van precios.
 *
 * Se pega con Pegado especial → "Saltar blancos" sobre C13: las celdas que
 * aquí quedan vacías (G/H de las líneas, J en adelante) no pisan sus fórmulas.
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
  hojas: HojaCobro[];
}

export interface Linea {
  texto: string;
  codigo?: string;
  cantidad?: number;
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
const DIAS = /^d[ií]as?$/;
const HH_EN_TEXTO = /(\d+(?:[.,]\d+)?)\s*(?:hh|h\.h\.?|horas?)\b/;
const PP_EN_TEXTO = /(\d+)\s*(?:pp|personas?)\b/;

/**
 * Las líneas de una OT para el bloque: primero la mano de obra (revnor /
 * reveme), después lo que escribió el técnico, al final personas y horas.
 *
 * Mano de obra = personas × hh, la regla de Claudio. Sólo se calcula si la OT
 * trae exactamente un dato de cada uno: con dos trabajos dentro de la misma OT
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

      if ((esHH || esPP) && n != null) {
        if (DIAS.test(nUnidad)) dudoso = true;
        (esHH ? horas : personas).push(n);
        // "Alza-hombre | 4 | hh": las horas cuentan, pero el texto también dice algo.
        if (item && !HH.test(nItem) && !PP.test(nItem)) notas.push(item);
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
    ...horas.map((n) => ({ texto: `${n}hh` })),
  ];
}

/** Días desde el 30-12-1899: así guarda Excel una fecha. */
function serieExcel(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

const COLS = { C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8 } as const;

/**
 * Una pestaña con el dibujo de bloques. Una OT con más de 20 líneas sigue en
 * el bloque siguiente con "Continuación" en la Solicitud, como ya lo hace
 * Claudio a mano.
 */
export function pestanaCobros(X: XlsxHoja, ots: OtCobro[], catalogo: Map<string, string>, sinOt: boolean): Record<string, unknown> {
  const ws: Record<string, unknown> = {};
  const put = (fila: number, col: keyof typeof COLS, v: string | number, z?: string) => {
    ws[X.utils.encode_cell({ r: fila - 1, c: COLS[col] })] =
      typeof v === "number" ? { t: "n", v, ...(z ? { z } : {}) } : { t: "s", v };
  };

  ["Fecha termino", "Solicitud", "Notas/Facultad", "Codigo", "Descripción", "Unidad", "Cantidad"]
    .forEach((t, i) => put(PRIMERA_CABECERA - 1, (["C", "D", "E", "F", "G", "H", "I"] as const)[i], t));

  let bloque = 0;
  for (const ot of ots) {
    const lineas = lineasDeOt(ot, catalogo);
    for (let i = 0; i < lineas.length; i += LINEAS_POR_BLOQUE) {
      const cab = PRIMERA_CABECERA + bloque * FILAS_POR_BLOQUE;
      if (i === 0) {
        if (ot.fecha) put(cab, "C", serieExcel(ot.fecha), "dd-mm-yyyy");
        put(cab, "D", sinOt ? ot.solicitante : ot.numeroOt);
        put(cab, "E", ot.lugar);
        put(cab, "G", ot.descripcion);
      } else {
        put(cab, "D", "Continuación");
      }
      put(cab, "F", "Codigo");
      put(cab, "I", "Cantidad");
      lineas.slice(i, i + LINEAS_POR_BLOQUE).forEach((l, j) => {
        put(cab + 1 + j, "E", l.texto);
        if (l.codigo) put(cab + 1 + j, "F", l.codigo);
        if (l.cantidad != null) put(cab + 1 + j, "I", l.cantidad);
      });
      put(cab + 1 + LINEAS_POR_BLOQUE, "I", "TOTALES");
      bloque++;
    }
  }

  const ultima = PRIMERA_CABECERA + Math.max(bloque, 1) * FILAS_POR_BLOQUE - 2;
  ws["!ref"] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultima - 1, c: COLS.I } });
  ws["!cols"] = [{ wch: 4 }, { wch: 4 }, { wch: 12 }, { wch: 18 }, { wch: 40 }, { wch: 14 }, { wch: 40 }, { wch: 8 }, { wch: 9 }];
  return ws;
}

export function libroCobros(X: XlsxHoja, ots: OtCobro[], catalogo: Map<string, string>): Uint8Array {
  const porFecha = (a: OtCobro, b: OtCobro) => a.fecha.localeCompare(b.fecha);
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, pestanaCobros(X, ots.filter((o) => o.numeroOt).sort(porFecha), catalogo, false), "CON OT");
  X.utils.book_append_sheet(wb, pestanaCobros(X, ots.filter((o) => !o.numeroOt).sort(porFecha), catalogo, true), "SIN OT");
  return new Uint8Array(X.write(wb, { bookType: "xlsx", type: "array" }));
}
