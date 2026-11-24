/**
 * GET /api/google/calendarios — calendarios de la cuenta conectada donde se
 * puede escribir, para que la persona elija a cuál van sus pendientes.
 * 409 { revocado: true } si Google ya no acepta el token (hay que reconectar).
 */
import { NextResponse } from "next/server";
import { accessTokenDelUsuario, adminActual, listarCalendarios } from "@/lib/google-calendar";

export async function GET() {
  const yo = await adminActual();
  if ("error" in yo) return yo.error;
  try {
    const access = await accessTokenDelUsuario(yo.uid);
    return NextResponse.json({ calendarios: await listarCalendarios(access) });
  } catch (e) {
    const codigo = (e as { codigo?: string }).codigo;
    if (codigo === "invalid_grant") return NextResponse.json({ revocado: true }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 502 });
  }
}
