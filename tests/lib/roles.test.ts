import { describe, it, expect } from "vitest";
import { esAdmin, esElevado, ROL_LABEL, ROL_DESCRIPTION } from "@/lib/roles";

describe("esAdmin", () => {
  it("returns true for admin", ()   => expect(esAdmin("admin")).toBe(true));
  it("returns false for jefe",  ()  => expect(esAdmin("jefe")).toBe(false));
  it("returns false for tecnico", () => expect(esAdmin("tecnico")).toBe(false));
  it("returns false for undefined", () => expect(esAdmin(undefined)).toBe(false));
  it("returns false for empty string", () => expect(esAdmin("")).toBe(false));
});

describe("esElevado", () => {
  it("returns true for admin",   () => expect(esElevado("admin")).toBe(true));
  it("returns true for jefe",    () => expect(esElevado("jefe")).toBe(true));
  it("returns false for tecnico", () => expect(esElevado("tecnico")).toBe(false));
  it("returns false for null",   () => expect(esElevado(null)).toBe(false));
});

describe("ROL_LABEL", () => {
  it("has labels for all roles", () => {
    expect(ROL_LABEL.admin).toBeTruthy();
    expect(ROL_LABEL.jefe).toBeTruthy();
    expect(ROL_LABEL.tecnico).toBeTruthy();
  });

  it("admin label is Administrador", () => {
    expect(ROL_LABEL.admin).toBe("Administrador");
  });
});

describe("ROL_DESCRIPTION", () => {
  it("has descriptions for all roles", () => {
    expect(ROL_DESCRIPTION.admin).toBeTruthy();
    expect(ROL_DESCRIPTION.jefe).toBeTruthy();
    expect(ROL_DESCRIPTION.tecnico).toBeTruthy();
  });
});
