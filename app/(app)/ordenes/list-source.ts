import type { FiltrosState } from "@/types/ordenes";

/**
 * Does the list need the full workspace snapshot instead of the paginated page?
 *
 * The bucket counters ("Faltan materiales", "Vencidas", …) and the tab pills are
 * always computed over the complete workspace set. If the rendered list looks at
 * only the loaded pages while a counter looks at everything, the two disagree:
 * the bucket reads "1" and the list renders empty until the user scrolls far
 * enough for that OT to load.
 *
 * So anything that narrows the list has to be listed here — `scope` and
 * `ocultarMarcadas` included, not just `filtros`.
 *
 * El split de pestañas TAMBIÉN recorta, y por eso está `haySnapshotCompleto`.
 * La página paginada viene ordenada por created_at DESC, así que puede estar
 * compuesta enteramente por OTs de una sola pestaña: un workspace de 22 OTs
 * cuyas 20 más nuevas están completadas mandaba una primera página de 20
 * completadas, y la pestaña Pendientes renderizaba vacía mientras su contador
 * —que sí mira el set completo— marcaba 2. Las 2 pendientes eran las más
 * viejas y vivían en la página 2, que solo se cargaba scrolleando una lista
 * que se veía vacía.
 *
 * No alcanza con mirar la pestaña: si lo hiciéramos, CUALQUIER pestaña exigiría
 * el set completo y el scroll infinito quedaría muerto. Lo que importa es si el
 * snapshot completo ya está en memoria — cuando lo está, usarlo es gratis y
 * además correcto; cuando no, la lista pagina como siempre.
 */
export function needsFullWorkspaceSet(args: {
  scope: string;
  /**
   * ¿Ya tenemos el set completo del workspace en memoria? Cuando es true la
   * lista lo prefiere, porque la página paginada puede no tener ninguna OT de
   * la pestaña activa (ver arriba). No dispara ningún fetch nuevo.
   */
  haySnapshotCompleto?: boolean;
  ocultarMarcadas: boolean;
  filtros: FiltrosState;
}): boolean {
  const { scope, haySnapshotCompleto, ocultarMarcadas, filtros } = args;
  return (
    scope !== "todas" ||
    haySnapshotCompleto === true ||
    ocultarMarcadas ||
    filtros.estados.length > 0 ||
    filtros.prioridades.length > 0 ||
    filtros.tipos.length > 0 ||
    filtros.asignadoIds.length > 0 ||
    filtros.ubicacionIds.length > 0 ||
    filtros.sociedadIds.length > 0 ||
    filtros.itos.length > 0 ||
    filtros.categoriaIds.length > 0 ||
    filtros.fechaVencimiento != null ||
    filtros.sinAsignar ||
    filtros.deUsuariosDadosDeBaja ||
    filtros.soloAsignados
  );
}
