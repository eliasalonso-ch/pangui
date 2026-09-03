/**
 * GET /api/suscripcion/reconciliar
 *
 * Barrido diario (ver vercel.json). Cubre lo que hoy solo pasa "de rebote":
 *
 *   1. Expirar trials vencidos. La expiración era perezosa: solo corría cuando
 *      alguien del workspace cargaba la web. Un workspace dormido conservaba
 *      Pro indefinidamente (había 4 así en producción).
 *   2. Reconciliar los items de Flow con los usuarios cobrables de cada
 *      suscripción cobrada. Es la red de seguridad si la sincronización en
 *      línea (invitar / desactivar) falló o Flow estaba caído en ese momento.
 *
 * Protegido con CRON_SECRET: Vercel manda `Authorization: Bearer <secret>`
 * en las invocaciones de cron cuando esa variable existe en el proyecto.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "../_helpers";
import { expireTrialsIfNeeded } from "@/lib/trial-expiry";
import { syncSubscriptionToUserCount } from "@/lib/flow-sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = adminSupabase();
  const resumen = { trials_expirados: 0, sincronizadas: 0, errores: 0 };

  const { data: trials } = await admin
    .from("subscriptions")
    .select("id, workspace_id, status, trial_end")
    .eq("status", "trialing")
    .lt("trial_end", new Date().toISOString());

  for (const t of trials ?? []) {
    try {
      if (await expireTrialsIfNeeded(t.workspace_id, t)) resumen.trials_expirados++;
    } catch (err) {
      resumen.errores++;
      console.error("[reconciliar] trial", t.workspace_id, err);
    }
  }

  const { data: cobradas } = await admin
    .from("subscriptions")
    .select("workspace_id")
    .in("status", ["active", "past_due"])
    .not("flow_subscription_id", "is", null);

  for (const s of cobradas ?? []) {
    try {
      await syncSubscriptionToUserCount(s.workspace_id);
      resumen.sincronizadas++;
    } catch (err) {
      resumen.errores++;
      console.error("[reconciliar] sync", s.workspace_id, err);
    }
  }

  console.info("[reconciliar]", resumen);
  return NextResponse.json({ ok: true, ...resumen });
}
