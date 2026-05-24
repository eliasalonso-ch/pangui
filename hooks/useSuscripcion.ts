"use client";

import { useEffect, useState } from "react";

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
 * Fetch /api/suscripcion/status once on mount. Returns null while loading.
 * Cached per page render — components that need a re-check should call refetch().
 */
export function useSuscripcion() {
  const [data, setData] = useState<SuscripcionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetch("/api/suscripcion/status", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return { data, loading, refetch: load };
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
