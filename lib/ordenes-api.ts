import { createClient } from "@/lib/supabase";
import { withSupabaseAuthRetry } from "@/lib/supabase-auth-retry";
import { ensureOtCategoria } from "@/lib/cuotas-client";
import type {
  OrdenTrabajo, OrdenListItem, OrdenBulkItem, OrdenCalendarExtra, ActividadOT, ActividadTipo,
  Estado, Prioridad, TipoTrabajo, ClasificacionOT, Recurrencia, RecurrenciaConfig, OTLink,
} from "@/types/ordenes";
import {
  notifyOTCreada,
  notifyOTEstadoCambiado,
} from "@/lib/notificar";
import {
  WORK_ORDER_COMMANDS_V1_ENABLED,
  createWorkOrderV1,
  editWorkOrderV1,
  transitionWorkOrderV1,
  type WorkOrderActionV1,
} from "@/lib/work-orders/commands-v1";
import { getWorkOrderRolloutV1 } from "@/lib/work-orders/rollout-v1";
import { getPerfilUsuario } from "@/lib/perfil-usuario";

// ITOs (inspector milestones) is an Electrilam-exclusive feature — the ITO field
// is shown only for this workspace. Mirrors the mobile gate in constants/index.ts.
// ponytail: single-tenant gate, promote to a workspaces feature-flag column if a
// second workspace ever needs it.
export const ELECTRILAM_WORKSPACE_ID = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

// ── Desc-meta helpers ─────────────────────────────────────────────────────────

export interface DescMeta {
  nOT:            string | null;
  solicitante:    string | null;
  hito:           string | null;
  ubicacionTexto: string | null;
  lugar:          string | null;
  descripcion:    string | null;
}

export function parseDescMeta(raw: string | null): DescMeta {
  const empty: DescMeta = { nOT: null, solicitante: null, hito: null, ubicacionTexto: null, lugar: null, descripcion: null };
  if (!raw) return empty;
  const parts = raw.split("\n\n");
  const firstLine = parts[0];
  const rest = parts.slice(1).join("\n\n") || null;
  const hasMeta =
    firstLine.includes("N° OT: ") ||
    firstLine.includes("Solicitante: ") ||
    firstLine.includes("Hito: ") ||
    firstLine.includes("Ubicación: ") ||
    firstLine.includes("Lugar: ");
  if (!hasMeta) return { ...empty, descripcion: raw };
  const result: DescMeta = { ...empty, descripcion: rest };
  firstLine.split(" | ").forEach(seg => {
    if (seg.startsWith("N° OT: "))      result.nOT = seg.slice("N° OT: ".length);
    if (seg.startsWith("Solicitante: "))result.solicitante = seg.slice("Solicitante: ".length);
    if (seg.startsWith("Hito: "))       result.hito = seg.slice("Hito: ".length);
    if (seg.startsWith("Ubicación: "))  result.ubicacionTexto = seg.slice("Ubicación: ".length);
    if (seg.startsWith("Lugar: "))      result.lugar = seg.slice("Lugar: ".length);
  });
  return result;
}

export function buildDescripcion(opts: {
  nOT: string;
  solicitante: string;
  hito: string;
  body: string;
}): string {
  const segs: string[] = [];
  if (opts.nOT.trim())          segs.push(`N° OT: ${opts.nOT.trim()}`);
  if (opts.solicitante.trim())  segs.push(`Solicitante: ${opts.solicitante.trim()}`);
  if (opts.hito.trim())         segs.push(`Hito: ${opts.hito.trim()}`);
  const header = segs.join(" | ");
  const body = opts.body.trim();
  if (header && body) return `${header}\n\n${body}`;
  if (header) return header;
  return body;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcProximaEjecucion(recurrencia: Recurrencia, fechaBase?: string | null, config?: RecurrenciaConfig | null): string | null {
  if (recurrencia === "ninguna") return null;
  const d = fechaBase ? new Date(`${fechaBase.slice(0, 10)}T12:00:00`) : new Date();
  const interval = Math.max(1, Number(config?.interval ?? 1));
  const weekdays = config?.weekdays ?? [];
  switch (recurrencia) {
    case "diaria":
      d.setDate(d.getDate() + 1);
      if (weekdays.length) while (!weekdays.includes(d.getDay())) d.setDate(d.getDate() + 1);
      else d.setDate(d.getDate() + interval - 1);
      break;
    case "semanal":
      if (weekdays.length) {
        const delta = (weekdays[0] - d.getDay() + 7) % 7;
        d.setDate(d.getDate() + (delta === 0 ? interval * 7 : delta + (interval - 1) * 7));
      } else d.setDate(d.getDate() + interval * 7);
      break;
    case "quincenal": d.setDate(d.getDate() + 15); break;
    case "mensual":
    case "mensual_fecha":
    case "mensual_dia": {
      const day = Math.min(31, Math.max(1, Number(config?.day_of_month ?? config?.month_day ?? d.getDate())));
      d.setMonth(d.getMonth() + interval, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(day, lastDay));
      break;
    }
    case "anual":     d.setFullYear(d.getFullYear() + interval); break;
    case "personalizada":
      if (config?.unit === "week") {
        if (weekdays.length) {
          const delta = (weekdays[0] - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + (delta === 0 ? interval * 7 : delta + (interval - 1) * 7));
        } else d.setDate(d.getDate() + interval * 7);
      } else if (config?.unit === "month") {
        const day = Math.min(31, Math.max(1, Number(config?.day_of_month ?? config?.month_day ?? d.getDate())));
        d.setDate(1); d.setMonth(d.getMonth() + interval);
        d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      } else if (config?.unit === "year") d.setFullYear(d.getFullYear() + interval);
      else d.setDate(d.getDate() + interval);
      break;
  }
  return d.toISOString();
}

// ── Select fragments ──────────────────────────────────────────────────────────

export const ORDEN_SELECT = `
  id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, clasificacion,
  fecha_inicio, fecha_termino, created_at, updated_at,
  creado_por, asignados_ids, workspace_id,
  n_serie, solicitante, solicitante_telefono, solicitante_email, hito, presupuesto,
  numero, categoria_id, categoria_ids, ubicacion_id, activo_id, lugar_id, sociedad_id,
  iniciado_at, pausado_at, en_ejecucion, tiempo_total_segundos,
  recurrencia, recurrencia_config, proxima_ejecucion, recurrencia_origen_id, recurrencia_iteracion, parent_id,
  requiere_materiales, requiere_hoja, requiere_fotos,
  cierre_forzado, cierre_forzado_motivo, cierre_forzado_por, cierre_forzado_at,
  imagen_url, fotos_urls, links,
  activos (id, nombre),
  ubicaciones (id, edificio, detalle, sociedad_id, sociedades(nombre)),
  lugar:lugares!lugar_id(id, nombre, imagen_url),
  sociedad:sociedades!sociedad_id(id, nombre, imagen_url),
  categorias_ot (id, nombre, icono, color),
  creador:usuarios!creado_por (id, nombre)
`;

export const LIST_SELECT = `
  id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, clasificacion,
  fecha_inicio, fecha_termino, recurrencia, recurrencia_config, proxima_ejecucion,
  recurrencia_origen_id, recurrencia_iteracion, created_at, updated_at,
  n_serie, solicitante, hito,
  categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids,
  numero, parent_id,
  iniciado_at, en_ejecucion, tiempo_total_segundos,
  completado_en,
  categorias_ot (nombre, icono, color),
  ubicaciones (edificio, detalle),
  lugar:lugares (nombre),
  activos (nombre)
`;

/**
 * Lean select for the workspace-wide snapshot that feeds the tab counts and,
 * when a filter is active, the rendered list. Same shape the bandeja draws,
 * minus what only the export, the calendar and the OT detail read.
 *
 * Dropped vs LIST_SELECT:
 *   - categorias_ot / activos joins → no OTRow or KanbanView reader
 *   - recurrencia_config (jsonb)    → CalendarView only, fetched on demand via
 *                                     ORDEN_CALENDAR_EXTRA_SELECT
 *   - tipo, n_serie, hito, solicitante, recurrencia_iteracion, updated_at
 *                                   → export-only (export keeps LIST_SELECT)
 *
 * KEPT deliberately — do not "optimize" these away:
 *   - descripcion → OTRow renders the N° OT chip and the ITO line out of it via
 *     parseDescMeta, and matchesSearch reads it during the search debounce,
 *     before server results land.
 *   - ubicaciones (edificio, detalle) → OTRow's location chip, the kanban card,
 *     and the `sort === "ubicacion"` comparator.
 *   - completado_en → the "Completadas recientemente" sort. This select feeds
 *     the rendered list whenever a filter is active, so dropping it would make
 *     that order silently collapse to "sin fecha" for every row.
 *
 * Mirrors ORDEN_LIST_SELECT in mobile's features/work-orders/api.ts.
 */
export const ORDEN_BULK_SELECT = `
  id, titulo, descripcion, estado, prioridad, tipo_trabajo, clasificacion,
  fecha_inicio, fecha_termino, recurrencia, proxima_ejecucion,
  recurrencia_origen_id, created_at,
  categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids,
  numero, parent_id,
  iniciado_at, en_ejecucion, tiempo_total_segundos,
  completado_en,
  ubicaciones (edificio, detalle)
`;

/** Calendar-only columns, merged onto bulk rows when the calendar opens. */
export const ORDEN_CALENDAR_EXTRA_SELECT = `
  id, recurrencia_config, activos (nombre)
`;

// ── Fetch ─────────────────────────────────────────────────────────────────────

// Page size deliberately kept small.
//
// WHY: past a threshold the planner estimates it will touch most of the
// workspace's rows anyway, so it abandons the ordered partial index
// (idx_ordenes_trabajo_active), scans via idx_ordenes_trabajo_workspace_id and
// top-N heapsorts the result. Staying under the threshold keeps the Index Scan
// + Memoize plan, which reads only the rows it returns.
//
// CAVEAT on the numbers below: the original measurements here were taken while
// the database had NO planner statistics (see the note on ANALYZE further
// down), so they overstated the penalty — most of that "planning cost" was
// missing stats, not the index count. Re-measured 2026-08-20 with correct
// statistics, on 678 parent OTs:
//
//   LIMIT 150 -> heapsort, reads all 667 : plan 27ms  + exec 88ms (cold cache)
//   LIMIT 100 -> heapsort, reads all 667 : plan  2.4ms + exec  1.5ms
//   LIMIT  50 -> Index Scan + Memoize    : plan  2.4ms + exec  0.4ms
//
// So the cliff now sits between 50 and 100, NOT between 150 and 300. Note the
// heapsort plan is still fast in absolute terms once the cache is warm — it
// reads the whole workspace either way, and at this table size that is cheap.
//
// 20 matches the infinite-scroll increment, so the first paint fetches exactly
// one screenful and the rest stream in on scroll. Re-measure with
// EXPLAIN (ANALYZE) before changing it — and confirm `last_analyze` is not
// NULL first, or you will be measuring the planner's ignorance, not the query.
export const ORDENES_PAGE_SIZE = 20;

/**
 * Page size for the workspace-wide snapshot (tab counts + filtered lists).
 *
 * Deliberately LARGER than ORDENES_PAGE_SIZE. These are two different jobs:
 * the rendered list wants a small first paint (20) because the user only sees
 * a screenful, but the snapshot must walk EVERY parent OT, so a small page
 * turns one job into ~33 sequential round-trips, each paying its own planner
 * cost and network latency.
 *
 * 150 is kept for the ROUND-TRIP count (~5 requests for the whole workspace),
 * not because it wins on plan shape. Re-measured 2026-08-20 with correct
 * statistics: at 150 the planner reads all 667 rows and heapsorts rather than
 * walking the ordered index — the cliff moved below 150 once the planner knew
 * the real row counts (see ORDENES_PAGE_SIZE). That plan still executes in
 * ~1.5ms warm, so trading it for ~10x more round-trips would be a net loss.
 *
 * Do not raise this to 300 without re-measuring: beyond the plan shape, the
 * payload itself grows and this query feeds the egress budget.
 */
export const ORDENES_BULK_PAGE_SIZE = 150;

/**
 * Restricted visibility: which user id (if any) OT queries must be filtered to.
 *
 * A `member` with `solo_asignadas = true` only sees the OTs they are assigned
 * to. RLS does NOT enforce this — `ordenes_select` scopes by workspace only —
 * so every client-side read has to apply it, exactly as the mobile app does in
 * features/work-orders/hooks.ts.
 *
 * Returns `null` when the caller sees everything (owner, admin, or a member
 * without the flag). Cached per session because it is consulted on every list
 * query; call `resetVisibilidadCache()` after changing a user's own flag.
 */
let visibilidadCache: { userId: string | null } | null = null;
// La consulta en vuelo, no solo su resultado. Antes se cacheaba unicamente al
// final: dos llamadas concurrentes (el dashboard pide el perfil y la
// visibilidad a la vez) veian `visibilidadCache === null` las dos y disparaban
// cada una su propio getUser() + select a `usuarios`. En el HAR del 2026-08-19
// eso salia como la misma consulta duplicada, con dos preflight CORS aparte.
let visibilidadEnVuelo: Promise<string | null> | null = null;

export function resetVisibilidadCache() {
  visibilidadCache = null;
  visibilidadEnVuelo = null;
}

/**
 * @param userId - id ya conocido del usuario, para ahorrarse un `auth.getUser()`
 *   de ida y vuelta. Quien ya llamo a getUser() deberia pasarlo; omitirlo sigue
 *   funcionando igual.
 */
export async function getSoloAsignadasUserId(userId?: string): Promise<string | null> {
  if (visibilidadCache) return visibilidadCache.userId;
  if (visibilidadEnVuelo) return visibilidadEnVuelo;

  visibilidadEnVuelo = (async () => {
    // `rol` y `solo_asignadas` viven en la misma fila que ya trae
    // getPerfilUsuario() para la topbar, el sidebar y el tablero: pedirla
    // aparte era una quinta consulta al mismo id, con su preflight.
    const data = await getPerfilUsuario();
    const id = userId ?? data?.id;
    if (!id) return null;

    // Only `member` is ever restricted. Owners/admins always see everything, and
    // a missing row must not accidentally hide a user's own work.
    const restricted = data?.rol === "member" && data?.solo_asignadas === true;
    visibilidadCache = { userId: restricted ? id : null };
    return visibilidadCache.userId;
  })();

  try {
    return await visibilidadEnVuelo;
  } finally {
    // Se limpia siempre: si fallo, la proxima llamada reintenta en vez de
    // quedarse pegada a una promesa rechazada. Si funciono, `visibilidadCache`
    // ya responde y esta promesa deja de hacer falta.
    visibilidadEnVuelo = null;
  }
}

/**
 * Applies the assigned-only filter to an ordenes_trabajo query builder.
 *
 * Typed loosely on purpose: PostgREST's builder generics differ per select
 * shape, and spelling them out here would force every caller to thread its own
 * row type through for no added safety.
 */
function aplicarVisibilidad<T extends { contains: (col: string, val: unknown[]) => T }>(
  query: T,
  userId: string | null,
): T {
  return userId ? query.contains("asignados_ids", [userId]) : query;
}

export async function fetchOrdenesPage(wsId: string, beforeCreatedAt?: string | null): Promise<OrdenListItem[]> {
  const soloAsignadas = await getSoloAsignadasUserId();
  const runQuery = () => {
    const sb = createClient();
    let query = sb
      .from("ordenes_trabajo")
      .select(LIST_SELECT)
      .eq("workspace_id", wsId)
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ORDENES_PAGE_SIZE);

    query = aplicarVisibilidad(query, soloAsignadas);
    if (beforeCreatedAt) query = query.lt("created_at", beforeCreatedAt);
    return query;
  };

  const { data, error } = await withSupabaseAuthRetry(runQuery);
  if (error) throw error;
  return (data ?? []) as unknown as OrdenListItem[];
}

// Max rows a text search returns. A query matching more than this is too broad;
// the UI nudges the user to refine rather than paginating search results.
export const ORDENES_SEARCH_LIMIT = 300;

// Server-side text search across the workspace's parent OTs — so search finds
// any matching OT regardless of what the infinite-scroll list has loaded.
// Matches titulo, descripcion (which embeds "N° OT:"/"Solicitante:" meta), and
// the solicitante column — the same fields the old in-memory search covered.
/**
 * Parses an OT-number query. The UI shows work orders as "#123", so a search
 * starting with `#` (or one that is nothing but digits) is an explicit lookup
 * by `numero` rather than a text match.
 *
 * Returns null when the query isn't a number lookup, so callers fall through
 * to the normal text search.
 */
export function parseOrdenNumeroQuery(rawQuery: string): number | null {
  const q = rawQuery.trim();
  if (!q) return null;
  const body = q.startsWith("#") ? q.slice(1).trim() : q;
  // Bare digits only — "#12a" or "12 bombas" stay text searches.
  if (!/^\d+$/.test(body)) return null;
  const n = Number(body);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Client-side counterpart to `searchOrdenes`, used to re-filter already-loaded
 * rows (tab counts, the visible list) with the same rules the server applies.
 *
 * Matches on OT number when the query looks like "#123"/"123", otherwise on
 * título, N° OT text, solicitante and description body.
 */
export function matchesSearch(
  o: {
    titulo?: string | null;
    numero?: number | null;
    descripcion?: string | null;
    solicitante?: string | null;
    ubicaciones?: { edificio?: string | null; detalle?: string | null } | null;
    lugar?: { nombre?: string | null } | null;
    activos?: { nombre?: string | null } | null;
    categorias_ot?: { nombre?: string | null } | null;
  },
  rawQuery: string,
): boolean {
  const raw = rawQuery.trim();
  if (!raw) return true;

  const numero = parseOrdenNumeroQuery(raw);
  if (numero !== null) {
    if (o.numero === numero) return true;
    // "#123" is an explicit number lookup: never fall back to text.
    if (raw.startsWith("#")) return false;
  }

  const q = raw.replace(/\s+/g, " ").toLowerCase();
  const hit = (v: string | null | undefined) => (v ?? "").toLowerCase().includes(q);

  if (hit(o.titulo)) return true;
  // Related records — must mirror the field list in search_ordenes_v1() or the
  // pre-server-response filtering will disagree with the server's results.
  if (
    hit(o.ubicaciones?.edificio) ||
    hit(o.ubicaciones?.detalle) ||
    hit(o.lugar?.nombre) ||
    hit(o.activos?.nombre) ||
    hit(o.categorias_ot?.nombre)
  ) {
    return true;
  }

  const meta = parseDescMeta(o.descripcion ?? null);
  return (
    hit(meta.nOT) ||
    hit(meta.solicitante) ||
    hit(o.solicitante) ||
    hit(meta.descripcion)
  );
}

export async function searchOrdenes(wsId: string, rawQuery: string): Promise<OrdenListItem[]> {
  const q = rawQuery.trim();
  if (!q) return [];
  const soloAsignadas = await getSoloAsignadasUserId();

  // "#123" / "123" → exact lookup by OT number.
  const numero = parseOrdenNumeroQuery(q);
  if (numero !== null) {
    const sbNum = createClient();
    const numQuery = sbNum
      .from("ordenes_trabajo")
      .select(LIST_SELECT)
      .eq("workspace_id", wsId)
      .eq("numero", numero)
      .is("parent_id", null)
      .is("deleted_at", null);
    const { data, error } = await aplicarVisibilidad(numQuery, soloAsignadas)
      .limit(ORDENES_SEARCH_LIMIT);
    if (error) throw error;
    const rows = (data ?? []) as unknown as OrdenListItem[];
    // An explicit "#123" that matches nothing should report "no results"
    // rather than silently falling back to a fuzzy text search for "123".
    if (q.startsWith("#") || rows.length > 0) return rows;
    // A bare number with no numero hit may still be text (e.g. "500" in
    // "Victoria 500"), so continue into the text search below.
  }
  // Text search runs through the search_ordenes_v1 RPC rather than a PostgREST
  // `.or()`. WHY: `.or()` can only filter columns physically on
  // ordenes_trabajo, so ubicacion / lugar / activo / categoria -- which live
  // behind FKs -- were unsearchable. Users searching a building or a floor got
  // zero results. The function joins those tables and matches in SQL.
  //
  // Visibility is NOT passed in: the function derives the caller's workspace
  // and the solo_asignadas rule from auth.uid() itself, since SECURITY DEFINER
  // bypasses RLS and a client-supplied workspace_id can't be trusted.
  const sb = createClient();
  // `.select("id")`: la funcion devuelve SETOF ordenes_trabajo, o sea la fila
  // COMPLETA -- descripcion incluida -- y aca abajo solo se usan los ids. Sin
  // esto, buscar "lum" transferia 370 KB de JSON para quedarse con 147 UUIDs
  // (130 KB crudos en la base contra 2,3 KB de ids). PostgREST admite proyectar
  // sobre una RPC que retorna SETOF de una tabla, asi que el recorte ocurre en
  // el servidor y no viaja lo que no se usa.
  const { data, error } = await sb.rpc("search_ordenes_v1", {
    p_workspace_id: wsId,
    p_query: q,
    p_limit: ORDENES_SEARCH_LIMIT,
  }).select("id");
  if (error) throw error;
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  if (!ids.length) return [];

  // The RPC returns bare ordenes_trabajo rows; re-select through LIST_SELECT so
  // results carry the same joined shape (ubicaciones, lugar, activos,
  // categorias_ot) the bandeja renders. RLS applies normally on this read.
  const { data: rows, error: rowsErr } = await sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .in("id", ids)
    .order("created_at", { ascending: false });
  if (rowsErr) throw rowsErr;
  return (rows ?? []) as unknown as OrdenListItem[];
}

export async function fetchOrdenes(wsId: string): Promise<OrdenListItem[]> {
  return fetchOrdenesPage(wsId);
}

// Fetches EVERY parent OT for the workspace by paging through with the same
// keyset (created_at) the bandeja uses. Exports must serialize the full server
// set — not the in-memory paginated list — or they silently drop orders the
// user never scrolled far enough to load (e.g. older completadas).
export async function fetchAllOrdenesForExport(
  wsId: string,
  firstPage?: OrdenListItem[],
): Promise<OrdenListItem[]> {
  return pageThroughAll<OrdenListItem>(
    (before) => fetchOrdenesPage(wsId, before),
    firstPage,
  );
}

/**
 * Walks a keyset-paginated OT query to completion, de-duplicating by id.
 *
 * Shared by the export fetch and the workspace-wide snapshot so the cursor,
 * dedupe and runaway-loop ceiling live in exactly one place. `firstPage` lets a
 * caller donate rows it already holds (the SSR page) instead of re-fetching
 * them — a short first page means there is no page 2 at all.
 */
export async function pageThroughAll<T extends { id: string; created_at: string }>(
  fetchPage: (before: string | null) => Promise<T[]>,
  firstPage?: T[],
  // Must match the limit `fetchPage` actually uses: a short page is how this
  // detects the last page, so a mismatch either stops early (dropping rows) or
  // fires one pointless extra request.
  pageSize: number = ORDENES_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  let before: string | null = null;
  if (firstPage) {
    for (const row of firstPage) {
      if (!seen.has(row.id)) { seen.add(row.id); all.push(row); }
    }
    if (firstPage.length < pageSize) return all;
    before = firstPage.at(-1)?.created_at ?? null;
  }
  // Hard ceiling so a bad cursor can never loop forever.
  for (let page = 0; page < 100; page++) {
    const rows: T[] = await fetchPage(before);
    for (const r of rows) {
      if (!seen.has(r.id)) { seen.add(r.id); all.push(r); }
    }
    if (rows.length < pageSize) break; // last page
    before = rows[rows.length - 1]?.created_at ?? null;
    if (!before) break;
  }
  return all;
}

/** One page of the lean workspace snapshot. Mirrors fetchOrdenesPage's keyset. */
async function fetchOrdenesBulkPage(
  wsId: string,
  beforeCreatedAt?: string | null,
): Promise<OrdenBulkItem[]> {
  const soloAsignadas = await getSoloAsignadasUserId();
  const runQuery = () => {
    const sb = createClient();
    let query = sb
      .from("ordenes_trabajo")
      .select(ORDEN_BULK_SELECT)
      .eq("workspace_id", wsId)
      .is("parent_id", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(ORDENES_BULK_PAGE_SIZE);

    query = aplicarVisibilidad(query, soloAsignadas);
    if (beforeCreatedAt) query = query.lt("created_at", beforeCreatedAt);
    return query;
  };

  const { data, error } = await withSupabaseAuthRetry(runQuery);
  if (error) throw error;
  return (data ?? []) as unknown as OrdenBulkItem[];
}

/**
 * Every parent OT in the workspace, in the lean bulk shape.
 *
 * Drives the tab counts and the filtered list. This is the app's most expensive
 * read — call it only when workspace membership actually changed (create,
 * realtime INSERT, an UPDATE for a row outside the loaded page), never on the
 * periodic poll.
 */
export async function fetchAllOrdenesBulk(
  wsId: string,
  // NOTE: intentionally ignored. Callers pass the rendered list's first page,
  // which is fetched at ORDENES_PAGE_SIZE (20) — but this walk pages at
  // ORDENES_BULK_PAGE_SIZE (150), and pageThroughAll uses "short page = last
  // page" to terminate. Seeding a 20-row page into a 150-row walk would end the
  // walk immediately and silently return ~20 of 653 OTs, corrupting the tab
  // counts. The parameter is kept so the call sites stay unchanged.
  _firstPage?: OrdenBulkItem[],
): Promise<OrdenBulkItem[]> {
  return pageThroughAll<OrdenBulkItem>(
    (before) => fetchOrdenesBulkPage(wsId, before),
    undefined,
    ORDENES_BULK_PAGE_SIZE,
  );
}

/**
 * The columns CalendarView needs that the bulk select omits, keyed by OT id.
 *
 * Only recurrent OTs and OTs with an activo can contribute anything, so the
 * query narrows to those; every other row keeps its null/undefined defaults,
 * which is exactly what the calendar already renders for them.
 */
export async function fetchOrdenesCalendarExtras(
  wsId: string,
): Promise<Map<string, OrdenCalendarExtra>> {
  const soloAsignadas = await getSoloAsignadasUserId();
  const runQuery = () => {
    const sb = createClient();
    const query = sb
      .from("ordenes_trabajo")
      .select(ORDEN_CALENDAR_EXTRA_SELECT)
      .eq("workspace_id", wsId)
      .is("parent_id", null)
      .is("deleted_at", null)
      .or("recurrencia.neq.ninguna,activo_id.not.is.null");
    return aplicarVisibilidad(query, soloAsignadas);
  };

  const { data, error } = await withSupabaseAuthRetry(runQuery);
  if (error) throw error;
  const rows = (data ?? []) as unknown as (OrdenCalendarExtra & { id: string })[];
  return new Map(rows.map((r) => [r.id, { recurrencia_config: r.recurrencia_config, activos: r.activos }]));
}

// Fetches a SINGLE OT in the list-row shape (LIST_SELECT, joins intact). Used
// when a realtime UPDATE arrives: the raw payload.new only carries the OT's own
// columns, so blind-merging it would wipe the joined relations (categorias_ot,
// ubicaciones, activos) and could flip a filtered field with a stale shape.
// Refetching keeps the row correct so it stays / leaves the filter accurately.
export async function fetchOrdenListItem(id: string): Promise<OrdenListItem | null> {
  const sb = createClient();
  // Realtime INSERT/UPDATE events arrive for the whole workspace, so this is
  // filtered too — otherwise a restricted member's list would gain rows they
  // are not assigned to as other people's OTs changed.
  const soloAsignadas = await getSoloAsignadasUserId();
  const base = sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .eq("id", id)
    .is("deleted_at", null);
  const { data, error } = await aplicarVisibilidad(base, soloAsignadas).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as OrdenListItem | null;
}

export async function fetchOrden(id: string): Promise<OrdenTrabajo | null> {
  const sb = createClient();
  // Filtered like the list: otherwise a restricted member could open any OT in
  // the workspace by pasting its id into the URL, since RLS only scopes by
  // workspace. Returns null (→ "no encontrada") rather than the row.
  const soloAsignadas = await getSoloAsignadasUserId();
  const base = sb
    .from("ordenes_trabajo")
    .select(ORDEN_SELECT)
    .eq("id", id);
  const { data, error } = await aplicarVisibilidad(base, soloAsignadas).maybeSingle();
  if (error) throw error;
  return data as unknown as OrdenTrabajo | null;
}

export async function fetchSubOrdenes(parentId: string): Promise<OrdenTrabajo[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(ORDEN_SELECT)
    .eq("parent_id", parentId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OrdenTrabajo[];
}

export async function fetchActividad(ordenId: string): Promise<ActividadOT[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("actividad_ot")
    .select("id, orden_id, tipo, comentario, foto_url, audio_url, usuario_id, created_at, usuario:usuarios!usuario_id(id, nombre)")
    .eq("orden_id", ordenId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ActividadOT[];
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createOrden(payload: {
  workspaceId: string;
  creadoPor: string;
  titulo: string;
  descripcion?: string;
  n_serie?: string | null;
  solicitante?: string | null;
  solicitante_telefono?: string | null;
  solicitante_email?: string | null;
  hito?: string | null;
  presupuesto?: string | null;
  prioridad: Prioridad;
  tipo_trabajo: TipoTrabajo | "";
  clasificacion?: ClasificacionOT | null;
  categoria_id?: string | null;
  categoria_ids?: string[] | null;
  recurrencia?: Recurrencia;
  recurrencia_config?: RecurrenciaConfig | null;
  ubicacion_id?: string | null;
  lugar_id?: string | null;
  sociedad_id?: string | null;
  activo_id?: string | null;
  asignados_ids?: string[] | null;
  fecha_inicio?: string | null;
  fecha_termino?: string | null;
  links?: OTLink[];
}): Promise<OrdenTrabajo> {
  const sb = createClient();
  const recurrencia = payload.recurrencia ?? "ninguna";
  const recurrencia_config = recurrencia === "ninguna" ? null : (payload.recurrencia_config ?? null);
  const proxima_ejecucion = calcProximaEjecucion(recurrencia, payload.fecha_inicio, recurrencia_config);

  // Quota gate: count OTs that are preventivas or recurrentes ("repetitivas").
  const esRepetitiva = recurrencia !== "ninguna" || payload.tipo_trabajo === "preventiva";
  if (esRepetitiva) {
    await ensureOtCategoria("repetitivas", "OT repetitivas");
  }

  if (WORK_ORDER_COMMANDS_V1_ENABLED) {
    const rollout = await getWorkOrderRolloutV1();
    if (rollout.create_enabled && !rollout.kill_switch) {
      const result = await createWorkOrderV1({
        contract_version: 1,
        command_id: crypto.randomUUID(),
        workspace_id: payload.workspaceId,
        actor_id: payload.creadoPor,
        payload: {
          titulo: payload.titulo,
          descripcion: payload.descripcion,
          n_serie: payload.n_serie,
          solicitante: payload.solicitante,
          solicitante_telefono: payload.solicitante_telefono,
          solicitante_email: payload.solicitante_email,
          hito: payload.hito,
          presupuesto: payload.presupuesto,
          prioridad: payload.prioridad,
          tipo_trabajo: payload.tipo_trabajo || "reactiva",
          clasificacion: payload.clasificacion,
          categoria_id: payload.categoria_id,
          categoria_ids: payload.categoria_ids,
          recurrencia,
          recurrencia_config,
          ubicacion_id: payload.ubicacion_id,
          lugar_id: payload.lugar_id,
          sociedad_id: payload.sociedad_id,
          activo_id: payload.activo_id,
          asignados_ids: payload.asignados_ids,
          fecha_inicio: payload.fecha_inicio,
          fecha_termino: payload.fecha_termino,
          links: payload.links?.filter((link) => link.url.trim()) ?? [],
        },
      });
      return result.data.work_order;
    }
  }

  const { data: ws } = await sb
    .from("workspaces")
    .select("requiere_materiales_global, requiere_hoja_global, requiere_fotos_global, fotos_obligatorias_todas")
    .eq("id", payload.workspaceId)
    .maybeSingle();

  const { data, error } = await sb
    .from("ordenes_trabajo")
    .insert({
      workspace_id:       payload.workspaceId,
      creado_por:         payload.creadoPor,
      titulo:             payload.titulo,
      descripcion:        payload.descripcion ?? "",
      ...(payload.n_serie?.trim()      ? { n_serie:      payload.n_serie.trim()      } : {}),
      ...(payload.solicitante?.trim()  ? { solicitante:  payload.solicitante.trim()  } : {}),
      ...(payload.solicitante_telefono?.trim() ? { solicitante_telefono: payload.solicitante_telefono.trim() } : {}),
      ...(payload.solicitante_email?.trim()    ? { solicitante_email:    payload.solicitante_email.trim()    } : {}),
      ...(payload.hito?.trim()         ? { hito:         payload.hito.trim()         } : {}),
      ...(payload.presupuesto?.trim()  ? { presupuesto:  payload.presupuesto.trim()  } : {}),
      tipo:               "solicitud",
      tipo_trabajo:       payload.tipo_trabajo || "reactiva",
      clasificacion:      payload.clasificacion ?? (payload.tipo_trabajo === "levantamiento" ? "levantamiento" : "ejecucion"),
      estado:             "pendiente",
      prioridad:          payload.prioridad,
      recurrencia,
      recurrencia_config,
      proxima_ejecucion,
      recurrencia_iteracion: recurrencia !== "ninguna" ? 1 : null,
      estado_cobro:       "no_cobrable",
      requiere_materiales: ws?.requiere_materiales_global ?? false,
      requiere_hoja:       ws?.requiere_hoja_global ?? false,
      // fotos_obligatorias_todas is the workspace mandate; requiere_fotos_global
      // is a softer "default on". Either one seeds the new OT's flag — admins
      // can still override per-OT from the detail panel.
      requiere_fotos:      (ws?.fotos_obligatorias_todas ?? false) || (ws?.requiere_fotos_global ?? false),
      ...(payload.categoria_id  ? { categoria_id:  payload.categoria_id  } : {}),
      ...(payload.categoria_ids?.length ? { categoria_ids: payload.categoria_ids } : {}),
      ...(payload.ubicacion_id  ? { ubicacion_id:  payload.ubicacion_id  } : {}),
      ...(payload.lugar_id      ? { lugar_id:      payload.lugar_id      } : {}),
      ...(payload.sociedad_id   ? { sociedad_id:   payload.sociedad_id   } : {}),
      ...(payload.activo_id     ? { activo_id:     payload.activo_id     } : {}),
      ...(payload.asignados_ids?.length ? { asignados_ids: payload.asignados_ids } : {}),
      ...(payload.fecha_inicio  ? { fecha_inicio:  payload.fecha_inicio  } : {}),
      ...(payload.fecha_termino ? { fecha_termino: payload.fecha_termino } : {}),
      links: payload.links?.filter(l => l.url.trim()) ?? [],
    })
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;
  const orden = data as unknown as OrdenTrabajo;

  await insertActividad(orden.id, payload.creadoPor, "creado", payload.titulo);
  if (payload.asignados_ids?.length) {
    await insertActividad(orden.id, payload.creadoPor, "asignado", payload.asignados_ids.join(","));
  }

  notifyOTCreada({
    workspaceId: payload.workspaceId,
    ordenId: orden.id,
    titulo: orden.titulo ?? payload.titulo,
    urgente: payload.prioridad === "urgente",
  });

  return orden;
}

export async function createSubOrden(
  parentId: string,
  titulo: string,
  parent: OrdenTrabajo,
): Promise<OrdenTrabajo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .insert({
      workspace_id:  parent.workspace_id,
      creado_por:    parent.creado_por,
      titulo:        titulo.trim(),
      descripcion:   "",
      tipo:          "solicitud",
      tipo_trabajo:  parent.tipo_trabajo ?? "reactiva",
      estado:        "pendiente",
      prioridad:     parent.prioridad,
      recurrencia:   "ninguna",
      recurrencia_config: null,
      proxima_ejecucion: null,
      estado_cobro:  "no_cobrable",
      parent_id:     parentId,
      asignados_ids: parent.asignados_ids ?? [],
      ubicacion_id:  parent.ubicacion_id ?? null,
      lugar_id:      parent.lugar_id ?? null,
      sociedad_id:   parent.sociedad_id ?? null,
      fecha_inicio:  parent.fecha_inicio ?? null,
      fecha_termino: parent.fecha_termino ?? null,
      // Sub-OTs inherit the parent's requisitos so they behave consistently
      // (the close-gate, fotos warning, etc. all reuse these flags).
      requiere_materiales: parent.requiere_materiales ?? false,
      requiere_hoja:       parent.requiere_hoja ?? false,
      requiere_fotos:      parent.requiere_fotos ?? false,
    })
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;
  const sub = data as unknown as OrdenTrabajo;
  await insertActividad(sub.id, parent.creado_por ?? "", "creado", titulo);
  await inheritProcedimientosToSubOT(parentId, sub.id, parent.creado_por ?? null).catch(() => {
    // Inheritance is best-effort — failure to copy attachments shouldn't
    // block the sub-OT itself. Real failures surface on the procedimientos tab.
  });
  return sub;
}

// Copy attached procedures from a parent OT to a freshly-created sub-OT, but
// only those flagged `hereda_a_hijos = true` on the ot_procedimientos row.
// Idempotent: skips rows that already exist on the child (rare unless this
// runs after another inheritance pass).
async function inheritProcedimientosToSubOT(
  parentId: string,
  childId: string,
  userId: string | null,
): Promise<void> {
  const sb = createClient();
  const { data: parents, error: parentErr } = await sb
    .from("ot_procedimientos")
    .select("procedimiento_id")
    .eq("orden_id", parentId)
    .eq("hereda_a_hijos", true);
  if (parentErr) throw parentErr;
  if (!parents || parents.length === 0) return;

  const { data: existing, error: exErr } = await sb
    .from("ot_procedimientos")
    .select("procedimiento_id")
    .eq("orden_id", childId);
  if (exErr) throw exErr;
  const have = new Set((existing ?? []).map(r => r.procedimiento_id));

  const inserts = parents
    .filter(p => !have.has(p.procedimiento_id))
    .map(p => ({
      orden_id: childId,
      procedimiento_id: p.procedimiento_id,
      adjuntado_por: userId,
      hereda_a_hijos: true, // Propagate the flag so grandchildren keep inheriting.
    }));
  if (inserts.length === 0) return;

  const { error: insErr } = await sb.from("ot_procedimientos").insert(inserts);
  if (insErr) throw insErr;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateOrden(
  id: string,
  userId: string,
  payload: {
    titulo?: string;
    descripcion?: string;
    n_serie?: string | null;
    solicitante?: string | null;
    solicitante_telefono?: string | null;
    solicitante_email?: string | null;
    hito?: string | null;
    presupuesto?: string | null;
    prioridad?: Prioridad;
    tipo_trabajo?: TipoTrabajo | null;
    clasificacion?: ClasificacionOT | null;
    categoria_id?: string | null;
    categoria_ids?: string[] | null;
    recurrencia?: Recurrencia;
    recurrencia_config?: RecurrenciaConfig | null;
    proxima_ejecucion?: string | null;
    fecha_inicio?: string | null;
    fecha_termino?: string | null;
    ubicacion_id?: string | null;
    lugar_id?: string | null;
    sociedad_id?: string | null;
    activo_id?: string | null;
    asignados_ids?: string[] | null;
    links?: OTLink[];
  },
  prevAsignadosIds?: string[] | null,
): Promise<OrdenTrabajo> {
  const sb = createClient();
  const patch = { ...payload };
  if (patch.recurrencia !== undefined) {
    patch.recurrencia_config = patch.recurrencia === "ninguna" ? null : (patch.recurrencia_config ?? null);
    patch.proxima_ejecucion = calcProximaEjecucion(patch.recurrencia, patch.fecha_inicio, patch.recurrencia_config);
  }

  if (WORK_ORDER_COMMANDS_V1_ENABLED) {
    const rollout = await getWorkOrderRolloutV1();
    if (rollout.edit_enabled && !rollout.kill_switch) {
      const { data: current, error: currentError } = await sb
        .from("ordenes_trabajo")
        .select("workspace_id,updated_at")
        .eq("id", id)
        .single();
      if (currentError) throw currentError;

      // The canonical command derives proxima_ejecucion itself from the
      // recurrence fields, keeping web, mobile and database behavior aligned.
      const { proxima_ejecucion: _derivedNextDate, ...changes } = patch;
      const result = await editWorkOrderV1({
        contract_version: 1,
        command_id: crypto.randomUUID(),
        workspace_id: current.workspace_id,
        actor_id: userId,
        payload: {
          ot_id: id,
          expected_updated_at: current.updated_at,
          changes,
        },
      });
      return result.data.work_order;
    }
  }

  const { data, error } = await sb
    .from("ordenes_trabajo")
    .update(patch)
    .eq("id", id)
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;

  if (payload.prioridad !== undefined) {
    const PRIORIDAD_LABELS: Record<Prioridad, string> = {
      ninguna: "Sin prioridad", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
    };
    await insertActividad(id, userId, "prioridad_cambiada", PRIORIDAD_LABELS[payload.prioridad]);
  }
  if (payload.ubicacion_id !== undefined || payload.lugar_id !== undefined) {
    await insertActividad(id, userId, "ubicacion_cambiada");
  }
  if (payload.asignados_ids !== undefined) {
    const prev = new Set(prevAsignadosIds ?? []);
    const next = new Set(payload.asignados_ids ?? []);
    const added = [...next].filter((uid) => !prev.has(uid));
    if (added.length > 0) {
      await insertActividad(id, userId, "asignado", added.join(","));
    }
  }
  if (payload.titulo !== undefined || payload.descripcion !== undefined || payload.tipo_trabajo !== undefined) {
    await insertActividad(id, userId, "editado");
  }
  return data as unknown as OrdenTrabajo;
}

/**
 * Owner/admin override for completing an OT with unmet requisitos. The reason is
 * mandatory and is re-validated server-side alongside the actor's role.
 */
export type ForceClose = { reason: string };

async function runCanonicalTransition(
  id: string,
  userId: string,
  action: WorkOrderActionV1,
  comment?: string,
  forceClose?: ForceClose,
): Promise<boolean> {
  if (!WORK_ORDER_COMMANDS_V1_ENABLED) return false;
  const rollout = await getWorkOrderRolloutV1();
  if (!rollout.transition_enabled || rollout.kill_switch) return false;

  const sb = createClient();
  const { data: current, error } = await sb
    .from("ordenes_trabajo")
    .select("workspace_id,updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;

  await transitionWorkOrderV1({
    contract_version: 1,
    command_id: crypto.randomUUID(),
    workspace_id: current.workspace_id,
    actor_id: userId,
    payload: {
      ot_id: id,
      expected_updated_at: current.updated_at,
      action,
      ...(comment?.trim() ? { comment: comment.trim() } : {}),
      ...(forceClose ? { force_close: true, force_close_reason: forceClose.reason.trim() } : {}),
    },
  });
  return true;
}

/**
 * Legacy-path counterpart to the RPC's override columns. The photo trigger only
 * stands down when these are set in the same UPDATE that completes the OT, so
 * they must be merged into that statement rather than written afterwards.
 */
function forceCloseColumns(userId: string, forceClose?: ForceClose) {
  if (!forceClose) return {};
  return {
    cierre_forzado:        true,
    cierre_forzado_motivo: forceClose.reason.trim(),
    cierre_forzado_por:    userId,
    cierre_forzado_at:     new Date().toISOString(),
  };
}

export async function updateOrdenEstado(
  id: string,
  estado: Estado,
  userId: string,
  ordenCtx?: { titulo: string; workspaceId: string; asignadosIds: string[] },
  forceClose?: ForceClose,
): Promise<void> {
  const ESTADO_LABELS: Record<Estado, string> = {
    pendiente:   "Abierta",
    en_espera:   "En espera",
    en_curso:    "En curso",
    completado:  "Completada",
  };
  const sb = createClient();
  if (WORK_ORDER_COMMANDS_V1_ENABLED) {
    const rollout = await getWorkOrderRolloutV1();
    if (rollout.transition_enabled && !rollout.kill_switch) {
      const { data: current, error: currentError } = await sb
        .from("ordenes_trabajo")
        .select("workspace_id,updated_at,estado,en_ejecucion,iniciado_at")
        .eq("id", id)
        .single();
      if (currentError) throw currentError;
      let action: WorkOrderActionV1 | null = null;
      if (estado === "en_espera") action = "wait";
      if (estado === "en_curso") {
        action = current.estado === "en_espera" && current.iniciado_at ? "resume" : "start";
      }
      if (estado === "completado") action = "complete";
      if (estado === "pendiente") action = "reopen";
      if (action) {
        await transitionWorkOrderV1({
          contract_version: 1,
          command_id: crypto.randomUUID(),
          workspace_id: current.workspace_id,
          actor_id: userId,
          payload: {
            ot_id: id,
            expected_updated_at: current.updated_at,
            action,
            ...(forceClose && action === "complete"
              ? { force_close: true, force_close_reason: forceClose.reason.trim() }
              : {}),
          },
        });
        return;
      }
    }
  }
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      estado,
      ...(estado === "completado" ? forceCloseColumns(userId, forceClose) : {}),
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "estado_cambiado", ESTADO_LABELS[estado]);

  if (ordenCtx) {
    notifyOTEstadoCambiado({
      asignadosIds: ordenCtx.asignadosIds,
      workspaceId: ordenCtx.workspaceId,
      ordenId: id,
      titulo: ordenCtx.titulo,
      estado,
      changedByUserId: userId,
    });
  }
}

export async function updateOrdenPrioridad(id: string, prioridad: Prioridad, userId: string): Promise<void> {
  const PRIORIDAD_LABELS: Record<Prioridad, string> = {
    ninguna: "Sin prioridad",
    baja:    "Baja",
    media:   "Media",
    alta:    "Alta",
    urgente: "Urgente",
  };
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").update({ prioridad }).eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "prioridad_cambiada", PRIORIDAD_LABELS[prioridad]);
}

// ── Timer operations ──────────────────────────────────────────────────────────

export async function iniciarOrden(id: string, userId: string): Promise<void> {
  const sb = createClient();
  if (await runCanonicalTransition(id, userId, "start")) return;
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ en_ejecucion: true, iniciado_at: new Date().toISOString(), estado: "en_curso" })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "iniciado");
}

export async function pausarOrden(
  id: string,
  userId: string,
  comentario: string,
  segundosAcumulados: number,
): Promise<void> {
  const sb = createClient();
  if (await runCanonicalTransition(id, userId, "pause", comentario)) return;
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion:          false,
      pausado_at:            new Date().toISOString(),
      tiempo_total_segundos: segundosAcumulados,
      estado:                "en_espera",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "pausado", comentario || undefined);
}

export async function reanudarOrden(id: string, userId: string): Promise<void> {
  const sb = createClient();
  if (await runCanonicalTransition(id, userId, "resume")) return;
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion: true,
      pausado_at:   null,
      iniciado_at:  new Date().toISOString(),
      estado:       "en_curso",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "reanudado");
}

export async function completarOrden(
  id: string,
  userId: string,
  comentario: string | undefined,
  segundosAcumulados: number,
  ordenCtx?: { titulo: string; workspaceId: string; asignadosIds: string[] },
  forceClose?: ForceClose,
): Promise<void> {
  const sb = createClient();
  if (await runCanonicalTransition(id, userId, "complete", comentario, forceClose)) return;
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion:          false,
      fecha_termino:         new Date().toISOString(),
      tiempo_total_segundos: segundosAcumulados,
      estado:                "completado",
      ...forceCloseColumns(userId, forceClose),
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(
    id,
    userId,
    "completado",
    forceClose ? `Cierre forzado: ${forceClose.reason.trim()}` : comentario,
  );

  if (ordenCtx) {
    notifyOTEstadoCambiado({
      asignadosIds: ordenCtx.asignadosIds,
      workspaceId: ordenCtx.workspaceId,
      ordenId: id,
      titulo: ordenCtx.titulo,
      estado: "completado",
      changedByUserId: userId,
    });
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

// Soft-delete: send the OT to the trash (papelera). Row + photos are kept so it
// can be restored. A 30-day cron permanently purges old trash.
export async function deleteOrden(id: string): Promise<void> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq("id", id);
  if (error) throw error;
}

// Restore an OT from the trash back into the active lists.
export async function restoreOrden(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ deleted_at: null, deleted_by: null })
    .eq("id", id);
  if (error) throw error;
}

// ── Marcar como leída/vista (per-user marker) ────────────────────────────────
// Row exists in ordenes_marcadas => marked for the current user. RLS scopes
// every query to auth.uid(), so we never pass user_id on reads.

// Returns the set of OT ids the current user has marked. One query for the whole
// workspace list — the caller intersects with what it's showing.
export async function fetchMarcadasIds(): Promise<Set<string>> {
  const sb = createClient();
  const { data, error } = await sb.from("ordenes_marcadas").select("orden_id");
  if (error) throw error;
  return new Set((data ?? []).map(r => r.orden_id as string));
}

// Toggle the current user's marker for one OT. Returns the new state (true = marked).
export async function toggleMarcada(ordenId: string, marcada: boolean): Promise<boolean> {
  const sb = createClient();
  if (marcada) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error("No autenticado");
    // upsert: idempotent if the row somehow already exists (double-tap).
    const { error } = await sb
      .from("ordenes_marcadas")
      .upsert({ orden_id: ordenId, user_id: user.id }, { onConflict: "orden_id,user_id" });
    if (error) throw error;
    return true;
  }
  const { error } = await sb.from("ordenes_marcadas").delete().eq("orden_id", ordenId);
  if (error) throw error;
  return false;
}

// Permanently delete an OT (hard delete). Owner/admin only at the RLS layer.
export async function purgeOrden(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").delete().eq("id", id);
  if (error) throw error;
}

// Trash list: OTs in the papelera, most-recently-deleted first.
export async function fetchTrashedOrdenes(wsId: string): Promise<OrdenListItem[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .eq("workspace_id", wsId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as OrdenListItem[];
}

// ── Photos ────────────────────────────────────────────────────────────────────

// ── Storage upload ────────────────────────────────────────────────────────────

export async function uploadOrdenFoto(orderId: string, file: File): Promise<string> {
  const { uploadToR2 } = await import("@/lib/r2");
  return uploadToR2(file, `ordenes/${orderId}`);
}

export async function addOrdenFoto(orderId: string, url: string): Promise<void> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("ordenes_trabajo")
    .select("fotos_urls")
    .eq("id", orderId)
    .single();
  if (fetchError) throw fetchError;

  const current: string[] = (data as { fotos_urls: string[] | null }).fotos_urls ?? [];
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ fotos_urls: [...current, url] })
    .eq("id", orderId);
  if (error) throw error;
}

export async function removeOrdenFoto(orderId: string, url: string): Promise<void> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("ordenes_trabajo")
    .select("imagen_url, fotos_urls")
    .eq("id", orderId)
    .single();
  if (fetchError) throw fetchError;

  const row = data as { imagen_url: string | null; fotos_urls: string[] | null };

  if (row.imagen_url === url) {
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({ imagen_url: null })
      .eq("id", orderId);
    if (error) throw error;
  } else {
    const updated = (row.fotos_urls ?? []).filter((u) => u !== url);
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({ fotos_urls: updated })
      .eq("id", orderId);
    if (error) throw error;
  }

  const { deleteFromR2 } = await import("@/lib/r2");
  await deleteFromR2(url);
}

// ── Activity / Comments ───────────────────────────────────────────────────────

/**
 * Comentario de usuario en la actividad de una OT.
 *
 * `fotoUrl` va DESPUES de `audioUrl` aunque el orden natural (y el del movil)
 * sea foto-antes-que-audio: invertirlo aca romperia en silencio a cada llamador
 * existente que pasa el audio como 4to argumento — el audio terminaria en
 * foto_url y la fila quedaria con una imagen rota. El orden de esta firma es
 * compatibilidad, no gusto.
 */
export async function addComentario(
  ordenId: string,
  userId: string,
  comentario: string,
  audioUrl?: string | null,
  fotoUrl?: string | null,
): Promise<void> {
  await insertActividad(ordenId, userId, "comentario", comentario, fotoUrl, audioUrl);
}

export async function insertActividad(
  ordenId: string,
  userId: string,
  tipo: ActividadTipo,
  comentario?: string,
  fotoUrl?: string | null,
  audioUrl?: string | null,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("actividad_ot").insert({
    orden_id:   ordenId,
    usuario_id: userId,
    tipo,
    comentario: comentario ?? null,
    foto_url:   fotoUrl   ?? null,
    audio_url:  audioUrl  ?? null,
  });
  if (error) throw error;
}
