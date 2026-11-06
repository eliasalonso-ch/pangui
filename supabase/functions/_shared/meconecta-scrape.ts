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

/** The portal rejected the username/password — retrying will not help. */
export class MeconectaAuthError extends Error {
  override name = "MeconectaAuthError";
}

/**
 * The login endpoint answers HTTP 200 and even sets a PHPSESSID for a wrong
 * password; only the JSON body says so ({"login_status":"invalid",...}). Any
 * other or unparseable body is NOT treated as a rejection, so a markup change
 * on their side can't silently disable the integration.
 */
export function loginRechazado(body: string): boolean {
  try {
    return (JSON.parse(body) as { login_status?: unknown })?.login_status === "invalid";
  } catch {
    return false;
  }
}

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
  if (loginRechazado(text)) {
    throw new MeconectaAuthError("MeConecta rechazó el usuario o la clave");
  }
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

// ── Detalle de una solicitud ("Ver solicitud") ──────────────────────────────
//
// Todo lo que necesita la OT viene en esa página, cada dato como
// `<label>Etiqueta</label>` seguido de su valor (en un div DestacaTexto o como
// texto suelto hasta el </td>). Incluye el "Nombre Resolutor" = el ITO, que el
// PDF de la solicitud NO trae.

export interface SolicitudDetalle {
  folio: string;
  titulo: string;
  prioridad: string;
  ubicacion: string;
  lugar: string;
  contacto: string;
  telefono: string;
  email: string;
  detalle: string;
  tipoMantencion: string;
  sociedad: string;
  resolutor: string;
  /** "Archivo N" adjuntos por el solicitante (fotos casi siempre). */
  archivos: string[];
}

/** Valor de la primera etiqueta exacta `label` ("" si no está). */
export function campo(html: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`<label[^>]*>\\s*${esc}\\s*:?\\s*</label>([\\s\\S]*?)(?=<label|</td>|</form>)`, "i").exec(html);
  return m ? stripTags(m[1]).trim() : "";
}

/** null si la página no es un detalle (p. ej. el portal devolvió el login). */
export function parseDetalle(html: string): SolicitudDetalle | null {
  const folio = campo(html, "N°");
  if (!/^SF\d+$/i.test(folio)) return null;
  const archivos = [...html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>\s*Descargar Archivo\s*<\/a>/gi)]
    .map((m) => decodeEntities(m[1]));
  return {
    folio,
    titulo:         campo(html, "Título Solicitud"),
    prioridad:      campo(html, "Prioridad"),
    ubicacion:      campo(html, "Ubicación"),
    lugar:          campo(html, "Lugar"),
    // Persona de Contacto; si viene vacía, el solicitante. Teléfono y email
    // primero del contacto, para no mezclar datos de dos personas.
    contacto:       campo(html, "Nombre") || campo(html, "Nombres y Apellidos"),
    telefono:       campo(html, "Anexo") || campo(html, "Teléfono"),
    email:          campo(html, "E-mail") || campo(html, "Email"),
    detalle:        campo(html, "Detalle Solicitud"),
    tipoMantencion: campo(html, "Tipo de Mantención"),
    sociedad:       campo(html, "Sociedad"),
    resolutor:      campo(html, "Nombre Resolutor"),
    archivos,
  };
}

/**
 * El portal declara UTF-8 pero no está garantizado (PHP viejo); fetch().text()
 * asume UTF-8 y destrozaría las tildes de un Latin-1. Si no es UTF-8 válido,
 * se lee como windows-1252.
 */
export function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function fetchDetalle(cookie: string, detalleHref: string): Promise<SolicitudDetalle> {
  const res = await fetchMeconecta(detalleUrl(detalleHref), {
    headers: { "Cookie": cookie, "User-Agent": UA, "Accept": "text/html" },
  }, "detalle fetch");
  if (!res.ok) throw new Error(`detalle fetch ${res.status}`);
  const detalle = parseDetalle(decodificar(new Uint8Array(await res.arrayBuffer())));
  if (!detalle) throw new Error("detalle fetch: la página no trae un N° SF (¿sesión caída o markup cambiado?)");
  return detalle;
}

const MAX_ARCHIVO_BYTES = 20 * 1024 * 1024;

/** El PDF "Solicitud de Mantención" que genera el portal (el que se imprimía a mano). */
export async function descargarPdfSolicitud(cookie: string, idExterno: number): Promise<Uint8Array> {
  const bytes = await descargarArchivo(cookie, `${BASE}/modulos/resolutor/resolutor_solicitudPDF.fmgf.php?ids=${btoa(String(idExterno))}`);
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("el portal no devolvió un PDF (¿sesión caída?)");
  }
  return bytes;
}

/** Descarga un adjunto del portal (con la sesión, por si /files/ la pide). */
export async function descargarArchivo(cookie: string, url: string): Promise<Uint8Array> {
  const abs = new URL(url, `${BASE}/`).href;
  if (!abs.startsWith(`${BASE}/`)) throw new Error(`archivo fuera del portal: ${abs}`);
  const res = await fetchMeconecta(abs, { headers: { "Cookie": cookie, "User-Agent": UA } }, "archivo fetch");
  if (!res.ok) throw new Error(`archivo fetch ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVO_BYTES) throw new Error(`archivo de ${bytes.byteLength} bytes supera 20 MB`);
  return bytes;
}
