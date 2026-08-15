import type { FiltrosState, Ubicacion } from "@/types/ordenes";
import { addDaysKey, dateKey, monthEndKey, monthStartKey } from "./date-utils";
import { matchesIto } from "./ito-filter";

/**
 * The single filter chain for the bandeja.
 *
 * WHY THIS EXISTS: this logic used to be written twice — once for the rendered
 * list and once for the tab counts (Pendientes / Completas) — and the two copies
 * drifted. The ITO filter was added to the list copy only, so rows filtered while
 * the tab counts sat unchanged. Any filter added to one copy but not the other
 * reproduces that bug, and it is invisible until someone reads the counts.
 *
 * So both call sites now go through here. A new filter is added in exactly one
 * place and both paths pick it up.
 *
 * Deliberately NOT handled here (they are not "filtros" and only one caller
 * applies each):
 *   - the tab split (pendientes vs completas)
 *   - `scope` (pendingScopeFor)
 *   - `ocultarMarcadas` — needs the per-user `marcadas` set
 *   - sorting
 *
 * Pure and dependency-free so it can be unit-tested without mounting the bandeja
 * or mocking Supabase.
 */

/** The row fields this chain reads. Both OrdenBulkItem and OrdenListItem satisfy it. */
export interface FilterableOrden {
  estado: string;
  prioridad: string;
  tipo_trabajo: string | null;
  asignados_ids: string[] | null;
  ubicacion_id: string | null;
  fecha_termino: string | null;
  descripcion: string | null;
}

export interface FilterDeps {
  /** Used to resolve sociedadIds → the ubicaciones belonging to those sociedades. */
  ubicaciones: Pick<Ubicacion, "id" | "sociedad_id">[];
  /** Ids of deactivated users, for the "de usuarios dados de baja" filter. */
  dadosDeBajaIds: Set<string>;
  /** Today as a Chile-local YYYY-MM-DD key, for the fechaVencimiento presets. */
  todayKey: string;
  /** Free-text search. Applied last, via `matchesSearch`, when non-empty. */
  search?: string;
  /**
   * Search predicate. Injected rather than imported so this module stays free of
   * the ordenes-api import chain; callers pass their existing `matchesSearch`.
   */
  matchesSearch?: (orden: FilterableOrden, query: string) => boolean;
}

export function applyFiltros<T extends FilterableOrden>(
  input: T[],
  filtros: FiltrosState,
  deps: FilterDeps,
): T[] {
  const { ubicaciones, dadosDeBajaIds, todayKey, search, matchesSearch } = deps;
  let list = input;

  if (filtros.estados.length) {
    list = list.filter(o => (filtros.estados as string[]).includes(o.estado));
  }
  if (filtros.prioridades.length) {
    list = list.filter(o => (filtros.prioridades as string[]).includes(o.prioridad));
  }
  if (filtros.tipos.length) {
    list = list.filter(o => o.tipo_trabajo != null && (filtros.tipos as string[]).includes(o.tipo_trabajo));
  }
  if (filtros.asignadoIds.length) {
    list = list.filter(o => filtros.asignadoIds.some(id => o.asignados_ids?.includes(id)));
  }
  if (filtros.ubicacionIds.length) {
    list = list.filter(o => o.ubicacion_id != null && filtros.ubicacionIds.includes(o.ubicacion_id));
  }
  if (filtros.sociedadIds.length) {
    // Match via ubicacion.sociedad_id (joined in list select)
    const ubicsBySociedad = new Set(
      ubicaciones
        .filter(u => u.sociedad_id != null && filtros.sociedadIds.includes(u.sociedad_id))
        .map(u => u.id),
    );
    list = list.filter(o => o.ubicacion_id != null && ubicsBySociedad.has(o.ubicacion_id));
  }
  if (filtros.fechaVencimiento) {
    const todayStr = todayKey;
    const tomorrowStr = addDaysKey(todayStr, 1);
    const in7Str = addDaysKey(todayStr, 7);
    const in30Str = addDaysKey(todayStr, 30);
    const monthStart = monthStartKey(todayStr);
    const monthEnd = monthEndKey(todayStr);
    list = list.filter(o => {
      const d = dateKey(o.fecha_termino);
      if (!d) return false;
      switch (filtros.fechaVencimiento) {
        case "hoy":      return d === todayStr;
        case "manana":   return d === tomorrowStr;
        case "7dias":    return d >= todayStr && d <= in7Str;
        case "30dias":   return d >= todayStr && d <= in30Str;
        case "este_mes": return d >= monthStart && d <= monthEnd;
        case "vencidas": return d < todayStr && o.estado !== "completado";
        default:         return true;
      }
    });
  }
  // ITO sale de `descripcion`, no de la columna `hito` (ver ito-filter.ts).
  if (filtros.itos.length) {
    list = list.filter(o => matchesIto(o, filtros.itos));
  }
  if (filtros.sinAsignar) {
    list = list.filter(o => !o.asignados_ids || o.asignados_ids.length === 0);
  }
  if (filtros.deUsuariosDadosDeBaja) {
    list = list.filter(o => (o.asignados_ids ?? []).some(id => dadosDeBajaIds.has(id)));
  }
  if (filtros.soloAsignados) {
    list = list.filter(o => o.asignados_ids && o.asignados_ids.length > 0);
  }
  // Search — checks title, N° OT, solicitante and description body
  if (search?.trim() && matchesSearch) {
    list = list.filter(o => matchesSearch(o, search));
  }

  return list;
}
