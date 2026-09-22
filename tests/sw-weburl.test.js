import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// webUrl vive en un service worker (no es un modulo ES): se extrae del fuente
// para probar la funcion real y no una copia que se desincronice.
const src = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
const webUrl = new Function(`${src.match(/function webUrl[\s\S]*?\n}/)[0]}; return webUrl;`)();

describe("sw webUrl", () => {
  const ot = "0ca0cea1-5e38-4d9c-9c10-0d5ff86c52a2";

  it("traduce la ruta movil de OT", () => {
    expect(webUrl(`/orden/${ot}`)).toBe(`/ordenes?id=${ot}`);
  });

  it("traduce la ruta anidada de procedimiento a su OT", () => {
    expect(webUrl(`/orden/${ot}/procedimiento/89aa6a98-374e-4307-af32-448642d37510`))
      .toBe(`/ordenes?id=${ot}`);
  });

  it("acepta tambien el plural que emite evaluar-alertas", () => {
    expect(webUrl(`/ordenes/${ot}`)).toBe(`/ordenes?id=${ot}`);
  });

  it("deja pasar las rutas que ya son web", () => {
    expect(webUrl(`/ordenes?ids=${ot}`)).toBe(`/ordenes?ids=${ot}`);
    expect(webUrl("/ordenes-compra?id=704117cf-86b2-4b1f-aa6f-5935c1ab92b1"))
      .toBe("/ordenes-compra?id=704117cf-86b2-4b1f-aa6f-5935c1ab92b1");
  });

  it("no rompe los enlaces externos ni el caso vacio", () => {
    expect(webUrl("https://meconecta.udec.cl/index.php?accion=x")).toBe("https://meconecta.udec.cl/index.php?accion=x");
    expect(webUrl(null)).toBe("/");
    expect(webUrl(undefined)).toBe("/");
  });
});
