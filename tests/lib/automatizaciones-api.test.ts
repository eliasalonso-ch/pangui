import { describe, it, expect, vi } from "vitest";
import {
  agruparTriggersPorMedidor, describirCondicion, describirTrigger, esAcumulado, esDelta,
  medidorTrasCambiarActivo, OPERADORES,
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
      condiciones: [],
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
    // CADA delete sobre triggers y acciones va acotado por `.not(id,in,...)`:
    // sin eso vuelve el bug de los ids nuevos. Se cuenta por tabla en vez de
    // fijar un total, porque las condiciones —que no guardan estado del motor—
    // sí se reemplazan enteras y suman un delete plano legítimo.
    for (const tabla of ["automatizacion_triggers", "automatizacion_acciones"]) {
      expect(ops.filter(o => o === `${tabla}.delete`).length).toBe(1);
      expect(ops.filter(o => o.startsWith(`${tabla}.delete:acotado`)).length).toBe(1);
    }
    expect(ops).toContain("automatizacion_condiciones.delete");
    expect(ops.some(o => o.startsWith("automatizacion_condiciones.delete:acotado"))).toBe(false);
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

/**
 * Las condiciones del paso "Sólo si además…".
 *
 * Se prueba la frase y no el motor: la evaluación vive en plpgsql
 * (fn_automatizacion_condiciones_bloqueo) y desde acá no se puede llamar. Lo que
 * sí puede romperse en silencio es el texto —es lo que el usuario lee para
 * entender por qué la regla no actuó— y la negación, que cambia el sentido de
 * la frase entera.
 */
describe("describirCondicion", () => {
  it("dice el estado del activo y lo invierte al negarla", () => {
    const base = { tipo: "estado_activo" as const, config: { estados: ["mantencion" as const] } };
    expect(describirCondicion({ ...base, negado: false }))
      .toBe("El activo está en mantención");
    // El caso que motivó la condición: NO abrir OT sobre algo ya intervenido.
    expect(describirCondicion({ ...base, negado: true }))
      .toBe("El activo no está en mantención");
  });

  it("enumera varios estados", () => {
    expect(describirCondicion({
      tipo: "estado_activo",
      config: { estados: ["mantencion", "fuera_servicio"] },
      negado: true,
    })).toBe("El activo no está en: en mantención, fuera de servicio");
  });

  it("dice todos los días cuando no hay ninguno elegido", () => {
    expect(describirCondicion({
      tipo: "ventana_horaria",
      config: { desde: "22:00", hasta: "06:00", dias: [] },
      negado: false,
    })).toBe("La lectura es entre las 22:00 y las 06:00, todos los días");
  });

  it("no enumera los siete días: eso es todos los días", () => {
    expect(describirCondicion({
      tipo: "ventana_horaria",
      config: { desde: "00:00", hasta: "23:59", dias: [1, 2, 3, 4, 5, 6, 7] },
      negado: false,
    })).toBe("La lectura es entre las 00:00 y las 23:59, todos los días");
  });

  it("nombra los días cuando son algunos", () => {
    expect(describirCondicion({
      tipo: "ventana_horaria",
      config: { desde: "08:00", hasta: "18:00", dias: [6, 7] },
      negado: false,
    })).toBe("La lectura es entre las 08:00 y las 18:00, sábado, domingo");
  });

  it("dice las dos caras de la OT abierta", () => {
    expect(describirCondicion({ tipo: "sin_ot_abierta_en_activo", config: {}, negado: false }))
      .toBe("El activo no tiene órdenes de trabajo abiertas");
    expect(describirCondicion({ tipo: "sin_ot_abierta_en_activo", config: {}, negado: true }))
      .toBe("El activo ya tiene una orden de trabajo abierta");
  });

  it("avisa cuando la condición quedó sin valores en vez de mentir", () => {
    expect(describirCondicion({ tipo: "estado_activo", config: {}, negado: false }))
      .toBe("Estado del activo — sin estados elegidos");
    expect(describirCondicion({ tipo: "criticidad_activo", config: {}, negado: false }))
      .toBe("Criticidad del activo — sin criticidad elegida");
  });
});

/**
 * Los once operadores.
 *
 * La evaluación vive en plpgsql, así que desde acá se prueba la frase y la
 * clasificación —que es lo que decide qué campos muestra el constructor y qué
 * se guarda—. Confundir el acumulado con el de salto cambia por completo cuándo
 * dispara la regla, y los dos se llaman parecido.
 */
describe("operadores de disparador", () => {
  it("distingue umbral, salto y acumulado", () => {
    expect(esDelta("mayor_igual")).toBe(false);
    expect(esAcumulado("mayor_igual")).toBe(false);

    // Salto: es delta pero NO usa próximo disparo.
    expect(esDelta("aumenta_desde_lectura")).toBe(true);
    expect(esAcumulado("aumenta_desde_lectura")).toBe(false);

    // Acumulado: las dos cosas.
    expect(esDelta("aumenta_desde_disparo")).toBe(true);
    expect(esAcumulado("aumenta_desde_disparo")).toBe(true);
  });

  it("los once tienen etiqueta y ayuda", () => {
    expect(OPERADORES).toHaveLength(11);
    for (const o of OPERADORES) {
      expect(o.label.length).toBeGreaterThan(0);
      // La ayuda es lo que hace distinguibles a los cuatro de cambio: sin ella
      // "Aumenta en" y "Sube de golpe" se leen igual.
      expect(o.ayuda.length).toBeGreaterThan(30);
    }
  });

  it("describe los estrictos y el distinto", () => {
    const d = (operador: string, valor: number) =>
      describirTrigger({ operador, valor, valor_hasta: null } as never, "°C");
    expect(d("mayor", 10)).toBe("es mayor que 10 °C");
    expect(d("menor", 10)).toBe("es menor que 10 °C");
    expect(d("distinto", 1)).toBe("es distinto de 1 °C");
  });

  it("dice desde dónde se mide cada tipo de cambio", () => {
    // Sin el sufijo, "aumenta 5000 km" no dice respecto de qué.
    expect(describirTrigger(
      { operador: "aumenta_desde_disparo", valor: 5000, valor_hasta: null } as never, "km",
    )).toBe("aumenta 5000 km desde el último disparo");

    expect(describirTrigger(
      { operador: "aumenta_desde_lectura", valor: 15, valor_hasta: null } as never, "°C",
    )).toBe("sube 15 °C respecto de la lectura anterior");

    expect(describirTrigger(
      { operador: "disminuye_desde_lectura", valor: 15, valor_hasta: null } as never, "bar",
    )).toBe("baja 15 bar respecto de la lectura anterior");
  });
});

/**
 * El avance del objetivo acumulado, que es la cuenta del motor.
 *
 * Réplica en TS de la expresión que corre en plpgsql, para poder afirmar la
 * propiedad que importa: tras disparar, el próximo objetivo SIEMPRE queda por
 * delante de la lectura actual. Sin eso, un camión que reporta 12.000 km de
 * golpe sobre un objetivo de "cada 5.000" abriría tres OT seguidas.
 */
function avanzar(proximo: number, paso: number, lectura: number): number {
  return proximo + paso * Math.ceil((lectura - proximo + 1) / paso);
}

describe("avance del próximo disparo", () => {
  it("avanza un paso en el caso normal", () => {
    expect(avanzar(5000, 5000, 5000)).toBe(10000);
    expect(avanzar(5000, 5000, 5200)).toBe(10000);
  });

  it("salta los ciclos perdidos de una sola vez", () => {
    // El camión estuvo un mes sin reportar y llega con 17.400.
    expect(avanzar(5000, 5000, 17400)).toBe(20000);
  });

  it("siempre deja el objetivo por delante de la lectura", () => {
    for (const lectura of [0, 1, 4999, 5000, 5001, 12345, 99999]) {
      const siguiente = avanzar(5000, 5000, Math.max(lectura, 5000));
      expect(siguiente).toBeGreaterThan(Math.max(lectura, 5000));
    }
  });

  it("respeta un objetivo inicial sembrado", () => {
    // "Cada 5.000 pero recién a partir de los 15.000."
    expect(avanzar(15000, 5000, 15000)).toBe(20000);
  });
});
