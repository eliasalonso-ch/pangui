/**
 * Cobro de cada OT (Electrilam): si ya salió en un Excel de cobros y si ya se
 * cobró. Tabla ot_cobros, solo dueño/admin; se escribe por marcar_ot_cobrada()
 * y registrar_ots_exportadas(). Se trae el workspace completo de una vez,
 * como las impresiones y las banderas.
 */
// ponytail: crece ~150 filas al mes; si algún día pesa, filtrar por las OTs a la vista.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase";

export interface OTCobro {
  exportadaAt: string | null;
  cobradaAt: string | null;
  cobradaPor: string | null;
}

const KEY = ["ot-cobros"] as const;

/** orden_id → cobro. */
export async function fetchOTCobros(): Promise<Map<string, OTCobro>> {
  const { data, error } = await createClient().from("ot_cobros").select("orden_id, exportada_at, cobrada_at, cobrada_por");
  if (error) throw error;
  return new Map((data ?? []).map(r => [r.orden_id as string, {
    exportadaAt: (r.exportada_at as string | null) ?? null,
    cobradaAt: (r.cobrada_at as string | null) ?? null,
    cobradaPor: (r.cobrada_por as string | null) ?? null,
  }]));
}

export function useOTCobros(enabled: boolean) {
  return useQuery({ queryKey: KEY, enabled, staleTime: 60 * 1000, queryFn: fetchOTCobros });
}

/** Marca o desmarca la OT como cobrada (botón de la card). */
export function useMarcarCobrada() {
  const qc = useQueryClient();
  return async (ordenId: string, cobrada: boolean) => {
    const { data, error } = await createClient().rpc("marcar_ot_cobrada", { p_orden_id: ordenId, p_cobrada: cobrada });
    if (error) throw error;
    if (!data) throw new Error("No se pudo marcar la OT");
    await qc.invalidateQueries({ queryKey: KEY });
  };
}

/** Las OTs que acaban de salir en un Excel (la primera vez manda). */
export async function registrarExportadas(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await createClient().rpc("registrar_ots_exportadas", { p_orden_ids: ids });
  if (error) throw error;
}
