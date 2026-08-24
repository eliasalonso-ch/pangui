// lib/auth-user.ts
//
// Un unico `auth.getUser()` compartido por toda la app.
//
// Antes cada componente montado en el layout (GlobalTopBar, AppShell,
// NotificationMenu, AnalyticsIdentity, AppSidebar) llamaba a `getUser()` por su
// cuenta al montarse. Como `getUser()` va a la red, en el HAR del 2026-08-24 eso
// salia como 7 peticiones a /auth/v1/user encadenadas una tras otra —3,5 s antes
// de la primera consulta de datos— porque cada render desbloqueaba la siguiente.
//
// Mismo patron que `getSoloAsignadasUserId` en lib/ordenes-api.ts: se cachea la
// promesa en vuelo, no solo su resultado, para que las llamadas concurrentes
// compartan una sola ida y vuelta en vez de disparar cada una la suya.

import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase";

let userCache: { user: User | null } | null = null;
let userEnVuelo: Promise<User | null> | null = null;

/**
 * Devuelve el usuario autenticado, compartiendo una sola consulta entre todos
 * los llamadores concurrentes. Tras resolverse queda cacheado hasta que cambie
 * la sesion (ver `subscribeAuthUserReset`) o se llame a `resetAuthUserCache`.
 */
export function getAuthUser(): Promise<User | null> {
  if (userCache) return Promise.resolve(userCache.user);
  if (userEnVuelo) return userEnVuelo;

  userEnVuelo = (async () => {
    try {
      const { data: { user } } = await createClient().auth.getUser();
      userCache = { user: user ?? null };
      return userCache.user;
    } catch {
      // No cachear un fallo de red: el siguiente llamador debe reintentar.
      return null;
    } finally {
      userEnVuelo = null;
    }
  })();

  return userEnVuelo;
}

export function resetAuthUserCache() {
  userCache = null;
  userEnVuelo = null;
}

/**
 * Invalida la cache cuando cambia la sesion. Debe montarse una sola vez, en el
 * arbol raiz de la app.
 */
export function subscribeAuthUserReset() {
  const { data: { subscription } } = createClient().auth.onAuthStateChange(() => {
    resetAuthUserCache();
  });
  return () => subscription.unsubscribe();
}
