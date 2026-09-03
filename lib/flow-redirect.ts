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
/**
 * URL pública de la app, para armar los `url_return` que se le pasan a Flow.
 *
 * `NEXT_PUBLIC_APP_URL` se incrusta en tiempo de build, así que si en Vercel
 * está guardada como *Secret* (write-only) el build no puede leerla y llega
 * `undefined` al servidor. Peor: un build local la congela con el valor del
 * `.env.local` de turno, que puede ser un túnel ngrok. Por eso se cae al
 * origen de la petición, que siempre es el dominio real desde el que el
 * usuario está contratando.
 *
 * Se normaliza sin barra final: los llamadores concatenan rutas con "/".
 */
export function urlPublica(req: Request): string {
  const configurada = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base = configurada || new URL(req.url).origin;
  return base.replace(/\/+$/, "");
}

export function urlDeRedireccion(
  respuesta: RespuestaConToken | null | undefined,
  operacion = "la operación",
): string {
  if (!respuesta?.url || !respuesta?.token) {
    throw new FlowRedirectError(operacion, respuesta);
  }
  return `${respuesta.url}?token=${encodeURIComponent(respuesta.token)}`;
}
