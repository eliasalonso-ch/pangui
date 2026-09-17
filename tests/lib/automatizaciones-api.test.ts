import { describe, it, expect, vi } from "vitest";
import {
  agruparTriggersPorMedidor, describirTrigger, medidorTrasCambiarActivo,
} from "@/lib/automatizaciones-api";

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

/**
 * El activo del disparador es un filtro de la UI, no un dato guardado. Lo único
 * con enjundia es qué pasa con el medidor ya elegido al cambiarlo.
 */
describe("medidorTrasCambiarActivo", () => {
  const medidores = [
    { id: "m1", activo_id: "a1" },
    { id: "m2", activo_id: "a2" },
    { id: "m3", activo_id: "a2" },
  ];

  it("respeta el medidor cuando se quita el filtro", () => {
    // Quitar un filtro no puede borrar lo que el usuario ya eligió.
    expect(medidorTrasCambiarActivo("m1", "", medidores)).toBe("m1");
  });

  it("conserva el medidor si pertenece al activo elegido", () => {
    expect(medidorTrasCambiarActivo("m2", "a2", medidores)).toBe("m2");
  });

  it("elige solo el medidor cuando el activo tiene exactamente uno", () => {
    expect(medidorTrasCambiarActivo("", "a1", medidores)).toBe("m1");
  });

  it("suelta el medidor ajeno cuando el activo tiene varios", () => {
    // Con dos candidatos no se puede adivinar: elige el usuario.
    expect(medidorTrasCambiarActivo("m1", "a2", medidores)).toBe("");
  });

  it("suelta el medidor cuando el activo no tiene ninguno", () => {
    expect(medidorTrasCambiarActivo("m1", "a9", medidores)).toBe("");
  });
});

/**
 * El constructor agrupa las filas por medidor y al guardar las vuelve a
 * aplanar. Si ese viaje de ida y vuelta pierde una fila, el usuario abre una
 * regla con tres condiciones, guarda sin tocar nada y se queda con menos.
 */
describe("agruparTriggersPorMedidor", () => {
  it("junta las condiciones del mismo medidor en un grupo", () => {
    const grupos = agruparTriggersPorMedidor([
      { id: "t1", medidor_id: "m1" },
      { id: "t2", medidor_id: "m1" },
      { id: "t3", medidor_id: "m2" },
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].condiciones.map(c => c.id)).toEqual(["t1", "t2"]);
    expect(grupos[1].condiciones.map(c => c.id)).toEqual(["t3"]);
  });

  it("respeta el orden de aparición aunque los medidores se intercalen", () => {
    // Sin esto, reabrir la regla barajaba las tarjetas.
    const grupos = agruparTriggersPorMedidor([
      { id: "t1", medidor_id: "m2" },
      { id: "t2", medidor_id: "m1" },
      { id: "t3", medidor_id: "m2" },
    ]);
    expect(grupos.map(g => g.medidor_id)).toEqual(["m2", "m1"]);
    expect(grupos[0].condiciones.map(c => c.id)).toEqual(["t1", "t3"]);
  });

  it("agrupar y volver a aplanar no pierde ni duplica filas", () => {
    const filas = [
      { id: "t1", medidor_id: "m1" },
      { id: "t2", medidor_id: "m2" },
      { id: "t3", medidor_id: "m1" },
      { id: "t4", medidor_id: "m3" },
    ];
    const aplanado = agruparTriggersPorMedidor(filas)
      .flatMap(g => g.condiciones.map(c => ({ id: c.id, medidor_id: g.medidor_id })));
    expect(aplanado).toHaveLength(filas.length);
    expect([...aplanado].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...filas].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("no crea grupos cuando no hay filas", () => {
    expect(agruparTriggersPorMedidor([])).toEqual([]);
  });
});
