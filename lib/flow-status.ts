/**
 * Traduce el estado de una suscripción de Flow al vocabulario local.
 *
 * Flow parte el estado en dos campos y la combinación importa:
 *
 *   status: 0 inactiva, 1 activa, 2 trial, 4 cancelada
 *   morose: 0 al día, 1 vencida, 2 pendiente de pago
 *
 * El caso que se presta a confusión es `status = 1` con `morose = 2`. No
 * significa "activa y al día": es una suscripción creada cuyo cobro todavía no
 * entró — el estado normal entre crearla y que el cliente pague el primer
 * link. Tratarla como `active` tiene dos consecuencias malas:
 *
 *   1. El cliente obtiene acceso pagado sin haber pagado.
 *   2. Desde que el webhook emite documentos tributarios, se generaría una
 *      factura por un cobro inexistente, obligando a una nota de crédito.
 *
 * Verificado contra Flow sandbox: una suscripción recién creada, con el link
 * de pago sin pagar, responde status=1 + morose=2.
 */

export type EstadoSuscripcion =
  | "trialing" | "active" | "past_due" | "unpaid" | "canceled";

export interface EstadoFlow {
  status: number;
  morose?: number;
}

/** Solo `morose = 0` (al día) cuenta como pagada. */
export function estadoDesdeFlow(flow: EstadoFlow): EstadoSuscripcion {
  switch (flow.status) {
    case 0: return "unpaid";
    case 2: return "trialing";
    case 4: return "canceled";
    case 1: return flow.morose === 1 || flow.morose === 2 ? "past_due" : "active";
    // Un estado que Flow no documenta: se asume lo más conservador posible
    // antes que regalar acceso o emitir una factura.
    default: return "past_due";
  }
}

/** ¿Este estado corresponde a un período efectivamente pagado? */
export function estaPagada(estado: EstadoSuscripcion): boolean {
  return estado === "active";
}
