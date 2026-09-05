/**
 * Cookie scope for the Supabase session, shared by the browser client, the
 * server client and the proxy.
 *
 * WHY THIS EXISTS: the app moved to app.getpangui.com while marketing stayed on
 * the apex. @supabase/ssr defaults to host-only cookies, which are sent ONLY to
 * the exact host that set them — so a session established on getpangui.com is
 * invisible to app.getpangui.com. Without this, the domain split would have
 * signed every existing user out: their bookmark redirects to the app host, no
 * sb-* cookie arrives, and the auth gate bounces them to /login.
 *
 * A leading dot ( .getpangui.com ) makes the cookie apply to the apex and every
 * subdomain, so sessions survive the move and the redirect between hosts.
 *
 * Scope note: this also exposes the session cookie to any other subdomain —
 * pdf.getpangui.com and n.getpangui.com today. Both are ours. Do not widen this
 * to a domain hosting third-party content.
 *
 * Returns undefined on localhost and Vercel previews: a `domain` that does not
 * match the current host makes the browser reject the cookie outright, which
 * would break `next dev` and every preview deployment.
 */
const ROOT_DOMAIN = ".getpangui.com";

export function sessionCookieOptions(hostname) {
  const host = (hostname || "").split(":")[0];
  const isProdDomain = host === "getpangui.com" || host.endsWith(".getpangui.com");
  if (!isProdDomain) return undefined;

  return {
    domain: ROOT_DOMAIN,
    path: "/",
    sameSite: "lax",
    secure: true,
  };
}

/**
 * Opciones de cookie para el cliente de navegador, sin depender de `window`.
 *
 * createBrowserClient cachea la PRIMERA instancia y descarta las opciones de
 * las llamadas siguientes. Resolver el dominio con `window.location` hacia que,
 * si esa primera llamada ocurria antes de hidratar (donde no hay window), la
 * instancia quedara host-only para siempre (ver lib/supabase.js).
 *
 * ROOT_DOMAIN ya es una constante de este modulo, asi que el scope se decide
 * igual en servidor y en cliente. En dev y en previews no se puede usar: un
 * `domain` que no cuadra con el host hace que el navegador rechace la cookie,
 * y por eso se mira NODE_ENV en vez del hostname.
 */
export function browserCookieOptions() {
  if (process.env.NODE_ENV !== "production") return undefined;
  return {
    domain: ROOT_DOMAIN,
    path: "/",
    sameSite: "lax",
    secure: true,
  };
}
