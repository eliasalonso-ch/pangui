import { describe, expect, it } from "vitest";

/**
 * Host-routing rules from proxy.js, mirrored here.
 *
 * The proxy itself imports @supabase/ssr and next/server, which need a request
 * context this test does not have. The routing decision is pure, so it is
 * re-derived here and asserted directly. If the lists in proxy.js change, these
 * must change with them — the cost of keeping the proxy a single file rather
 * than splitting the tables into a module both can import.
 */
const APP_SEGMENTS = [
  "activos", "analitica", "analitica-materiales", "categorias", "configuracion",
  "espacio-trabajo", "inicio", "itos", "mi-cuenta", "notificaciones", "ordenes",
  "papelera", "partes", "preferencias-notificaciones", "procedimientos",
  "reglas-alerta", "requisitos", "suscripcion", "ubicaciones", "usuarios",
  "superadmin",
];
const APP_ONLY_PREFIXES = [
  "/login", "/registro", "/recuperar-contrasena", "/reset-contrasena",
  "/confirmar-reset", "/invite",
];
const MARKETING_PREFIXES = [
  "/precios", "/casos-de-exito", "/industrias", "/arco", "/privacidad",
  "/terminos", "/demo",
];

const APP_HOST = "app.getpangui.com";
const MARKETING_HOST = "getpangui.com";

const isAppRoute = (p) => APP_SEGMENTS.includes(p.split("/")[1]);
const hasPrefix = (p, prefixes) =>
  prefixes.some((x) => p === x || p.startsWith(`${x}/`));

/** Returns [targetUrl, status] or null when the host is already correct. */
function hostRedirect(host, pathname, search = "") {
  const isAppHost = host === APP_HOST;
  const isMarketingHost = host === MARKETING_HOST || host === `www.${MARKETING_HOST}`;
  if (!isAppHost && !isMarketingHost) return null;

  const belongsToApp = hasPrefix(pathname, APP_ONLY_PREFIXES) || isAppRoute(pathname);
  const belongsToMarketing = hasPrefix(pathname, MARKETING_PREFIXES);

  if (isMarketingHost && belongsToApp) {
    return [`https://${APP_HOST}${pathname}${search}`, 308];
  }
  if (isAppHost) {
    if (pathname === "/") return [`https://${APP_HOST}/inicio`, 307];
    if (belongsToMarketing) {
      return [`https://${MARKETING_HOST}${pathname}${search}`, 308];
    }
  }
  return null;
}

describe("proxy host routing", () => {
  it("sends app routes on the marketing host to the app host", () => {
    expect(hostRedirect(MARKETING_HOST, "/ordenes")).toEqual([
      "https://app.getpangui.com/ordenes", 308,
    ]);
    expect(hostRedirect(MARKETING_HOST, "/ubicaciones/lugares")).toEqual([
      "https://app.getpangui.com/ubicaciones/lugares", 308,
    ]);
  });

  it("redirects login to the app host, preserving the query string", () => {
    // The landing's "Entrar" button and every stale bookmark hit this path.
    expect(hostRedirect(MARKETING_HOST, "/login", "?next=%2Fordenes")).toEqual([
      "https://app.getpangui.com/login?next=%2Fordenes", 308,
    ]);
  });

  it("sends marketing routes on the app host back to the apex", () => {
    expect(hostRedirect(APP_HOST, "/precios")).toEqual([
      "https://getpangui.com/precios", 308,
    ]);
    expect(hostRedirect(APP_HOST, "/terminos")).toEqual([
      "https://getpangui.com/terminos", 308,
    ]);
  });

  it("points the app host's root at the dashboard, not the landing", () => {
    expect(hostRedirect(APP_HOST, "/")).toEqual([
      "https://app.getpangui.com/inicio", 307,
    ]);
  });

  it("leaves correctly-hosted requests alone", () => {
    expect(hostRedirect(MARKETING_HOST, "/")).toBeNull();
    expect(hostRedirect(MARKETING_HOST, "/precios")).toBeNull();
    expect(hostRedirect(APP_HOST, "/ordenes")).toBeNull();
    expect(hostRedirect(APP_HOST, "/login")).toBeNull();
  });

  it("ignores hosts it does not own", () => {
    // localhost and Vercel previews must never redirect to production.
    expect(hostRedirect("localhost", "/ordenes")).toBeNull();
    expect(hostRedirect("pangui-git-main.vercel.app", "/login")).toBeNull();
  });

  it("routes www like the apex", () => {
    expect(hostRedirect("www.getpangui.com", "/login")).toEqual([
      "https://app.getpangui.com/login", 308,
    ]);
  });

  it("does not mistake a marketing path for an app segment", () => {
    // "/industrias" starts with no app segment; guards against a sloppy
    // startsWith check reclassifying marketing URLs.
    expect(hostRedirect(MARKETING_HOST, "/industrias/mineria")).toBeNull();
  });
});
