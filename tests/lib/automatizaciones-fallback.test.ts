import { describe, it, expect, vi } from "vitest";

/**
 * El 400 que apareció en el navegador: el código llegó antes que la tabla.
 * La página no puede quedar vacía por una función que todavía no existe.
 */
describe("fetchAutomatizaciones sin la tabla de condiciones", () => {
  it("reintenta sin el embed y no vuelve a pedirlo", async () => {
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
        if (last.includes("automatizacion_condiciones")) {
          return res({ data: null, error: { code: "PGRST200", message: "no relationship" } });
        }
        return res({ data: [], error: null });
      };
      return chain;
    };

    vi.doMock("@/lib/supabase", () => ({ createClient: () => ({ from: () => qb() }) }));
    vi.resetModules();
    const { fetchAutomatizaciones, condicionesDisponibles } =
      await import("@/lib/automatizaciones-api");

    await expect(fetchAutomatizaciones("ws-1")).resolves.toEqual([]);
    expect(selects.length).toBe(2);
    expect(selects[0]).toContain("automatizacion_condiciones");
    expect(selects[1]).not.toContain("automatizacion_condiciones");

    // Recordado: la segunda carga ya no gasta un 400.
    expect(condicionesDisponibles()).toBe(false);
    await fetchAutomatizaciones("ws-1");
    expect(selects.length).toBe(3);
    expect(selects[2]).not.toContain("automatizacion_condiciones");
  });
});
