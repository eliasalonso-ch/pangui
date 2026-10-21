/**
 * Rango de fechas de la analítica: atajos, agrupación y etiquetas.
 *
 * Las fechas viajan como "YYYY-MM-DD" (días locales, inclusive en los dos
 * extremos). Nunca se pasan por `toISOString()`: en Chile eso corre la fecha un
 * día después de las 20:00.
 */

export type Grano = "dia" | "semana" | "mes";

export type Atajo = "30d" | "3m" | "6m" | "12m" | "anio" | "personalizado";

export interface Rango {
  desde: string;
  hasta: string;
}

const MESES_ES = ["ene", "feb", "mar", "abr", "may", "jun",
                  "jul", "ago", "sep", "oct", "nov", "dic"];

/** "YYYY-MM-DD" de una fecha local. */
export function aFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fecha local desde "YYYY-MM-DD". */
export function deFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Días del rango, contando los dos extremos. */
export function diasDelRango({ desde, hasta }: Rango): number {
  return Math.round((deFecha(hasta).getTime() - deFecha(desde).getTime()) / 86_400_000) + 1;
}

/**
 * Los atajos de meses cuentan meses CALENDARIO completos, incluido el actual:
 * "12 meses" en octubre va de noviembre del año pasado a hoy, con el mismo eje
 * mensual que tenía el informe antes del rango personalizado.
 */
export function rangoDeAtajo(atajo: Exclude<Atajo, "personalizado">, hoy: Date): Rango {
  const hasta = aFecha(hoy);
  if (atajo === "30d") {
    return { desde: aFecha(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29)), hasta };
  }
  if (atajo === "anio") {
    return { desde: aFecha(new Date(hoy.getFullYear(), 0, 1)), hasta };
  }
  const meses = atajo === "3m" ? 3 : atajo === "6m" ? 6 : 12;
  return { desde: aFecha(new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1)), hasta };
}

/** Tramos del gráfico: ~30 puntos como máximo para que el eje se lea. */
export function granoPara(rango: Rango): Grano {
  const dias = diasDelRango(rango);
  if (dias <= 31) return "dia";
  if (dias <= 186) return "semana";
  return "mes";
}

/**
 * Etiqueta de un tramo a partir de su inicio ("2026-03-01").
 * Si el rango cruza de año, los meses llevan el año: "oct '25" y "oct '26" no
 * pueden quedar los dos como "oct".
 */
export function etiquetaTramo(clave: string, grano: Grano, cruzaAnio: boolean): string {
  const d = deFecha(clave);
  const mes = MESES_ES[d.getMonth()];
  // Año con apóstrofo ("oct '26"): sin él, "oct 26" se leía como el día 26.
  if (grano === "mes") return cruzaAnio ? `${mes} '${String(d.getFullYear()).slice(2)}` : mes;
  return `${d.getDate()} ${mes}`;
}

/** El límite de historial del plan: el "desde" no puede ir más atrás. */
export function minimoDesde(hoy: Date, historialMeses: number): string | null {
  if (!Number.isFinite(historialMeses)) return null;
  return aFecha(new Date(hoy.getFullYear(), hoy.getMonth() - (historialMeses - 1), 1));
}
