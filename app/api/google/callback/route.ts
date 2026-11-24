/**
 * GET /api/google/callback — vuelta de Google después del consentimiento.
 *
 * Valida la sesión (owner/admin), que el `state` lo haya firmado este mismo
 * usuario para este workspace, y que el usuario haya aceptado los dos permisos
 * (en la pantalla de Google se pueden desmarcar). Canjea el código, guarda el
 * refresh token en Vault (gcal_guardar_conexion, solo service_role) y vuelve a
 * /integraciones/google-calendar, donde el panel pide elegir el calendario.
 */
import { NextResponse } from "next/server";
import {
  SCOPES, adminActual, canjearCodigo, secretoState, supabaseAdmin, verificarState,
} from "@/lib/google-calendar";

const volver = (req: Request, resultado: string) =>
  NextResponse.redirect(new URL(`/integraciones/google-calendar?calendario=${encodeURIComponent(resultado)}`, req.url));

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  if (q.get("error")) return volver(req, "cancelado");          // el usuario apretó "Cancelar"

  const yo = await adminActual();
  if ("error" in yo) return yo.error;

  const state = verificarState(q.get("state") ?? "", secretoState());
  if (!state || state.ws !== yo.ws || state.uid !== yo.uid) return volver(req, "invalido");

  const code = q.get("code");
  if (!code) return volver(req, "invalido");

  try {
    const tokens = await canjearCodigo(req, code);
    const otorgados = (tokens.scope ?? "").split(" ");
    if (!SCOPES.every(s => otorgados.includes(s))) return volver(req, "permisos");
    if (!tokens.refresh_token) return volver(req, "error");

    // El id del calendario principal es el correo de la cuenta: sirve para
    // mostrar "Conectado como …" sin pedir el permiso de perfil.
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList/primary", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const principal = res.ok ? await res.json() as { id?: string } : {};
    const email = principal.id ?? "Cuenta de Google";

    const { error } = await supabaseAdmin().rpc("gcal_guardar_conexion", {
      p_workspace: yo.ws, p_usuario: yo.uid, p_email: email, p_refresh: tokens.refresh_token,
    });
    if (error) throw error;
    return volver(req, "conectado");
  } catch (e) {
    console.error("google callback:", e);
    return volver(req, "error");
  }
}
