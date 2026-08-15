import { describe, it, expect } from "vitest";
import { applyFiltros, type FilterableOrden, type FilterDeps } from "@/app/(app)/ordenes/filter-predicate";
import type { FiltrosState } from "@/types/ordenes";


const SIN_FILTROS: FiltrosState = {
  estados: [], prioridades: [], tipos: [],
  asignadoIds: [], ubicacionIds: [], sociedadIds: [],
  itos: [],
  fechaVencimiento: null,
  sinAsignar: false,
  soloAsignados: false,
  deUsuariosDadosDeBaja: false,
};

const TODAY = "2026-08-14";

const deps: FilterDeps = {
  ubicaciones: [
    { id: "ub1", sociedad_id: "s1" },
    { id: "ub2", sociedad_id: "s2" },
    { id: "ub3", sociedad_id: null },
  ],
  dadosDeBajaIds: new Set(["baja1"]),
  todayKey: TODAY,
};

function ot(over: Partial<FilterableOrden> = {}): FilterableOrden {
  return {
    estado: "en_curso",
    prioridad: "media",
    tipo_trabajo: "reactiva",
    asignados_ids: ["u1"],
    ubicacion_id: "ub1",
    fecha_termino: null,
    descripcion: null,
    ...over,
  };
}

const run = (list: FilterableOrden[], over: Partial<FiltrosState> = {}, d: FilterDeps = deps) =>
  applyFiltros(list, { ...SIN_FILTROS, ...over }, d);

describe("applyFiltros", () => {
  it("sin filtros no descarta nada", () => {
    const list = [ot(), ot({ estado: "completado" })];
    expect(run(list)).toHaveLength(2);
  });

  it("no muta la lista de entrada", () => {
    const list = [ot({ estado: "en_curso" }), ot({ estado: "completado" })];
    run(list, { estados: ["en_curso"] });
    expect(list).toHaveLength(2);
  });

  it("filtra por estado", () => {
    const list = [ot({ estado: "en_curso" }), ot({ estado: "completado" })];
    expect(run(list, { estados: ["completado"] })).toHaveLength(1);
  });

  it("filtra por prioridad", () => {
    const list = [ot({ prioridad: "urgente" }), ot({ prioridad: "baja" })];
    expect(run(list, { prioridades: ["urgente"] })).toHaveLength(1);
  });

  it("filtra por tipo y descarta las OTs sin tipo", () => {
    const list = [ot({ tipo_trabajo: "preventiva" }), ot({ tipo_trabajo: null })];
    expect(run(list, { tipos: ["preventiva"] })).toHaveLength(1);
  });

  it("filtra por asignado (una OT con varios asignados pasa si coincide uno)", () => {
    const list = [ot({ asignados_ids: ["u1", "u2"] }), ot({ asignados_ids: ["u3"] })];
    expect(run(list, { asignadoIds: ["u2"] })).toHaveLength(1);
  });

  it("filtra por ubicacion", () => {
    const list = [ot({ ubicacion_id: "ub1" }), ot({ ubicacion_id: "ub2" })];
    expect(run(list, { ubicacionIds: ["ub2"] })).toHaveLength(1);
  });

  it("filtra por sociedad resolviendo sus ubicaciones", () => {
    const list = [ot({ ubicacion_id: "ub1" }), ot({ ubicacion_id: "ub2" }), ot({ ubicacion_id: "ub3" })];
    // s1 → ub1 solamente.
    expect(run(list, { sociedadIds: ["s1"] })).toHaveLength(1);
  });

  it("filtra por ITO leyendo el hito de descripcion", () => {
    const list = [
      ot({ descripcion: "N° OT: 1 | Hito: ITO 1\n\ncuerpo" }),
      ot({ descripcion: "N° OT: 2 | Hito: ITO 2\n\ncuerpo" }),
      ot({ descripcion: null }),
    ];
    expect(run(list, { itos: ["ITO 2"] })).toHaveLength(1);
  });

  it("filtra sin asignar", () => {
    const list = [ot({ asignados_ids: [] }), ot({ asignados_ids: null }), ot({ asignados_ids: ["u1"] })];
    expect(run(list, { sinAsignar: true })).toHaveLength(2);
  });

  it("filtra solo asignados", () => {
    const list = [ot({ asignados_ids: [] }), ot({ asignados_ids: ["u1"] })];
    expect(run(list, { soloAsignados: true })).toHaveLength(1);
  });

  it("filtra por usuarios dados de baja", () => {
    const list = [ot({ asignados_ids: ["baja1"] }), ot({ asignados_ids: ["u1"] })];
    expect(run(list, { deUsuariosDadosDeBaja: true })).toHaveLength(1);
  });

  describe("fechaVencimiento", () => {
    it("hoy", () => {
      const list = [ot({ fecha_termino: TODAY }), ot({ fecha_termino: "2026-08-20" })];
      expect(run(list, { fechaVencimiento: "hoy" })).toHaveLength(1);
    });

    it("descarta las OTs sin fecha", () => {
      expect(run([ot({ fecha_termino: null })], { fechaVencimiento: "hoy" })).toHaveLength(0);
    });

    it("vencidas excluye las completadas", () => {
      const list = [
        ot({ fecha_termino: "2026-08-01", estado: "en_curso" }),
        ot({ fecha_termino: "2026-08-01", estado: "completado" }),
      ];
      expect(run(list, { fechaVencimiento: "vencidas" })).toHaveLength(1);
    });
  });

  it("aplica la busqueda solo cuando hay predicado y texto", () => {
    const list = [ot({ descripcion: "bomba" }), ot({ descripcion: "motor" })];
    const withSearch: FilterDeps = {
      ...deps,
      search: "bomba",
      matchesSearch: (o, q) => (o.descripcion ?? "").includes(q),
    };
    expect(run(list, {}, withSearch)).toHaveLength(1);
    // Texto en blanco → la busqueda no filtra.
    expect(run(list, {}, { ...withSearch, search: "   " })).toHaveLength(2);
  });

  it("combina filtros en AND", () => {
    const list = [
      ot({ estado: "en_curso", prioridad: "urgente" }),
      ot({ estado: "en_curso", prioridad: "baja" }),
      ot({ estado: "completado", prioridad: "urgente" }),
    ];
    expect(run(list, { estados: ["en_curso"], prioridades: ["urgente"] })).toHaveLength(1);
  });

  /**
   * La regresión que motivó extraer esta función: la cadena de filtros estaba
   * escrita dos veces (lista renderizada y contadores de pestaña). Se agregó el
   * filtro de ITO a una sola copia, así que las filas se filtraban pero los
   * contadores no se movían. Ahora ambas rutas llaman aquí; este test fija que
   * un mismo conjunto de filtros produce el mismo resultado, que es justo lo que
   * las dos copias dejaron de cumplir.
   */
  it("da el mismo resultado a la lista y a los contadores", () => {
    const list = [
      ot({ descripcion: "N° OT: 1 | Hito: ITO 1\n\na", prioridad: "urgente" }),
      ot({ descripcion: "N° OT: 2 | Hito: ITO 2\n\nb", prioridad: "urgente" }),
      ot({ descripcion: "N° OT: 3 | Hito: ITO 1\n\nc", prioridad: "baja" }),
    ];
    const filtros: FiltrosState = { ...SIN_FILTROS, itos: ["ITO 1"], prioridades: ["urgente"] };

    const paraLaLista = applyFiltros(list, filtros, deps);
    const paraLosContadores = applyFiltros(list, filtros, deps);

    expect(paraLosContadores.length).toBe(paraLaLista.length);
    expect(paraLaLista).toHaveLength(1);
  });
});
