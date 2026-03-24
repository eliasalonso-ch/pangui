import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()      { return cookieStore.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

// PATCH /api/usuarios/[id] — toggle activo or update rol
export async function PATCH(request, { params }) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { data: callerPerfil } = await supabase
      .from("usuarios")
      .select("rol, workspace_id")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerPerfil || !["jefe", "admin"].includes(callerPerfil.rol)) {
      return NextResponse.json({ error: "No tienes permisos para modificar usuarios." }, { status: 403 });
    }

    const { id } = await params;
    if (id === caller.id) {
      return NextResponse.json({ error: "No puedes modificarte a ti mismo." }, { status: 400 });
    }

    const body = await request.json();

    // Verify target user belongs to same plant
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: target } = await adminClient
      .from("usuarios")
      .select("workspace_id")
      .eq("id", id)
      .maybeSingle();

    if (!target || target.workspace_id !== callerPerfil.workspace_id) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    const updates = {};
    if (typeof body.activo === "boolean") updates.activo = body.activo;
    if (body.rol) {
      const rolesPermitidos = callerPerfil.rol === "admin"
        ? ["tecnico", "jefe", "admin"]
        : ["tecnico", "jefe"];
      if (rolesPermitidos.includes(body.rol)) updates.rol = body.rol;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
    }

    const { error } = await adminClient
      .from("usuarios")
      .update(updates)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If deactivating, also disable auth user
    if (updates.activo === false) {
      await adminClient.auth.admin.updateUserById(id, { ban_duration: "876600h" });
    } else if (updates.activo === true) {
      await adminClient.auth.admin.updateUserById(id, { ban_duration: "none" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message ?? "Error interno." }, { status: 500 });
  }
}

// DELETE /api/usuarios/[id] — permanently delete user
export async function DELETE(request, { params }) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { data: callerPerfil } = await supabase
      .from("usuarios")
      .select("rol, workspace_id")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerPerfil || callerPerfil.rol !== "admin") {
      return NextResponse.json({ error: "Solo el administrador puede eliminar usuarios." }, { status: 403 });
    }

    const { id } = await params;
    if (id === caller.id) {
      return NextResponse.json({ error: "No puedes eliminarte a ti mismo." }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: target } = await adminClient
      .from("usuarios")
      .select("workspace_id")
      .eq("id", id)
      .maybeSingle();

    if (!target || target.workspace_id !== callerPerfil.workspace_id) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }

    await adminClient.from("usuarios").delete().eq("id", id);
    await adminClient.auth.admin.deleteUser(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message ?? "Error interno." }, { status: 500 });
  }
}
