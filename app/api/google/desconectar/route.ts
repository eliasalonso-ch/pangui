/**
 * POST /api/google/desconectar — revoca el acceso en Google y borra la conexión
 * y el token de Vault (gcal_desconectar, con la sesión del owner/admin). Los
 * eventos ya creados quedan en el calendario.
 */
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { adminActual, revocar, supabaseAdmin } from "@/lib/google-calendar";

export async function POST() {
  const yo = await adminActual();
  if ("error" in yo) return yo.error;

  const { data: refresh } = await supabaseAdmin().rpc("gcal_refresh_token", { p_workspace: yo.ws });
  if (refresh) await revocar(refresh as string);

  const { error } = await (await createServerSupabase()).rpc("gcal_desconectar");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
