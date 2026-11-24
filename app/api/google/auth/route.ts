/**
 * GET /api/google/auth — inicia la conexión con Google Calendar (owner/admin).
 * Redirige a la pantalla de consentimiento de Google con un `state` firmado
 * que ata la vuelta (/api/google/callback) a este usuario y workspace.
 */
import { NextResponse } from "next/server";
import { adminActual, firmarState, secretoState, urlAutorizacion } from "@/lib/google-calendar";

export async function GET(req: Request) {
  const yo = await adminActual();
  if ("error" in yo) return yo.error;
  return NextResponse.redirect(urlAutorizacion(req, firmarState(yo.ws, yo.uid, secretoState())));
}
