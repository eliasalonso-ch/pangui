import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function serverSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

export const adminSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface CallerContext {
  userId:      string;
  email:       string;
  workspaceId: string;
  rol:         string;
}

/**
 * Resolves the authenticated caller plus their workspace & role.
 * Returns 403 unless the caller is the workspace OWNER. Subscription/billing
 * is owner-only: admins manage day-to-day, but only the owner pays.
 *
 * Function name kept for back-compat with existing call sites; the gate is
 * now stricter than "admin".
 */
export async function requireAdminOfWorkspace(): Promise<
  { ctx: CallerContext; error: null } | { ctx: null; error: Response }
> {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return { ctx: null, error: Response.json({ error: "No autenticado." }, { status: 401 }) };
  }
  const { data: perfil } = await sb
    .from("usuarios")
    .select("rol, workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.workspace_id) {
    return { ctx: null, error: Response.json({ error: "Usuario sin workspace." }, { status: 400 }) };
  }
  if (perfil.rol !== "owner") {
    return { ctx: null, error: Response.json({ error: "Solo el owner puede gestionar la suscripción." }, { status: 403 }) };
  }
  return {
    ctx: {
      userId:      user.id,
      email:       user.email!,
      workspaceId: perfil.workspace_id,
      rol:         perfil.rol,
    },
    error: null,
  };
}
