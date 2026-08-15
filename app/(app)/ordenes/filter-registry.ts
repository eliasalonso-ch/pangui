import { ELECTRILAM_WORKSPACE_ID } from "@/lib/ordenes-api";
import type { FiltrosState } from "@/types/ordenes";

/**
 * Catalogo de filtros de la bandeja.
 *
 * La barra ya no muestra todos los filtros siempre: arranca con un set base y
 * el resto se agregan desde "+ Añadir filtro". Este modulo es la unica fuente
 * de verdad de que filtros existen, cuales se ven de entrada y como se vacia
 * cada uno — agregar un filtro nuevo es agregar una entrada aca.
 */

export type FilterKey =
  | "asignadoIds"
  | "sinAsignar"
  | "fechaVencimiento"
  | "ubicacionIds"
  | "itos"
  | "prioridades"
  | "estados"
  | "tipos"
  | "sociedadIds";

export interface FilterMeta {
  key: FilterKey;
  /** Etiqueta del chip y del catalogo. */
  label: string;
  /**
   * Deja el filtro sin valores. Se usa tanto al quitarlo de la barra como al
   * pulsar la papelera, para que un filtro oculto nunca siga filtrando en
   * silencio.
   */
  clear: (f: FiltrosState) => Partial<FiltrosState>;
  /** Cuantos valores tiene seleccionados ahora mismo. */
  count: (f: FiltrosState) => number;
}

export const FILTER_META: Record<FilterKey, FilterMeta> = {
  asignadoIds: {
    key: "asignadoIds", label: "Asignado a",
    clear: () => ({ asignadoIds: [] }),
    count: f => f.asignadoIds.length,
  },
  sinAsignar: {
    key: "sinAsignar", label: "Sin asignar",
    clear: () => ({ sinAsignar: false }),
    count: f => (f.sinAsignar ? 1 : 0),
  },
  fechaVencimiento: {
    key: "fechaVencimiento", label: "Fecha de vencimiento",
    clear: () => ({ fechaVencimiento: null }),
    count: f => (f.fechaVencimiento ? 1 : 0),
  },
  ubicacionIds: {
    key: "ubicacionIds", label: "Ubicación",
    clear: () => ({ ubicacionIds: [] }),
    count: f => f.ubicacionIds.length,
  },
  itos: {
    key: "itos", label: "ITO",
    clear: () => ({ itos: [] }),
    count: f => f.itos.length,
  },
  prioridades: {
    key: "prioridades", label: "Prioridad",
    clear: () => ({ prioridades: [] }),
    count: f => f.prioridades.length,
  },
  estados: {
    key: "estados", label: "Estado",
    clear: () => ({ estados: [] }),
    count: f => f.estados.length,
  },
  tipos: {
    key: "tipos", label: "Tipo de trabajo",
    clear: () => ({ tipos: [] }),
    count: f => f.tipos.length,
  },
  sociedadIds: {
    key: "sociedadIds", label: "Sociedad",
    clear: () => ({ sociedadIds: [] }),
    count: f => f.sociedadIds.length,
  },
};

/**
 * Orden en que se dibujan los chips en la barra (y en que se listan en
 * "+ Añadir filtro"). `sinAsignar` va primero para quedar junto al toggle de
 * leídas/no leídas, que vive a la izquierda de esta barra.
 */
export const FILTER_ORDER: FilterKey[] = [
  "sinAsignar", "asignadoIds", "fechaVencimiento", "ubicacionIds",
  "itos", "prioridades", "estados", "tipos", "sociedadIds",
];

/**
 * Los 4 filtros que ve una cuenta nueva. El resto siguen disponibles desde
 * "+ Añadir filtro"; esto solo decide que hay en la barra al entrar por primera
 * vez, para que no arranque saturada.
 */
export const DEFAULT_FILTER_KEYS: FilterKey[] = [
  "asignadoIds", "fechaVencimiento", "estados", "prioridades",
];

export interface DefaultFilterArgs {
  workspaceId: string;
  /** Preferencia guardada de este workspace, si el usuario ya personalizo. */
  saved?: FilterKey[] | null;
  /** Filtros que ya vienen con valor (p. ej. desde ?filtro=urgentes). */
  preseeded?: FilterKey[];
}

/**
 * Que filtros arrancan visibles.
 *
 * Electrilam ve todos: ya opera con la barra completa y esconderle filtros que
 * usa a diario seria una regresion. Las cuentas nuevas arrancan con
 * DEFAULT_FILTER_KEYS y agregan lo que necesiten.
 *
 * Un filtro que ya trae valor SIEMPRE se muestra, aunque no este en el set
 * guardado: si no, un deep link como ?filtro=urgentes filtraria la lista sin
 * ningun chip visible que lo explique — el usuario veria resultados recortados
 * sin saber por que.
 */
export function initialFilterKeys({ workspaceId, saved, preseeded = [] }: DefaultFilterArgs): FilterKey[] {
  const base = saved?.length
    ? saved.filter((k): k is FilterKey => k in FILTER_META)
    : workspaceId === ELECTRILAM_WORKSPACE_ID
      ? [...FILTER_ORDER]
      : [...DEFAULT_FILTER_KEYS];
  const merged = new Set<FilterKey>([...base, ...preseeded]);
  return FILTER_ORDER.filter(k => merged.has(k));
}

/** Que filtros de `filtros` tienen algun valor puesto. */
export function activeFilterKeys(filtros: FiltrosState): FilterKey[] {
  return FILTER_ORDER.filter(k => FILTER_META[k].count(filtros) > 0);
}

/** Clave de localStorage por workspace: la barra es una preferencia por cuenta. */
export function filterKeysStorageKey(workspaceId: string): string {
  return `ordenes:filtros:${workspaceId}`;
}
