import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { sessionCookieOptions } from "./lib/supabase-cookies";

/**
 * Next.js 16 proxy (formerly "middleware"). Auth gate for the app.
 *
 * File-naming convention: in Next.js 16+ the file MUST be named `proxy.js`
 * (or `proxy.ts`) at the project root and export a function named `proxy`.
 * The old `middleware` convention is deprecated.
 *
 * This proxy is hardened against the Supabase refresh-token loop:
 *   - public paths skip auth entirely (no Supabase client created)
 *   - any auth error clears all sb-* cookies and bounces to /login
 *   - network/rate-limit exceptions are swallowed (failing closed amplifies the storm)
 *   - each request goes through this once — server components also call
 *     getServerUser() which is memoized per request via React.cache()
 */
/**
 * Route segments that belong to the authenticated app (the dirs under
 * `app/(app)/`) plus `/superadmin`. ONLY these are bounced to /login when the
 * session is missing.
 *
 * Why an explicit list instead of a catch-all: the catch-all redirected every
 * unknown path to /login with a 307, so typos, dead backlinks and stale URLs
 * all reported themselves to Google as valid redirects (soft-404) instead of
 * 404s. Anything not listed here now falls through to Next's not-found page.
 *
 * Keep in sync with the directories under `app/(app)/`.
 */
const APP_SEGMENTS = [
  "activos",
  "analitica",
  "analitica-materiales",
  "categorias",
  "configuracion",
  "espacio-trabajo",
  "inicio",
  "itos",
  "mi-cuenta",
  "notificaciones",
  "ordenes",
  "papelera",
  "partes",
  "preferencias-notificaciones",
  "procedimientos",
  "reglas-alerta",
  "requisitos",
  "suscripcion",
  "ubicaciones",
  "usuarios",
  "superadmin",
];

const isAppRoute = (pathname) => {
  const segment = pathname.split("/")[1];
  return APP_SEGMENTS.includes(segment);
};

/* ── Host routing ──────────────────────────────────────────────────────────
 * getpangui.com      → marketing (landing, precios, casos-de-exito, legal…)
 * app.getpangui.com  → auth screens + everything behind the login
 *
 * One Vercel project serves both; this is what makes them behave like two
 * sites. Requests arriving on the wrong host are redirected, NOT rewritten:
 * a rewrite would leave the same page reachable under both hostnames, which
 * splits session cookies and web-push subscriptions across two origins (push
 * subscriptions are origin-scoped — a user who activated push on the apex
 * would silently stop receiving it). One canonical origin per page.
 *
 * 308 preserves the request method; 301 can turn a POST into a GET.
 */
const APP_HOST = "app.getpangui.com";
const MARKETING_HOST = "getpangui.com";

/** App routes that live outside `app/(app)/` — the auth screens. */
const APP_ONLY_PREFIXES = [
  "/login",
  "/registro",
  "/recuperar-contrasena",
];

/**
 * Auth-callback paths that must NOT be host-routed, on either host.
 *
 * Supabase's implicit flow returns its tokens in the URL fragment
 * (#access_token=…), and a fragment never reaches the server — so redirecting
 * one of these strips the token and the user lands on a dead form. Both
 * app/reset-contrasena/page.jsx and app/invite/page.js read
 * window.location.hash, so this is not hypothetical.
 *
 * They are also the one case we cannot fix by updating a link: recovery and
 * invitation emails already sitting in inboxes point at whichever host sent
 * them, and stay valid for their token lifetime. Serving them from both hosts
 * is the only way those keep working.
 *
 * Safe to do: these pages only establish a session and then navigate onward,
 * so the cookie is written by the host the user actually continues on.
 */
const AUTH_CALLBACK_PREFIXES = [
  "/reset-contrasena",
  "/confirmar-reset",
  "/invite",
];

/** Marketing sections. `/` is handled separately: it differs per host. */
const MARKETING_PREFIXES = [
  "/precios",
  "/casos-de-exito",
  "/industrias",
  "/arco",
  "/privacidad",
  "/terminos",
  "/demo",
];

const hasPrefix = (pathname, prefixes) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Returns a redirect when `pathname` is being served by the wrong host, or
 * null to let the request continue to the auth gate below.
 *
 * Only the two production hosts are routed — localhost and Vercel preview
 * deployments fall through, so `next dev` never redirects itself to prod.
 */
function hostRedirect(request, pathname, search) {
  const host = (request.headers.get("host") || "").split(":")[0];
  const isAppHost = host === APP_HOST;
  const isMarketingHost = host === MARKETING_HOST || host === `www.${MARKETING_HOST}`;
  if (!isAppHost && !isMarketingHost) return null;

  // Never redirect an auth callback: doing so drops the URL fragment its token
  // travels in. Served as-is on whichever host the email pointed at.
  if (hasPrefix(pathname, AUTH_CALLBACK_PREFIXES)) return null;

  const belongsToApp = hasPrefix(pathname, APP_ONLY_PREFIXES) || isAppRoute(pathname);
  const belongsToMarketing = hasPrefix(pathname, MARKETING_PREFIXES);

  if (isMarketingHost && belongsToApp) {
    return NextResponse.redirect(`https://${APP_HOST}${pathname}${search}`, 308);
  }

  if (isAppHost) {
    // The app host has no landing page. Send "/" to the dashboard; if there is
    // no session the auth gate below bounces it to /login on THIS host, so the
    // cookie it sets is the one the app reads.
    if (pathname === "/") {
      return NextResponse.redirect(`https://${APP_HOST}/inicio`, 307);
    }
    if (belongsToMarketing) {
      return NextResponse.redirect(`https://${MARKETING_HOST}${pathname}${search}`, 308);
    }
  }

  return null;
}

export async function proxy(request) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  // Host routing runs FIRST: no point validating a session against a host that
  // is about to redirect, and the redirect target's own request re-runs this
  // proxy anyway.
  const redirectToCorrectHost = hostRedirect(request, pathname, request.nextUrl.search);
  if (redirectToCorrectHost) return redirectToCorrectHost;

  const isLogin = pathname === "/login";
  const isRoot  = pathname === "/";
  const isPublic =
    pathname.startsWith("/monitoring") || // Sentry tunnel — must bypass auth
    pathname === "/api/health" ||         // uptime monitor — must bypass auth
    // SEO/social endpoints: crawlers arrive with no session, and redirecting
    // them to /login would deindex the site and break link previews.
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/opengraph-image" ||
    pathname.startsWith("/arco") ||
    pathname.startsWith("/privacidad") ||
    pathname.startsWith("/terminos") ||
    pathname.startsWith("/registro") ||
    // Invitation links arrive before a web session exists. The client page
    // consumes the Supabase callback tokens/code, creates the password, and
    // establishes the session; sending it through the auth gate first would
    // discard the URL fragment and redirect every new member to /login.
    pathname.startsWith("/invite") ||
    pathname.startsWith("/precios") ||
    // Marketing pages — public by definition; the auth gate would bounce
    // prospective customers to /login before they ever see the product.
    pathname.startsWith("/demo") ||
    pathname === "/api/demo" ||
    pathname.startsWith("/industrias") ||
    pathname.startsWith("/casos-de-exito") ||
    pathname.startsWith("/recuperar-contrasena") ||
    pathname.startsWith("/reset-contrasena") ||
    pathname.startsWith("/confirmar-reset") ||
    pathname === "/api/registro" ||
    // Mobile onboarding authenticates with its Supabase bearer token. It has
    // no web session cookie yet, so the route must reach its own token check
    // instead of being redirected to /login by this page-session gate.
    pathname === "/api/onboarding" ||
    // Mobile support requests authenticate with their Supabase bearer token
    // inside the route and therefore do not have a web session cookie.
    pathname === "/api/soporte" ||
    pathname === "/api/catalogos/cargos-oficios" ||
    pathname === "/api/suscripcion/webhook" ||
    pathname === "/api/suscripcion/register/callback" ||
    pathname === "/api/suscripcion/card/change/callback";

  // Public paths: don't even create a Supabase client. Avoids burning rate-limit
  // budget on routes that don't need auth (landing, pricing, terms, signup, …).
  if (isPublic || isRoot) return response;

  // This proxy is what persists refreshed tokens (server components cannot
  // write cookies), so the .getpangui.com scope has to be applied here too —
  // otherwise the first token refresh rewrites the cookie as host-only and
  // undoes the sharing between the apex and app.getpangui.com.
  const cookieOptions = sessionCookieOptions(request.nextUrl.hostname);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      ...(cookieOptions ? { cookieOptions } : {}),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, ...cookieOptions }),
          );
        },
      },
    },
  );

  const sendToLogin = () => {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    request.cookies.getAll().forEach(({ name }) => {
      if (!name.startsWith("sb-")) return;
      // A cookie is identified by (name, domain, path): deleting by name alone
      // clears only the host-only variant, leaving a .getpangui.com cookie in
      // place and the dead session with it. Delete both forms — sessions
      // predating the domain split are still host-only.
      redirect.cookies.delete(name);
      if (cookieOptions) {
        redirect.cookies.delete({ name, domain: cookieOptions.domain, path: "/" });
      }
    });
    return redirect;
  };

  let user = null;
  try {
    const { data, error } = await supabase.auth.getUser();

    // Any auth error here is treated as "session is dead". Clear cookies and
    // bounce to /login. Don't retry — that's what caused the 429 storm.
    if (error) {
      if (isLogin) return response;
      return isAppRoute(pathname) ? sendToLogin() : response;
    }
    user = data.user;
  } catch {
    // Network error or rate-limit. Let the request through; failing closed only
    // amplifies the problem (every retry burns another auth/v1/token call).
    return response;
  }

  // Only real app routes gate to /login. Unknown paths fall through so Next
  // can render a genuine 404 instead of a soft-404 redirect.
  if (!user && !isLogin) {
    return isAppRoute(pathname) ? sendToLogin() : response;
  }

  if (user && isLogin) {
    return NextResponse.redirect(new URL("/ordenes", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // `sw.js` must be excluded explicitly: a service worker has to be served
    // from its own origin path with a 200, and the auth check was redirecting
    // it to /login (307), which makes registration fail outright.
    "/((?!_next/static|_next/image|favicon\\.ico|icons|sw\\.js|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.ico$|.*\\.gif$).*)",
  ],
};
