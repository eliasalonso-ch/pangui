import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function proxy(request) {
  const response = NextResponse.next();

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  const isLogin = pathname === "/login";
  const isRoot  = pathname === "/";
  const isPublic =
    pathname.startsWith("/arco") ||
    pathname.startsWith("/privacidad") ||
    pathname.startsWith("/terminos") ||
    pathname.startsWith("/registro") ||
    pathname === "/api/registro" ||
    pathname === "/api/suscripcion/webhook" ||
    pathname === "/api/suscripcion/seed-planes";

  // No session → allow /, /login and public routes only
  if (!user && !isLogin && !isRoot && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Session + on /login → go to app
  if (user && isLogin) {
    return NextResponse.redirect(new URL("/ordenes", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icons|sw\\.js|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.webp$|.*\\.ico$|.*\\.gif$).*)",
  ],
};
