/**
 * POST /api/registro
 * Crea usuario en Supabase Auth + planta + perfil en un solo request.
 * Usa service role para evitar exponer credenciales admin al cliente.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const {
    nombre,
    email,
    password,
    empresa_nombre,
    cargo,
    sector,
    tamaño_equipo,
    region,
  } = await req.json();

  // Validación básica
  if (!nombre || !email || !password || !empresa_nombre) {
    return NextResponse.json({ error: "Faltan campos obligatorios." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
  }

  // 1. Crear usuario en Auth
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { nombre },
  });

  if (authError) {
    const msg = authError.message.includes("already registered")
      ? "Ya existe una cuenta con ese correo."
      : authError.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const userId = authData.user.id;

  // 2. Crear workspace (empresa)
  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .insert({
      nombre: empresa_nombre.trim(),
      sector: sector ?? null,
      region: region ?? null,
    })
    .select("id")
    .single();

  if (workspaceError) {
    await admin.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: "Error creando la empresa: " + workspaceError.message }, { status: 500 });
  }

  // 3. Crear perfil usuario
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);

  const { error: perfilError } = await admin.from("usuarios").insert({
    id:           userId,
    workspace_id: workspace.id,
    nombre:       nombre.trim(),
    rol:          "admin",
    cargo:        cargo ?? null,
    plan:         "basic",
    plan_status:  "trial",
    trial_end:    trialEnd.toISOString(),
  });

  if (perfilError) {
    await admin.auth.admin.deleteUser(userId);
    await admin.from("workspaces").delete().eq("id", workspace.id);
    return NextResponse.json({ error: "Error creando perfil: " + perfilError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
