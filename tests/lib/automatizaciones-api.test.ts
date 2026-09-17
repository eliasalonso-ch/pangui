import { describe, it, expect, vi } from "vitest";
import { describirTrigger } from "@/lib/automatizaciones-api";

describe("describirTrigger", () => {
  it("describe un mayor o igual", () => {
    expect(describirTrigger(
      { operador: "mayor_igual", valor: 10, valor_hasta: null } as never, "A",
    )).toBe("es mayor o igual a 10 A");
  });

  it("describe un rango", () => {
    expect(describirTrigger(
      { operador: "entre", valor: 5, valor_hasta: 9 } as never, "mm/s",
    )).toBe("está entre 5 y 9 mm/s");
  });

  it("no deja espacio colgando cuando el medidor no tiene unidad", () => {
    expect(describirTrigger(
      { operador: "igual", valor: 3, valor_hasta: null } as never, "",
    )).toBe("es igual a 3");
  });
});

/**
 * Editar una automatización NO puede recrear sus hijos.
 *
 * Los hijos guardan estado que no está en el formulario: `armado` (el latch de
 * "una lectura, luego reiniciar") en el disparador, y la identidad de la acción,
 * que es por donde el freno de retrigger encuentra la última ejecución. La
 * primera versión hacía DELETE + INSERT y por eso editar el título rearmaba el
 * latch, reseteaba el enfriamiento y dejaba el historial huérfano. Se detectó en
 * producción editando una automatización en vivo entre dos lecturas.
 */
describe("updateAutomatizacion", () => {
  it("actualiza los hijos existentes en vez de borrarlos y recrearlos", async () => {
    const ops: string[] = [];

    const qb = (tabla: string) => {
      const chain: Record<string, unknown> = {};
      const step = (nombre: string) => (...args: unknown[]) => {
        if (nombre === "delete" || nombre === "update" || nombre === "insert") {
          ops.push(`${tabla}.${nombre}`);
        }
        // `.not(...)` es el que acota el delete a "los que ya no están".
        if (nombre === "not") ops.push(`${tabla}.delete:acotado(${args.map(String).join("|")})`);
        return chain;
      };
      for (const m of ["select", "insert", "update", "delete", "eq", "not", "single", "order", "limit"]) {
        chain[m] = step(m);
      }
      // Await sobre el builder: PostgREST resuelve a { data, error }.
      (chain as { then: unknown }).then = (res: (v: unknown) => unknown) => res({ data: null, error: null });
      return chain;
    };

    vi.doMock("@/lib/supabase", () => ({
      createClient: () => ({ from: (t: string) => qb(t), auth: { getUser: async () => ({ data: { user: null } }) } }),
    }));
    vi.resetModules();
    const { updateAutomatizacion } = await import("@/lib/automatizaciones-api");

    await updateAutomatizacion("auto-1", {
      nombre: "Editada",
      triggers: [{ id: "trig-1", medidor_id: "med-1", operador: "mayor_igual", valor: 200, modo: "una_lectura_reset" }],
      acciones: [{ id: "acc-1", tipo: "crear_ot", config: { titulo: "x" }, retrigger_minutos: 20, solo_si_anterior_cerrada: true }],
    });

    // El disparador y la acción que siguen existiendo se ACTUALIZAN...
    expect(ops).toContain("automatizacion_triggers.update");
    expect(ops).toContain("automatizacion_acciones.update");
    // ...y no se reinsertan, que es lo que les cambiaba el id.
    expect(ops).not.toContain("automatizacion_triggers.insert");
    expect(ops).not.toContain("automatizacion_acciones.insert");
    // Sigue habiendo un delete —el de las filas que el usuario sacó del
    // formulario— pero acotado por `.not("id","in",...)`, no un borrado plano
    // de todos los hijos como hacía la primera versión.
    expect(ops.filter(o => o.endsWith(".delete")).length).toBe(2);
    expect(ops.some(o => o.startsWith("automatizacion_triggers.delete:acotado"))).toBe(true);
    expect(ops.some(o => o.startsWith("automatizacion_acciones.delete:acotado"))).toBe(true);
  });
});
