/**
 * GET /api/google/callback — vuelta de Google después del consentimiento, para
 * Google Calendar y Google Tasks (el `state` dice cuál se estaba conectando).
 *
 * Valida la sesión (owner/admin), que el `state` lo haya firmado este mismo
 * usuario para este workspace, y que el usuario haya aceptado los permisos del
 * destino (en la pantalla de Google se pueden desmarcar). Canjea el código,
 * guarda el refresh token en Vault junto con los permisos concedidos
 * (gcal_guardar_conexion, solo service_role) y vuelve a la página de la
 * integración, donde el panel pide elegir el calendario o la lista.
 */
import { NextResponse } from "next/server";
import {
  SCOPES_REQUERIDOS, adminActual, canjearCodigo, correoDelIdToken, secretoState, supabaseAdmin, verificarState,
} from "@/lib/google-calendar";
import type { DestinoGoogle } from "@/lib/google-state";

const PAGINA: Record<DestinoGoogle, string> = {
  calendar: "/integraciones/google-calendar?calendario=",
  tasks: "/integraciones/google-tasks?tareas=",
};
const volver = (req: Request, destino: DestinoGoogle, resultado: string) =>
  NextResponse.redirect(new URL(`${PAGINA[destino]}${encodeURIComponent(resultado)}`, req.url));

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  const yo = await adminActual();
  if ("error" in yo) return yo.error;

  const state = verificarState(q.get("state") ?? "", secretoState());
  const destino = state?.destino ?? "calendar";
  if (q.get("error")) return volver(req, destino, "cancelado");          // el usuario apretó "Cancelar"
  if (!state || state.ws !== yo.ws || state.uid !== yo.uid) return volver(req, destino, "invalido");

  const code = q.get("code");
  if (!code) return volver(req, destino, "invalido");

  try {
    const tokens = await canjearCodigo(req, code);
    const otorgados = (tokens.scope ?? "").split(" ");
    if (!SCOPES_REQUERIDOS[destino].every(s => otorgados.includes(s))) return volver(req, destino, "permisos");
    if (!tokens.refresh_token) return volver(req, destino, "error");

    // Correo para "Conectado como …": del id_token (Tasks pide openid email) o,
    // si hay permiso de Calendar, del id del calendario principal. Si no hay
    // ninguno, la base deja el que ya tenía la conexión.
    let email = correoDelIdToken(tokens.id_token);
    if (!email && otorgados.includes("https://www.googleapis.com/auth/calendar.calendarlist.readonly")) {
      const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList/primary", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      email = res.ok ? (await res.json() as { id?: string }).id ?? null : null;
    }

    const { error } = await supabaseAdmin().rpc("gcal_guardar_conexion", {
      p_workspace: yo.ws, p_usuario: yo.uid, p_email: email, p_refresh: tokens.refresh_token, p_scopes: tokens.scope ?? "",
    });
    if (error) throw error;
    return volver(req, destino, "conectado");
  } catch (e) {
    console.error("google callback:", e);
    return volver(req, destino, "error");
  }
}
