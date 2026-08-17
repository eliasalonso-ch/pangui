/**
 * Construcción de las URLs a las que se redirige al usuario en Flow.
 *
 * Flow devuelve `url` y `token` como campos SEPARADOS y espera que el cliente
 * los concatene: `<url>?token=<token>`. Aplica igual a /payment/create y a
 * /customer/register.
 *
 * Redirigir solo a `url` lleva a la página sin contexto y Flow responde
 * "¡Ups! Ha ocurrido un error — Error Processing Request", que no dice nada
 * sobre la causa real. Verificado contra sandbox: la misma URL sin token
 * muestra el error y con token muestra el formulario de tarjeta.
 */

export interface RespuestaConToken {
  url?: string;
  token?: string;
}

export class FlowRedirectError extends Error {
  constructor(operacion: string, respuesta: unknown) {
    super(`Flow no devolvió url + token para ${operacion}.`);
    this.name = "FlowRedirectError";
    this.respuesta = respuesta;
  }
  respuesta: unknown;
}

/**
 * Arma la URL de redirección. Lanza si falta cualquiera de las dos partes:
 * mandar al usuario a una URL incompleta produce un error opaco de Flow, y es
 * preferible fallar acá con un mensaje que diga qué pasó.
 */
export function urlDeRedireccion(
  respuesta: RespuestaConToken | null | undefined,
  operacion = "la operación",
): string {
  if (!respuesta?.url || !respuesta?.token) {
    throw new FlowRedirectError(operacion, respuesta);
  }
  return `${respuesta.url}?token=${encodeURIComponent(respuesta.token)}`;
}
