import type { BorradorPayload } from "@/lib/ot-borradores-api";

/**
 * Synchronous localStorage mirror of the OT draft.
 *
 * WHY THIS EXISTS: the server draft needs a session check plus a SELECT before
 * it can hydrate the form — a few hundred ms during which the form renders
 * empty. Users read that gap as "my work was not saved". localStorage is
 * synchronous, so the mirror is available during the very first render and the
 * draft is on screen before paint.
 *
 * The database stays the source of truth: it is what survives a cleared cache
 * and what carries a draft between devices. This is a display accelerator and
 * a crash buffer, nothing more.
 */

const PREFIX = "pangui:ot-borrador";
// Bumped if BorradorPayload ever changes shape, so a stale mirror written by an
// older build is ignored instead of hydrating a form with unknown fields.
const VERSION = 1;
// Mirrors the server-side CHECK constraint; a payload past this would fail the
// upsert anyway, so there is no point mirroring it.
const MAX_BYTES = 64 * 1024;

interface Envelope {
  v: number;
  actualizado_at: string;
  payload: BorradorPayload;
}

function key(userId: string, wsId: string): string {
  return `${PREFIX}:${userId}:${wsId}`;
}

/** Reads the mirror. Returns null on anything unexpected — never throws. */
export function readLocalBorrador(
  userId: string,
  wsId: string,
): { payload: BorradorPayload; actualizado_at: string } | null {
  if (typeof window === "undefined") return null;
  if (!userId || !wsId) return null;

  try {
    const raw = window.localStorage.getItem(key(userId, wsId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Envelope;
    if (parsed?.v !== VERSION) return null;
    if (!parsed.payload || typeof parsed.payload !== "object") return null;
    if (Array.isArray(parsed.payload)) return null;

    return { payload: parsed.payload, actualizado_at: parsed.actualizado_at };
  } catch {
    // Corrupt JSON, or storage blocked (Safari private mode, quota policies).
    return null;
  }
}

/** Writes the mirror. Silently gives up if storage is unavailable or full. */
export function writeLocalBorrador(
  userId: string,
  wsId: string,
  payload: BorradorPayload,
): void {
  if (typeof window === "undefined") return;
  if (!userId || !wsId) return;

  try {
    const envelope: Envelope = {
      v: VERSION,
      actualizado_at: new Date().toISOString(),
      payload,
    };
    const serialized = JSON.stringify(envelope);
    if (serialized.length > MAX_BYTES) return;
    window.localStorage.setItem(key(userId, wsId), serialized);
  } catch {
    // QuotaExceededError or a blocked storage API. The server draft still
    // works; only the instant-hydrate optimisation is lost.
  }
}

export function clearLocalBorrador(userId: string, wsId: string): void {
  if (typeof window === "undefined") return;
  if (!userId || !wsId) return;
  try {
    window.localStorage.removeItem(key(userId, wsId));
  } catch {
    /* nothing to do */
  }
}
