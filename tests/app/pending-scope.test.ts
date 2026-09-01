import { describe, it, expect } from "vitest";
import { pendingScopeFor } from "@/app/(app)/ordenes/pending-scope";
import type { OrdenListItem } from "@/types/ordenes";

const TODAY = "2026-07-29";

function ot(over: Partial<OrdenListItem> = {}): OrdenListItem {
  return {
    id: "ot-1",
    estado: "en_espera",
    prioridad: "media",
    tipo_trabajo: "reactiva",
    clasificacion: "ejecucion",
    asignados_ids: ["u1"],
    fecha_termino: null,
    en_ejecucion: false,
    iniciado_at: null,
    tiempo_total_segundos: 0,
    ...over,
  } as OrdenListItem;
}

const NONE = new Set<string>();

describe("pendingScopeFor", () => {
  it("cae en 'otras' cuando no calza ninguna regla", () => {
    expect(pendingScopeFor(ot(), NONE, NONE, TODAY)).toBe("otras");
  });

  // El tipo de trabajo gana: describe QUÉ es la OT, no por qué está detenida.
  it("levantamiento gana sobre faltan materiales", () => {
    const o = ot({ clasificacion: "levantamiento" });
    expect(pendingScopeFor(o, NONE, new Set([o.id]), TODAY)).toBe("levantamientos");
  });

  it("presupuesto gana sobre faltan materiales", () => {
    const o = ot({ tipo_trabajo: "presupuesto" });
    expect(pendingScopeFor(o, NONE, new Set([o.id]), TODAY)).toBe("presupuestos");
  });

  // El motivo de bloqueo gana sobre el estado del calendario: es lo accionable.
  it("faltan materiales gana sobre vencida", () => {
    const o = ot({ fecha_termino: "2026-06-22" });
    expect(pendingScopeFor(o, NONE, new Set([o.id]), TODAY)).toBe("materiales");
  });

  it("reprogramada gana sobre vencida", () => {
    const o = ot({ fecha_termino: "2026-06-22" });
    expect(pendingScopeFor(o, new Set([o.id]), NONE, TODAY)).toBe("reprogramadas");
  });

  it("faltan materiales gana sobre sin asignar", () => {
    const o = ot({ asignados_ids: [] });
    expect(pendingScopeFor(o, NONE, new Set([o.id]), TODAY)).toBe("materiales");
  });

  it("materiales gana sobre reprogramada cuando calzan las dos", () => {
    const o = ot();
    expect(pendingScopeFor(o, new Set([o.id]), new Set([o.id]), TODAY)).toBe("materiales");
  });

  it("una OT vencida sin motivo de bloqueo sigue en vencidas", () => {
    const o = ot({ fecha_termino: "2026-06-22" });
    expect(pendingScopeFor(o, NONE, NONE, TODAY)).toBe("vencidas");
  });

  it("sin asignados va a sin_asignar", () => {
    expect(pendingScopeFor(ot({ asignados_ids: [] }), NONE, NONE, TODAY)).toBe("sin_asignar");
  });

  it("pendiente sin timer ni cambios va a sin_progreso", () => {
    expect(pendingScopeFor(ot({ estado: "pendiente" }), NONE, NONE, TODAY)).toBe("sin_progreso");
  });

  // La razón de ser de la cadena: los contadores tienen que sumar el total.
  it("cada OT cae en exactamente un bucket", () => {
    const ots = [
      ot({ id: "a", clasificacion: "levantamiento" }),
      ot({ id: "b", tipo_trabajo: "presupuesto" }),
      ot({ id: "c", fecha_termino: "2026-06-22" }),
      ot({ id: "d", asignados_ids: [] }),
      ot({ id: "e", estado: "pendiente" }),
      ot({ id: "f" }),
    ];
    const mat = new Set(["c"]);
    const rep = new Set(["f"]);
    const buckets = ots.map(o => pendingScopeFor(o, rep, mat, TODAY));
    expect(buckets).toEqual([
      "levantamientos", "presupuestos", "materiales",
      "sin_asignar", "sin_progreso", "reprogramadas",
    ]);
    expect(buckets).toHaveLength(ots.length);
  });

  // "En curso" responde "¿quién está trabajando ahora?", así que gana sobre
  // todo lo demás: una OT que se está ejecutando no está detenida por nada.
  describe("en curso", () => {
    it("una OT en_curso va a en_curso", () => {
      expect(pendingScopeFor(ot({ estado: "en_curso" }), NONE, NONE, TODAY)).toBe("en_curso");
    });

    it("en curso gana sobre vencida", () => {
      const o = ot({ estado: "en_curso", fecha_termino: "2026-06-22" });
      expect(pendingScopeFor(o, NONE, NONE, TODAY)).toBe("en_curso");
    });

    it("en curso gana sobre levantamiento y presupuesto", () => {
      const lev = ot({ estado: "en_curso", clasificacion: "levantamiento" });
      const pre = ot({ estado: "en_curso", tipo_trabajo: "presupuesto" });
      expect(pendingScopeFor(lev, NONE, NONE, TODAY)).toBe("en_curso");
      expect(pendingScopeFor(pre, NONE, NONE, TODAY)).toBe("en_curso");
    });

    it("en curso gana sobre faltan materiales y reprogramada", () => {
      const o = ot({ estado: "en_curso" });
      expect(pendingScopeFor(o, new Set([o.id]), new Set([o.id]), TODAY)).toBe("en_curso");
    });

    // El bucket se define por `estado`, no por el cronómetro: si se atara a
    // `en_ejecucion`, una OT aparecería acá mostrando "En espera" en su tarjeta.
    it("el cronómetro corriendo NO basta si el estado no es en_curso", () => {
      const o = ot({ estado: "en_espera", en_ejecucion: true });
      expect(pendingScopeFor(o, NONE, NONE, TODAY)).toBe("otras");
    });

    it("una OT en_espera con progreso sigue cayendo en otras", () => {
      const o = ot({ estado: "en_espera", iniciado_at: "2026-07-01T10:00:00Z" });
      expect(pendingScopeFor(o, NONE, NONE, TODAY)).toBe("otras");
    });
  });
});
