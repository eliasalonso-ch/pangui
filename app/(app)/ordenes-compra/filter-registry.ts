import type { EstadoOrdenCompra } from "@/types/ordenes-compra";

/**
 * Catalogo de filtros de ordenes de compra.
 *
 * Mismo contrato que el de /ordenes (filter-registry.ts): cada filtro declara
 * como se vacia y cuantos valores tiene, y este modulo es la unica fuente de
 * verdad de que filtros existen. Agregar uno es agregar una entrada aca.
 *
 * No hay filtro por activo a proposito: una OC no apunta a un activo. Sus
 * lineas referencian `partes` via parte_id y nada mas (ver la migracion
 * 20260909120000_ordenes_compra.sql), asi que "las OC de este activo" no es una
 * pregunta que los datos puedan responder hoy.
 */

/** Presets de fecha de creacion. Los mismos tramos que usa la bandeja de OT. */
export type FechaOCPreset = "hoy" | "semana" | "mes" | "trimestre";

export interface FiltrosOC {
  estados: EstadoOrdenCompra[];
  proveedorIds: string[];
  /** Materiales del catalogo presentes en alguna linea de la OC. */
  parteIds: string[];
  fecha: FechaOCPreset | null;
}

export const EMPTY_FILTROS_OC: FiltrosOC = {
  estados: [], proveedorIds: [], parteIds: [], fecha: null,
};

export type FilterKeyOC = keyof FiltrosOC;

export interface FilterMetaOC {
  key: FilterKeyOC;
  label: string;
  clear: () => Partial<FiltrosOC>;
  count: (f: FiltrosOC) => number;
}

export const FILTER_META_OC: Record<FilterKeyOC, FilterMetaOC> = {
  estados: {
    key: "estados", label: "Estado",
    clear: () => ({ estados: [] }),
    count: f => f.estados.length,
  },
  proveedorIds: {
    key: "proveedorIds", label: "Proveedor",
    clear: () => ({ proveedorIds: [] }),
    count: f => f.proveedorIds.length,
  },
  parteIds: {
    key: "parteIds", label: "Material",
    clear: () => ({ parteIds: [] }),
    count: f => f.parteIds.length,
  },
  fecha: {
    key: "fecha", label: "Fecha de creación",
    clear: () => ({ fecha: null }),
    count: f => (f.fecha ? 1 : 0),
  },
};

export const FILTER_ORDER_OC: FilterKeyOC[] = ["estados", "proveedorIds", "fecha", "parteIds"];

/**
 * Los cuatro filtros caben en la barra, asi que arrancan todos visibles.
 * "+ Anadir filtro" queda igual para cuando se sumen mas.
 */
export const DEFAULT_FILTER_KEYS_OC: FilterKeyOC[] = ["estados", "proveedorIds", "fecha"];

export function filterKeysStorageKeyOC(workspaceId: string): string {
  return `ordenes-compra:filtros:${workspaceId}`;
}

/**
 * Que chips arrancan en la barra.
 *
 * Un filtro que ya trae valores se muestra siempre, aunque no este en los
 * guardados: si no, un filtro activo quedaria filtrando en silencio sin chip
 * que lo delate.
 */
export function initialFilterKeysOC(
  saved: string[] | null,
  activos: FilterKeyOC[] = [],
): FilterKeyOC[] {
  const base = saved?.length
    ? saved.filter((k): k is FilterKeyOC => k in FILTER_META_OC)
    : [...DEFAULT_FILTER_KEYS_OC];
  const merged = new Set<FilterKeyOC>([...base, ...activos]);
  return FILTER_ORDER_OC.filter(k => merged.has(k));
}

/** Cuantos filtros tienen valores ahora mismo. */
export function contarFiltrosOC(f: FiltrosOC): number {
  return FILTER_ORDER_OC.reduce((n, k) => n + FILTER_META_OC[k].count(f), 0);
}

/** Fecha de corte de un preset, o null si el preset no aplica. */
export function desdeDePreset(preset: FechaOCPreset): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (preset === "semana") d.setDate(d.getDate() - 7);
  else if (preset === "mes") d.setMonth(d.getMonth() - 1);
  else if (preset === "trimestre") d.setMonth(d.getMonth() - 3);
  return d;
}
