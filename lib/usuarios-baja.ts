/**
 * Reglas de la baja de usuarios, puras y testeables.
 *
 * La autorización real vive en Postgres (`dar_de_baja_usuario` y las políticas
 * RLS); esto solo decide qué mostrar y qué habilitar en la UI.
 */

export type ActorRol = { id: string; rol: string };
export type UsuarioObjetivo = { id: string; rol: string };

/**
 * ¿Este actor puede desactivar o dar de baja a este usuario?
 *
 * - Nadie se gestiona a sí mismo.
 * - Solo owner y admin gestionan usuarios.
 * - Un admin no puede tocar a otro admin ni al owner: sacar del medio a un par
 *   con los mismos permisos es decisión del owner.
 */
export function puedeGestionarUsuario(actor: ActorRol, objetivo: UsuarioObjetivo): boolean {
  if (actor.id === objetivo.id) return false;
  const esOwner = actor.rol === "owner";
  const esAdmin = actor.rol === "admin" || esOwner;
  if (!esAdmin) return false;
  if (esOwner) return true;
  return objetivo.rol !== "admin" && objetivo.rol !== "owner";
}

/**
 * ¿Se puede confirmar la baja?
 *
 * `null` = todavía se está contando el trabajo abierto; hasta saberlo el botón
 * queda deshabilitado en vez de arriesgar dejar una OT sin responsable.
 */
export function puedeDarDeBaja(otsAbiertas: number | null): boolean {
  return otsAbiertas === 0;
}
