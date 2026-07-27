// Pending "copiar hoja a otra OT" selection.
//
// The user starts a copy from inside a sheet, then picks the destination from
// the real Órdenes bandeja — with its existing filters, views and search —
// rather than a cut-down modal list. This module carries the source sheet
// across that navigation.
//
// sessionStorage, not React state: the bandeja is a separate route, so the
// sheet component unmounts on the way there. Scoped to the tab and cleared on
// use, so a stale copy can't fire later.
import type { Hoja } from "./hojas-api";

const KEY = "pangui.pendingHojaCopy";

export interface PendingHojaCopy {
  hoja: Hoja;
  sourceOrdenId: string;
}

export function setPendingHojaCopy(pending: PendingHojaCopy) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    // Private mode / storage disabled — the copy just won't carry over.
  }
}

export function getPendingHojaCopy(): PendingHojaCopy | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingHojaCopy;
    // Guard against a half-written or schema-changed entry.
    if (!parsed?.hoja?.id || !parsed?.sourceOrdenId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingHojaCopy() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
