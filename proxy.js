import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

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
export async function proxy(request) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;

  const isLogin = pathname === "/login";
  const isRoot  = pathname === "/";
  const isPublic =
    pathname.startsWith("/monitoring") || // Sentry tunnel — must bypass auth
    pathname.startsWith("/arco") ||
    pathname.startsWith("/privacidad") ||
    pathname.startsWith("/terminos") ||
    pathname.startsWith("/registro") ||
    pathname.startsWith("/precios") ||
    pathname.startsWith("/recuperar-contrasena") ||
    pathname.startsWith("/reset-contrasena") ||
    pathname.startsWith("/confirmar-reset") ||
    pathname === "/api/registro" ||
    pathname === "/api/catalogos/cargos-oficios" ||
    pathname === "/api/suscripcion/webhook" ||
    pathname === "/api/suscripcion/register/callback" ||
    pathname === "/api/suscripcion/card/change/callback";

  // Public paths: don't even create a Supabase client. Avoids burning rate-limit
  // budget on routes that don't need auth (landing, pricing, terms, signup, …).
  if (isPublic || isRoot) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const sendToLogin = () => {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    request.cookies.getAll().forEach(({ name }) => {
      if (name.startsWith("sb-")) redirect.cookies.delete(name);
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
      return sendToLogin();
    }
    user = data.user;
  } catch {
    // Network error or rate-limit. Let the request through; failing closed only
    // amplifies the problem (every retry burns another auth/v1/token call).
    return response;
  }

  if (!user && !isLogin) return sendToLogin();

  if (user && isLogin) {
    return NextResponse.redirect(new URL("/ordenes", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.ico$|.*\\.gif$).*)",
  ],
};
