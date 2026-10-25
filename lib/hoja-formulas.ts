// Mismo archivo en la app (pangui-native: lib/hoja-formulas.ts) y en la web (pangui:
// lib/hoja-formulas.ts): las dos calculan las hojas igual. Si se cambia uno, copiar
// al otro tal cual (y su test: tests/hoja-formulas.test.ts / tests/lib/hoja-formulas.test.ts).
// @ts-ignore — fast-formula-parser no trae tipos
import FormulaParser from "fast-formula-parser";

// ── Fórmulas de la hoja de cálculo ───────────────────────────────────────────
// Una celda que parte con "=" es una fórmula; se guarda tal cual se escribió y
// se calcula al mostrarla. El motor es fast-formula-parser (MIT, funciones de
// Excel). Se escribe como en el Excel en español de Chile: SUMA, PROMEDIO…,
// ";" entre argumentos y "," decimal; antes de calcular se pasa a la forma en
// inglés que entiende el motor (también acepta los nombres en inglés).
//
// Direcciones: la letra es la columna (A = primera) y el número la fila del
// lienzo + 1, igual que en pantalla: fila 1 = nombres de columna, 2 = primera fila.

type Celdas = { columnas: { id: string; label: string }[]; filas: { celdas: Record<string, string> }[] };
/** `error`: la fórmula no se puede calcular (mal escrita, circular, #DIV/0!…); `texto` trae el código. */
export type Resultado = { texto: string; numero: boolean; valor?: number; error?: boolean };

// Español → nombre en el motor. Solo las de uso común; el resto, en inglés.
const ALIAS: Record<string, string> = {
  SUMA: "SUM", PROMEDIO: "AVERAGE", CONTAR: "COUNT", CONTARA: "COUNTA", PRODUCTO: "PRODUCT",
  SI: "IF", Y: "AND", O: "OR", NO: "NOT", "SI.ERROR": "IFERROR",
  REDONDEAR: "ROUND", "REDONDEAR.MAS": "ROUNDUP", "REDONDEAR.MENOS": "ROUNDDOWN", ENTERO: "INT",
  RAIZ: "SQRT", POTENCIA: "POWER", RESIDUO: "MOD",
  "SUMAR.SI": "SUMIF", "CONTAR.SI": "COUNTIF", "PROMEDIO.SI": "AVERAGEIF", BUSCARV: "VLOOKUP",
  HOY: "TODAY", AHORA: "NOW", "AÑO": "YEAR", MES: "MONTH", DIA: "DAY", DIAS: "DAYS",
  CONCATENAR: "CONCATENATE", TEXTO: "TEXT", LARGO: "LEN", MAYUSC: "UPPER", MINUSC: "LOWER",
  ESPACIOS: "TRIM", IZQUIERDA: "LEFT", DERECHA: "RIGHT", EXTRAE: "MID",
};

// Errores en la forma del Excel en español.
const ERRORES: Record<string, string> = {
  "#VALUE!": "#¡VALOR!", "#REF!": "#¡REF!", "#ERROR!": "#¡ERROR!", "#NAME?": "#¿NOMBRE?", "#NUM!": "#¡NUM!", "#NULL!": "#¡NULO!",
};

export const esFormula = (v?: string | null): v is string => !!v && v.length > 1 && v.startsWith("=");

/** Lo escrito en una celda como valor para una fórmula: "1,5" y "1.234,5" son números. */
export function aValor(v: string | undefined): number | string | null {
  if (v == null || v.trim() === "") return null;
  const t = v.trim();
  // Miles con punto (1.500 = mil quinientos, como se escribe en Chile) y coma decimal.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."));
  return v;
}

/** "=SUMA(B2:B4;1,5)" → "SUM(B2:B4,1.5)": la fórmula sin "=" en la forma del motor (y de .xlsx). */
export function normalizar(formula: string): string {
  // Los textos entre comillas no se tocan: los tramos pares quedan fuera de ellas.
  return formula.slice(1).split('"').map((tramo, i) => {
    if (i % 2) return tramo;
    return tramo
      // "1,5" → "1.5", pero "B2,3" (referencia seguida de argumento) se deja.
      .replace(/([A-Za-z$]*)(\d+),(\d+)/g, (m, pre, a, b) => (pre ? m : `${a}.${b}`))
      .replace(/;/g, ",")
      // Como se escribe a mano: "×" "÷" "−", y "20x20" (x entre números) = 20*20.
      .replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-")
      .replace(/(\d)\s*[xX]\s*(?=\d)/g, "$1*")
      .replace(/([A-Za-zÑñÁÉÍÓÚáéíóú][\wÑñÁÉÍÓÚáéíóú.]*)\s*\(/g, (_, nombre: string) => `${ALIAS[nombre.toUpperCase()] ?? nombre.toUpperCase()}(`);
  }).join('"');
}

// Un solo motor: armarlo cuesta ~15 ms. Sus callbacks leen la hoja que se está calculando.
let motor: { parse: (f: string, pos: object) => unknown } | null = null;
let leer: (row: number, col: number) => unknown = () => null;
let limites = { filas: 0, cols: 0 };
// Un marco por fórmula en cálculo: el primer error leído dentro de un rango. El motor
// ignora los errores de un rango (SUMA(B2:B4) con B3 en error daba un número); como
// en Excel, la fórmula toma ese error. Así también un rango que incluye su propia celda.
let pila: unknown[] = [];

function getMotor() {
  return (motor ??= new FormulaParser({
    onCell: ({ row, col }: { row: number; col: number }) => leer(row, col),
    onRange: ({ from, to }: { from: { row: number; col: number }; to: { row: number; col: number } }) => {
      // Rangos de columna entera (B:B) llegan hasta la fila 1.048.576: se recortan a la hoja.
      const out: unknown[][] = [];
      for (let r = from.row; r <= Math.min(to.row, limites.filas); r++) {
        const fila: unknown[] = [];
        for (let c = from.col; c <= Math.min(to.col, limites.cols); c++) {
          const v = leer(r, c);
          if (esError(v) && pila.length && pila[pila.length - 1] == null) pila[pila.length - 1] = v;
          fila.push(v);
        }
        out.push(fila);
      }
      return out;
    },
  }));
}

const esError = (v: unknown): v is { error: string } =>
  !!v && typeof v === "object" && "error" in v && typeof (v as { error: unknown }).error === "string";

// Serie de Excel (días desde 1900) → fecha local "24/10/2026" (como lib/hoja-valores).
function fechaSerie(n: number, conHora: boolean) {
  const d = new Date(Math.round((n - 25569) * 86400000));
  const p = (x: number) => String(x).padStart(2, "0");
  const fecha = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return conHora ? `${fecha} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : fecha;
}

function formatear(v: unknown, formula: string): Resultado {
  if (Array.isArray(v)) v = Array.isArray(v[0]) ? v[0][0] : v[0]; // un rango suelto muestra su primera celda
  if (esError(v)) return { texto: ERRORES[v.error] ?? v.error, numero: false, error: true };
  if (typeof v === "boolean") return { texto: v ? "VERDADERO" : "FALSO", numero: false };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { texto: "#¡NUM!", numero: false, error: true };
    // ponytail: solo HOY()/AHORA() solos se muestran como fecha; una fecha calculada (HOY()+7) sale como número.
    const fecha = /^(TODAY|NOW)\(\)$/.exec(formula);
    if (fecha) return { texto: fechaSerie(v, fecha[1] === "NOW"), numero: false };
    // toPrecision quita el ruido de coma flotante (0,1 + 0,2).
    const n = Number(v.toPrecision(12));
    return { texto: n.toLocaleString("es-CL", { maximumFractionDigits: 10 }), numero: true, valor: n };
  }
  return { texto: v == null ? "" : String(v), numero: false };
}

/**
 * Calcula todas las fórmulas de la hoja. Clave: `${fila del lienzo}:${columna}`
 * (fila 1.. = filas de la hoja). Las referencias a otras fórmulas se resuelven
 * en cadena; un ciclo da #¡REF!.
 */
export function calcularHoja({ columnas, filas }: Celdas): Map<string, Resultado> {
  const valores = new Map<string, unknown>(); // ya calculadas (valor crudo)
  const enCurso = new Set<string>();
  const salida = new Map<string, Resultado>();
  const m = getMotor();

  const evaluar = (r: number, c: number, raw: string): unknown => {
    const k = `${r}:${c}`;
    if (valores.has(k)) return valores.get(k);
    if (enCurso.has(k)) return { error: "#REF!" };
    enCurso.add(k);
    let v: unknown;
    pila.push(null);
    try {
      v = m.parse(normalizar(raw), { sheet: "hoja", row: r + 1, col: c + 1 });
      const enRango = pila[pila.length - 1];
      if (esError(enRango) && !esError(v)) v = { error: enRango.error };
    } catch (e) {
      // Fórmula mal escrita o función que no existe: el motor lanza en vez de devolver.
      v = { error: /not implemented/i.test((e as Error)?.message ?? "") ? "#NAME?" : esError(e) && e.error !== "#ERROR!" ? e.error : "#¡ERROR!" };
    }
    pila.pop();
    enCurso.delete(k);
    valores.set(k, v);
    return v;
  };

  // Valor de una celda para el motor (fila/columna de Excel, desde 1).
  leer = (row, col) => {
    const r = row - 1;
    const c = col - 1;
    const columna = columnas[c];
    if (!columna) return null;
    if (r === 0) return columna.label || null;
    const raw = filas[r - 1]?.celdas[columna.id];
    if (esFormula(raw)) {
      const v = evaluar(r, c, raw);
      // Un error se entrega como error del motor (un objeto simple lo ignoraba SUMA y
      // un rango que incluye su propia celda daba un número en vez de error).
      if (esError(v)) return new FormulaParser.FormulaError(v.error === "#¡ERROR!" ? "#ERROR!" : v.error);
      return Array.isArray(v) ? null : v;
    }
    return aValor(raw);
  };
  limites = { filas: filas.length + 1, cols: columnas.length };
  pila = [];

  filas.forEach((fila, i) => {
    columnas.forEach((col, c) => {
      const raw = fila.celdas[col.id];
      if (esFormula(raw)) salida.set(`${i + 1}:${c}`, formatear(evaluar(i + 1, c, raw), normalizar(raw)));
    });
  });
  return salida;
}

/**
 * Las celdas de cada fila con cada fórmula reemplazada por su resultado, para
 * mostrar o exportar la hoja fuera de la grilla (Excel, PDF, cobro, resúmenes).
 * `filas` en su orden (por `orden`): la fila 2 de las fórmulas es la primera.
 * `crudo`: los números sin formato ("1507.5" en vez de "1.507,5"), para leerlos como número.
 */
export function celdasConResultados(
  columnas: { id: string; label: string }[],
  filas: { celdas: Record<string, unknown> | null }[],
  crudo = false,
): Record<string, string>[] {
  const texto = filas.map((f) => Object.fromEntries(Object.entries(f.celdas ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)])));
  const calc = calcularHoja({ columnas, filas: texto.map((celdas) => ({ celdas })) });
  return texto.map((celdas, i) => {
    const out = { ...celdas };
    columnas.forEach((col, c) => {
      const r = calc.get(`${i + 1}:${c}`);
      if (r) out[col.id] = crudo && r.valor != null ? String(r.valor) : r.texto;
    });
    return out;
  });
}

/** Fórmulas rápidas de la hoja "Celda" (nombre en español, como se escriben). */
export const FORMULAS_RAPIDAS = [
  { id: "SUMA", label: "Suma" },
  { id: "PROMEDIO", label: "Promedio" },
  { id: "MIN", label: "Mínimo" },
  { id: "MAX", label: "Máximo" },
  { id: "CONTAR", label: "Conteo" },
  { id: "PRODUCTO", label: "Producto" },
] as const;

/** Funciones del botón fx de la barra de fórmulas. */
export const FUNCIONES = [
  "SUMA", "PROMEDIO", "MIN", "MAX", "CONTAR", "PRODUCTO", "SI", "REDONDEAR", "ABS", "HOY", "AHORA", "CONCATENAR",
] as const;

/** Letra de una columna (0 → A, 26 → AA). */
export function colLetter(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "AB" → 27 (A = 0). */
function colIndex(letras: string): number {
  return [...letras.toUpperCase()].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
}

/** Color de cada referencia de una fórmula (B2, B3:B5…), en orden, como Numbers: el mismo en la celda y en el texto. */
export const COLORES_REF = ["#5E7FD9", "#D08A48", "#3FA66B", "#C85A8A", "#8E6BD1", "#3AA6B9"];

export type Referencia = { r0: number; c0: number; r1: number; c1: number; inicio: number; fin: number };

/**
 * Celdas que nombra una fórmula (B2, B2:C5, con o sin $), en coordenadas del
 * lienzo (fila 0 = nombres de columna), en el orden en que aparecen, con su
 * lugar en el texto (inicio..fin). Los textos entre comillas y los nombres de
 * función (LOG10( ) no cuentan.
 */
export function referencias(formula: string): Referencia[] {
  const out: Referencia[] = [];
  let offset = 0; // dónde parte el tramo en la fórmula completa
  formula.split('"').forEach((tramo, i) => {
    const base = offset;
    offset += tramo.length + 1;
    if (i % 2) return;
    const re = /\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tramo))) {
      const antes = tramo[m.index - 1] ?? "";
      if (/[A-Za-z0-9_.]/.test(antes) || /^\s*\(/.test(tramo.slice(re.lastIndex))) continue;
      const a = { r: Number(m[2]) - 1, c: colIndex(m[1]) };
      const b = m[3] ? { r: Number(m[4]) - 1, c: colIndex(m[3]) } : a;
      out.push({
        r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c),
        inicio: base + m.index, fin: base + re.lastIndex,
      });
    }
  });
  return out;
}
