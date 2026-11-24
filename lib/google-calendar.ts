import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase, getServerUser, shouldRedirectToLogin } from "@/lib/supabase-server";
import { esAdmin } from "@/lib/roles";

/**
 * Google Calendar con OAuth (etapa 2 de pendientes → calendario). Solo servidor:
 * usa GOOGLE_CLIENT_SECRET y la service role. Especificación en
 * docs/superpowers/plans/2026-11-23-google-calendar-oauth.md.
 *
 * Flujo: /api/google/auth → Google → /api/google/callback (guarda el refresh
 * token en Vault) → la persona elige su calendario → la edge function gcal-sync
 * escribe sus pendientes. La conexión es personal: una por usuario.
 */

export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

export { firmarState, verificarState } from "@/lib/google-state";

// ── Google ───────────────────────────────────────────────────────────────────

const credenciales = () => {
  const id = process.env.GOOGLE_CLIENT_ID, secreto = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secreto) throw new Error("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
  return { id, secreto };
};

export const redirectUri = (req: Request) => `${new URL(req.url).origin}/api/google/callback`;

export function urlAutorizacion(req: Request, state: string): string {
  const q = new URLSearchParams({
    client_id: credenciales().id,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent: que Google entregue un refresh token cada vez.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function token(body: Record<string, string>) {
  const { id, secreto } = credenciales();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secreto, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw Object.assign(new Error(json.error_description ?? json.error ?? "Error de Google"), { codigo: json.error });
  return json as { access_token: string; refresh_token?: string; scope?: string };
}

export const canjearCodigo = (req: Request, code: string) =>
  token({ code, grant_type: "authorization_code", redirect_uri: redirectUri(req) });

export const accessToken = async (refresh: string) =>
  (await token({ refresh_token: refresh, grant_type: "refresh_token" })).access_token;

export async function revocar(tokenGoogle: string): Promise<void> {
  // Si ya estaba revocado, Google responde 400: da igual, el fin es el mismo.
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenGoogle)}`, { method: "POST" }).catch(() => {});
}

export interface CalendarioGoogle { id: string; nombre: string; principal: boolean }

/** Los calendarios donde la cuenta puede escribir (writer u owner). */
export async function listarCalendarios(access: string): Promise<CalendarioGoogle[]> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer&maxResults=250", {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) throw new Error(`Google respondió ${res.status} al listar calendarios`);
  const json = await res.json() as { items?: { id: string; summary: string; summaryOverride?: string; primary?: boolean }[] };
  return (json.items ?? []).map(c => ({ id: c.id, nombre: c.summaryOverride || c.summary, principal: !!c.primary }));
}

// ── Pangui ───────────────────────────────────────────────────────────────────

export const supabaseAdmin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const secretoState = () => credenciales().secreto;

/** Sesión real + owner/admin. Devuelve el usuario y su workspace, o la respuesta de error. */
export async function adminActual(): Promise<{ uid: string; ws: string } | { error: NextResponse }> {
  const [sb, auth] = await Promise.all([createServerSupabase(), getServerUser()]);
  if (shouldRedirectToLogin(auth)) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };
  if (!auth.user) return { error: NextResponse.json({ error: "No se pudo verificar la sesión" }, { status: 503 }) };
  const { data: perfil } = await sb.from("usuarios").select("rol, workspace_id").eq("id", auth.user.id).maybeSingle();
  if (!perfil?.workspace_id || !esAdmin(perfil.rol)) {
    return { error: NextResponse.json({ error: "Solo owner o admin" }, { status: 403 }) };
  }
  return { uid: auth.user.id, ws: perfil.workspace_id };
}

/** Access token de la conexión de una persona, con el refresh token guardado en Vault. */
export async function accessTokenDelUsuario(uid: string): Promise<string> {
  const { data: refresh, error } = await supabaseAdmin().rpc("gcal_refresh_token", { p_usuario: uid });
  if (error) throw error;
  if (!refresh) throw new Error("Google Calendar no está conectado");
  return accessToken(refresh as string);
}
