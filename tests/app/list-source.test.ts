import { describe, it, expect } from "vitest";
import { needsFullWorkspaceSet } from "@/app/(app)/ordenes/list-source";
import type { FiltrosState } from "@/types/ordenes";


const SIN_FILTROS: FiltrosState = {
  estados: [],
  prioridades: [],
  tipos: [],
  asignadoIds: [],
  ubicacionIds: [],
  sociedadIds: [],
  itos: [],
  categoriaIds: [],
  fechaVencimiento: null,
  sinAsignar: false,
  soloAsignados: false,
  deUsuariosDadosDeBaja: false,
};

const base = { scope: "todas", ocultarMarcadas: false, filtros: SIN_FILTROS };

describe("needsFullWorkspaceSet", () => {
  it("sin nada activo, la lista paginada basta", () => {
    expect(needsFullWorkspaceSet(base)).toBe(false);
  });

  // La regresión: el bucket "Faltan materiales" contaba 1 sobre el set completo
  // mientras la lista miraba solo la página 1, así que aparecía vacía hasta
  // scrollear. `scope` tiene que pedir el set completo igual que `filtros`.
  it("un scope activo exige el set completo", () => {
    expect(needsFullWorkspaceSet({ ...base, scope: "materiales" })).toBe(true);
    expect(needsFullWorkspaceSet({ ...base, scope: "vencidas" })).toBe(true);
    expect(needsFullWorkspaceSet({ ...base, scope: "sin_asignar" })).toBe(true);
  });

  it("ocultar marcadas también estrecha la lista", () => {
    expect(needsFullWorkspaceSet({ ...base, ocultarMarcadas: true })).toBe(true);
  });

  it.each([
    ["estados", { estados: ["completado"] }],
    ["prioridades", { prioridades: ["urgente"] }],
    ["tipos", { tipos: ["reactiva"] }],
    ["asignadoIds", { asignadoIds: ["u1"] }],
    ["ubicacionIds", { ubicacionIds: ["ub1"] }],
    ["sociedadIds", { sociedadIds: ["s1"] }],
    ["itos", { itos: ["ITO 1"] }],
    ["categoriaIds", { categoriaIds: ["c1"] }],
    ["fechaVencimiento", { fechaVencimiento: "hoy" }],
    ["sinAsignar", { sinAsignar: true }],
    ["soloAsignados", { soloAsignados: true }],
    ["deUsuariosDadosDeBaja", { deUsuariosDadosDeBaja: true }],
  ])("el filtro %s exige el set completo", (_name, over) => {
    expect(
      needsFullWorkspaceSet({ ...base, filtros: { ...SIN_FILTROS, ...over } as FiltrosState }),
    ).toBe(true);
  });

  /**
   * La regresión real, con los números del workspace donde apareció: 22 OTs, las
   * 20 más nuevas completadas y las 2 pendientes al final. Como la página es de
   * 20 y viene ordenada created_at DESC, la primera página eran 20 completadas:
   * la pestaña Pendientes renderizaba vacía mientras su contador marcaba 2.
   *
   * Con el snapshot completo en memoria la lista tiene que preferirlo, aunque no
   * haya ni un filtro ni un scope puesto.
   */
  it("con el snapshot completo en memoria, la lista lo prefiere", () => {
    expect(needsFullWorkspaceSet({ ...base, haySnapshotCompleto: true })).toBe(true);
  });

  // Y el contrapeso: sin snapshot no puede exigirlo, o el scroll infinito
  // quedaría muerto (siempre pediría el set completo y nunca paginaría).
  it("sin snapshot completo sigue paginando", () => {
    expect(needsFullWorkspaceSet({ ...base, haySnapshotCompleto: false })).toBe(false);
    expect(needsFullWorkspaceSet(base)).toBe(false);
  });
});
