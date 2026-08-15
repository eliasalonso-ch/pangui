import { parseDescMeta } from "@/lib/ordenes-api";

/**
 * ITO filtering helpers.
 *
 * "ITO" is the user-facing label; the underlying storage is still called `hito`
 * everywhere (column, descripcion meta segment, prefix). See the ITO rename note
 * — that change was label-only on purpose.
 *
 * Both helpers read the ITO out of `descripcion` via `parseDescMeta` rather than
 * the real `ordenes_trabajo.hito` column. That is deliberate:
 *
 *   - `hito` is dropped from ORDEN_BULK_SELECT as "export-only", and the bulk
 *     snapshot is exactly what the bandeja renders whenever a filter is active.
 *     Reading `o.hito` there yields undefined for every row (the type widens it
 *     to optional precisely to surface that at build time).
 *   - `descripcion` is kept in the bulk select deliberately, because OTRow
 *     already renders the ITO line out of it.
 *
 * So this needs no schema change, no wider select, and no extra egress — and the
 * filter matches exactly what the row displays.
 */

/** Normalize an ITO for comparison: trimmed, case-insensitive. */
export function normalizeIto(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * The OT's ITO in normalized form, or null when it has none.
 *
 * Returning the NORMALIZED value matters: the filter compares against a Set, so
 * both sides have to be normalized the same way or "ITO 1" and "ito 1" stop
 * matching. Callers that need the display casing should read the option list
 * from `collectItos` instead, which preserves the first-seen spelling.
 */
export function itoOf(orden: { descripcion: string | null }): string | null {
  const raw = parseDescMeta(orden.descripcion).hito;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed ? normalizeIto(trimmed) : null;
}

/**
 * The distinct ITO values present in a set of OTs, ready for the filter
 * dropdown. Sorted with `localeCompare` so numeric-ish ITOs ("ITO 2" before
 * "ITO 10") and accented text order the way a Spanish-speaking user expects.
 *
 * Values are returned in their original casing (first occurrence wins) so the
 * dropdown shows what the user typed, while matching stays case-insensitive.
 */
export function collectItos(ordenes: { descripcion: string | null }[]): string[] {
  const byNormalized = new Map<string, string>();
  for (const o of ordenes) {
    const raw = parseDescMeta(o.descripcion).hito;
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normalizeIto(trimmed);
    if (!byNormalized.has(key)) byNormalized.set(key, trimmed);
  }
  return [...byNormalized.values()].sort((a, b) =>
    a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }),
  );
}

/**
 * Does this OT belong to one of the selected ITOs?
 *
 * An empty selection matches everything (the filter is inactive), matching how
 * every other array filter in the bandeja pipeline behaves.
 */
export function matchesIto(
  orden: { descripcion: string | null },
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const hito = parseDescMeta(orden.descripcion).hito;
  if (!hito) return false;
  const key = normalizeIto(hito);
  return selected.some(s => normalizeIto(s) === key);
}
