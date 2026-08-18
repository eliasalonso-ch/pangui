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
