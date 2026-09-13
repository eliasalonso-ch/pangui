/**
 * Pangui plan catalog (Flow.cl).
 *
 * 3 self-serve tiers + Empresa (contacto a ventas, sin plan en Flow).
 * Priced per active user / month. Empresa se lleva abastecimiento,
 * planificación y analítica avanzada; Pro es el techo self-serve.
 * Inspired by the MaintainX model: OTs are always unlimited; the limits live on
 * sub-categories of OTs (procedimientos adjuntos, fotos adjuntas, repetitivas)
 * counted over a rolling 30-day window.
 *
 * Trial: 30 days at Pro features. Auto-downgrade to Basic (paid) on expiry.
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
    // Seats. Basic es gratis, así que el tope de usuarios es lo que impide que
    // una empresa entera se quede en el tier gratuito para siempre.
    usuarios:                       number;
    // COGS directo: sin estos dos el plan gratis es un agujero abierto.
    storage_gb:                     number;
    ai_scans_mes:                   number;
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
    // Compras: proveedores es el catálogo y las OC el documento que se les
    // dirige. Van juntos — una orden de compra sin proveedor no sirve — y
    // ambos son Pro, igual que el resto del módulo de abastecimiento.
    proveedores:              boolean;   // /proveedores route
    ordenes_compra:           boolean;   // /ordenes-compra route
    // Planned maintenance: /planes route. Distinct from `preventivos` (a
    // recurring OT, generated when the previous one closes) — a plan declares
    // its future dates up front so they can be seen and prepared for in
    // advance. That forward horizon is the Pro-only part.
    planes_mantencion:        boolean;
    // Analytics & insights
    analytics_pro:            boolean;   // advanced analytics dashboard (MTTR/MTBF)
    scheduler:                boolean;   // export schedules
    // Notifications — disponibles en todos los planes; se mantiene la bandera
    // para no romper llamadas existentes, pero ya no diferencia planes.
    push:                     boolean;
    // AI
    ai_scan:                  boolean;
  };
}

export const TRIAL_DAYS = 30;

export const PLANS: PlanDef[] = [
  {
    key: "basic",
    // Gratis para siempre: es el tier de adquisición, no se cobra por Flow.
    // Un usuario de Esencial subsidia ~57 usuarios gratis, así que el riesgo
    // real no es el precio sino que las cuotas se respeten de verdad.
    name: "Basic",
    pricePerUser: 0,
    selfServe: false,
    tagline: "Gratis para partir",
    highlights: [
      "Órdenes de trabajo ilimitadas",
      "5 OT con procedimientos / mes",
      "10 OT con fotos adjuntas / mes",
      "Hasta 5 procedimientos en catálogo",
      "Hasta 25 activos",
      "Exportar OT a PDF",
      "1 mes de historial en analítica",
    ],
    limits: {
      procedimientos:             5,
      activos:                    25,
      ots_con_procedimientos_mes: 5,
      ots_con_fotos_mes:          10,
      ots_repetitivas_mes:        3,
      historial_meses:            1,
      usuarios:                   3,
      storage_gb:                 1,
      ai_scans_mes:               0,
    },
    features: {
      exports:                   false,
      procedimiento_auto_attach: false,
      qr_codes:                  false,
      jerarquias_activos:        false,
      preventivos:               false,
      inventario:                false,
      proveedores:               false,
      ordenes_compra:            false,
      planes_mantencion:         false,
      analytics_pro:             false,
      scheduler:                 false,
      push:                      true,
      ai_scan:                   false,
    },
  },
  {
    key: "esencial",
    name: "Esencial",
    pricePerUser: 15000,
    selfServe: true,
    envVar: "FLOW_PLAN_ESENCIAL",
    tagline: "Para equipos en operación",
    highlights: [
      "Usuarios ilimitados",
      "Órdenes de trabajo ilimitadas",
      "25 OT con procedimientos / mes",
      "Fotos adjuntas ilimitadas",
      "OT repetitivas (preventivos) ilimitadas",
      "Hasta 50 procedimientos en catálogo",
      "Hasta 300 activos",
      "QR / códigos de barras",
      "Exportar PDF, Excel y CSV",
      "3 meses de historial en analítica",
    ],
    limits: {
      procedimientos:             50,
      activos:                    300,
      ots_con_procedimientos_mes: 25,
      ots_con_fotos_mes:          Infinity,
      ots_repetitivas_mes:        Infinity,
      historial_meses:            3,
      usuarios:                   Infinity,
      storage_gb:                 20,
      ai_scans_mes:               20,
    },
    features: {
      exports:                   true,
      procedimiento_auto_attach: true,
      qr_codes:                  true,
      jerarquias_activos:        true,
      preventivos:               true,
      inventario:                false,
      proveedores:               false,
      ordenes_compra:            false,
      planes_mantencion:         false,
      analytics_pro:             false,
      scheduler:                 false,
      push:                      true,
      // El acceso lo acota la cuota `ai_scans_mes` (20), no la bandera: cuestan
      // ~CLP 140 al mes y son el mejor gancho para subir a Pro.
      ai_scan:                   true,
    },
  },
  {
    key: "pro",
    name: "Pro",
    pricePerUser: 25000,
    selfServe: true,
    envVar: "FLOW_PLAN_PRO",
    tagline: "Sin límites para el día a día",
    highlights: [
      "Todo lo de Esencial, sin límites",
      "Procedimientos y activos ilimitados",
      "Inventario completo (módulo Partes)",
      "Hojas de cálculo en OT",
      "12 meses de historial en analítica",
      "Exportes programados",
      "200 escaneos de OT con IA / mes",
      "Soporte prioritario",
    ],
    limits: {
      procedimientos:             Infinity,
      activos:                    Infinity,
      ots_con_procedimientos_mes: Infinity,
      ots_con_fotos_mes:          Infinity,
      ots_repetitivas_mes:        Infinity,
      historial_meses:            12,
      usuarios:                   Infinity,
      storage_gb:                 100,
      ai_scans_mes:               200,
    },
    features: {
      exports:                   true,
      procedimiento_auto_attach: true,
      qr_codes:                  true,
      jerarquias_activos:        true,
      preventivos:               true,
      inventario:                true,
      // Abastecimiento (proveedores + OC), planificación y analítica avanzada
      // son de Empresa: van juntos porque una OC sin proveedor no sirve.
      proveedores:               false,
      ordenes_compra:            false,
      planes_mantencion:         false,
      analytics_pro:             false,
      scheduler:                 true,
      push:                      true,
      ai_scan:                   true,
    },
  },
  {
    key: "enterprise",
    name: "Empresa",
    pricePerUser: 0,
    selfServe: false,
    tagline: "Para operaciones que planifican y compran",
    highlights: [
      "Todo lo de Pro",
      "Analítica de órdenes (MTTR, MTBF)",
      "Analítica de activos",
      "Planes de mantención",
      "Órdenes de compra y proveedores",
      "Onboarding, SLA y account manager",
    ],
    limits: {
      procedimientos:             Infinity,
      activos:                    Infinity,
      ots_con_procedimientos_mes: Infinity,
      ots_con_fotos_mes:          Infinity,
      ots_repetitivas_mes:        Infinity,
      historial_meses:            Infinity,
      usuarios:                   Infinity,
      storage_gb:                 Infinity,
      ai_scans_mes:               Infinity,
    },
    features: {
      exports:                   true,
      procedimiento_auto_attach: true,
      qr_codes:                  true,
      jerarquias_activos:        true,
      preventivos:               true,
      inventario:                true,
      proveedores:               true,
      ordenes_compra:            true,
      planes_mantencion:         true,
      analytics_pro:             true,
      scheduler:                 true,
      push:                      true,
      ai_scan:                   true,
    },
  },
];

export const SELF_SERVE_PLANS = PLANS.filter(p => p.selfServe);

/**
 * Planes mostrados en /precios: los 3 self-serve + Empresa.
 *
 * Empresa se muestra pero NO es self-serve: no tiene plan en Flow y su CTA
 * lleva a /demo. Por eso las rutas de cobro siguen usando SELF_SERVE_PLANS.
 */
export const UI_VISIBLE_PLANS = PLANS;

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
