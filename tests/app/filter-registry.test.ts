import { describe, it, expect } from "vitest";
import {
  initialFilterKeys, activeFilterKeys, FILTER_META, FILTER_ORDER,
  DEFAULT_FILTER_KEYS, filterKeysStorageKey, type FilterKey,
} from "@/app/(app)/ordenes/filter-registry";
import { ELECTRILAM_WORKSPACE_ID } from "@/lib/ordenes-api";
import type { FiltrosState } from "@/types/ordenes";

const NUEVO_WS = "00000000-0000-0000-0000-000000000001";

const SIN_FILTROS: FiltrosState = {
  estados: [], prioridades: [], tipos: [],
  asignadoIds: [], ubicacionIds: [], sociedadIds: [],
  itos: [],
  fechaVencimiento: null,
  sinAsignar: false,
  soloAsignados: false,
  deUsuariosDadosDeBaja: false,
};

describe("initialFilterKeys", () => {
  it("Electrilam arranca con TODOS los filtros", () => {
    expect(initialFilterKeys({ workspaceId: ELECTRILAM_WORKSPACE_ID }))
      .toEqual(FILTER_ORDER);
  });

  it("una cuenta nueva arranca solo con los 4 por defecto", () => {
    const keys = initialFilterKeys({ workspaceId: NUEVO_WS });
    expect(keys).toHaveLength(4);
    expect(new Set(keys)).toEqual(new Set(DEFAULT_FILTER_KEYS));
  });

  it("la preferencia guardada gana sobre el default del workspace", () => {
    // Incluso en Electrilam: si el usuario ya personalizo, se respeta.
    expect(initialFilterKeys({
      workspaceId: ELECTRILAM_WORKSPACE_ID,
      saved: ["estados", "itos"],
    })).toEqual(["itos", "estados"]); // devuelto en FILTER_ORDER
  });

  it("una preferencia guardada vacia cae al default (no deja la barra sin filtros)", () => {
    expect(initialFilterKeys({ workspaceId: NUEVO_WS, saved: [] }))
      .toHaveLength(DEFAULT_FILTER_KEYS.length);
  });

  it("ignora claves guardadas que ya no existen", () => {
    const keys = initialFilterKeys({
      workspaceId: NUEVO_WS,
      saved: ["estados", "filtroBorrado" as FilterKey],
    });
    expect(keys).toEqual(["estados"]);
  });

  /**
   * Un deep link como ?filtro=urgentes preselecciona prioridades. Si ese filtro
   * no estuviera en la barra, la lista saldria recortada sin ningun chip que lo
   * explicara: el usuario veria menos OTs de las que espera y nada que tocar
   * para entenderlo.
   */
  it("un filtro con valor se muestra aunque no este en el set guardado", () => {
    const keys = initialFilterKeys({
      workspaceId: NUEVO_WS,
      saved: ["estados"],
      preseeded: ["itos"],
    });
    expect(keys).toContain("itos");
    expect(keys).toContain("estados");
  });

  it("no duplica si el preseeded ya estaba visible", () => {
    const keys = initialFilterKeys({
      workspaceId: NUEVO_WS,
      saved: ["estados"],
      preseeded: ["estados"],
    });
    expect(keys).toEqual(["estados"]);
  });

  it("siempre devuelve en el orden de la barra, no en el de entrada", () => {
    const keys = initialFilterKeys({
      workspaceId: NUEVO_WS,
      saved: ["tipos", "asignadoIds", "estados"],
    });
    expect(keys).toEqual(FILTER_ORDER.filter(k => keys.includes(k)));
  });
});

describe("activeFilterKeys", () => {
  it("sin filtros no hay ninguno activo", () => {
    expect(activeFilterKeys(SIN_FILTROS)).toEqual([]);
  });

  it("detecta arrays con valores y booleanos encendidos", () => {
    expect(activeFilterKeys({ ...SIN_FILTROS, itos: ["ITO 1"], sinAsignar: true }))
      .toEqual(["sinAsignar", "itos"]);
  });

  it("detecta fechaVencimiento", () => {
    expect(activeFilterKeys({ ...SIN_FILTROS, fechaVencimiento: "hoy" }))
      .toEqual(["fechaVencimiento"]);
  });
});

describe("FILTER_META", () => {
  it("cada filtro del orden tiene metadata, y viceversa", () => {
    expect(new Set(FILTER_ORDER)).toEqual(new Set(Object.keys(FILTER_META) as FilterKey[]));
  });

  it("clear() deja el filtro en cero para todos", () => {
    // Un filtro oculto que siguiera filtrando seria invisible para el usuario.
    const lleno: FiltrosState = {
      ...SIN_FILTROS,
      estados: ["completado"], prioridades: ["urgente"], tipos: ["reactiva"],
      asignadoIds: ["u1"], ubicacionIds: ["ub1"], sociedadIds: ["s1"],
      itos: ["ITO 1"], fechaVencimiento: "hoy", sinAsignar: true,
    };
    for (const key of FILTER_ORDER) {
      const meta = FILTER_META[key];
      expect(meta.count(lleno)).toBeGreaterThan(0);
      const limpio = { ...lleno, ...meta.clear(lleno) };
      expect(meta.count(limpio)).toBe(0);
    }
  });
});

describe("filterKeysStorageKey", () => {
  it("es distinta por workspace", () => {
    expect(filterKeysStorageKey("a")).not.toBe(filterKeysStorageKey("b"));
  });
});
