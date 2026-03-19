// supabase/functions/invitar/index.ts
// Deno Edge Function — replaces /api/invitar Next.js route.
// Runs on Supabase infrastructure, same region as the DB.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON    = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Verify caller JWT and check jefe role
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "No autenticado" }, 401);

  // Get caller identity using anon client + user token
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
  if (authError || !caller) return json({ error: "Token inválido" }, 401);

  const { data: callerPerfil } = await admin
    .from("usuarios")
    .select("rol, planta_id")
    .eq("id", caller.id)
    .maybeSingle();

  if (!callerPerfil || callerPerfil.rol !== "jefe") {
    return json({ error: "Solo el jefe puede invitar miembros." }, 403);
  }

  // Parse body
  const { nombre, email, password, rol } = await req.json();

  if (!nombre || !email || !password || !rol) {
    return json({ error: "Faltan campos requeridos." }, 400);
  }
  if (!["tecnico", "jefe"].includes(rol)) {
    return json({ error: "Rol inválido." }, 400);
  }

  // Create auth user
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) return json({ error: createError.message }, 400);

  // Insert profile in usuarios table
  const { error: dbError } = await admin.from("usuarios").insert({
    id:        newUser.user.id,
    planta_id: callerPerfil.planta_id,
    nombre:    nombre.trim(),
    rol,
  });

  if (dbError) {
    // Rollback: delete the orphaned auth user
    await admin.auth.admin.deleteUser(newUser.user.id);
    return json({ error: dbError.message }, 500);
  }

  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
