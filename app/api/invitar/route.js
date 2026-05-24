import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";

// Helper: server-side Supabase client that reads the session from cookies
async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()          { return cookieStore.getAll(); },
        setAll(toSet)     { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

export async function POST(request) {
  try {
    // 1. Verify the caller is an authenticated jefe
    const supabase = await createSupabaseServer();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const { data: callerPerfil } = await supabase
      .from("usuarios")
      .select("rol, workspace_id")
      .eq("id", caller.id)
      .maybeSingle();

    if (!callerPerfil || !["jefe", "admin"].includes(callerPerfil.rol)) {
      return NextResponse.json({ error: "No tienes permisos para invitar miembros." }, { status: 403 });
    }

    // 2. Parse request body
    const { nombre, email, password, rol } = await request.json();

    if (!nombre || !email || !password || !rol) {
      return NextResponse.json({ error: "Faltan campos requeridos." }, { status: 400 });
    }
    const rolesPermitidos = callerPerfil.rol === "admin"
      ? ["tecnico", "jefe", "admin"]
      : ["tecnico", "jefe"];
    if (!rolesPermitidos.includes(rol)) {
      return NextResponse.json({ error: "Rol inválido." }, { status: 400 });
    }

    // 3. Use service_role key to create the Auth user (admin API)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 3a. Block invites only if the workspace is on basic_free (trial ended, no paid plan).
    //     During trial and on active paid plans, invites are unlimited; each active user
    //     adds price_per_user to the monthly charge (synced to Flow after insert).
    const { data: sub } = await adminClient
      .from("subscriptions")
      .select("status, plan_key")
      .eq("workspace_id", callerPerfil.workspace_id)
      .neq("status", "canceled")
      .maybeSingle();
    if (sub?.status === "basic_free") {
      return NextResponse.json({
        error: "Tu prueba terminó. Elige un plan en Configuración → Suscripción para invitar usuarios.",
      }, { status: 402 });
    }

    const { data: newUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email confirmation — jefe shares creds directly
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // 4. Insert profile in usuarios table (same plant as inviting jefe)
    const { error: dbError } = await adminClient
      .from("usuarios")
      .insert({
        id:           newUser.user.id,
        workspace_id: callerPerfil.workspace_id,
        nombre:       nombre.trim(),
        rol,
      });

    if (dbError) {
      // Rollback: delete the auth user so it doesn't become orphan
      await adminClient.auth.admin.deleteUser(newUser.user.id);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // 5. Reconcile Flow subscription items to reflect new user count.
    //    Fire-and-forget; failures are logged but do not block the invite.
    try {
      const { syncSubscriptionToUserCount } = await import("@/lib/flow-sync");
      await syncSubscriptionToUserCount(callerPerfil.workspace_id);
    } catch (err) {
      console.error("[invitar] flow-sync failed:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message ?? "Error interno." }, { status: 500 });
  }
}
