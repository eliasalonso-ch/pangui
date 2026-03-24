// ── Plan limits & helpers ─────────────────────────────────────────────────────

export const LIMITES = {
  basic: {
    ots_mes:         10,
    activos:         30,
    usuarios:        1,
    historial_meses: 3,
  },
  pro: {
    ots_mes:         Infinity,
    activos:         Infinity,
    usuarios:        Infinity,
    historial_meses: Infinity,
  },
  enterprise: {
    ots_mes:         Infinity,
    activos:         Infinity,
    usuarios:        Infinity,
    historial_meses: Infinity,
  },
};

/** Features locked on Basic — used by PlanGate and nav locks */
export const FEATURES_PRO = [
  "preventivos",
  "normativa",
  "exports",
  "push_notifications",
];

/**
 * Returns true if the plan/status has access to a given feature.
 * Trial users get full Pro access.
 */
export function tieneAcceso(plan, planStatus, feature) {
  if (planStatus === "trial") return true;
  const p = plan ?? "basic";
  if (p === "pro" || p === "enterprise") return true;
  return !FEATURES_PRO.includes(feature);
}

/** Returns limits for a given plan */
export function limitesParaPlan(plan) {
  return LIMITES[plan ?? "basic"] ?? LIMITES.basic;
}
