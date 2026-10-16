import type { OpcionFiltro } from "@/components/filtros/primitivas";
import { etiquetaFrecuencia, nivelDeLectura, type MedidorConUltima } from "@/lib/medidores-api";

/**
 * Filtros de /medidores.
 *
 * Todos son "uno de" sobre la lista ya cargada: los medidores de un workspace
 * son decenas y `fetchMedidores` ya los trae completos, así que filtrar en el
 * servidor sería un viaje por cada clic sin ganar nada.
 *
 * Las opciones salen de los medidores que existen, igual que en /proveedores:
 * una opción sin resultados no sirve.
 */

export const CLAVES_FILTRO = ["activos", "ubicaciones", "unidades", "frecuencias", "tipos", "estados"] as const;
export type ClaveFiltro = typeof CLAVES_FILTRO[number];
export type FiltrosMedidor = Record<ClaveFiltro, string[]>;

export const FILTROS_VACIOS: FiltrosMedidor = {
  activos: [], ubicaciones: [], unidades: [], frecuencias: [], tipos: [], estados: [],
};

export const ETIQUETA_FILTRO: Record<ClaveFiltro, string> = {
  activos: "Activo",
  ubicaciones: "Ubicación",
  unidades: "Unidad",
  frecuencias: "Frecuencia",
  tipos: "Tipo",
  estados: "Estado",
};

/** Id de "no tiene": un medidor sin activo o sin ronda también se busca. */
const SIN = "sin";

/**
 * En este orden se muestran: lo que pide acción primero. "Lectura pendiente"
 * no está acá: tiene su propio filtro en la barra (ver la página).
 */
const ESTADOS: [string, string][] = [
  ["critico", "Crítico"],
  ["advertencia", "Advertencia"],
  ["sin-lecturas", "Sin lecturas"],
];

/** Lo que vale un medidor en cada filtro, como pares [id, etiqueta]. */
function valores(m: MedidorConUltima): Record<ClaveFiltro, [string, string][]> {
  // Misma caída a la columna vieja que `proximaLectura`.
  const min = m.frecuencia_minutos ?? (m.frecuencia_dias != null ? m.frecuencia_dias * 1440 : null);
  const nivel = m.ultima ? nivelDeLectura(m.ultima.valor, m) : null;
  return {
    activos: [[m.activo_id ?? SIN, m.activo_nombre ?? "Sin activo"]],
    ubicaciones: [[m.ubicacion_id ?? SIN, m.ubicacion_nombre ?? "Sin ubicación"]],
    unidades: [[m.unidad, m.unidad]],
    frecuencias: [[min == null ? SIN : String(min), etiquetaFrecuencia(min)]],
    tipos: [[m.tipo, m.tipo === "manual" ? "Manual" : "Automatizado"]],
    estados: ESTADOS.filter(([id]) => (id === "sin-lecturas" ? !m.ultima : id === nivel)),
  };
}

export function contarFiltros(f: FiltrosMedidor): number {
  return CLAVES_FILTRO.reduce((n, k) => n + f[k].length, 0);
}

/** Dentro de un filtro, "uno de"; entre filtros, todos a la vez. */
export function aplicarFiltros(items: MedidorConUltima[], f: FiltrosMedidor): MedidorConUltima[] {
  const activas = CLAVES_FILTRO.filter(k => f[k].length > 0);
  if (activas.length === 0) return items;
  return items.filter(m => {
    const v = valores(m);
    return activas.every(k => v[k].some(([id]) => f[k].includes(id)));
  });
}

export function opcionesFiltro(items: MedidorConUltima[]): Record<ClaveFiltro, OpcionFiltro[]> {
  const vistos = Object.fromEntries(CLAVES_FILTRO.map(k => [k, new Map<string, string>()])) as Record<ClaveFiltro, Map<string, string>>;
  for (const m of items) {
    const v = valores(m);
    for (const k of CLAVES_FILTRO) for (const [id, label] of v[k]) vistos[k].set(id, label);
  }

  const ordenEstado = (id: string) => ESTADOS.findIndex(([e]) => e === id);
  return Object.fromEntries(CLAVES_FILTRO.map(k => {
    const opciones = [...vistos[k]].map(([id, label]) => ({ id, label }));
    // "Sin …" siempre al final; las frecuencias por duración y no por nombre
    // ("Cada hora" antes que "Diaria"), los estados en su orden fijo.
    opciones.sort((a, b) =>
      Number(a.id === SIN) - Number(b.id === SIN) ||
      (k === "frecuencias" ? Number(a.id) - Number(b.id)
        : k === "estados" ? ordenEstado(a.id) - ordenEstado(b.id)
          : a.label.localeCompare(b.label, "es")));
    return [k, opciones];
  })) as Record<ClaveFiltro, OpcionFiltro[]>;
}
