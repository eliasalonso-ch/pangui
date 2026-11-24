/**
 * GET /api/google/auth?destino=calendar|tasks — inicia la conexión con Google
 * (owner/admin). Redirige a la pantalla de consentimiento de Google con los
 * permisos de ese destino y un `state` firmado que ata la vuelta
 * (/api/google/callback) a este usuario, workspace y destino.
 */
import { NextResponse } from "next/server";
import { adminActual, firmarState, secretoState, urlAutorizacion } from "@/lib/google-calendar";

export async function GET(req: Request) {
  const yo = await adminActual();
  if ("error" in yo) return yo.error;
  const destino = new URL(req.url).searchParams.get("destino") === "tasks" ? "tasks" : "calendar";
  return NextResponse.redirect(urlAutorizacion(req, firmarState(yo.ws, yo.uid, secretoState(), Date.now(), destino), destino));
}
