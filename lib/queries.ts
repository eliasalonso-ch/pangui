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
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";
import { fetchSubOrdenes, fetchActividad } from "@/lib/ordenes-api";
import { fetchFotoGrupos } from "@/lib/foto-grupos-api";
import { getOTProcedimientos } from "@/lib/procedimientos-api";

/** Reference data is near-static; keep it far longer than the global default. */
const REFERENCE_STALE_TIME = 15 * 60 * 1000; // 15 min

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
