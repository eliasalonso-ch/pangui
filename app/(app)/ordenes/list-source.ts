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
 */
export function needsFullWorkspaceSet(args: {
  scope: string;
  ocultarMarcadas: boolean;
  filtros: FiltrosState;
}): boolean {
  const { scope, ocultarMarcadas, filtros } = args;
  return (
    scope !== "todas" ||
    ocultarMarcadas ||
    filtros.estados.length > 0 ||
    filtros.prioridades.length > 0 ||
    filtros.tipos.length > 0 ||
    filtros.asignadoIds.length > 0 ||
    filtros.ubicacionIds.length > 0 ||
    filtros.sociedadIds.length > 0 ||
    filtros.itos.length > 0 ||
    filtros.fechaVencimiento != null ||
    filtros.sinAsignar ||
    filtros.deUsuariosDadosDeBaja ||
    filtros.soloAsignados
  );
}
