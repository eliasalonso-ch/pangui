/**
 * Decide si un webhook de Flow corresponde a un período que hay que facturar.
 *
 * Se separa del handler para poder probar la decisión sin Supabase ni Flow:
 * es la regla que determina si se emite o no un documento tributario, y
 * equivocarse tiene dos costos asimétricos —facturar de más obliga a emitir una
 * nota de crédito, facturar de menos deja ingresos sin declarar.
 *
 * REGLA: solo se factura un período efectivamente PAGADO.
 *
 * Flow notifica muchos estados (trial, impago, cancelación) y la mayoría no
 * genera documento tributario:
 *
 *   - `active`   → el período está pagado. SE FACTURA.
 *   - `trialing` → el cliente no ha pagado nada todavía. No se factura.
 *   - `past_due` → hubo un intento de cobro fallido. No se factura: emitir una
 *                  factura por un cobro que no entró obliga a anularla.
 *   - `unpaid` / `canceled` → nada que facturar.
 *
 * El monto se congela con los usuarios activos al momento del cobro, no al
 * momento de emitir: si el cliente agrega usuarios el día 20, ese cambio va en
 * el cobro siguiente, no en el que ya se pagó.
 */

export interface EntradaPeriodo {
  /** Estado ya mapeado al vocabulario local. */
  status: string;
  /** Inicio del período vigente según Flow. */
  periodStart?: string | null;
  /** Fin del período vigente según Flow. */
  periodEnd?: string | null;
  /** Próximo cobro según Flow; sirve de fin cuando period_end no viene. */
  nextInvoiceDate?: string | null;
}

export interface PeriodoFacturable {
  periodoInicio: string;  // YYYY-MM-DD
  periodoFin:    string;  // YYYY-MM-DD
}

/** Normaliza una fecha de Flow ("2026-08-01 00:00:00" o ISO) a YYYY-MM-DD. */
export function soloFecha(valor: string): string | null {
  const match = valor.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Devuelve el período a facturar, o null si este webhook no genera documento.
 *
 * Null no es un error: la enorme mayoría de los webhooks (trial, reintentos,
 * cancelaciones) legítimamente no producen factura.
 */
export function periodoAFacturar(entrada: EntradaPeriodo): PeriodoFacturable | null {
  // Solo un período pagado se factura.
  if (entrada.status !== "active") return null;

  const inicio = entrada.periodStart ? soloFecha(entrada.periodStart) : null;
  // Flow no siempre manda period_end; next_invoice_date marca el mismo límite
  // (el día en que arranca el período siguiente).
  const finCrudo = entrada.periodEnd ?? entrada.nextInvoiceDate ?? null;
  const fin = finCrudo ? soloFecha(finCrudo) : null;

  // Sin período no se puede identificar qué se está facturando, y el índice
  // único que evita la doble facturación depende de esas fechas. Mejor no
  // registrar nada y que el período aparezca en facturas-pendientes.sql.
  if (!inicio || !fin) return null;

  // Un período invertido indica datos corruptos de Flow; la constraint de la
  // tabla lo rechazaría igual, pero es preferible no intentar la escritura.
  if (fin < inicio) return null;

  return { periodoInicio: inicio, periodoFin: fin };
}
