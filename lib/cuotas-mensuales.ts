/**
 * Rolling 30-day quota helpers for OT sub-categories (MaintainX-style limits).
 *
 * Counts OTs created in the workspace within the last 30 days that match each
 * category. Returns both the current count and the plan limit so callers can
 * render usage bars or block actions cleanly.
 *
 * Categorías:
 *   - con_procedimientos: OTs with ≥1 row in ot_procedimientos
 *   - con_fotos:          OTs with ≥1 row in foto_grupo_items (via foto_grupos)
 *   - repetitivas:        OTs where tipo_trabajo = 'preventiva' OR recurrencia IS NOT NULL
 */
import { adminSupabase } from "@/app/api/suscripcion/_helpers";
import { planLimite, type PlanKey } from "@/lib/flow-plans";

export type CategoriaOT = "con_procedimientos" | "con_fotos" | "repetitivas";

const LIMIT_KEY: Record<CategoriaOT, "ots_con_procedimientos_mes" | "ots_con_fotos_mes" | "ots_repetitivas_mes"> = {
  con_procedimientos: "ots_con_procedimientos_mes",
  con_fotos:          "ots_con_fotos_mes",
  repetitivas:        "ots_repetitivas_mes",
};

const ROLLING_DAYS = 30;

export interface CuotaResult {
  categoria: CategoriaOT;
  usado:     number;
  limite:    number;          // Infinity for unlimited
  permitido: boolean;
}

/** Returns the cutoff ISO string (now - 30 days). */
function cutoffISO(): string {
  return new Date(Date.now() - ROLLING_DAYS * 86_400_000).toISOString();
}

export async function contarOtsCategoria(
  workspaceId: string,
  categoria: CategoriaOT
): Promise<number> {
  const admin = adminSupabase();
  const since = cutoffISO();

  if (categoria === "con_procedimientos") {
    // Distinct OT ids in ot_procedimientos joined to workspace OTs created in window.
    const { data, error } = await admin
      .from("ot_procedimientos")
      .select("orden_id, ordenes_trabajo!inner(workspace_id, created_at)")
      .eq("ordenes_trabajo.workspace_id", workspaceId)
      .gte("ordenes_trabajo.created_at", since);
    if (error || !data) return 0;
    const distinct = new Set(data.map(r => r.orden_id));
    return distinct.size;
  }

  if (categoria === "con_fotos") {
    // OTs (in window) that have at least one foto_grupo with at least one item.
    // Simpler: count distinct orden_id from foto_grupos where the grupo has items.
    const { data: grupos, error } = await admin
      .from("foto_grupos")
      .select("orden_id, ordenes_trabajo!inner(workspace_id, created_at), foto_grupo_items!inner(id)")
      .eq("ordenes_trabajo.workspace_id", workspaceId)
      .gte("ordenes_trabajo.created_at", since);
    if (error || !grupos) return 0;
    const distinct = new Set(grupos.map(g => g.orden_id));
    return distinct.size;
  }

  // repetitivas
  const { count } = await admin
    .from("ordenes_trabajo")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", since)
    .or("tipo_trabajo.eq.preventiva,recurrencia.not.is.null");
  return count ?? 0;
}

export async function cuotaOtsCategoria(
  workspaceId: string,
  planKey: PlanKey | string | null,
  planStatus: string | null,
  categoria: CategoriaOT
): Promise<CuotaResult> {
  const limite = planLimite(planKey, planStatus, LIMIT_KEY[categoria]);
  const usado  = limite === Infinity ? 0 : await contarOtsCategoria(workspaceId, categoria);
  return {
    categoria,
    usado,
    limite,
    permitido: usado < limite,
  };
}

/** Fetches all three OT-category quotas for a workspace in parallel. */
export async function cuotasOtsWorkspace(
  workspaceId: string,
  planKey: PlanKey | string | null,
  planStatus: string | null,
): Promise<Record<CategoriaOT, CuotaResult>> {
  const [con_procedimientos, con_fotos, repetitivas] = await Promise.all([
    cuotaOtsCategoria(workspaceId, planKey, planStatus, "con_procedimientos"),
    cuotaOtsCategoria(workspaceId, planKey, planStatus, "con_fotos"),
    cuotaOtsCategoria(workspaceId, planKey, planStatus, "repetitivas"),
  ]);
  return { con_procedimientos, con_fotos, repetitivas };
}

/** Total procedimientos vs catalog limit. */
export async function cuotaProcedimientos(
  workspaceId: string,
  planKey: PlanKey | string | null,
  planStatus: string | null,
): Promise<{ usado: number; limite: number; permitido: boolean }> {
  const limite = planLimite(planKey, planStatus, "procedimientos");
  const admin = adminSupabase();
  const { count } = await admin
    .from("procedimientos")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("activo", true);
  const usado = count ?? 0;
  return { usado, limite, permitido: usado < limite };
}

/** Total activos vs catalog limit. */
export async function cuotaActivos(
  workspaceId: string,
  planKey: PlanKey | string | null,
  planStatus: string | null,
): Promise<{ usado: number; limite: number; permitido: boolean }> {
  const limite = planLimite(planKey, planStatus, "activos");
  const admin = adminSupabase();
  const { count } = await admin
    .from("activos")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("activo", true);
  const usado = count ?? 0;
  return { usado, limite, permitido: usado < limite };
}
