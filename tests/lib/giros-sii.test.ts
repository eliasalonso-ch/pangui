import { describe, it, expect } from "vitest";
import {
  GIROS_SII,
  buscarGiros,
  giroPorCodigo,
  etiquetaGiro,
  codigoDesdeEtiqueta,
} from "@/lib/giros-sii";

describe("GIROS_SII", () => {
  it("tiene el catálogo del SII", () => {
    expect(GIROS_SII.length).toBeGreaterThan(600);
  });

  it("todos los códigos son de 6 dígitos y únicos", () => {
    const vistos = new Set<string>();
    for (const [codigo] of GIROS_SII) {
      expect(codigo).toMatch(/^\d{6}$/);
      expect(vistos.has(codigo), `código repetido: ${codigo}`).toBe(false);
      vistos.add(codigo);
    }
  });

  it("no quedó texto mal decodificado al extraer la tabla", () => {
    // Mojibake típico de leer latin-1 como utf-8: "PROGRAMACIÃ³N".
    const rotos = GIROS_SII.filter(([, nombre]) => /Ã|Â|�/.test(nombre));
    expect(rotos.map(g => g[1])).toEqual([]);
  });

  it("conserva las tildes y la ñ", () => {
    const conTilde = GIROS_SII.filter(([, n]) => /[áéíóúñÁÉÍÓÚÑ]/.test(n));
    expect(conTilde.length).toBeGreaterThan(100);
  });

  it("usa los valores de IVA y categoría del SII", () => {
    for (const [, , iva, categoria] of GIROS_SII) {
      // "G" = se determina por las características propias de la actividad.
      expect(["SI", "NO", "G"]).toContain(iva);
      expect(["1", "2", "G"]).toContain(categoria);
    }
  });

  it("no tiene nombres vacíos", () => {
    for (const [codigo, nombre] of GIROS_SII) {
      expect(nombre.trim().length, `giro ${codigo} sin nombre`).toBeGreaterThan(0);
    }
  });
});

describe("giroPorCodigo", () => {
  it("encuentra un giro conocido", () => {
    // El propio giro de Pangui. Está marcado "G": el SII determina el IVA y la
    // categoría por las características de la actividad, no automáticamente.
    const giro = giroPorCodigo("620100");
    expect(giro?.nombre).toBe("ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA");
    expect(giro?.afectoIva).toBe("G");
    expect(giro?.categoria).toBe("G");
  });

  it("encuentra un giro afecto a IVA de primera categoría", () => {
    const giro = giroPorCodigo("432100");
    expect(giro?.nombre).toBe("INSTALACIONES ELÉCTRICAS");
    expect(giro?.afectoIva).toBe("SI");
    expect(giro?.categoria).toBe("1");
  });

  it("devuelve null si el código no existe", () => {
    expect(giroPorCodigo("999999")).toBeNull();
    expect(giroPorCodigo("")).toBeNull();
  });
});

describe("buscarGiros", () => {
  it("busca por código", () => {
    expect(buscarGiros("620100")[0].codigo).toBe("620100");
  });

  it("busca ignorando tildes y mayúsculas", () => {
    // Nadie escribe "INFORMÁTICA" con tilde en un buscador.
    const sinTilde = buscarGiros("informatica");
    expect(sinTilde.some(g => g.codigo === "620100")).toBe(true);
    expect(buscarGiros("INFORMATICA").length).toBe(sinTilde.length);
  });

  it("exige todas las palabras, en cualquier orden", () => {
    const a = buscarGiros("instalaciones electricas");
    expect(a.some(g => g.codigo === "432100")).toBe(true);
    expect(buscarGiros("electricas instalaciones").length).toBe(a.length);
  });

  it("no devuelve nada si una palabra no calza", () => {
    expect(buscarGiros("informatica unicornio")).toEqual([]);
  });

  it("respeta el límite", () => {
    expect(buscarGiros("de", 5)).toHaveLength(5);
  });

  it("con consulta vacía devuelve el inicio del catálogo", () => {
    expect(buscarGiros("", 3)).toHaveLength(3);
    expect(buscarGiros("   ", 3)).toHaveLength(3);
  });
});

describe("etiquetaGiro / codigoDesdeEtiqueta", () => {
  it("arma la etiqueta que se guarda en el perfil", () => {
    expect(etiquetaGiro(["620100", "ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA", "SI", "1"]))
      .toBe("620100 - ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA");
  });

  it("acepta también la forma de objeto", () => {
    const giro = giroPorCodigo("620100")!;
    expect(etiquetaGiro(giro)).toBe("620100 - ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA");
  });

  it("recupera el código desde la etiqueta guardada", () => {
    expect(codigoDesdeEtiqueta("620100 - ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA")).toBe("620100");
    expect(codigoDesdeEtiqueta("620100")).toBe("620100");
  });

  it("devuelve null para valores antiguos escritos a mano", () => {
    // Perfiles creados antes del dropdown tienen texto libre sin código.
    expect(codigoDesdeEtiqueta("ACTIVIDADES DE PROGRAMACIÓN INFORMÁTICA")).toBeNull();
    expect(codigoDesdeEtiqueta(null)).toBeNull();
    expect(codigoDesdeEtiqueta(undefined)).toBeNull();
    expect(codigoDesdeEtiqueta("")).toBeNull();
  });

  it("la ida y vuelta es estable para todo el catálogo", () => {
    for (const giro of GIROS_SII) {
      expect(codigoDesdeEtiqueta(etiquetaGiro(giro))).toBe(giro[0]);
    }
  });
});
