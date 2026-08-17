import { describe, it, expect } from "vitest";
import { urlDeRedireccion, FlowRedirectError } from "@/lib/flow-redirect";

describe("urlDeRedireccion", () => {
  it("concatena url y token como espera Flow", () => {
    // Respuesta real de /customer/register en sandbox.
    expect(urlDeRedireccion({
      url: "https://sandbox.flow.cl/app/customer/disclaimer.php",
      token: "CF13EB1E4768235C4D187942AF70425C59C938EY",
    })).toBe(
      "https://sandbox.flow.cl/app/customer/disclaimer.php?token=CF13EB1E4768235C4D187942AF70425C59C938EY"
    );
  });

  // El bug que motivó el módulo: redirigir solo a `url` lleva a la página de
  // disclaimer sin contexto y Flow responde "Error Processing Request".
  it("no devuelve la url pelada", () => {
    const url = urlDeRedireccion({ url: "https://sandbox.flow.cl/app/customer/disclaimer.php", token: "T1" });
    expect(url).toContain("?token=");
    expect(url).not.toBe("https://sandbox.flow.cl/app/customer/disclaimer.php");
  });

  it("escapa tokens con caracteres especiales", () => {
    expect(urlDeRedireccion({ url: "https://flow.cl/x", token: "a+b/c=d&e" }))
      .toBe("https://flow.cl/x?token=a%2Bb%2Fc%3Dd%26e");
  });

  it("lanza si falta el token", () => {
    expect(() => urlDeRedireccion({ url: "https://flow.cl/x" }, "inscribir la tarjeta"))
      .toThrow(FlowRedirectError);
    expect(() => urlDeRedireccion({ url: "https://flow.cl/x" }, "inscribir la tarjeta"))
      .toThrow(/inscribir la tarjeta/);
  });

  it("lanza si falta la url", () => {
    expect(() => urlDeRedireccion({ token: "T1" })).toThrow(FlowRedirectError);
  });

  it("lanza ante una respuesta vacía o nula", () => {
    expect(() => urlDeRedireccion(null)).toThrow(FlowRedirectError);
    expect(() => urlDeRedireccion(undefined)).toThrow(FlowRedirectError);
    expect(() => urlDeRedireccion({})).toThrow(FlowRedirectError);
  });

  it("conserva la respuesta original para poder loguearla", () => {
    try {
      urlDeRedireccion({ url: "https://flow.cl/x" });
      expect.unreachable("debió lanzar");
    } catch (err) {
      expect((err as FlowRedirectError).respuesta).toEqual({ url: "https://flow.cl/x" });
    }
  });
});
