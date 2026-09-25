/**
 * Bandera por OT (color + nota) — solo dueño/admin.
 *
 * Tabla ot_banderas: una fila por OT. RLS ya la limita a owner/admin del
 * propio workspace; `enabled` solo evita pedirla para el resto. Se trae el
 * workspace completo de una vez (pocas filas) para que la bandeja pinte y
 * filtre sin una consulta por OT.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";

export interface OTBandera {
  color: string;
  nota: string | null;
}

/** Colores ofrecidos al marcar una OT. */
export const COLORES_BANDERA = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E", "#3B82F6", "#8B5CF6", "#EC4899", "#64748B",
] as const;

const KEY = ["ot-banderas"] as const;

/** orden_id → bandera. */
export function useOTBanderas(enabled: boolean) {
  return useQuery({
    queryKey: KEY,
    enabled,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, OTBandera>> => {
      const { data, error } = await createClient().from("ot_banderas").select("orden_id, color, nota");
      if (error) throw error;
      return new Map((data ?? []).map(b => [b.orden_id as string, { color: b.color as string, nota: (b.nota as string | null) ?? null }]));
    },
  });
}

export function useOTBanderaActions(workspaceId: string | null | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });
  return {
    async guardar(ordenId: string, color: string, nota: string) {
      if (!workspaceId) return;
      const { error } = await createClient().from("ot_banderas").upsert(
        { orden_id: ordenId, workspace_id: workspaceId, color, nota: nota.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: "orden_id" },
      );
      if (error) throw error;
      await refresh();
    },
    async quitar(ordenId: string) {
      const { error } = await createClient().from("ot_banderas").delete().eq("orden_id", ordenId);
      if (error) throw error;
      await refresh();
    },
  };
}
