import type { OrdenCompraListItem } from "@/types/ordenes-compra";
import { desdeDePreset, type FiltrosOC } from "./filter-registry";

/**
 * Aplica los filtros a la lista cargada.
 *
 * Del lado del cliente y no en la consulta a proposito: la lista ya vive en
 * memoria pagina por pagina, y filtrar en el servidor obligaria a re-pedir todo
 * con cada click de un chip. Es el mismo reparto que usa la bandeja de OT.
 */
export function aplicarFiltrosOC(
  items: OrdenCompraListItem[],
  f: FiltrosOC,
): OrdenCompraListItem[] {
  const desde = f.fecha ? desdeDePreset(f.fecha).getTime() : null;

  return items.filter(oc => {
    if (f.estados.length > 0 && !f.estados.includes(oc.estado)) return false;

    if (f.proveedorIds.length > 0) {
      if (!oc.proveedor_id || !f.proveedorIds.includes(oc.proveedor_id)) return false;
    }

    // Coincide si la OC toca CUALQUIERA de los materiales elegidos: elegir dos
    // materiales pregunta "OCs que traigan alguno de estos", no "que traigan
    // los dos".
    if (f.parteIds.length > 0) {
      if (!oc.parte_ids.some(id => f.parteIds.includes(id))) return false;
    }

    if (desde !== null) {
      if (!oc.created_at || new Date(oc.created_at).getTime() < desde) return false;
    }

    return true;
  });
}

/** Búsqueda por texto: "#12" y "12" van al correlativo exacto. */
export function aplicarBusquedaOC(
  items: OrdenCompraListItem[],
  search: string,
): OrdenCompraListItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  const soloDigitos = q.replace(/^#/, "");
  const esNumero = /^\d+$/.test(soloDigitos);
  return items.filter(oc =>
    (esNumero && oc.numero === Number(soloDigitos)) ||
    (oc.numero_manual ?? "").toLowerCase().includes(q) ||
    (oc.proveedor_nombre ?? "").toLowerCase().includes(q));
}
