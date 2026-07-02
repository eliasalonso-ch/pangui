/**
 * POST /api/onboarding
 * Completes signup for an already-authenticated user who has NO workspace yet
 * (the typical case: someone who signed in with Google for the first time).
 *
 * The auth user + a bare `usuarios` row already exist (created by the
 * `on_auth_user_created` trigger). Here we provision their workspace, promote
 * them to owner, set cargo/oficio, start the 14-day Pro trial, create the
 * `subscriptions` row, and flip `onboarding_done = true`.
 *
 * Uses the service role because a workspace-less user cannot (under RLS) insert
 * a workspace nor self-promote to owner. We authorize the request by requiring
 * the caller's Supabase access token and only acting on THAT user's id.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // Resolve the caller from their access token — never trust a userId in the body.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Sesión inválida." }, { status: 401 });
  }
  const userId = userData.user.id;

  const {
    nombre,
    empresa_nombre,
    cargo, // human-readable name (back-compat legacy text column)
    cargo_id, // FK to public.cargos.id (canonical)
    oficio, // human-readable name (back-compat)
    oficio_id, // FK to public.oficios.id (canonical)
    sector,
    region,
  } = await req.json();

  if (!nombre || !empresa_nombre) {
    return NextResponse.json(
      { error: "Faltan campos obligatorios." },
      { status: 400 }
    );
  }

  // Guard: only run for a user who hasn't been onboarded / has no workspace yet.
  // This makes the endpoint idempotent-safe — a double tap can't create a second
  // workspace or wipe an existing membership.
  const { data: perfil, error: perfilErr } = await admin
    .from("usuarios")
    .select("id, workspace_id, onboarding_done")
    .eq("id", userId)
    .maybeSingle();

  if (perfilErr) {
    return NextResponse.json(
      { error: "Error leyendo el perfil: " + perfilErr.message },
      { status: 500 }
    );
  }
  if (perfil?.workspace_id) {
    // Already belongs to a workspace (e.g. arrived via invite). Nothing to do.
    return NextResponse.json(
      { error: "Tu cuenta ya pertenece a un espacio de trabajo." },
      { status: 409 }
    );
  }

  // 1. Create the workspace (empresa)
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
    return NextResponse.json(
      { error: "Error creando la empresa: " + workspaceError.message },
      { status: 500 }
    );
  }

  // 2. Promote the existing usuarios row to owner + fill profile data.
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 14);

  const { error: updErr } = await admin
    .from("usuarios")
    .update({
      workspace_id: workspace.id,
      nombre: nombre.trim(),
      rol: "owner",
      cargo: cargo ?? null,
      cargo_id: cargo_id ?? null,
      oficio: oficio ?? null,
      oficio_id: oficio_id ?? null,
      plan: "pro",
      plan_status: "trial",
      trial_end: trialEnd.toISOString(),
      onboarding_done: true,
    })
    .eq("id", userId);

  if (updErr) {
    // Roll back the orphan workspace so a retry starts clean.
    await admin.from("workspaces").delete().eq("id", workspace.id);
    return NextResponse.json(
      { error: "Error completando el perfil: " + updErr.message },
      { status: 500 }
    );
  }

  // 3. Subscription row in status trialing (Pro features, no Flow charge yet).
  const { error: subError } = await admin.from("subscriptions").insert({
    workspace_id: workspace.id,
    plan_key: "pro",
    status: "trialing",
    trial_end: trialEnd.toISOString(),
    price_per_user_clp: 0,
  });
  if (subError) {
    // Not fatal — user can still use the app. Log and continue.
    console.error("[onboarding] subscription insert failed:", subError);
  }

  return NextResponse.json({ ok: true, workspace_id: workspace.id });
}
