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
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isTecnico = pathname.startsWith("/tecnico");
  const isJefe = pathname.startsWith("/jefe");

  // Sin sesión → solo puede estar en /login
  if (!user && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Con sesión → resolver rol y proteger rutas
  if (user) {
    let rol = null;

    if (isLogin || isTecnico || isJefe) {
      const { data: perfil } = await supabase
        .from("usuarios")
        .select("rol")
        .eq("id", user.id)
        .single();
      rol = perfil?.rol;
    }

    // En /login con sesión → redirigir al dashboard correcto
    if (isLogin) {
      const destino =
        rol === "tecnico" ? "/tecnico" : "/jefe";
      return NextResponse.redirect(new URL(destino, request.url));
    }

    // Técnico no puede acceder a /jefe
    if (isJefe && rol === "tecnico") {
      return NextResponse.redirect(new URL("/tecnico", request.url));
    }

    // Jefe/admin no puede acceder a /tecnico
    if (isTecnico && (rol === "jefe" || rol === "admin")) {
      return NextResponse.redirect(new URL("/jefe", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icons|sw\\.js|.*\\.svg$).*)",
  ],
};
