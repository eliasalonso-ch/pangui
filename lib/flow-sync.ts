/**
 * Sincroniza la cantidad de usuarios cobrables de un workspace con su
 * suscripción en Flow.
 *
 * Modelo de cobro:
 *   - El plan de Flow cubre al usuario #1 (precio por usuario, en bruto).
 *   - Los usuarios extra van como UN ítem de suscripción con `quantity`.
 *
 * Contrato real de Flow, verificado contra producción el 2026-09-03 (la
 * documentación pública no lo describe):
 *
 *   - Los ítems son un catálogo del comercio: se crean UNA vez con
 *     /subscription_item/create {name, amount, currency} y devuelven un `id`.
 *   - /subscription/addItem exige `itemId` de ese catálogo. Mandar `name` y
 *     `amount` responde "104 Missing service params: itemId" — que es lo que
 *     hacía la versión anterior, así que nunca agregó un ítem.
 *   - La cantidad se fija con /subscription/updateItem {itemId, quantity}.
 *   - Los ítems asociados se leen de /subscription/get → `items[]`.
 *     /subscription/listItems responde "105 No services available" incluso
 *     con ítems asociados: no sirve.
 *   - Los ítems afectan la PRÓXIMA factura, no una ya emitida.
 *
 * Idempotente: se puede llamar cuantas veces haga falta. No hace nada en
 * trial, basic_free, cancelada ni enterprise (facturación fuera de la
 * plataforma).
 */
import { adminSupabase } from "@/app/api/suscripcion/_helpers";
import { flow } from "@/lib/flow";
import { montoParaFlow } from "@/lib/tributario";

/** Cliente Supabase con service role, en su forma mínima. */
type Admin = { from(tabla: string): any };  // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Usuarios que van como ítem de la suscripción: los cobrables menos el #1,
 * que ya cubre el plan.
 *
 * `excluir_de_facturacion` deja fuera a las cuentas de staff de Pangui que
 * viven dentro del workspace de un cliente: acceso completo, sin sumar al
 * cobro. Ver 20260729180000_usuarios_excluir_de_facturacion.sql. Un usuario
 * dado de baja conserva su fila para el historial, pero no se cobra.
 */
export async function usuariosExtra(admin: Admin, workspaceId: string): Promise<number> {
  const { count } = await admin
    .from("usuarios")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("activo", true)
    .eq("excluir_de_facturacion", false)
    .is("deleted_at", null);
  return Math.max(0, (count ?? 0) - 1);
}

/**
 * Ítem que cubre a TODOS los usuarios extra en una sola línea, para adjuntar
 * en `planAdditionalList` al crear la suscripción.
 *
 * Se usa solo al contratar: Flow rechaza el mismo itemId repetido en esa
 * lista y no acepta cantidad al crear, así que el monto total va en el propio
 * ítem. Después, la reconciliación en curso usa el modelo de `quantity`, que
 * sí se puede ajustar sobre una suscripción viva.
 *
 * `montoPorUsuario` es BRUTO (ya pasado por montoParaFlow).
 */
export async function itemUsuariosExtra(
  extras: number,
  montoPorUsuario: number,
): Promise<{ id: number }> {
  return itemDeCatalogo(extras * montoPorUsuario, `${extras} usuarios adicionales`);
}

export async function syncSubscriptionToUserCount(workspaceId: string): Promise<void> {
  const admin = adminSupabase();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, flow_subscription_id, status, plan_key, price_per_user_clp")
    .eq("workspace_id", workspaceId)
    .neq("status", "canceled")
    .maybeSingle();

  if (!sub) return;
  if (!sub.flow_subscription_id)               return; // trialing / basic_free
  if (!["active", "past_due"].includes(sub.status)) return;
  if (sub.plan_key === "enterprise")           return; // off-platform billing
  if (!sub.price_per_user_clp || sub.price_per_user_clp <= 0) return;

  const extras = await usuariosExtra(admin, workspaceId);
  // `price_per_user_clp` es neto; Flow cobra el bruto.
  const monto = montoParaFlow(sub.price_per_user_clp);

  try {
    await reconciliarItems(sub.flow_subscription_id, extras, monto);
  } catch (err) {
    // No bloquea invitaciones ni contrataciones por un fallo de Flow: queda
    // en el log y el barrido de /api/suscripcion/reconciliar lo reintenta.
    console.error("[flow-sync] error syncing items:", err);
  }
}

/**
 * Deja la suscripción con exactamente un ítem "usuario adicional" al monto
 * dado y con cantidad `extras`, o sin ítems si `extras` es 0.
 */
async function reconciliarItems(subscriptionId: string, extras: number, monto: number): Promise<void> {
  const flowSub = await flow.getSubscription(subscriptionId);
  const asociados = flowSub.items ?? [];

  const item = extras > 0 ? await itemUsuarioAdicional(monto) : null;

  // Cualquier ítem que no sea el correcto sobra: otro precio (cambio de plan
  // o de precio) o ya no hay usuarios extra.
  for (const a of asociados) {
    if (item && a.item_id === item.id) continue;
    await flow.removeSubscriptionItem({ subscriptionId, itemId: a.item_id });
  }

  if (!item) return;

  const actual = asociados.find(a => a.item_id === item.id);
  if (!actual) {
    // addItem asocia con quantity 1; la cantidad real se fija aparte.
    await flow.addSubscriptionItem({ subscriptionId, itemId: item.id });
    if (extras !== 1) {
      await flow.updateSubscriptionItem({ subscriptionId, itemId: item.id, quantity: extras });
    }
  } else if (actual.quantity !== extras) {
    await flow.updateSubscriptionItem({ subscriptionId, itemId: item.id, quantity: extras });
  }
}

/** Ítem del catálogo para un usuario adicional a ese monto bruto. */
async function itemUsuarioAdicional(monto: number): Promise<{ id: number }> {
  return itemDeCatalogo(monto, `Usuario adicional $${monto.toLocaleString("es-CL")}`);
}

/**
 * Busca un ítem del catálogo de Flow por monto, y lo crea si no existe.
 *
 * El catálogo es del comercio, no del cliente: se reutiliza entre workspaces
 * con el mismo monto. Por eso la búsqueda es por `amount` y no por nombre —
 * hay un ítem por cada precio en circulación (uno por tier, más uno por cada
 * precio negociado de cliente fundador, más uno por cada total de usuarios
 * extra que se haya contratado).
 */
async function itemDeCatalogo(monto: number, nombre: string): Promise<{ id: number }> {
  const catalogo = await flow.listSubscriptionItemCatalog();
  const existente = catalogo.data?.find(i => Number(i.amount) === monto && i.status === 1);
  if (existente) return { id: existente.id };

  const creado = await flow.createSubscriptionItem({ name: nombre, amount: monto, currency: "CLP" });
  return { id: creado.id };
}
