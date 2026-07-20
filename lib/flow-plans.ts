/**
 * Pangui plan catalog (Flow.cl).
 *
 * 3 self-serve tiers + 1 sales-contact tier. All priced per active user / month.
 * Inspired by the MaintainX model: OTs are always unlimited; the limits live on
 * sub-categories of OTs (procedimientos adjuntos, fotos adjuntas, repetitivas)
 * counted over a rolling 30-day window.
 *
 * Trial: 14 days at Pro features. Auto-downgrade to Basic (paid) on expiry.
 * Billing model: one Flow plan per tier; quantity (user count) is mirrored via
 * subscription_items (see lib/flow-sync.ts).
 */

export type PlanKey = "basic" | "esencial" | "pro" | "enterprise";

export interface PlanDef {
  key:        PlanKey;
  name:       string;
  pricePerUser: number;          // CLP / user / month (0 = enterprise / contact-sales)
  selfServe:  boolean;
  envVar?:    string;            // Flow planId env var (filled by seed-planes)
  tagline:    string;
  highlights: string[];
  limits: {
    // Total / catalog limits (lifetime within workspace)
    procedimientos:                 number;
    activos:                        number;
    // Rolling 30-day OT sub-quotas
    ots_con_procedimientos_mes:     number;
    ots_con_fotos_mes:              number;
    ots_repetitivas_mes:            number;
    // Analytics history window (months visible in dashboards)
    historial_meses:                number;
  };
  features: {
    // Operations
    exports:                  boolean;   // CSV / Excel export of OTs
    procedimiento_auto_attach: boolean;  // auto-attach matching procedimientos to OT
    // Asset management
    qr_codes:                 boolean;
    jerarquias_activos:       boolean;
    // Maintenance modes
    preventivos:              boolean;
    // Inventory module
    inventario:               boolean;   // /partes route + hojas in OT
    // Analytics & insights
    analytics_pro:            boolean;   // advanced analytics dashboard + materials
    scheduler:                boolean;   // export schedules
    // Notifications & compliance
    push:                     boolean;
    normativa:                boolean;
    // AI
    ai_scan:                  boolean;
  };
}

export const TRIAL_DAYS = 14;

export const PLANS: PlanDef[] = [
  {
    key: "basic",
    name: "Basic",
    pricePerUser: 4990,
    selfServe: true,
    envVar: "FLOW_PLAN_BASIC",
    tagline: "Lo esencial para empezar",
    highlights: [
      "Órdenes de trabajo ilimitadas",
      "5 OT con procedimientos / mes",
      "5 OT con fotos adjuntas / mes",
      "5 OT repetitivas / mes",
      "Hasta 3 procedimientos en catálogo",
      "Hasta 30 activos",
      "Exportar OT a PDF",
      "1 mes de historial en analítica",
      "Soporte por email",
    ],
    limits: {
      procedimientos:             3,
      activos:                    30,
      ots_con_procedimientos_mes: 5,
      ots_con_fotos_mes:          5,
      ots_repetitivas_mes:        5,
      historial_meses:            1,
    },
    features: {
      exports:                   false,
      procedimiento_auto_attach: false,
      qr_codes:                  false,
      jerarquias_activos:        false,
      preventivos:               false,
      inventario:                false,
      analytics_pro:             false,
      scheduler:                 false,
      push:                      false,
      normativa:                 false,
      ai_scan:                   false,
    },
  },
  {
    key: "esencial",
    name: "Esencial",
    pricePerUser: 6990,
    selfServe: true,
    envVar: "FLOW_PLAN_ESENCIAL",
    tagline: "Para equipos en operación",
    highlights: [
      "Órdenes de trabajo ilimitadas",
      "10 OT con procedimientos / mes",
      "Fotos adjuntas ilimitadas",
      "OT repetitivas (preventivos) ilimitadas",
      "Hasta 20 procedimientos en catálogo",
      "Hasta 200 activos",
      "QR / códigos de barras",
      "Jerarquías de activos",
      "Exportar PDF, Excel y CSV",
      "3 meses de historial en analítica",
    ],
    limits: {
      procedimientos:             20,
      activos:                    200,
      ots_con_procedimientos_mes: 10,
      ots_con_fotos_mes:          Infinity,
      ots_repetitivas_mes:        Infinity,
      historial_meses:            3,
    },
    features: {
      exports:                   true,
      procedimiento_auto_attach: true,
      qr_codes:                  true,
      jerarquias_activos:        true,
      preventivos:               true,
      inventario:                false,
      analytics_pro:             false,
      scheduler:                 false,
      push:                      false,
      normativa:                 false,
      ai_scan:                   false,
    },
  },
  {
    key: "pro",
    name: "Pro",
    pricePerUser: 9990,
    selfServe: true,
    envVar: "FLOW_PLAN_PRO",
    tagline: "Todo lo que tu operación necesita",
    highlights: [
      "Todo lo de Esencial, sin límites",
      "Procedimientos y activos ilimitados",
      "Inventario completo (módulo Partes)",
      "Hojas de cálculo en OT",
      "Analítica avanzada (MTTR, MTBF, FTFR)",
      "Analítica de materiales",
      "Historial de analítica ilimitado",
      "Notificaciones push (web + móvil)",
      "Exportes programados",
      "Normativa y cumplimiento",
      "Escaneo de OT con IA",
      "Soporte prioritario",
    ],
    limits: {
      procedimientos:             Infinity,
      activos:                    Infinity,
      ots_con_procedimientos_mes: Infinity,
      ots_con_fotos_mes:          Infinity,
      ots_repetitivas_mes:        Infinity,
      historial_meses:            Infinity,
    },
    features: {
      exports:                   true,
      procedimiento_auto_attach: true,
      qr_codes:                  true,
      jerarquias_activos:        true,
      preventivos:               true,
      inventario:                true,
      analytics_pro:             true,
      scheduler:                 true,
      push:                      true,
      normativa:                 true,
      ai_scan:                   true,
    },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    pricePerUser: 0,
    selfServe: false,
    tagline: "Soluciones a medida para grandes operaciones",
    highlights: [
      "Todo lo de Pro",
      "SSO / SAML",
      "Onboarding y capacitación dedicada",
      "SLA garantizado",
      "Integraciones a medida",
      "Account manager",
    ],
    limits: {
      procedimientos:             Infinity,
      activos:                    Infinity,
      ots_con_procedimientos_mes: Infinity,
      ots_con_fotos_mes:          Infinity,
      ots_repetitivas_mes:        Infinity,
      historial_meses:            Infinity,
    },
    features: {
      exports:                   true,
      procedimiento_auto_attach: true,
      qr_codes:                  true,
      jerarquias_activos:        true,
      preventivos:               true,
      inventario:                true,
      analytics_pro:             true,
      scheduler:                 true,
      push:                      true,
      normativa:                 true,
      ai_scan:                   true,
    },
  },
];

export const SELF_SERVE_PLANS = PLANS.filter(p => p.selfServe);

/**
 * Planes mostrados en /precios y /suscripcion. Hoy = self-serve.
 * Enterprise existe en el catálogo pero NO se muestra (decisión de producto:
 * lo activamos cuando tengamos demanda real / un proceso de ventas).
 */
export const UI_VISIBLE_PLANS = SELF_SERVE_PLANS;

export function planByKey(key: PlanKey | string | null | undefined): PlanDef {
  const k = (key && PLANS.find(p => p.key === key)?.key) || "basic";
  const p = PLANS.find(p => p.key === k);
  if (!p) throw new Error(`Plan inválido: ${key}`);
  return p;
}

/** Flow planId from env (set by /api/suscripcion/seed-planes) */
export function flowPlanId(key: PlanKey): string {
  const def = planByKey(key);
  if (!def.envVar) throw new Error(`Plan ${key} no tiene plan en Flow (enterprise).`);
  const id = process.env[def.envVar];
  if (!id) throw new Error(`Plan ${key} no está sembrado en Flow (falta ${def.envVar})`);
  return id;
}

/**
 * Resolves the effective plan considering trial: trial users get Pro.
 * Pass plan/planStatus from usuarios row or subscriptions row.
 */
export function effectivePlan(plan: PlanKey | string | null, planStatus: string | null): PlanDef {
  if (planStatus === "trial" || planStatus === "trialing") return planByKey("pro");
  return planByKey(plan);
}

/** Feature gate. Trial → Pro features. */
export function planTieneFeature(
  plan: PlanKey | string | null,
  planStatus: string | null,
  feature: keyof PlanDef["features"]
): boolean {
  return effectivePlan(plan, planStatus).features[feature];
}

/** Limit lookup. Trial → Pro limits. */
export function planLimite(
  plan: PlanKey | string | null,
  planStatus: string | null,
  limit: keyof PlanDef["limits"]
): number {
  return effectivePlan(plan, planStatus).limits[limit];
}
