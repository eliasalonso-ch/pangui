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

export async function flowGet<T = unknown>(path: string, params: FlowParams = {}): Promise<T> {
  const all = { apiKey: API_KEY, ...params };
  const s = sign(all);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(all)) qs.set(k, String(v));
  qs.set("s", s);
  const url = `${BASE_URL}${path}?${qs.toString()}`;
  const res = await fetch(url, { method: "GET" });
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
  invoices?: unknown[];
  trial_period_days?: number;
  cancel_at_period_end?: number;
  cancel_at?: string | null;
  morose?: number;              // 0 ok, 1 overdue, 2 pending but not overdue
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
  cancelSubscription: (p: { subscriptionId: string; at_period_end?: 0 | 1 }) =>
    flowPost<FlowSubscription>("/subscription/cancel", p),
  changePlan: (p: { subscriptionId: string; newPlanId: string }) =>
    flowPost<FlowSubscription>("/subscription/changePlan", p),

  // Subscription items — used to mirror user count onto the recurring charge.
  // We add one item per "extra" active user beyond the first (the plan amount
  // covers user #1; each extra user is one additional item at the same amount).
  addSubscriptionItem: (p: {
    subscriptionId: string;
    name:           string;
    amount:         number;
    currency?:      string;
    interval?:      number;
    interval_count?: number;
  }) => flowPost<{ subscription_item_id: string }>("/subscription/addItem", p),
  removeSubscriptionItem: (p: {
    subscriptionId: string;
    subscription_item_id: string;
  }) => flowPost("/subscription/removeItem", p),
  listSubscriptionItems: (subscriptionId: string) =>
    flowGet<{ data: Array<{ subscription_item_id: string; name: string; amount: number }> }>(
      "/subscription/listItems", { subscriptionId }
    ),
};

export { BASE_URL as FLOW_BASE_URL };
