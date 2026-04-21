import { describe, it, expect } from "vitest";
import { esAdmin, esElevado, esOwner, ROL_LABEL, ROL_DESCRIPTION } from "@/lib/roles";

describe("esOwner", () => {
  it("returns true for owner",  () => expect(esOwner("owner")).toBe(true));
  it("returns false for admin", () => expect(esOwner("admin")).toBe(false));
  it("returns false for member", () => expect(esOwner("member")).toBe(false));
});

describe("esAdmin", () => {
  it("returns true for admin",  () => expect(esAdmin("admin")).toBe(true));
  it("returns true for owner",  () => expect(esAdmin("owner")).toBe(true));
  it("returns false for member", () => expect(esAdmin("member")).toBe(false));
  it("returns false for requester", () => expect(esAdmin("requester")).toBe(false));
  it("returns false for undefined", () => expect(esAdmin(undefined)).toBe(false));
  it("returns false for empty string", () => expect(esAdmin("")).toBe(false));
});

describe("esElevado", () => {
  it("returns true for owner",   () => expect(esElevado("owner")).toBe(true));
  it("returns true for admin",   () => expect(esElevado("admin")).toBe(true));
  it("returns true for member",  () => expect(esElevado("member")).toBe(true));
  it("returns false for requester", () => expect(esElevado("requester")).toBe(false));
  it("returns false for null",   () => expect(esElevado(null)).toBe(false));
});

describe("ROL_LABEL", () => {
  it("has labels for all roles", () => {
    expect(ROL_LABEL.owner).toBeTruthy();
    expect(ROL_LABEL.admin).toBeTruthy();
    expect(ROL_LABEL.member).toBeTruthy();
    expect(ROL_LABEL.requester).toBeTruthy();
  });

  it("admin label is Administrador", () => {
    expect(ROL_LABEL.admin).toBe("Administrador");
  });

  it("owner label is Propietario", () => {
    expect(ROL_LABEL.owner).toBe("Propietario");
  });
});

describe("ROL_DESCRIPTION", () => {
  it("has descriptions for all roles", () => {
    expect(ROL_DESCRIPTION.owner).toBeTruthy();
    expect(ROL_DESCRIPTION.admin).toBeTruthy();
    expect(ROL_DESCRIPTION.member).toBeTruthy();
    expect(ROL_DESCRIPTION.requester).toBeTruthy();
  });
});
