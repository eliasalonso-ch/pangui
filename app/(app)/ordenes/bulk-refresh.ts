/**
 * Pure decisions for when the bandeja may refetch the workspace-wide OT snapshot.
 *
 * The snapshot (`allOrdenesForCounts`) is every parent OT in the workspace. It
 * powers the tab counts and, when a filter is active, the rendered list itself.
 * It is also the single most expensive read in the app: for a 600-OT workspace
 * it is ~600 rows, and it used to run on mount AND on the 60s poll, which is
 * what pushed Supabase egress to 3.35 GB/month.
 *
 * These helpers live outside the component so the rules are testable without
 * mounting React or mocking Supabase.
 */

/** Minimum gap between two workspace-wide snapshot fetches. */
export const BULK_MIN_INTERVAL_MS = 120_000;

/**
 * Does the workspace-wide snapshot need fetching at all?
 *
 * The server-rendered first page is capped at `pageSize`. If it came back
 * short, there is no page 2 — that page already IS the whole workspace, and
 * fetching the snapshot would re-download rows we are holding. Only when the
 * first page is full might more rows exist.
 */
export function needsBulkSnapshot(initialCount: number, pageSize: number): boolean {
  return initialCount >= pageSize;
}

/**
 * May a workspace-wide snapshot fetch run now?
 *
 * `lastFetchMs === 0` means "never fetched", which must always be allowed —
 * otherwise a session starting inside the first `minIntervalMs` of the epoch
 * would skip its only snapshot.
 */
export function shouldRefetchBulk(
  nowMs: number,
  lastFetchMs: number,
  minIntervalMs: number = BULK_MIN_INTERVAL_MS,
): boolean {
  if (lastFetchMs === 0) return true;
  return nowMs - lastFetchMs >= minIntervalMs;
}

/**
 * El set que leen los contadores y la lista: el snapshot con `ordenes` encima.
 *
 * Todos los parches (realtime, edición en el detalle, crear) caen en `ordenes`,
 * la página visible. El snapshot solo cambia cuando se vuelve a bajar entero,
 * así que leerlo crudo mostraba estados viejos — y lo único que lo arreglaba
 * era la descarga completa que disparaba cada OT creada (~7 requests y ~1000
 * filas por creación, en cada pestaña abierta del workspace). Superponer acá
 * hace innecesaria esa descarga: `ordenes` siempre es la versión más fresca de
 * las filas que tiene, y las que el snapshot aún no conoce son OTs nuevas.
 */
export function overlaySnapshot<S extends { id: string }, O extends S>(
  snapshot: S[] | null,
  ordenes: O[],
): S[] {
  if (!snapshot) return ordenes;
  const frescas = new Map(ordenes.map(o => [o.id, o]));
  const merged = snapshot.map(o => frescas.get(o.id) ?? o);
  const conocidas = new Set(snapshot.map(o => o.id));
  const nuevas = ordenes.filter(o => !conocidas.has(o.id));
  return nuevas.length ? [...nuevas, ...merged] : merged;
}

/** Holds the in-flight snapshot walk so concurrent callers share one run. */
export interface InFlightRef<T> {
  current: Promise<T> | null;
}

/**
 * Runs `start()` unless an identical run is already in flight, in which case
 * the caller joins that one.
 *
 * The snapshot walk pages through the entire workspace, so two overlapping runs
 * issue the same ~70 kB requests twice with an identical cursor. The cooldown
 * timestamp alone cannot prevent this: the mount effect and a realtime-driven
 * refresh can both pass the check before either has finished and stamped it.
 */
export function coalesce<T>(ref: InFlightRef<T>, start: () => Promise<T>): Promise<T> {
  if (ref.current) return ref.current;
  // The guard must be cleared BEFORE the returned promise settles, or a caller
  // doing `await coalesce(...)` and then calling again would still see the
  // finished run parked in `ref` and join it instead of starting a new one.
  // `token` identifies this run without the async IIFE having to close over the
  // promise it is itself producing.
  const token: { p: Promise<T> | null } = { p: null };
  const run = (async () => {
    try {
      return await start();
    } finally {
      if (ref.current === token.p) ref.current = null;
    }
  })();
  token.p = run;
  ref.current = run;
  return run;
}
