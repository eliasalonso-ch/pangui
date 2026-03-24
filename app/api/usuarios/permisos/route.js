/**
 * GET  /api/usuarios/permisos?usuario_id=X  — returns { modulo: boolean } map for a user
 * PATCH /api/usuarios/permisos              — upserts permission rows for a user
 *
 * Both endpoints require the caller to be `admin` of the same plant.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

const MODULOS = ["inventario", "reportes", "facturacion", "preventivos", "usuarios", "clientes", "activos", "normativa"];

async function getCallerAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()      { return cookieStore.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", status: 401 };

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol, workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || perfil.rol !== "admin") {
    return { error: "Solo el administrador puede gestionar permisos.", status: 403 };
  }

  return { caller: user, callerPerfil: perfil };
}

// ── GET ──────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { caller, callerPerfil, error, status } = await getCallerAdmin();
    if (error) return NextResponse.json({ error }, { status });

    const { searchParams } = new URL(request.url);
    const usuario_id = searchParams.get("usuario_id");
    if (!usuario_id) return NextResponse.json({ error: "Falta usuario_id." }, { status: 400 });

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify target belongs to same plant
    const { data: target } = await admin
      .from("usuarios")
      .select("workspace_id")
      .eq("id", usuario_id)
      .maybeSingle();

    if (!target || target.workspace_id !== callerPerfil.workspace_id) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    const { data: rows } = await admin
      .from("permisos_usuario")
      .select("modulo, puede_ver")
      .eq("usuario_id", usuario_id);

    // Build map with defaults
    const map = {};
    MODULOS.forEach((m) => { map[m] = true; });
    (rows ?? []).forEach(({ modulo, puede_ver }) => { map[modulo] = puede_ver; });

    return NextResponse.json(map);
  } catch (err) {
    return NextResponse.json({ error: err?.message ?? "Error interno." }, { status: 500 });
  }
}

// ── PATCH ────────────────────────────────────────────────────
export async function PATCH(request) {
  try {
    const { caller, callerPerfil, error, status } = await getCallerAdmin();
    if (error) return NextResponse.json({ error }, { status });

    const body = await request.json();
    const { usuario_id, permisos } = body;

    if (!usuario_id || !permisos || typeof permisos !== "object") {
      return NextResponse.json({ error: "Faltan campos." }, { status: 400 });
    }

    if (usuario_id === caller.id) {
      return NextResponse.json({ error: "No puedes modificar tus propios permisos." }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify target belongs to same plant
    const { data: target } = await admin
      .from("usuarios")
      .select("workspace_id")
      .eq("id", usuario_id)
      .maybeSingle();

    if (!target || target.workspace_id !== callerPerfil.workspace_id) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    // Build upsert rows only for valid modules
    const rows = Object.entries(permisos)
      .filter(([modulo]) => MODULOS.includes(modulo))
      .map(([modulo, puede_ver]) => ({
        usuario_id,
        modulo,
        puede_ver: Boolean(puede_ver),
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const { error: upsertError } = await admin
      .from("permisos_usuario")
      .upsert(rows, { onConflict: "usuario_id,modulo" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message ?? "Error interno." }, { status: 500 });
  }
}
