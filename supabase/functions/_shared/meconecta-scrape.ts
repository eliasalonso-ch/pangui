// Shared meconecta (UdeC portal) login + scrape.
//
// Used by two callers with different jobs but identical access needs:
//   - meconecta-scrape-cron  : every 15 min, notifies on newly-appeared rows.
//   - meconecta-check        : on demand, reconciles the portal against our OTs.
//
// Kept in _shared so the login flow and the table parsing exist exactly once —
// when the portal's markup shifts, there is a single place to fix.

const BASE = "https://meconecta.udec.cl";
const LOGIN_URL  = `${BASE}/response/rmgf_login.php?accion=login`;
// accion=YXNpZ25hZGFz -> base64 "asignadas"
const ORDERS_URL = `${BASE}/index.php?accion=YXNpZ25hZGFz&boton=2&submenu=2`;
const UA = "Mozilla/5.0 (compatible; PanguiBot/1.0; +https://getpangui.com)";
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [0, 1_000, 3_000] as const;

export const MECONECTA_BASE = BASE;

export interface ScrapedRow {
  idExterno: number;
  folio: string;
  fecha: string | null;   // "2026-06-24 17:03:40"
  estado: string;
  detalleHref: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

// meconecta is an external dependency and its DNS/host occasionally becomes
// unavailable for a few seconds. Retry only transport failures and transient
// HTTP statuses. Authentication and other 4xx responses must surface as-is.
async function fetchMeconecta(
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay > 0) await sleep(delay);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!isRetryableStatus(response.status) || attempt === RETRY_DELAYS_MS.length - 1) {
        return response;
      }
      await response.body?.cancel().catch(() => undefined);
      lastError = new Error(`${operation}: transient HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length - 1) break;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(
    `${operation}: meconecta unavailable after ${RETRY_DELAYS_MS.length} attempts`,
    { cause: lastError },
  );
}

/** Logs in and returns the PHPSESSID cookie string to reuse, or throws. */
export async function login(email: string, password: string): Promise<string> {
  const body = new URLSearchParams({ email, password }).toString();

  const res = await fetchMeconecta(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
      "Origin": BASE,
      "Referer": `${BASE}/login.php`,
      "Accept": "application/json, text/javascript, */*; q=0.01",
    },
    body,
    redirect: "manual",
  }, "login");

  const setCookies: string[] =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);

  const sess = setCookies
    .map((c) => /PHPSESSID=([^;]+)/.exec(c)?.[1])
    .find(Boolean);

  const text = await res.text().catch(() => "");
  if (!sess) {
    throw new Error(`login: no PHPSESSID returned (status ${res.status}, body ${text.slice(0, 120)})`);
  }
  return `PHPSESSID=${sess}`;
}

/** Fetches and parses the "asignadas" orders table. */
export async function fetchOrders(cookie: string): Promise<ScrapedRow[]> {
  const res = await fetchMeconecta(ORDERS_URL, {
    headers: { "Cookie": cookie, "User-Agent": UA, "Accept": "text/html" },
  }, "orders fetch");
  if (!res.ok) throw new Error(`orders fetch ${res.status}`);
  const html = await res.text();

  // If we got bounced to the login page, the session didn't take.
  if (/rmgf_login|name=["']?password/i.test(html) && !/<tbody/i.test(html)) {
    throw new Error("orders fetch: session not authenticated (got login page)");
  }
  return parseRows(html);
}

// Parse each <tr> in the first <tbody>. Regex-based (no DOM dep) — the table
// markup is stable and simple. Each row: 6 <td>; we need cols 1, 2, 5 and the
// ids= param from the detail link in col 6.
export function parseRows(html: string): ScrapedRow[] {
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
  if (!tbodyMatch) return [];

  const rows: ScrapedRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tbodyMatch[1])) !== null) {
    const tds = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1]);
    if (tds.length < 6) continue;

    const hrefMatch = /href=["']([^"']*ids=([^"'&]+)[^"']*)["']/i.exec(tds[5]);
    if (!hrefMatch) continue;
    const idExterno = decodeBase64Int(hrefMatch[2]);
    if (!Number.isFinite(idExterno)) continue;

    rows.push({
      idExterno,
      folio:  stripTags(tds[1]).trim(),
      fecha:  stripTags(tds[0]).trim() || null,
      estado: stripTags(tds[4]).trim(),
      detalleHref: decodeEntities(hrefMatch[1]),
    });
  }
  return rows;
}

export function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

export function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export function decodeBase64Int(b64: string): number {
  try { return parseInt(atob(b64), 10); } catch { return NaN; }
}

/**
 * Absolute URL for a row's "Ver solicitud" link.
 *
 * The portal emits these hrefs inconsistently — some start with "?accion=",
 * others with a bare "&accion=" (they assume an existing query string). Strip
 * whichever leading separator is there and re-attach a single "?", otherwise
 * the link resolves to "index.phpaccion=..." and 404s.
 */
export function detalleUrl(href: string): string {
  if (href.startsWith("http")) return href;
  const qs = href.replace(/^[?&]+/, "");
  return `${BASE}/index.php?${qs}`;
}
