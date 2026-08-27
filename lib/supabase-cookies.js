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
