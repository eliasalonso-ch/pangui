/**
 * POST /api/suscripcion/cancel-scheduled-plan
 *
 * Cancela una bajada de plan agendada, dejando la suscripción en el plan que
 * ya tiene.
 *
 * Una bajada no se aplica al instante: se guarda en `scheduled_plan_key` y se
 * materializa cuando llega el webhook del período siguiente (ver change-plan y
 * el webhook). Eso deja una ventana —el resto del ciclo pagado— en la que el
 * usuario puede arrepentirse sin costo, que es lo que este endpoint permite.
 *
 * No aplica a las subidas de plan: esas se ejecutan de inmediato en Flow y
 * cobran la diferencia, así que no hay nada agendado que cancelar. Para volver
 * atrás desde una subida hay que hacer una bajada normal.
 */
import { NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";

export async function POST() {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const { workspaceId } = auth.ctx;

  const admin = adminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, plan_key, scheduled_plan_key")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ error: "No hay suscripción." }, { status: 404 });
  }

  // Idempotente: si no había nada agendado el resultado deseado ya se cumple.
  // Devolver 404 obligaría a la UI a distinguir un caso que no le importa.
  if (!sub.scheduled_plan_key) {
    return NextResponse.json({ ok: true, unchanged: true, plan_key: sub.plan_key });
  }

  const { error } = await admin
    .from("subscriptions")
    .update({
      scheduled_plan_key: null,
      scheduled_plan_at:  null,
      updated_at:         new Date().toISOString(),
    })
    .eq("id", sub.id);

  if (error) {
    console.error("[suscripcion/cancel-scheduled-plan]", error);
    return NextResponse.json({ error: "No se pudo cancelar el cambio agendado." }, { status: 500 });
  }

  // No se toca Flow: la bajada nunca llegó a aplicarse allá. La suscripción
  // siguió cobrando el plan actual todo este tiempo, que es justo lo que el
  // usuario quiere conservar.
  return NextResponse.json({ ok: true, plan_key: sub.plan_key });
}
