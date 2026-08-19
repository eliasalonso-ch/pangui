import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSoloAsignadasUserId, resetVisibilidadCache } from "@/lib/ordenes-api";

// Cuenta cuantas veces se va a la red, que es exactamente lo que este cambio
// pretende reducir. El HAR del 2026-08-19 mostraba la misma consulta a
// `usuarios` saliendo dos veces (con dos preflight CORS) porque el cache solo
// se poblaba DESPUES de los await: dos llamadas concurrentes no se veian.
const getUser = vi.fn();
const perfil = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => perfil() }),
      }),
    }),
  }),
}));

beforeEach(() => {
  resetVisibilidadCache();
  getUser.mockReset();
  perfil.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  perfil.mockResolvedValue({ data: { rol: "member", solo_asignadas: true } });
});

describe("getSoloAsignadasUserId", () => {
  it("no repite la consulta cuando se la llama en paralelo", async () => {
    const [a, b, c] = await Promise.all([
      getSoloAsignadasUserId(),
      getSoloAsignadasUserId(),
      getSoloAsignadasUserId(),
    ]);

    expect(perfil).toHaveBeenCalledTimes(1);
    expect([a, b, c]).toEqual(["u1", "u1", "u1"]);
  });

  it("se salta auth.getUser() cuando el llamador ya tiene el id", async () => {
    await getSoloAsignadasUserId("u1");
    expect(getUser).not.toHaveBeenCalled();
    expect(perfil).toHaveBeenCalledTimes(1);
  });

  it("sigue consultando auth.getUser() si no le pasan el id", async () => {
    await getSoloAsignadasUserId();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("cachea entre llamadas sucesivas", async () => {
    await getSoloAsignadasUserId("u1");
    await getSoloAsignadasUserId("u1");
    expect(perfil).toHaveBeenCalledTimes(1);
  });

  it("devuelve null para un owner (nunca restringido)", async () => {
    perfil.mockResolvedValue({ data: { rol: "owner", solo_asignadas: true } });
    expect(await getSoloAsignadasUserId("u1")).toBeNull();
  });

  it("reintenta despues de un fallo en vez de quedarse pegado", async () => {
    perfil.mockRejectedValueOnce(new Error("red caida"));
    await expect(getSoloAsignadasUserId("u1")).rejects.toThrow("red caida");

    perfil.mockResolvedValue({ data: { rol: "member", solo_asignadas: true } });
    expect(await getSoloAsignadasUserId("u1")).toBe("u1");
  });
});
