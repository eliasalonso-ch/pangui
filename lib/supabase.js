import { createBrowserClient } from "@supabase/ssr";
import { browserCookieOptions } from "./supabase-cookies";

export function createClient() {
  // cookieOptions scopes the session to .getpangui.com so it is shared entre
  // el apex de marketing y app.getpangui.com. Sin esto el reparto de dominios
  // desloguea a todo el mundo. Ver lib/supabase-cookies.js.
  //
  // OJO CON EL ORDEN: createBrowserClient es un SINGLETON -- cachea la primera
  // instancia y DESCARTA las opciones de todas las llamadas siguientes. Antes
  // esto leia window.location.hostname, que en el render del servidor / antes
  // de hidratar es undefined: si la primera llamada ocurria ahi, el cliente
  // quedaba cacheado SIN cookieOptions y escribia la cookie host-only para
  // siempre.
  //
  // El sintoma: dos juegos de cookies a la vez
  //   sb-<ref>-auth-token.0  (domain .getpangui.com, la escribe proxy.js)
  //   sb-<ref>-auth-token.0  (host-only, la escribe el navegador)
  // document.cookie devuelve las dos con el mismo nombre y el parser se queda
  // con una sola -- a veces la vieja. El cliente no llegaba a persistir nunca
  // el token nuevo, asi que reenviaba el viejo en cada refresh: 20 refrescos en
  // 4 minutos, todos con expires_in=3600 y todos devolviendo el mismo token,
  // hasta agotar el rate limit (429) del endpoint /token.
  //
  // El dominio es una constante, no depende de window: se resuelve igual en
  // servidor y en cliente, asi que la instancia cacheada siempre lleva el scope
  // correcto sea cual sea la llamada que la creo.
  const cookieOptions = browserCookieOptions();

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions,
      // getAll/setAll propios en vez de los de la libreria.
      //
      // Con `domain`, el setAll por defecto hace `document.cookie = serialize(...)`
      // y NO reemplaza la cookie que ya existe con ese nombre pero otro scope:
      // deja las dos (supabase/supabase#30084). Y su getAll usa cookie.parse(),
      // que ante nombres repetidos se queda con UNA sola, a veces la caducada.
      // De ahi el refresco infinito: se escribia la sesion nueva pero se leia la
      // vieja, y el cliente reenviaba el mismo refresh_token una y otra vez.
      //
      // Solo aplica cuando escribimos con dominio; sin el (dev, previews) la
      // cookie host-only es la buena y no hay nada que limpiar.
      ...(cookieOptions?.domain
        ? {
            cookies: {
              getAll: () =>
                document.cookie
                  .split(";")
                  .map((chunk) => chunk.trim())
                  .filter(Boolean)
                  .map((chunk) => {
                    const eq = chunk.indexOf("=");
                    return eq === -1
                      ? { name: chunk, value: "" }
                      : { name: chunk.slice(0, eq), value: decodeURIComponent(chunk.slice(eq + 1)) };
                  }),
              setAll: (cookiesToSet) => {
                cookiesToSet.forEach(({ name, value, options }) => {
                  const path = options?.path ?? "/";
                  // Mata la host-only antes de escribir la del dominio: sin esto
                  // conviven y el nombre aparece repetido en document.cookie.
                  document.cookie = `${name}=; Max-Age=0; path=${path}`;
                  const parts = [
                    `${name}=${encodeURIComponent(value)}`,
                    `path=${path}`,
                    `domain=${cookieOptions.domain}`,
                    `SameSite=${options?.sameSite ?? cookieOptions.sameSite ?? "Lax"}`,
                  ];
                  if (options?.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
                  if (cookieOptions.secure) parts.push("Secure");
                  document.cookie = parts.join("; ");
                });
              },
            },
          }
        : {}),
    }
  );
}

export function logRealtimeChannel(action, details = {}, client) {
  if (process.env.NODE_ENV === "production") return;

  const channelCount =
    client && typeof client.getChannels === "function"
      ? client.getChannels().length
      : undefined;

  console.info("[pangui:realtime]", {
    action,
    at: new Date().toISOString(),
    channelCount,
    ...details,
  });
}
