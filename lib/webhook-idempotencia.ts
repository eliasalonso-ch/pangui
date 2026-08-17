/**
 * Clave de idempotencia para los webhooks de Flow.
 *
 * Flow reintenta la notificación si no recibe 200 a tiempo, y puede entregar
 * el mismo evento más de una vez. Hasta ahora el handler reprocesaba todo en
 * cada llamada: insertaba un evento nuevo en `subscription_events` y, si había
 * una bajada de plan agendada y vencida, llamaba a `changePlan` otra vez.
 *
 * La clave se deriva del contenido del evento, no de un identificador que Flow
 * no siempre manda: misma suscripción + mismo estado + mismo período = mismo
 * evento. El índice único parcial de `subscription_events.idempotency_key`
 * (ver 20260817120000_facturacion_spa_iva.sql) hace que el segundo intento de
 * insertar falle con 23505, que es la señal para no reprocesar.
 *
 * Deliberadamente NO se incluye la hora: dos entregas del mismo evento llegan
 * en instantes distintos y deben colapsar en una sola clave.
 */

/** Código de Postgres para violación de índice único. */
export const UNIQUE_VIOLATION = "23505";

export interface EntradaWebhook {
  subscriptionId: string;
  /** Estado ya mapeado al vocabulario local (active, past_due, canceled…). */
  status: string;
  /** Inicio del período vigente según Flow, si viene. */
  periodStart?: string | null;
  /** Fecha del próximo cobro según Flow, si viene. */
  nextInvoiceDate?: string | null;
}

/**
 * Construye la clave de idempotencia de un evento.
 *
 * Incluir el período es lo que permite distinguir la renovación del mes
 * siguiente (evento legítimamente nuevo, misma suscripción y mismo estado) de
 * una reentrega del evento de este mes.
 */
export function claveIdempotencia(entrada: EntradaWebhook): string {
  const periodo = entrada.periodStart ?? entrada.nextInvoiceDate ?? "sin-periodo";
  return [entrada.subscriptionId, entrada.status, periodo].join(":");
}

/**
 * ¿El error de una inserción indica que el evento ya estaba registrado?
 * Se usa para distinguir "duplicado, no reprocesar" de un fallo real de base.
 */
export function esDuplicado(error: { code?: string } | null | undefined): boolean {
  return error?.code === UNIQUE_VIOLATION;
}
