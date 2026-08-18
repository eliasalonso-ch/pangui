"use client";

import { useQuery } from "@tanstack/react-query";

export interface CuotaItem { usado: number; limite: number; permitido: boolean }
export interface SuscripcionStatus {
  rol?: string;
  effective_plan?: "basic" | "esencial" | "pro" | "enterprise";
  plan_features?: Record<string, boolean>;
  plan_limits?:   Record<string, number>;
  subscription?: { status: string; plan_key: string } | null;
  cuotas_uso?: {
    ots_con_procedimientos: CuotaItem;
    ots_con_fotos:          CuotaItem;
    ots_repetitivas:        CuotaItem;
    procedimientos:         CuotaItem;
    activos:                CuotaItem;
  };
}

const PLAN_NAME: Record<string, string> = {
  basic: "Basic",
  esencial: "Esencial",
  pro: "Pro",
  enterprise: "Enterprise",
};

/**
 * Fetch /api/suscripcion/status. Returns null while loading.
 * Cached for 5 minutes in the shared QueryClient, so the sidebar mounting on
 * every navigation costs one request per session rather than one per page.
 *
 * `full` opts into the billing half of the response (card details refreshed
 * against Flow.cl + rolling quota counts). It is off by default because the
 * sidebar mounts on every page and only reads `plan_features`; paying the Flow
 * round-trip there put an external provider on every page load. Pass true only
 * where `cuotas_uso` or card data is actually rendered.
 */
export function useSuscripcion(full = false) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["suscripcion-status", full],
    queryFn: async (): Promise<SuscripcionStatus> => {
      const res = await fetch(`/api/suscripcion/status${full ? "?full=1" : ""}`);
      if (!res.ok) throw new Error(`suscripcion/status ${res.status}`);
      return res.json();
    },
    // The sidebar mounts on every page, so before this was a query each
    // navigation re-ran the whole route server-side. A plan does not change
    // mid-session: 5 minutes of cache turns N page views into one call.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });

  return {
    data: data ?? null,
    loading: isLoading,
    // Callers use this after mutating the plan (checkout, cancel), where the
    // point is to bypass the cache above.
    refetch: () => { void refetch(); },
  };
}

/** Smallest paid tier that covers the requested feature. */
export function recommendedUpgradeFor(feature: string): string {
  // Mirrors lib/flow-plans.ts feature tiers
  const ESENCIAL = new Set(["exports", "preventivos", "qr_codes", "jerarquias_activos", "procedimiento_auto_attach"]);
  if (ESENCIAL.has(feature)) return PLAN_NAME.esencial;
  return PLAN_NAME.pro;
}

/** Smallest paid tier that raises the given limit beyond the current one. */
export function recommendedUpgradeForLimit(limit: string): string {
  const ESENCIAL_RAISES = new Set([
    "ots_con_procedimientos_mes", "ots_con_fotos_mes", "ots_repetitivas_mes",
    "procedimientos", "activos", "historial_meses",
  ]);
  if (ESENCIAL_RAISES.has(limit)) return PLAN_NAME.esencial;
  return PLAN_NAME.pro;
}
