// lib/perfil-usuario.ts
//
// Una unica consulta a `usuarios` por la fila del usuario actual, compartida
// por toda la app.
//
// Mismo problema que resolvio `getAuthUser()` para /auth/v1/user, un nivel mas
// abajo: cada componente del layout pedia su propio trozo de la MISMA fila
// (GlobalTopBar "nombre, rol"; AppSidebar "workspace_id, rol, nombre"; el
// tablero "nombre, workspace_id, rol"; getSoloAsignadasUserId "rol,
// solo_asignadas"). En el HAR del 2026-09-01 eso salia como 5 GET simultaneos
// a usuarios?id=eq.<mismo id>, cada uno con su preflight OPTIONS: desde Chile
// a us-east-1 el preflight cuesta ~190 ms y la consulta ~20 ms, asi que se
// pagaba casi un segundo de latencia para traer una fila que ya se tenia.
//
// Se pide el superconjunto de columnas una sola vez y cada llamador toma lo
// suyo. Como en `auth-user.ts`, se cachea la promesa en vuelo y no solo el
// resultado, para que los llamadores concurrentes —que es el caso real: todos
// montan a la vez— compartan una sola ida y vuelta.

import { createClient } from "./supabase";
import { getAuthUser } from "./auth-user";

export interface PerfilUsuario {
  id: string;
  nombre: string | null;
  rol: string | null;
  workspace_id: string | null;
  solo_asignadas: boolean | null;
}

/** Superconjunto de lo que piden los llamadores. Al agregar una columna aqui,
 *  revisar que siga siendo una sola consulta y no varias. */
const PERFIL_SELECT = "id, nombre, rol, workspace_id, solo_asignadas";

let perfilCache: { perfil: PerfilUsuario | null } | null = null;
let perfilEnVuelo: Promise<PerfilUsuario | null> | null = null;

/**
 * Devuelve la fila de `usuarios` del usuario autenticado, compartiendo una
 * sola consulta entre todos los llamadores concurrentes. Queda cacheada hasta
 * que cambie la sesion o se llame a `resetPerfilUsuarioCache`.
 *
 * Devuelve null si no hay sesion. Un fallo de red tampoco se cachea: el
 * siguiente llamador reintenta.
 */
export function getPerfilUsuario(): Promise<PerfilUsuario | null> {
  if (perfilCache) return Promise.resolve(perfilCache.perfil);
  if (perfilEnVuelo) return perfilEnVuelo;

  perfilEnVuelo = (async () => {
    try {
      const user = await getAuthUser();
      if (!user) return null;

      const { data, error } = await createClient()
        .from("usuarios")
        .select(PERFIL_SELECT)
        .eq("id", user.id)
        .maybeSingle();

      // Un error de red no se cachea, para que el siguiente llamador reintente.
      // AppSidebar depende de esto: si `rol` queda en null dibuja el menu sin
      // los items de administracion y sin aviso ninguno.
      if (error) return null;

      perfilCache = { perfil: (data as PerfilUsuario | null) ?? null };
      return perfilCache.perfil;
    } catch {
      return null;
    } finally {
      perfilEnVuelo = null;
    }
  })();

  return perfilEnVuelo;
}

/**
 * Invalida la cache. Hay que llamarla tras editar el perfil propio (nombre,
 * rol, workspace) o la pantalla seguiria mostrando el valor viejo hasta
 * recargar.
 */
export function resetPerfilUsuarioCache() {
  perfilCache = null;
  perfilEnVuelo = null;
}
