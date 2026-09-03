/**
 * POST /api/suscripcion/sync-usuarios
 *
 * Reconcilia los items de la suscripción en Flow con la cantidad de usuarios
 * cobrables del workspace. La pantalla de Equipo lo llama después de
 * desactivar, reactivar o dar de baja a alguien.
 *
 * Invitar ya sincronizaba (ver /api/invitar), pero desactivar escribía
 * directo en `usuarios` desde el cliente y Flow nunca se enteraba: el cobro
 * seguía contando al usuario desactivado, contra lo que promete la pantalla
 * de suscripción ("puedes desactivar usuarios antes del siguiente ciclo para
 * ajustar el cobro").
 *
 * Idempotente y sin efectos si el workspace no tiene un plan cobrado.
 */
import { NextResponse } from "next/server";
import { serverSupabase } from "../_helpers";
import { syncSubscriptionToUserCount } from "@/lib/flow-sync";
import { esAdmin } from "@/lib/roles";

export async function POST() {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await sb
    .from("usuarios")
    .select("rol, workspace_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.workspace_id) return NextResponse.json({ error: "Sin workspace." }, { status: 400 });
  if (!esAdmin(perfil.rol)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });

  try {
    await syncSubscriptionToUserCount(perfil.workspace_id);
  } catch (err) {
    // flow-sync ya captura sus propios errores; esto cubre fallos de base.
    console.error("[suscripcion/sync-usuarios]", err);
  }
  return NextResponse.json({ ok: true });
}
