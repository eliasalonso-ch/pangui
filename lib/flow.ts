/**
 * Flow.cl API client.
 *
 * Auth: every request includes `apiKey` and a signature `s` = HMAC-SHA256 of
 * the params concatenated as `name1value1name2value2…` after sorting names
 * alphabetically. POST sends as application/x-www-form-urlencoded; GET puts
 * everything in the query string.
 *
 * Docs: https://www.flow.cl/docs/api.html
 */
import crypto from "node:crypto";

const API_KEY    = process.env.FLOW_API_KEY!;
const SECRET_KEY = process.env.FLOW_SECRET_KEY!;
const BASE_URL   = process.env.FLOW_ENV === "production"
  ? "https://www.flow.cl/api"
  : "https://sandbox.flow.cl/api";

if (!API_KEY || !SECRET_KEY) {
  console.warn("[flow] FLOW_API_KEY / FLOW_SECRET_KEY no configurados");
}

export type FlowParams = Record<string, string | number | boolean | undefined | null>;

function sign(params: FlowParams): string {
  const keys = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== null)
    .sort();
  const toSign = keys.map(k => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", SECRET_KEY).update(toSign).digest("hex");
}

function buildBody(params: FlowParams): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, String(v));
  }
  return body;
}

/**
 * Flow.cl is a third-party payment provider reached over the public internet.
 * Every call here sits on a user-facing request path, so an unbounded fetch
 * lets Flow's latency become ours: a slow provider once stalled
 * /api/suscripcion/status for 11s on every page load. Bound every call.
 */
const FLOW_TIMEOUT_MS = 5_000;

export async function flowGet<T = unknown>(path: string, params: FlowParams = {}): Promise<T> {
  const all = { apiKey: API_KEY, ...params };
  const s = sign(all);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(all)) qs.set(k, String(v));
  qs.set("s", s);
  const url = `${BASE_URL}${path}?${qs.toString()}`;
  const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(FLOW_TIMEOUT_MS) });
  const json = await res.json();
  if (!res.ok) {
    throw new FlowError(json?.message ?? `Flow GET ${path} → HTTP ${res.status}`, res.status, json);
  }
  return json as T;
}

export async function flowPost<T = unknown>(path: string, params: FlowParams = {}): Promise<T> {
  const all = { apiKey: API_KEY, ...params };
  const s = sign(all);
  const body = buildBody({ ...all, s });
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(FLOW_TIMEOUT_MS),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new FlowError(json?.message ?? `Flow POST ${path} → HTTP ${res.status}`, res.status, json);
  }
  return json as T;
}

export class FlowError extends Error {
  constructor(message: string, public status: number, public payload: unknown) {
    super(message);
    this.name = "FlowError";
  }
}

// ── Typed wrappers ──────────────────────────────────────────────────────────

export interface FlowPlan {
  planId: string;
  name: string;
  amount: number;
  currency: string;
  interval: number;
  interval_count: number;
  trial_period_days?: number;
  status: number;
}

export interface FlowCustomer {
  customerId:        string;
  name:              string;
  email:             string;
  externalId?:       string;
  status:            string | number;
  registerDate?:     string;
  // Card metadata when has_card. Flow flattens these onto the customer object.
  creditCardType?:   string;   // e.g. "Visa", "Mastercard"
  last4CardDigits?:  string;
  pay_mode?:         string;
}

export interface FlowRegisterCardResponse {
  url: string;       // redirect user here
  token: string;     // pass back to getRegisterStatus
}

/**
 * Response of /customer/getRegisterStatus.
 * Flow returns card data as top-level fields (creditCardType, last4CardDigits)
 * — NOT nested in a `card` object. Older docs sometimes hint at a nested shape
 * but production responses are flat. Kept both for safety.
 */
export interface FlowRegisterStatus {
  status:            string;    // "0" pending, "1" success
  customerId:        string;
  creditCardType?:   string;
  last4CardDigits?:  string;
  card?: { type?: string; last4Digits?: string; issuerBank?: string };
}

/** Cupón de descuento de Flow. Un cupón de monto tiene `amount` + `currency`
 *  y `percent_off` vacío; uno de porcentaje, al revés. */
export interface FlowCoupon {
  id:               number;
  name:             string;
  percent_off:      number | null;
  currency:         string | null;
  amount:           number | null;
  created:          string;
  /** 0 = indefinida, 1 = definida (ver `times`). */
  duration:         number;
  times:            number | null;
  max_redemptions:  number | null;
  expires:          string | null;
  status?:          number;
  deleted?:         number;
}

export interface FlowSubscription {
  subscriptionId: string;
  planId: string;
  plan_name?: string;
  customerId: string;
  status: number;          // 0 pending, 1 active, 2 canceled
  subscription_start: string;
  subscription_end?: string | null;
  period_start?: string;          // current invoice period start
  period_end?: string;            // current invoice period end (= last day they have access if they cancel)
  next_invoice_date?: string;
  invoices?: Array<FlowInvoice | { id?: number; invoiceId?: number }>;
  trial_period_days?: number;
  cancel_at_period_end?: number;
  cancel_at?: string | null;
  morose?: number;              // 0 ok, 1 overdue, 2 pending but not overdue
  /** Ítems asociados (usuarios adicionales). Única fuente fiable: /listItems
   *  responde 105 aunque haya ítems. Ver lib/flow-sync.ts. */
  items?: FlowSubscriptionItemAsociado[];
}

/** Ítem del catálogo del comercio (/subscription_item/*). */
export interface FlowSubscriptionItem {
  id:       number;
  name:     string;
  amount:   number | string;
  currency: string;
  status:   number;   // 1 activo
}

/** Ítem ya asociado a una suscripción, tal como viene en /subscription/get. */
export interface FlowSubscriptionItemAsociado {
  s_item_id: number;
  item_id:   number;
  name:      string;
  amount:    number;
  quantity:  number;
}

export interface FlowInvoiceItem {
  id: number;
  subject: string;
  type: number;
  currency: string;
  amount: number;
}

export interface FlowInvoice {
  id: number;
  invoiceId?: number;
  subscriptionId: string;
  customerId: string;
  created: string;
  subject: string;
  currency: string;
  amount: number;
  period_start?: string;
  period_end?: string;
  due_date?: string;
  status: 0 | 1 | 2;
  error?: 0 | 1;
  errorDate?: string | null;
  errorDescription?: string | null;
  items?: FlowInvoiceItem[];
  payment?: {
    flowOrder?: number;
    commerceOrder?: string;
    requestDate?: string;
    status?: number;
    paymentData?: { date?: string; media?: string; amount?: number; currency?: string };
  } | null;
  outsidePayment?: { date?: string; comment?: string } | null;
  paymentLink?: string | null;
}

export const flow = {
  // Plans
  createPlan: (p: {
    planId: string; name: string; amount: number; currency?: string;
    interval?: number; interval_count?: number;
    trial_period_days?: number; periods_number?: number;
    urlCallback: string;
  }) => flowPost<FlowPlan>("/plans/create", p),
  getPlan:  (planId: string) => flowGet<FlowPlan>("/plans/get", { planId }),
  listPlans: () => flowGet<{ total: number; hasMore: number; data: FlowPlan[] }>("/plans/list"),

  // Customers
  createCustomer: (p: { name: string; email: string; externalId: string }) =>
    flowPost<FlowCustomer>("/customer/create", p),
  getCustomer: (customerId: string) =>
    flowGet<FlowCustomer>("/customer/get", { customerId }),
  /** Actualiza nombre y/o email del cliente. Flow manda a ese email los
   *  comprobantes, avisos de cargo y links de pago, así que debe seguir al
   *  email de cobros del workspace. */
  editCustomer: (p: { customerId: string; name?: string; email?: string }) =>
    flowPost<FlowCustomer>("/customer/edit", p),

  registerCard: (p: { customerId: string; url_return: string }) =>
    flowPost<FlowRegisterCardResponse>("/customer/register", p),
  getRegisterStatus: (token: string) =>
    flowGet<FlowRegisterStatus>("/customer/getRegisterStatus", { token }),
  unregisterCard: (customerId: string) =>
    flowPost("/customer/unRegister", { customerId }),

  // Payments (used to resolve webhook tokens for invoice notifications)
  getPaymentStatus: (token: string) =>
    flowGet<{
      flowOrder:     number;
      commerceOrder: string;
      requestDate:   string;
      status:        number;  // 1=pending, 2=paid, 3=rejected, 4=canceled
      subject:       string;
      currency:      string;
      amount:        string;
      payer:         string;
      paymentData?:  { date: string; media: string; transferDate?: string };
      // For subscription-driven payments
      pending_info?: { subscriptionId?: string };
      subscriptionId?: string;
    }>("/payment/getStatus", { token }),

  // Subscriptions
  createSubscription: (p: {
    planId: string;
    customerId: string;
    subscription_start?: string;
    couponId?: string;
    trial_period_days?: number;
    periods_number?: number;
  }) => flowPost<FlowSubscription>("/subscription/create", p),
  getSubscription: (subscriptionId: string) =>
    flowGet<FlowSubscription>("/subscription/get", { subscriptionId }),

  // Coupons — descuentos aplicados a una suscripción.
  //
  // El plan de Flow cobra el precio de lista por el usuario #1 (los usuarios
  // extra van como items al precio real, ver flow-sync.ts). Un cupón de monto
  // fijo cubre esa diferencia para clientes con precio especial.
  //
  //   duration: 0        -> indefinida (para siempre)
  //   amount + currency  -> descuento de monto fijo (sin `percent_off`)
  //   max_redemptions: 1 -> un solo uso, así el cupón no puede filtrarse a
  //                         otro cliente
  //   sin `expires`      -> no caduca
  createCoupon: (p: {
    name:             string;
    amount?:          number;
    currency?:        string;
    percent_off?:     number;
    duration?:        0 | 1;
    times?:           number;
    max_redemptions?: number;
    expires?:         string;
  }) => flowPost<FlowCoupon>("/coupon/create", p),
  getCoupon: (couponId: string | number) =>
    flowGet<FlowCoupon>("/coupon/get", { couponId }),
  getInvoice: (invoiceId: number) =>
    flowGet<FlowInvoice>("/invoice/get", { invoiceId }),
  cancelSubscription: (p: { subscriptionId: string; at_period_end?: 0 | 1 }) =>
    flowPost<FlowSubscription>("/subscription/cancel", p),
  changePlan: (p: { subscriptionId: string; newPlanId: string }) =>
    flowPost<FlowSubscription>("/subscription/changePlan", p),

  // Subscription items — reflejan los usuarios extra en el cobro recurrente.
  //
  // Son un catálogo del comercio (se crean una vez, por precio) y se asocian a
  // una suscripción por `itemId` con una `quantity`. Contrato verificado
  // contra producción el 2026-09-03; ver lib/flow-sync.ts para el detalle.
  createSubscriptionItem: (p: { name: string; amount: number; currency?: string }) =>
    flowPost<FlowSubscriptionItem>("/subscription_item/create", p),
  listSubscriptionItemCatalog: () =>
    flowGet<{ total: number; hasMore: number; data: FlowSubscriptionItem[] }>(
      "/subscription_item/list", { limit: 100 }
    ),
  /** Asocia con quantity 1; la cantidad real se fija con updateSubscriptionItem. */
  addSubscriptionItem: (p: { subscriptionId: string; itemId: number }) =>
    flowPost<{ sub_id: string; item_id: number; quantity: number; success: boolean }>(
      "/subscription/addItem", p
    ),
  updateSubscriptionItem: (p: { subscriptionId: string; itemId: number; quantity: number }) =>
    flowPost<{ sub_id: string; item_id: number; quantity: number; success: boolean }>(
      "/subscription/updateItem", p
    ),
  // El nombre del parámetro no está verificado: la única prueba respondió
  // 105 sobre una suscripción que se estaba cancelando en paralelo. Se
  // asume `itemId` por simetría con addItem/updateItem.
  removeSubscriptionItem: (p: { subscriptionId: string; itemId: number }) =>
    flowPost("/subscription/removeItem", p),
};

export { BASE_URL as FLOW_BASE_URL };
