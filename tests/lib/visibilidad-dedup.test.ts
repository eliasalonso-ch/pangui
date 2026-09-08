import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSoloAsignadasUserId, resetVisibilidadCache } from "@/lib/ordenes-api";
import { getPerfilUsuario } from "@/lib/perfil-usuario";

// Cuenta cuantas veces se va a la red, que es exactamente lo que este cambio
// pretende reducir. El HAR del 2026-08-19 mostraba la misma consulta a
// `usuarios` saliendo dos veces (con dos preflight CORS) porque el cache solo
// se poblaba DESPUES de los await: dos llamadas concurrentes no se veian.
//
// Se mockea `getPerfilUsuario` y no `@/lib/supabase`: desde que la fila del
// usuario se pide una sola vez para toda la app, getSoloAsignadasUserId ya no
// construye su propia consulta, la pide a ese modulo. Mockear el cliente de
// Supabase dejaba pasar la implementacion real y el test no probaba nada.
vi.mock("@/lib/perfil-usuario", () => ({
  getPerfilUsuario: vi.fn(),
}));

const perfil = vi.mocked(getPerfilUsuario);

beforeEach(() => {
  resetVisibilidadCache();
  perfil.mockReset();
  perfil.mockResolvedValue({
    id: "u1", nombre: "Ana", rol: "member", workspace_id: "w1", solo_asignadas: true,
  });
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

  it("cachea entre llamadas sucesivas", async () => {
    await getSoloAsignadasUserId("u1");
    await getSoloAsignadasUserId("u1");
    expect(perfil).toHaveBeenCalledTimes(1);
  });

  it("usa el id que le pasan en vez del de la fila", async () => {
    // El perfil sigue haciendo falta por `rol` y `solo_asignadas`, pero el id
    // del argumento manda: asi el llamador que ya lo tiene no depende de que
    // la fila traiga el suyo.
    perfil.mockResolvedValue({
      id: "otro", nombre: "Ana", rol: "member", workspace_id: "w1", solo_asignadas: true,
    });
    expect(await getSoloAsignadasUserId("u1")).toBe("u1");
  });

  it("devuelve null para un owner (nunca restringido)", async () => {
    perfil.mockResolvedValue({
      id: "u1", nombre: "Ana", rol: "owner", workspace_id: "w1", solo_asignadas: true,
    });
    expect(await getSoloAsignadasUserId("u1")).toBeNull();
  });

  it("devuelve null para un member sin la marca puesta", async () => {
    perfil.mockResolvedValue({
      id: "u1", nombre: "Ana", rol: "member", workspace_id: "w1", solo_asignadas: false,
    });
    expect(await getSoloAsignadasUserId("u1")).toBeNull();
  });

  it("no restringe cuando no hay sesion ni id", async () => {
    // getPerfilUsuario() devuelve null si no hay sesion; sin id no se puede
    // filtrar por asignado, y esconderle todo al usuario seria peor que
    // mostrarle de mas: la consulta ya va acotada por workspace y RLS.
    perfil.mockResolvedValue(null);
    expect(await getSoloAsignadasUserId()).toBeNull();
  });

  it("reintenta despues de un fallo en vez de quedarse pegado", async () => {
    perfil.mockRejectedValueOnce(new Error("red caida"));
    await expect(getSoloAsignadasUserId("u1")).rejects.toThrow("red caida");

    perfil.mockResolvedValue({
      id: "u1", nombre: "Ana", rol: "member", workspace_id: "w1", solo_asignadas: true,
    });
    expect(await getSoloAsignadasUserId("u1")).toBe("u1");
  });
});
