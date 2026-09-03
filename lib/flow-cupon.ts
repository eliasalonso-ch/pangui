/**
 * Cupón de Flow para clientes fundadores.
 *
 * El plan de Flow cobra el precio de lista por el usuario #1 y los usuarios
 * extra van como items al precio real (ver lib/flow-sync.ts). Para un cliente
 * fundador eso dejaría el primer usuario a precio de lista, así que al crear
 * la suscripción se adjunta un cupón de monto fijo que cubre la diferencia.
 *
 * Existen tres lugares que crean suscripciones en Flow (register con link de
 * pago, register/callback con cargo automático, y change-plan al reactivar).
 * Los tres tienen que aplicar el mismo criterio; antes solo lo hacía uno.
 */
export function cuponClienteFundador(
  esFundador: boolean,
  workspaceId: string,
): { couponId: string } | Record<string, never> {
  if (!esFundador) return {};
  const couponId = process.env.FLOW_COUPON_EARLY_CUSTOMER;
  if (!couponId) {
    console.warn(
      "[flow-cupon] workspace %s es cliente fundador pero FLOW_COUPON_EARLY_CUSTOMER no está configurado: " +
      "Flow cobrará el usuario #1 a precio de lista.",
      workspaceId,
    );
    return {};
  }
  return { couponId };
}

/**
 * Precio por usuario que corresponde persistir al (re)crear una suscripción.
 * Un cliente fundador conserva su precio negociado en cualquier tier; el
 * resto toma el precio de catálogo del plan elegido.
 */
export function precioEfectivo(
  prev: { is_early_customer?: boolean | null; price_per_user_clp?: number | null } | null | undefined,
  precioCatalogo: number,
): { esFundador: boolean; precio: number } {
  const esFundador = prev?.is_early_customer === true && (prev.price_per_user_clp ?? 0) > 0;
  return { esFundador, precio: esFundador ? prev!.price_per_user_clp! : precioCatalogo };
}
