import type { OrdenCalendarExtra } from "@/types/ordenes";

/**
 * Merges the calendar-only columns back onto list rows.
 *
 * The bandeja's workspace-wide snapshot uses a lean select that omits
 * `recurrencia_config` and the `activos` join — dead weight for the list and
 * kanban views, where users spend nearly all their time. The calendar does need
 * them, so it fetches them separately and merges here.
 *
 * Returns the SAME array reference when there is nothing to merge. Callers pass
 * the result straight into a memo dependency, so allocating a new array on every
 * render would re-render the list for no reason.
 */
export function mergeCalendarExtras<T extends { id: string }>(
  rows: T[],
  extras: Map<string, OrdenCalendarExtra> | null | undefined,
): T[] {
  if (!extras || extras.size === 0) return rows;
  return rows.map((row) => {
    const extra = extras.get(row.id);
    return extra ? { ...row, ...extra } : row;
  });
}
