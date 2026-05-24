// ── Plan limits & helpers ─────────────────────────────────────────────────────
// Thin compat layer. Source of truth lives in lib/flow-plans.ts.
//
// All values mirror PLANS in flow-plans.ts. Update both files together.

const TIERS = {
  basic: {
    limits: {
      procedimientos: 3,
      activos: 30,
      ots_con_procedimientos_mes: 5,
      ots_con_fotos_mes: 5,
      ots_repetitivas_mes: 5,
      historial_meses: 1,
    },
    features: {
      exports: false, procedimiento_auto_attach: false,
      qr_codes: false, jerarquias_activos: false,
      preventivos: false, inventario: false,
      analytics_pro: false, scheduler: false,
      push: false, normativa: false, ai_scan: false,
    },
  },
  esencial: {
    limits: {
      procedimientos: 20,
      activos: 200,
      ots_con_procedimientos_mes: 10,
      ots_con_fotos_mes: Infinity,
      ots_repetitivas_mes: Infinity,
      historial_meses: 3,
    },
    features: {
      exports: true, procedimiento_auto_attach: true,
      qr_codes: true, jerarquias_activos: true,
      preventivos: true, inventario: false,
      analytics_pro: false, scheduler: false,
      push: false, normativa: false, ai_scan: false,
    },
  },
  pro: {
    limits: {
      procedimientos: Infinity,
      activos: Infinity,
      ots_con_procedimientos_mes: Infinity,
      ots_con_fotos_mes: Infinity,
      ots_repetitivas_mes: Infinity,
      historial_meses: Infinity,
    },
    features: {
      exports: true, procedimiento_auto_attach: true,
      qr_codes: true, jerarquias_activos: true,
      preventivos: true, inventario: true,
      analytics_pro: true, scheduler: true,
      push: true, normativa: true, ai_scan: true,
    },
  },
  enterprise: {
    limits: {
      procedimientos: Infinity,
      activos: Infinity,
      ots_con_procedimientos_mes: Infinity,
      ots_con_fotos_mes: Infinity,
      ots_repetitivas_mes: Infinity,
      historial_meses: Infinity,
    },
    features: {
      exports: true, procedimiento_auto_attach: true,
      qr_codes: true, jerarquias_activos: true,
      preventivos: true, inventario: true,
      analytics_pro: true, scheduler: true,
      push: true, normativa: true, ai_scan: true,
    },
  },
};

export const LIMITES = Object.fromEntries(Object.entries(TIERS).map(([k, v]) => [k, v.limits]));

/** Features that require a paid plan above Basic (used by nav locks). */
export const FEATURES_PRO = [
  "preventivos", "normativa", "exports", "push_notifications",
  "analytics_pro", "scheduler", "ai_scan", "inventario",
  "qr_codes", "jerarquias_activos", "procedimiento_auto_attach",
];

/** Map old feature names to new flag keys */
const FEATURE_ALIAS = {
  push_notifications: "push",
};

export function tieneAcceso(plan, planStatus, feature) {
  if (planStatus === "trial" || planStatus === "trialing") return true;
  const tier = TIERS[plan] ?? TIERS.basic;
  const flagKey = FEATURE_ALIAS[feature] ?? feature;
  if (flagKey in tier.features) return tier.features[flagKey];
  // Unknown feature → allow on paid tiers, deny on basic
  return plan === "esencial" || plan === "pro" || plan === "enterprise";
}

export function limitesParaPlan(plan, planStatus) {
  if (planStatus === "trial" || planStatus === "trialing") return TIERS.pro.limits;
  return LIMITES[plan] ?? LIMITES.basic;
}
