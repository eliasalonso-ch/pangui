import type { ProveedorListItem } from "@/types/proveedores";

/**
 * Catalogo de filtros de proveedores.
 *
 * Mismo contrato que /ordenes y /ordenes-compra. Los dos filtros salen de datos
 * que la fila ya trae, asi que filtrar no cuesta una consulta nueva.
 *
 * "Con ordenes de compra activas" quedo afuera a proposito: la lista no sabe
 * cuantas OC tiene cada proveedor, y contarlas pedia una consulta agregada por
 * cada carga de la pantalla para un filtro que casi no se usaria.
 */

export type EstadoProveedor = "activos" | "archivados";

export interface FiltrosProveedor {
  /** Vacio = solo activos, que es lo que se ve por defecto. */
  estado: EstadoProveedor[];
  /** Solo los que tienen con quien hablar (contacto, email o telefono). */
  conContacto: boolean;
}

export const EMPTY_FILTROS_PROV: FiltrosProveedor = { estado: [], conContacto: false };

export type FilterKeyProv = keyof FiltrosProveedor;

export interface FilterMetaProv {
  key: FilterKeyProv;
  label: string;
  clear: () => Partial<FiltrosProveedor>;
  count: (f: FiltrosProveedor) => number;
}

export const FILTER_META_PROV: Record<FilterKeyProv, FilterMetaProv> = {
  estado: {
    key: "estado", label: "Estado",
    clear: () => ({ estado: [] }),
    count: f => f.estado.length,
  },
  conContacto: {
    key: "conContacto", label: "Con contacto",
    clear: () => ({ conContacto: false }),
    count: f => (f.conContacto ? 1 : 0),
  },
};

export const FILTER_ORDER_PROV: FilterKeyProv[] = ["estado", "conContacto"];
export const DEFAULT_FILTER_KEYS_PROV: FilterKeyProv[] = ["estado"];

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

/**
 * Si hay que pedirle al servidor los archivados.
 *
 * La consulta filtra por `activo` del lado del servidor, asi que elegir
 * "Archivados" cambia lo que se pide, no solo lo que se muestra.
 */
export function incluyeInactivos(f: FiltrosProveedor): boolean {
  return f.estado.includes("archivados");
}

export function aplicarFiltrosProv(
  items: ProveedorListItem[],
  f: FiltrosProveedor,
): ProveedorListItem[] {
  return items.filter(p => {
    // Elegir solo "Archivados" esconde los activos; elegir los dos (o ninguno)
    // no filtra por estado.
    if (f.estado.length === 1) {
      if (f.estado[0] === "activos" && !p.activo) return false;
      if (f.estado[0] === "archivados" && p.activo) return false;
    }
    if (f.conContacto && !(p.contacto || p.email || p.telefono)) return false;
    return true;
  });
}
