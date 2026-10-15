import type { ProveedorListItem } from "@/types/proveedores";

/**
 * Catalogo de filtros de proveedores.
 *
 * Mismo contrato que /ordenes y /ordenes-compra. "Con contacto" sale de la
 * fila; activo, material y persona de contacto de `RelacionesProv`.
 *
 * Sin filtro de estado: los proveedores se eliminan, y los pocos archivados
 * (los que tienen OCs) se listan siempre, atenuados.
 *
 * "Con ordenes de compra activas" quedo afuera a proposito: la lista no sabe
 * cuantas OC tiene cada proveedor, y contarlas pedia una consulta agregada por
 * cada carga de la pantalla para un filtro que casi no se usaria.
 */

export interface FiltrosProveedor {
  /** Solo los que tienen con quien hablar (contacto, email o telefono). */
  conContacto: boolean;
  /** Ids de activos / materiales / personas de contacto: "tiene uno de". */
  activos: string[];
  materiales: string[];
  contactos: string[];
}

export const EMPTY_FILTROS_PROV: FiltrosProveedor = {
  conContacto: false, activos: [], materiales: [], contactos: [],
};

/**
 * Lo que cada proveedor tiene vinculado, por id de proveedor. La fila de la
 * lista no lo trae: sale de las consultas de vínculos y contactos, que ya
 * están en caché por la ficha.
 */
export interface RelacionesProv {
  activos: Map<string, string[]>;
  materiales: Map<string, string[]>;
  contactos: Map<string, string[]>;
}

export type FilterKeyProv = keyof FiltrosProveedor;

export interface FilterMetaProv {
  key: FilterKeyProv;
  label: string;
  clear: () => Partial<FiltrosProveedor>;
  count: (f: FiltrosProveedor) => number;
}

export const FILTER_META_PROV: Record<FilterKeyProv, FilterMetaProv> = {
  conContacto: {
    key: "conContacto", label: "Con contacto",
    clear: () => ({ conContacto: false }),
    count: f => (f.conContacto ? 1 : 0),
  },
  activos: {
    key: "activos", label: "Activo",
    clear: () => ({ activos: [] }),
    count: f => f.activos.length,
  },
  materiales: {
    key: "materiales", label: "Material",
    clear: () => ({ materiales: [] }),
    count: f => f.materiales.length,
  },
  contactos: {
    key: "contactos", label: "Persona de contacto",
    clear: () => ({ contactos: [] }),
    count: f => f.contactos.length,
  },
};

export const FILTER_ORDER_PROV: FilterKeyProv[] = ["activos", "materiales", "contactos", "conContacto"];
export const DEFAULT_FILTER_KEYS_PROV: FilterKeyProv[] = ["activos", "materiales", "contactos"];

export function filterKeysStorageKeyProv(workspaceId: string): string {
  return `proveedores:filtros:${workspaceId}`;
}

export function initialFilterKeysProv(
  saved: string[] | null,
  activos: FilterKeyProv[] = [],
): FilterKeyProv[] {
  const base = saved?.length
    ? saved.filter((k): k is FilterKeyProv => k in FILTER_META_PROV)
    : [...DEFAULT_FILTER_KEYS_PROV];
  const merged = new Set<FilterKeyProv>([...base, ...activos]);
  return FILTER_ORDER_PROV.filter(k => merged.has(k));
}

export function contarFiltrosProv(f: FiltrosProveedor): number {
  return FILTER_ORDER_PROV.reduce((n, k) => n + FILTER_META_PROV[k].count(f), 0);
}

export function aplicarFiltrosProv(
  items: ProveedorListItem[],
  f: FiltrosProveedor,
  rel: RelacionesProv,
): ProveedorListItem[] {
  const tieneUno = (sel: string[], ids: string[] | undefined) =>
    sel.length === 0 || (ids ?? []).some(id => sel.includes(id));
  return items.filter(p => {
    if (f.conContacto && !(p.contacto || p.email || p.telefono || rel.contactos.get(p.id)?.length)) return false;
    return tieneUno(f.activos, rel.activos.get(p.id))
      && tieneUno(f.materiales, rel.materiales.get(p.id))
      && tieneUno(f.contactos, rel.contactos.get(p.id));
  });
}
