// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from "vitest";
import { puedeBorrarClave } from "../../supabase/functions/r2-delete/permiso";

// _shared/r2.ts es código Deno (lee Deno.env al cargarse) y tsc no lo compila.
// Se importa con una ruta en variable para que el chequeo de tipos no lo siga.
type R2 = {
  firmarSigV4(o: Record<string, unknown>): Promise<{ url: string; headers: Record<string, string> }>;
  esPrefijoDeOrden(p: string): boolean;
  borrarCarpetaDeOrden(p: string): Promise<number>;
  borrarObjetoR2(c: string): Promise<void>;
  claveValida(c: string): boolean;
};
const RUTA_R2 = "../../supabase/functions/_shared/r2";
let r2: R2;

beforeAll(async () => {
  vi.stubGlobal("Deno", { env: { get: () => "x" } });
  r2 = await import(/* @vite-ignore */ RUTA_R2);
});

const OT = "f2326b35-dae7-4c18-b10a-aa9202e33e66";

/** Cliente falso: `visibles` son los ids que RLS le deja ver al usuario. */
function cliente(visibles: string[]) {
  const consultas: string[] = [];
  return {
    consultas,
    from(tabla: string) {
      return {
        select: () => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => {
              consultas.push(`${tabla}:${id}`);
              return { data: visibles.includes(id) ? { id } : null };
            },
          }),
        }),
      };
    },
  };
}

describe("firma SigV4", () => {
  // Vector "GET Bucket (List Objects)" de la documentación de AWS S3.
  it("coincide con el vector publicado por AWS", async () => {
    const { url, headers } = await r2.firmarSigV4({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/",
      query: { prefix: "J", "max-keys": "2" },
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(url).toBe("https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J");
    expect(headers.Authorization).toContain(
      "Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7",
    );
  });

  it("codifica la ruta y la consulta", async () => {
    const { url } = await r2.firmarSigV4({
      method: "GET", host: "h", path: "/b/a b/ñ(1).jpg", query: { prefix: `ordenes/${OT}/` },
      region: "auto", accessKeyId: "k", secretAccessKey: "s", now: new Date(0),
    });
    expect(url).toBe(`https://h/b/a%20b/%C3%B1%281%29.jpg?prefix=ordenes%2F${OT}%2F`);
  });
});

describe("prefijo borrable", () => {
  it("solo acepta la carpeta exacta de una orden", () => {
    expect(r2.esPrefijoDeOrden(`ordenes/${OT}/`)).toBe(true);
    for (const malo of ["", "/", "ordenes/", "ordenes", `ordenes/${OT}`, `ordenes/${OT}/grupos/`,
      `activos/${OT}/`, "ordenes/../", `x/ordenes/${OT}/`, `ordenes/${OT.toUpperCase()}/`]) {
      expect(r2.esPrefijoDeOrden(malo), malo).toBe(false);
    }
  });

  it("borrarCarpetaDeOrden rechaza un prefijo inválido antes de llamar a R2", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(r2.borrarCarpetaDeOrden("ordenes/")).rejects.toThrow("no permitido");
    await expect(r2.borrarCarpetaDeOrden("")).rejects.toThrow("no permitido");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("borrarCarpetaDeOrden", () => {
  it("pagina el listado y borra solo lo que está bajo el prefijo", async () => {
    const prefijo = `ordenes/${OT}/`;
    const paginas = [
      `<ListBucketResult><IsTruncated>true</IsTruncated><Contents><Key>${prefijo}a.jpg</Key></Contents>` +
        `<Contents><Key>${prefijo}grupos/b&amp;c.jpg</Key></Contents><NextContinuationToken>tok=1</NextContinuationToken></ListBucketResult>`,
      `<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>${prefijo}d.pdf</Key></Contents>` +
        `<Contents><Key>ordenes/otra/x.jpg</Key></Contents></ListBucketResult>`,
    ];
    const llamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method: string }) => {
      llamadas.push(`${init.method} ${decodeURIComponent(url.split(".com")[1])}`);
      if (init.method === "GET") return new Response(paginas.shift(), { status: 200 });
      return new Response(null, { status: 204 });
    }));

    expect(await r2.borrarCarpetaDeOrden(prefijo)).toBe(3);
    expect(llamadas.filter((l) => l.startsWith("GET"))).toHaveLength(2);
    expect(llamadas[3]).toContain("continuation-token=tok=1");
    expect(llamadas.filter((l) => l.startsWith("DELETE")).sort()).toEqual([
      `DELETE /x/${prefijo}a.jpg`,
      `DELETE /x/${prefijo}d.pdf`,
      `DELETE /x/${prefijo}grupos/b&c.jpg`,
    ]);
  });

  it("si un borrado falla, lanza para que la cola lo reintente", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { method: string }) =>
      init.method === "GET"
        ? new Response(`<IsTruncated>false</IsTruncated><Key>ordenes/${OT}/a.jpg</Key>`, { status: 200 })
        : new Response("boom", { status: 500 })));
    await expect(r2.borrarCarpetaDeOrden(`ordenes/${OT}/`)).rejects.toThrow("R2 DELETE 500");
  });

  it("un 404 al borrar cuenta como borrado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(r2.borrarObjetoR2(`ordenes/${OT}/a.jpg`)).resolves.toBeUndefined();
  });
});

describe("claveValida", () => {
  it("rechaza vacías, con .. o con segmentos vacíos", () => {
    expect(r2.claveValida("ordenes/a/b.jpg")).toBe(true);
    for (const mala of ["", "/", "a//b", "a/../b", "../a", "a/"]) {
      expect(r2.claveValida(mala), mala).toBe(false);
    }
  });
});

describe("puedeBorrarClave", () => {
  it("permite archivos de una OT que el usuario ve", async () => {
    const c = cliente([OT]);
    expect(await puedeBorrarClave(c, `ordenes/${OT}/grupos/g1/a.jpg`)).toBe(true);
    expect(c.consultas).toEqual([`ordenes_trabajo:${OT}`]);
  });

  it("rechaza archivos de una OT que no ve (otro workspace o ya borrada)", async () => {
    expect(await puedeBorrarClave(cliente([]), `ordenes/${OT}/grupos/a.jpg`)).toBe(false);
  });

  it("valida activos y levantamientos contra su tabla", async () => {
    expect(await puedeBorrarClave(cliente([OT]), `activos/${OT}/a.jpg`)).toBe(true);
    expect(await puedeBorrarClave(cliente([]), `activos/${OT}/a.jpg`)).toBe(false);
    expect(await puedeBorrarClave(cliente([]), `levantamientos/${OT}/fotos/a.jpg`)).toBe(false);
  });

  it("acepta borradores de activo sin consultar", async () => {
    const c = cliente([]);
    expect(await puedeBorrarClave(c, "activos/draft-1784127252601-hhnla2/a.pdf")).toBe(true);
    expect(c.consultas).toEqual([]);
  });

  it("acepta las raíces sin id y rechaza las desconocidas", async () => {
    const c = cliente([]);
    expect(await puedeBorrarClave(c, "partes/a.jpg")).toBe(true);
    expect(await puedeBorrarClave(c, "partes/adjuntos/a.pdf")).toBe(true);
    expect(await puedeBorrarClave(c, "pruebas/a.jpg")).toBe(false);
    expect(await puedeBorrarClave(c, "a.jpg")).toBe(false);
  });

  it("rechaza ids que no son uuid y archivos sueltos en ordenes/", async () => {
    const c = cliente([OT]);
    expect(await puedeBorrarClave(c, "ordenes/a.jpg")).toBe(false);
    expect(await puedeBorrarClave(c, "ordenes/sin-id/a.jpg")).toBe(false);
    expect(await puedeBorrarClave(c, `ordenes/${OT}`)).toBe(false);
    expect(c.consultas).toEqual([]);
  });
});
