import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL;

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

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET(request) {
  // 1. Auth check
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SUPERADMIN_EMAIL || user.email !== SUPERADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") ?? "feedback";

  const admin = createAdminClient();

  if (tab === "feedback") {
    const { data, error } = await admin
      .from("feedback")
      .select("id, tipo, mensaje, rating, created_at, usuario_id, usuarios(nombre, workspace_id, workspaces(nombre))")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (tab === "arco") {
    const { data, error } = await admin
      .from("solicitudes_arco")
      .select("id, tipo, rut, email, detalle, estado, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (tab === "usuarios") {
    const { data, error } = await admin
      .from("usuarios")
      .select("id, nombre, rol, activo, created_at, last_active, workspace_id, workspaces(nombre)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (tab === "workspaces") {
    const { data, error } = await admin
      .from("workspaces")
      .select("id, nombre, sector, region, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Augment with user count
    const counts = await Promise.all(
      data.map(async (ws) => {
        const { count } = await admin
          .from("usuarios")
          .select("*", { count: "exact", head: true })
          .eq("workspace_id", ws.id)
          .eq("activo", true);
        return { ...ws, user_count: count ?? 0 };
      })
    );
    return NextResponse.json(counts);
  }

  if (tab === "analytics") {
    function groupBy(arr, key) {
      const counts = {};
      for (const item of arr ?? []) {
        const val = item[key] ?? "desconocido";
        counts[val] = (counts[val] ?? 0) + 1;
      }
      return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }

    function bucketByWeek(rows, field = "created_at") {
      const counts = {};
      for (const row of rows ?? []) {
        const d = new Date(row[field]);
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((day + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, count]) => ({ week, count }));
    }

    const since12w = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString();

    const [
      { count: totalWorkspaces },
      { count: totalUsers },
      { count: totalOTs },
      { count: totalFeedback },
      { data: otsStatus },
      { data: otsTipoTrabajo },
      { data: otsTipo },
      { data: otsWeek },
      { data: usersRol },
      { data: usersWeek },
      { data: wsOTs },
      { data: fbTipo },
      { data: fbRating },
    ] = await Promise.all([
      admin.from("workspaces").select("*", { count: "exact", head: true }),
      admin.from("usuarios").select("*", { count: "exact", head: true }).eq("activo", true),
      admin.from("ordenes_trabajo").select("*", { count: "exact", head: true }),
      admin.from("feedback").select("*", { count: "exact", head: true }),
      admin.from("ordenes_trabajo").select("estado"),
      admin.from("ordenes_trabajo").select("tipo_trabajo"),
      admin.from("ordenes_trabajo").select("tipo"),
      admin.from("ordenes_trabajo").select("created_at").gte("created_at", since12w).order("created_at"),
      admin.from("usuarios").select("rol").eq("activo", true),
      admin.from("usuarios").select("created_at").gte("created_at", since12w).order("created_at"),
      admin.from("ordenes_trabajo").select("workspace_id, workspaces(nombre)").limit(2000),
      admin.from("feedback").select("tipo"),
      admin.from("feedback").select("rating"),
    ]);

    // Top workspaces by OT count
    const wsCounts = {};
    const wsNames = {};
    for (const row of wsOTs ?? []) {
      const id = row.workspace_id;
      wsCounts[id] = (wsCounts[id] ?? 0) + 1;
      wsNames[id] = row.workspaces?.nombre ?? id?.slice(0, 8);
    }
    const topWorkspaces = Object.entries(wsCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([id, value]) => ({ name: wsNames[id], value }));

    return NextResponse.json({
      kpis: {
        workspaces: totalWorkspaces ?? 0,
        users: totalUsers ?? 0,
        ots: totalOTs ?? 0,
        feedback: totalFeedback ?? 0,
      },
      otsByStatus:     groupBy(otsStatus, "estado"),
      otsByTipoTrabajo: groupBy(otsTipoTrabajo, "tipo_trabajo"),
      otsByTipo:       groupBy(otsTipo, "tipo"),
      otsByWeek:       bucketByWeek(otsWeek),
      usersByRol:      groupBy(usersRol, "rol"),
      userGrowth:      bucketByWeek(usersWeek),
      topWorkspaces,
      feedbackByTipo:  groupBy(fbTipo, "tipo"),
      feedbackByRating: groupBy(fbRating, "rating").sort((a, b) => Number(a.name) - Number(b.name)),
    });
  }

  return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
}

// PATCH: update ARCO request status
export async function PATCH(request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SUPERADMIN_EMAIL || user.email !== SUPERADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, estado } = await request.json();
  if (!id || !estado) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("solicitudes_arco")
    .update({ estado })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
