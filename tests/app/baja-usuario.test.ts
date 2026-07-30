import { describe, it, expect } from "vitest";
import { puedeDarDeBaja, puedeGestionarUsuario } from "@/lib/usuarios-baja";

describe("puedeGestionarUsuario", () => {
  const owner = { id: "yo", rol: "owner" };
  const admin = { id: "yo", rol: "admin" };

  it("nadie se gestiona a sí mismo", () => {
    expect(puedeGestionarUsuario(owner, { id: "yo", rol: "member" })).toBe(false);
  });

  it("un member no gestiona a nadie", () => {
    expect(puedeGestionarUsuario({ id: "yo", rol: "member" }, { id: "otro", rol: "member" })).toBe(false);
  });

  it("un admin gestiona members", () => {
    expect(puedeGestionarUsuario(admin, { id: "otro", rol: "member" })).toBe(true);
  });

  // Un admin no puede sacar del medio a otro admin: eso es del owner.
  it("un admin NO gestiona a otro admin", () => {
    expect(puedeGestionarUsuario(admin, { id: "otro", rol: "admin" })).toBe(false);
  });

  it("un admin NO gestiona al owner", () => {
    expect(puedeGestionarUsuario(admin, { id: "otro", rol: "owner" })).toBe(false);
  });

  it("el owner gestiona admins", () => {
    expect(puedeGestionarUsuario(owner, { id: "otro", rol: "admin" })).toBe(true);
  });
});

describe("puedeDarDeBaja", () => {
  it("bloquea mientras queda trabajo abierto", () => {
    expect(puedeDarDeBaja(2)).toBe(false);
    expect(puedeDarDeBaja(1)).toBe(false);
  });

  it("permite cuando no queda trabajo abierto", () => {
    expect(puedeDarDeBaja(0)).toBe(true);
  });

  // Mientras no se sabe cuántas OTs abiertas hay, el botón no se habilita.
  it("bloquea mientras el conteo no cargó", () => {
    expect(puedeDarDeBaja(null)).toBe(false);
  });
});
