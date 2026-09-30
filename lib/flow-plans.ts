/**
 * Pangui plan catalog (Flow.cl).
 *
 * 3 self-serve tiers + Empresa (contacto a ventas, sin plan en Flow).
 * Precio por equipo: cada plan trae una base mensual que incluye N usuarios, y
 * cada usuario sobre N se cobra aparte. Los solicitantes (rol requester) no
 * cuentan nunca: que el cliente pida trabajos no debe costarle al contratista.
 * Empresa se lleva abastecimiento, planificación y analítica avanzada; Pro es
 * el techo self-serve.
 * Inspired by the MaintainX model: OTs are always unlimited; the limits live on
 * sub-categories of OTs (procedimientos adjuntos, fotos adjuntas, repetitivas)
 * counted over a rolling 30-day window.
 *
 * Trial: 30 days at Pro features. Auto-downgrade to Basic (paid) on expiry.
 * Billing model: one Flow plan per tier at `basePrice`; users above
 * `includedUsers` go as one subscription item with quantity (lib/flow-sync.ts).
 */

export type PlanKey = "basic" | "esencial" | "pro" | "enterprise";

export interface PlanDef {
  key:        PlanKey;
  name:       string;
  basePrice:      number;        // CLP neto / mes, incluye `includedUsers` (0 = gratis o a medida)
  includedUsers:  number;        // usuarios cubiertos por basePrice
  extraUserPrice: number;        // CLP neto / mes por cada usuario sobre includedUsers (0 = no se venden)
  listPrice?:     number;        // precio normal anunciado; basePrice es el de lanzamiento
  desdePrecio?:   number;        // solo Empresa: precio "desde" publicado, CLP neto / mes
  selfServe:  boolean;
  envVar?:    string;            // Flow planId env var (filled by seed-planes)
  tagline:    string;           // para quién es, una línea
  highlights: string[];         // lo que suma sobre el plan anterior ("Todo lo de X, más:")
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
    // Medidores: puntos de lectura sobre un activo (vibración, horómetro,
    // consumo) con umbrales que abren OT solas. Pro y Empresa.
    //
    // Por qué Pro y no Empresa como el resto del bloque de arriba: el medidor no
    // es abastecimiento ni planificación — es mantenimiento basado en condición,
    // que es la razón por la que alguien sube de Esencial a Pro. Dejarlo en
    // Empresa lo escondería justo del cliente que lo pide.
    medidores:                boolean;   // /medidores route
    // Automatizaciones: el constructor de reglas medidor → acción. Empresa y
    // solo Empresa. A diferencia de `medidores` —que es ver el número— esto es
    // que el sistema actúe solo, y es la línea que separa Pro de Empresa.
    automatizaciones:         boolean;   // /automatizaciones route
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
    basePrice: 0,
    includedUsers: 3,
    extraUserPrice: 0,
    selfServe: false,
    tagline: "Gratis para siempre. Para equipos pequeños que quieren dejar el papel.",
    highlights: [
      "Hasta 3 usuarios",
      "Órdenes de trabajo ilimitadas",
      "30 OT con procedimientos, firma y fotos / mes",
      "Hasta 25 activos",
      "Exportar OT a PDF",
    ],
    limits: {
      procedimientos:             5,
      activos:                    25,
      // La evidencia es lo que vende Pangui: el plan gratis tiene que dejar
      // sentirla. 30/mes alcanza para convencerse y se agota con operación real.
      ots_con_procedimientos_mes: 30,
      ots_con_fotos_mes:          30,
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
      medidores:                 false,
      automatizaciones:          false,
      analytics_pro:             false,
      scheduler:                 false,
      push:                      true,
      ai_scan:                   false,
    },
  },
  {
    key: "esencial",
    name: "Esencial",
    basePrice: 59000,
    listPrice: 79000,
    includedUsers: 5,
    // $8.000 y no menos: con 10 usuarios Esencial queda en $99.000, cerca de
    // Pro, y ahí inventario, medidores e IA cierran la subida.
    extraUserPrice: 8000,
    selfServe: true,
    envVar: "FLOW_PLAN_ESENCIAL",
    tagline: "Para cuadrillas que necesitan respaldar cada trabajo frente al cliente.",
    highlights: [
      "5 usuarios incluidos",
      "OT con procedimientos y firma ilimitadas",
      "Fotos de evidencia ilimitadas",
      "Mantenimiento preventivo (OT repetitivas)",
      "Hasta 50 procedimientos y 300 activos",
      "QR / códigos de barras",
      "Exportar PDF, Excel y CSV",
      "3 meses de historial en analítica",
    ],
    limits: {
      procedimientos:             50,
      activos:                    300,
      // Procedimientos + firma son la prueba del trabajo: lo que vende Pangui.
      // Racionarlos en un plan pagado frena el uso justo donde más importa.
      ots_con_procedimientos_mes: Infinity,
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
      medidores:                 false,
      automatizaciones:          false,
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
    basePrice: 129000,
    listPrice: 169000,
    includedUsers: 10,
    extraUserPrice: 10000,
    selfServe: true,
    envVar: "FLOW_PLAN_PRO",
    tagline: "Para contratistas que además controlan inventario, equipos y costos.",
    highlights: [
      "10 usuarios incluidos",
      "Procedimientos y activos ilimitados",
      "Inventario completo (módulo Partes)",
      "Medidores y seguimiento de condición",
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
      // Medidores SÍ entra en Pro: es mantenimiento basado en condición, el
      // motivo por el que un cliente sube desde Esencial. No es abastecimiento.
      medidores:                 true,
      automatizaciones:          false,
      analytics_pro:             false,
      scheduler:                 true,
      push:                      true,
      ai_scan:                   true,
    },
  },
  {
    key: "enterprise",
    name: "Empresa",
    basePrice: 0,
    // Precio "desde" publicado como ancla. El contrato real es anual en UF y
    // se factura fuera de Flow: esto no entra al cobro.
    desdePrecio: 349000,
    includedUsers: Infinity,
    extraUserPrice: 0,
    selfServe: false,
    tagline: "Para operaciones con varios contratos que planifican, compran y miden.",
    highlights: [
      "Usuarios según contrato",
      "Automatizaciones (medidor → orden de trabajo)",
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
      medidores:                 true,
      automatizaciones:          true,
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

/**
 * Usuarios que se cobran aparte: los que exceden lo incluido en el plan.
 * `usuarios` ya viene sin solicitantes ni staff excluido (ver lib/flow-sync.ts).
 */
export function usuariosAdicionales(plan: PlanDef, usuarios: number): number {
  if (!Number.isFinite(plan.includedUsers)) return 0;
  return Math.max(0, usuarios - plan.includedUsers);
}

/** Costo mensual neto (sin IVA) de un plan con `usuarios` cobrables. */
export function costoMensual(plan: PlanDef, usuarios: number): number {
  return plan.basePrice + usuariosAdicionales(plan, usuarios) * plan.extraUserPrice;
}
