/**
 * Shared TanStack Query hooks for workspace reference data.
 *
 * WHY THIS EXISTS: catálogos (categorías, ubicaciones, lugares, usuarios) are
 * near-static — they change maybe weekly — but were fetched from scratch on
 * every component mount. OTDetail refetched several of them every time the user
 * opened an OT, and network captures showed the same `categorias_ot` request
 * firing repeatedly within a single page load.
 *
 * These hooks give every caller one cache entry per (kind, workspace), so the
 * second and later reads are free until the data goes stale.
 *
 * NOT for OT data. `OrdenesBandeja` has its own coalescing + 120s snapshot
 * cooldown + realtime row patching, tuned to fix a 3.35 GB/month egress
 * problem. Routing it through here would re-open that.
 *
 * Query keys are `[kind, wsId]` so `queryClient.invalidateQueries({ queryKey:
 * ["categorias"] })` clears every workspace at once, and passing the full key
 * clears just one.
 */
import { useQuery, queryOptions } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { fetchSubOrdenes, fetchActividad, fetchOrden } from "@/lib/ordenes-api";
import { fetchFotoGrupos } from "@/lib/foto-grupos-api";
import { getOTProcedimientos } from "@/lib/procedimientos-api";
import type { OrdenTrabajo } from "@/types/ordenes";

/** Reference data is near-static; keep it far longer than the global default. */
const REFERENCE_STALE_TIME = 15 * 60 * 1000; // 15 min

// ─── OT detail record ────────────────────────────────────────────────────────

/**
 * How long a fetched OT record stays fresh, by estado.
 *
 * A completed OT is historical: it only changes if someone deliberately edits
 * it, and the large majority of any workspace's OTs are completed — so most
 * opens can be served from cache indefinitely within a session. An open OT
 * changes constantly (notes, parts, photos, reassignments), so it gets a short
 * window and relies on realtime for anything newer.
 *
 * Realtime already invalidates on change (see the postgres_changes handler in
 * OrdenesBandeja), so a stale-but-cached open OT is corrected within a tick.
 */
export function detailStaleTime(estado: string | null | undefined): number {
  if (!estado) return 0;
  return estado === "completado"
    ? 60 * 60 * 1000 // 1 h — historical
    : 2 * 60 * 1000; //  2 min — still moving
}

/**
 * The single definition of the `["orden", id]` query.
 *
 * WHY THIS EXISTS: the key, the fetcher and the staleness rule were spelled out
 * separately at three call sites (hover prefetch, click open, realtime
 * invalidate). Three copies of the same triple is three chances for them to
 * drift — and a prefetch that disagrees with the open it is meant to warm is
 * silently useless: the key or staleTime differs, so the click refetches and
 * the prefetch was pure waste. One factory makes that impossible.
 *
 * `estado` is optional because the caller does not always know it yet (a cold
 * open from a pasted URL has no row and no cache entry). Omitting it yields
 * staleTime 0 — always refetch — which is the safe default.
 */
export const ordenQueryOptions = (id: string, estado?: string | null) =>
  queryOptions({
    queryKey: ["orden", id] as const,
    queryFn: () => fetchOrden(id),
    staleTime: detailStaleTime(estado),
  });

export interface CategoriaRef {
  id: string;
  nombre: string;
  icono: string | null;
  color: string | null;
}

export interface UbicacionRef {
  id: string;
  edificio: string | null;
  detalle: string | null;
  sociedad_id: string | null;
}

export interface LugarRef {
  id: string;
  nombre: string;
  ubicacion_id: string | null;
}

export interface UsuarioRef {
  id: string;
  nombre: string;
  rol: string | null;
  deleted_at: string | null;
}

/**
 * Categorías available to a workspace.
 *
 * Includes the shared defaults (`workspace_id IS NULL`) alongside the
 * workspace's own, which is what every existing call site does.
 */
export function useCategorias(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["categorias", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<CategoriaRef[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("categorias_ot")
        .select("id, nombre, icono, color")
        .or(`workspace_id.eq.${wsId},workspace_id.is.null`);
      if (error) throw error;
      return (data ?? []) as CategoriaRef[];
    },
  });
}

export function useUbicaciones(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["ubicaciones", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<UbicacionRef[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("ubicaciones")
        .select("id, edificio, detalle, sociedad_id")
        .eq("workspace_id", wsId!)
        .order("edificio");
      if (error) throw error;
      return (data ?? []) as UbicacionRef[];
    },
  });
}

export function useLugares(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["lugares", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<LugarRef[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("lugares")
        .select("id, nombre, ubicacion_id")
        .eq("workspace_id", wsId!)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as LugarRef[];
    },
  });
}

/**
 * Workspace members.
 *
 * Deactivated users are included on purpose: an old OT still has to render the
 * name of whoever created or was assigned to it. Callers that populate pickers
 * filter on `deleted_at` themselves — the same rule the existing queries use.
 */
export function useUsuarios(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["usuarios", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<UsuarioRef[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("usuarios")
        .select("id, nombre, rol, deleted_at")
        .eq("workspace_id", wsId!)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as UsuarioRef[];
    },
  });
}

// ─── OT detail sub-resources ─────────────────────────────────────────────────
//
// Everything below is per-OT data rendered inside OTDetail. It used to load
// eagerly on every open via raw useEffect + .from(), with no cache: reopening
// the same OT refetched orden_partes, actividad_ot, hojas_inventario and the
// sub-órdenes every single time.
//
// Staleness follows the same rule as the OT record itself (see
// `detailStaleTime` in OrdenesBandeja): a completed OT's activity log, parts
// list and sub-orders are historical and only change on a deliberate edit, so
// they can be cached aggressively. An open OT keeps moving.

/** 1 h for completed OTs, 2 min for anything still open. */
export function subResourceStaleTime(estado: string | null | undefined): number {
  return estado === "completado" ? 60 * 60 * 1000 : 2 * 60 * 1000;
}

export interface OrdenParteRow {
  id: string;
  parte_id: string;
  cantidad: number;
  cantidad_utilizada: number | null;
  parte: { nombre: string; unidad: string | null; stock_actual: number | null } | null;
}

/**
 * Materials attached to an OT.
 *
 * NOT lazy per tab: `ordenPartes.length` is the badge count on the Materiales
 * button, which is visible from the Detalle tab. Deferring it to the tab click
 * would show "0 ítems usados" until the user opened that tab.
 */
export function useOrdenPartes(ordenId: string | null | undefined, estado?: string | null) {
  return useQuery({
    queryKey: ["orden-partes", ordenId],
    enabled: !!ordenId,
    staleTime: subResourceStaleTime(estado),
    queryFn: async (): Promise<OrdenParteRow[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("orden_partes")
        .select("id, parte_id, cantidad, cantidad_utilizada, parte:partes!parte_id(nombre, unidad, stock_actual)")
        .eq("orden_id", ordenId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // PostgREST returns an embedded to-one relation as an array in some
      // shapes; normalize so callers always get an object or null.
      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        parte: Array.isArray(row.parte) ? (row.parte[0] ?? null) : row.parte,
      })) as OrdenParteRow[];
    },
  });
}

/**
 * Inventory sheets for an OT.
 *
 * Safe to defer: the Hoja de cálculo button shows "Abrir", not a count, so
 * nothing on the Detalle tab depends on this having loaded. Pass `enabled`
 * false until the tab is opened.
 */
export function useHojasInventario(
  wsId: string | null | undefined,
  ordenId: string | null | undefined,
  opts?: { enabled?: boolean; estado?: string | null },
) {
  return useQuery({
    queryKey: ["hojas-inventario", wsId, ordenId],
    enabled: !!wsId && !!ordenId && (opts?.enabled ?? true),
    staleTime: subResourceStaleTime(opts?.estado),
    queryFn: async () => {
      const sb = createClient();
      const { data, error } = await sb
        .from("hojas_inventario")
        .select("*")
        .eq("workspace_id", wsId!)
        .eq("orden_id", ordenId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Sub-órdenes of an OT.
 *
 * OTDetail remounts on every OT switch (`key={detail.id}` in OrdenesBandeja),
 * which is what makes each OT open on Detalles with clean state. Without a
 * cache that remount also re-runs every per-OT fetch, so going A → B → A
 * re-downloads everything about A. These hooks make the remount nearly free:
 * the component is new, the data is not.
 */
export function useSubOrdenes(
  ordenId: string | null | undefined,
  opts?: { enabled?: boolean; estado?: string | null },
) {
  return useQuery({
    queryKey: ["sub-ordenes", ordenId],
    enabled: !!ordenId && (opts?.enabled ?? true),
    staleTime: subResourceStaleTime(opts?.estado),
    queryFn: () => fetchSubOrdenes(ordenId!),
  });
}

/** Activity log for an OT. */
export function useActividad(
  ordenId: string | null | undefined,
  opts?: { enabled?: boolean; estado?: string | null },
) {
  return useQuery({
    queryKey: ["actividad", ordenId],
    enabled: !!ordenId && (opts?.enabled ?? true),
    staleTime: subResourceStaleTime(opts?.estado),
    queryFn: () => fetchActividad(ordenId!),
  });
}

/** Photo groups (albums) for an OT. */
export function useFotoGrupos(
  ordenId: string | null | undefined,
  opts?: { enabled?: boolean; estado?: string | null },
) {
  return useQuery({
    queryKey: ["foto-grupos", ordenId],
    enabled: !!ordenId && (opts?.enabled ?? true),
    staleTime: subResourceStaleTime(opts?.estado),
    queryFn: () => fetchFotoGrupos(ordenId!),
  });
}

/** Procedures attached to an OT, with their executions. */
export function useOTProcedimientos(
  ordenId: string | null | undefined,
  opts?: { enabled?: boolean; estado?: string | null },
) {
  return useQuery({
    queryKey: ["ot-procedimientos", ordenId],
    enabled: !!ordenId && (opts?.enabled ?? true),
    staleTime: subResourceStaleTime(opts?.estado),
    queryFn: () => getOTProcedimientos(ordenId!),
  });
}

/**
 * Workspace-level configuration flags.
 *
 * WHY: `OTDetail` is keyed `key={detail.id}` and so remounts per OT, and it
 * fetched this row on every mount — opening 20 OTs meant 20 identical
 * round-trips for a row that changes maybe monthly. The same table is also read
 * by the sidebar and the requisitos page, uncoordinated.
 *
 * Cached per workspace at REFERENCE_STALE_TIME like the other catálogos: the
 * first OT opened pays for it, every later one is free.
 *
 * Export-only reads (PDF header logo/nombre) deliberately keep their own
 * one-shot fetch — they are user-triggered and need different columns.
 */
export interface WorkspaceConfig {
  fotos_obligatorias_todas: boolean;
  modo_registro: "ambos" | "materiales" | "hoja";
}

export function useWorkspaceConfig(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["workspace-config", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<WorkspaceConfig> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("workspaces")
        .select("fotos_obligatorias_todas, modo_registro")
        .eq("id", wsId!)
        .maybeSingle();
      if (error) throw error;
      return {
        fotos_obligatorias_todas: !!(data as any)?.fotos_obligatorias_todas,
        modo_registro: ((data as any)?.modo_registro ?? "ambos") as WorkspaceConfig["modo_registro"],
      };
    },
  });
}

/**
 * Active parts catalogue — workspace reference data.
 *
 * WHY: `OTDetail` fetched this per mount behind a `catalogo.length > 0` guard,
 * which is a hand-rolled cache that dies with the component. Since OTDetail
 * remounts per OT, opening the Materiales tab on each of N OTs meant N fetches
 * of the same near-static 500-row list.
 */
export interface ParteCatalogoRef {
  id: string;
  nombre: string;
  unidad: string;
  stock_actual: number;
}

export function usePartesCatalogo(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["partes-catalogo"],
    enabled: opts?.enabled ?? true,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<ParteCatalogoRef[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("partes")
        .select("id, nombre, unidad, stock_actual")
        .eq("activo", true)
        .order("nombre", { ascending: true })
        .limit(500);
      if (error) throw error;
      // Normalize the nullable columns once here so consumers get a total type.
      return (data ?? []).map((r: any) => ({
        id: r.id,
        nombre: r.nombre,
        unidad: r.unidad ?? "",
        stock_actual: r.stock_actual ?? 0,
      })) as ParteCatalogoRef[];
    },
  });
}

// ─── /ubicaciones page data ──────────────────────────────────────────────────

/**
 * The five catalogs the /ubicaciones page renders.
 *
 * WHY SEPARATE FROM useUbicaciones/useLugares ABOVE: those select the minimal
 * columns a picker needs (id + label + parent). This page also shows the
 * address, description, image and QR code, so it needs the wide row. Sharing
 * one hook would either starve the page or make every picker download columns
 * it never reads.
 *
 * Before this, the page refetched all five tables on every mount and after
 * every save — five round trips to render a list that changes maybe weekly.
 */

export interface UbicacionFull {
  id: string;
  edificio: string;
  detalle: string | null;
  direccion: string | null;
  grupo_cargo: string | null;
  sociedad_id: string | null;
  imagen_url: string | null;
  sociedad_nombre: string | null;
  descripcion: string | null;
  qr_code: string | null;
}

export interface LugarFull {
  id: string;
  nombre: string;
  descripcion: string | null;
  direccion: string | null;
  imagen_url: string | null;
  ubicacion_id: string | null;
  ubicacion_edificio: string | null;
  grupo_cargo: string | null;
  qr_code: string | null;
}

export interface SociedadFull {
  id: string;
  nombre: string;
  imagen_url: string | null;
  descripcion: string | null;
  direccion: string | null;
  qr_code: string | null;
}

export interface ActivoResumen {
  id: string;
  nombre: string;
  imagen_url: string | null;
  numero_serie: string | null;
  ubicacion_id: string | null;
  lugar_id: string | null;
}

export interface ReservaResumen {
  id: string;
  ubicacion_id: string;
  lugar_id: string | null;
  cantidad: number;
  parte: { nombre: string; unidad: string; imagen_url: string | null } | null;
}

export function useUbicacionesFull(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["ubicaciones-full", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<UbicacionFull[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("ubicaciones")
        .select("id, edificio, detalle, descripcion, direccion, grupo_cargo, sociedad_id, imagen_url, qr_code, sociedades(nombre)")
        .eq("workspace_id", wsId!)
        .eq("activa", true)
        .order("edificio");
      if (error) throw error;
      return (data ?? []).map((u: any) => ({
        ...u,
        sociedad_nombre: u.sociedades?.nombre ?? null,
      })) as UbicacionFull[];
    },
  });
}

export function useLugaresFull(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["lugares-full", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<LugarFull[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("lugares")
        .select("id, nombre, descripcion, direccion, grupo_cargo, imagen_url, qr_code, ubicacion_id, ubicaciones(edificio)")
        .eq("workspace_id", wsId!)
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        ...l,
        ubicacion_edificio: l.ubicaciones?.edificio ?? null,
      })) as LugarFull[];
    },
  });
}

export function useSociedadesFull(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["sociedades-full", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<SociedadFull[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("sociedades")
        .select("id, nombre, descripcion, direccion, imagen_url, qr_code")
        .eq("workspace_id", wsId!)
        .eq("activa", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as SociedadFull[];
    },
  });
}

export function useActivosResumen(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["activos-resumen", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<ActivoResumen[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("activos")
        .select("id, nombre, imagen_url, numero_serie, ubicacion_id, lugar_id")
        .eq("workspace_id", wsId!)
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as ActivoResumen[];
    },
  });
}

export function useReservasResumen(wsId: string | null | undefined) {
  return useQuery({
    queryKey: ["reservas-resumen", wsId],
    enabled: !!wsId,
    staleTime: REFERENCE_STALE_TIME,
    queryFn: async (): Promise<ReservaResumen[]> => {
      const sb = createClient();
      const { data, error } = await sb
        .from("material_reservations")
        .select("id, ubicacion_id, lugar_id, cantidad, parte:partes!parte_id(nombre, unidad, imagen_url)")
        .eq("workspace_id", wsId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ReservaResumen[];
    },
  });
}
