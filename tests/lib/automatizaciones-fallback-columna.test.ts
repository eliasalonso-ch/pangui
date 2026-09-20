import { describe, it, expect, vi } from "vitest";

/**
 * El segundo "la migración todavía no corrió": falta la COLUMNA.
 *
 * `proximo_disparo` viaja en 20260920160000 y el despliegue está bloqueado, así
 * que el código llega antes. Postgres contesta 42703 al parsear y PostgREST
 * contesta PGRST204 desde su caché de esquema —que es por donde salen los
 * INSERT—, así que hay que reconocer las dos.
 */
describe("fetchAutomatizaciones sin la columna proximo_disparo", () => {
  it("reintenta sin la columna y la deja fuera del select", async () => {
    const selects: string[] = [];

    const qb = () => {
      const chain: Record<string, unknown> = {};
      const step = (n: string) => (...args: unknown[]) => {
        if (n === "select") selects.push(String(args[0]));
        return chain;
      };
      for (const m of ["select", "eq", "order"]) chain[m] = step(m);
      (chain as { then: unknown }).then = (res: (v: unknown) => unknown) => {
        const last = selects[selects.length - 1];
        if (last.includes("proximo_disparo")) {
          return res({ data: null, error: { code: "42703", message: "column does not exist" } });
        }
        return res({ data: [], error: null });
      };
      return chain;
    };

    vi.doMock("@/lib/supabase", () => ({ createClient: () => ({ from: () => qb() }) }));
    vi.resetModules();
    const { fetchAutomatizaciones, proximoDisparoDisponible, operadoresDisponibles } =
      await import("@/lib/automatizaciones-api");

    await expect(fetchAutomatizaciones("ws-1")).resolves.toEqual([]);
    expect(selects[0]).toContain("proximo_disparo");
    expect(selects[1]).not.toContain("proximo_disparo");
    // Las condiciones NO se apagan: son otra migración.
    expect(selects[1]).toContain("automatizacion_condiciones");

    expect(proximoDisparoDisponible()).toBe(false);
    // Y el constructor deja de ofrecer los operadores que el CHECK viejo
    // rechazaría: los cuatro de siempre y nada más.
    expect(operadoresDisponibles().map(o => o.value)).toEqual([
      "mayor_igual", "menor_igual", "igual", "entre",
    ]);
  });

  it("al crear, reintenta el insert sin la columna (PGRST204)", async () => {
    const inserts: Record<string, unknown>[][] = [];

    const qb = (tabla: string) => {
      const chain: Record<string, unknown> = {};
      let esInsertTrigger = false;
      const step = (n: string) => (...args: unknown[]) => {
        if (n === "insert" && tabla === "automatizacion_triggers") {
          esInsertTrigger = true;
          inserts.push(args[0] as Record<string, unknown>[]);
        }
        return chain;
      };
      for (const m of ["select", "insert", "update", "delete", "eq", "not", "single", "order", "limit"]) {
        chain[m] = step(m);
      }
      (chain as { then: unknown }).then = (res: (v: unknown) => unknown) => {
        const ultimo = inserts[inserts.length - 1];
        if (esInsertTrigger && inserts.length === 1 && "proximo_disparo" in (ultimo?.[0] ?? {})) {
          return res({ data: null, error: { code: "PGRST204", message: "not in schema cache" } });
        }
        return res({ data: { id: "auto-1" }, error: null });
      };
      return chain;
    };

    vi.doMock("@/lib/supabase", () => ({
      createClient: () => ({
        from: (t: string) => qb(t),
        auth: { getUser: async () => ({ data: { user: null } }) },
      }),
    }));
    vi.resetModules();
    const { createAutomatizacion } = await import("@/lib/automatizaciones-api");

    await createAutomatizacion("ws-1", {
      nombre: "Cada 5000 km",
      triggers: [{
        medidor_id: "med-1", operador: "aumenta_desde_disparo", valor: 5000,
        modo: "una_lectura", proximo_disparo: 15000,
      }],
      acciones: [],
      condiciones: [],
    });

    // Dos intentos: el primero con la columna, el segundo sin ella. Sin el
    // reintento, guardar reventaba con "not in schema cache".
    expect(inserts).toHaveLength(2);
    expect(inserts[0][0]).toHaveProperty("proximo_disparo");
    expect(inserts[1][0]).not.toHaveProperty("proximo_disparo");
    // El resto de la fila se conserva intacto.
    expect(inserts[1][0]).toMatchObject({ operador: "aumenta_desde_disparo", valor: 5000 });
  });
});
