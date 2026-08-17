import { describe, it, expect } from "vitest";
import {
  REGIONES,
  NOMBRES_REGIONES,
  TODAS_LAS_COMUNAS,
  comunasDeRegion,
  regionDeComuna,
  comunaPerteneceARegion,
  comunaCanonica,
  regionCanonica,
} from "@/lib/regiones-comunas";

/**
 * Conteo oficial de comunas por región (división político-administrativa
 * vigente, 346 comunas en total). Verificado contra el listado de la
 * Biblioteca del Congreso Nacional.
 */
const OFICIAL: Record<string, number> = {
  "Arica y Parinacota": 4,
  "Tarapacá": 7,
  "Antofagasta": 9,
  "Atacama": 9,
  "Coquimbo": 15,
  "Valparaíso": 38,
  "Metropolitana de Santiago": 52,
  "Libertador General Bernardo O'Higgins": 33,
  "Maule": 30,
  "Ñuble": 21,
  "Biobío": 33,
  "La Araucanía": 32,
  "Los Ríos": 12,
  "Los Lagos": 30,
  "Aysén del General Carlos Ibáñez del Campo": 10,
  "Magallanes y de la Antártica Chilena": 11,
};

describe("REGIONES", () => {
  it("tiene las 16 regiones", () => {
    expect(REGIONES).toHaveLength(16);
  });

  it("suma 346 comunas", () => {
    expect(TODAS_LAS_COMUNAS).toHaveLength(346);
  });

  it("cada región tiene su cantidad oficial de comunas", () => {
    for (const region of REGIONES) {
      expect(
        region.comunas.length,
        `${region.nombre} debería tener ${OFICIAL[region.nombre]} comunas`,
      ).toBe(OFICIAL[region.nombre]);
    }
  });

  it("no repite comunas entre regiones", () => {
    const vistas = new Set<string>();
    const duplicadas: string[] = [];
    for (const region of REGIONES) {
      for (const comuna of region.comunas) {
        if (vistas.has(comuna)) duplicadas.push(comuna);
        vistas.add(comuna);
      }
    }
    expect(duplicadas).toEqual([]);
  });

  it("no tiene nombres vacíos ni con espacios sobrantes", () => {
    for (const region of REGIONES) {
      expect(region.nombre.trim()).toBe(region.nombre);
      expect(region.nombre.length).toBeGreaterThan(0);
      for (const comuna of region.comunas) {
        expect(comuna.trim()).toBe(comuna);
        expect(comuna.length).toBeGreaterThan(0);
      }
    }
  });

  it("lista las comunas ordenadas alfabéticamente dentro de cada región", () => {
    for (const region of REGIONES) {
      const ordenadas = [...region.comunas].sort((a, b) => a.localeCompare(b, "es"));
      expect(region.comunas, `${region.nombre} sin ordenar`).toEqual(ordenadas);
    }
  });

  // Casos que se prestan a confusión al transcribir el listado: "Ranco" y
  // "Los Lagos" son nombres de PROVINCIA en Los Ríos, no comunas extra.
  it("incluye comunas que suelen omitirse o confundirse", () => {
    expect(comunasDeRegion("Los Ríos")).toContain("Los Lagos");
    expect(comunasDeRegion("Los Ríos")).toContain("Lago Ranco");
    expect(comunasDeRegion("Los Ríos")).not.toContain("Ranco");
    expect(comunasDeRegion("Libertador General Bernardo O'Higgins")).toContain("Mostazal");
    expect(comunasDeRegion("Valparaíso")).toContain("Isla de Pascua");
    expect(comunasDeRegion("Magallanes y de la Antártica Chilena")).toContain("Antártica");
    expect(comunasDeRegion("Biobío")).toContain("Alto Biobío");
  });

  it("no incluye nombres de provincia como si fueran comunas", () => {
    // Provincias que no son comunas: si aparecieran, alguien transcribió mal.
    for (const falsa of ["Cachapoal", "Colchagua", "Cardenal Caro", "Del Tamarugal", "El Loa"]) {
      expect(TODAS_LAS_COMUNAS).not.toContain(falsa);
    }
  });
});

describe("comunasDeRegion", () => {
  it("devuelve las comunas de la región", () => {
    expect(comunasDeRegion("Biobío")).toContain("Coronel");
    expect(comunasDeRegion("Biobío")).toContain("Concepción");
    expect(comunasDeRegion("Biobío")).toHaveLength(33);
  });

  it("no mezcla comunas de otras regiones", () => {
    // Filtrado en cascada: elegir Biobío no debe ofrecer comunas de la RM.
    expect(comunasDeRegion("Biobío")).not.toContain("Santiago");
    expect(comunasDeRegion("Metropolitana de Santiago")).not.toContain("Coronel");
  });

  it("devuelve lista vacía ante una región inexistente o nula", () => {
    expect(comunasDeRegion("Narnia")).toEqual([]);
    expect(comunasDeRegion(null)).toEqual([]);
    expect(comunasDeRegion(undefined)).toEqual([]);
    expect(comunasDeRegion("")).toEqual([]);
  });
});

describe("regionDeComuna", () => {
  it("encuentra la región de una comuna", () => {
    expect(regionDeComuna("Coronel")).toBe("Biobío");
    expect(regionDeComuna("Providencia")).toBe("Metropolitana de Santiago");
    expect(regionDeComuna("Arica")).toBe("Arica y Parinacota");
  });

  it("devuelve null si la comuna no existe", () => {
    expect(regionDeComuna("Springfield")).toBeNull();
    expect(regionDeComuna(null)).toBeNull();
    expect(regionDeComuna(undefined)).toBeNull();
  });

  it("es consistente con comunasDeRegion para todas las comunas", () => {
    for (const region of REGIONES) {
      for (const comuna of region.comunas) {
        expect(regionDeComuna(comuna)).toBe(region.nombre);
      }
    }
  });
});

describe("comunaPerteneceARegion", () => {
  it("valida la combinación región + comuna", () => {
    expect(comunaPerteneceARegion("Coronel", "Biobío")).toBe(true);
    // El caso que el formulario debe impedir: cambiar de región y dejar la
    // comuna anterior, guardando una dirección imposible en la factura.
    expect(comunaPerteneceARegion("Coronel", "Metropolitana de Santiago")).toBe(false);
    expect(comunaPerteneceARegion("Narnia", "Biobío")).toBe(false);
  });
});

describe("comunaCanonica / regionCanonica", () => {
  // El caso real que apareció en producción: un perfil guardado antes de los
  // selectores tenía "Concepcion" sin tilde, el <select> no encontraba la
  // opción y el campo aparecía vacío, como si el dato se hubiera perdido.
  it("recupera el nombre oficial de una comuna escrita sin tilde", () => {
    expect(comunaCanonica("Concepcion")).toBe("Concepción");
    expect(comunaCanonica("Vina del Mar")).toBe("Viña del Mar");
    expect(comunaCanonica("Nunoa")).toBe("Ñuñoa");
  });

  it("tolera mayúsculas y espacios sobrantes", () => {
    expect(comunaCanonica("CONCEPCIÓN")).toBe("Concepción");
    expect(comunaCanonica("  coronel  ")).toBe("Coronel");
    expect(comunaCanonica("puerto  montt")).toBe("Puerto Montt");
  });

  it("devuelve null si la comuna no existe", () => {
    expect(comunaCanonica("Springfield")).toBeNull();
    expect(comunaCanonica(null)).toBeNull();
    expect(comunaCanonica("")).toBeNull();
  });

  it("hace lo mismo con las regiones", () => {
    expect(regionCanonica("Biobio")).toBe("Biobío");
    expect(regionCanonica("BIOBÍO")).toBe("Biobío");
    expect(regionCanonica("Valparaiso")).toBe("Valparaíso");
    expect(regionCanonica("Narnia")).toBeNull();
  });

  it("las funciones de consulta también toleran la falta de tilde", () => {
    // Sin esto, un perfil antiguo no pasaría la validación del servidor.
    expect(comunasDeRegion("Biobio").length).toBe(33);
    expect(regionDeComuna("Concepcion")).toBe("Biobío");
    expect(comunaPerteneceARegion("Concepcion", "Biobio")).toBe(true);
    expect(comunaPerteneceARegion("Concepcion", "Maule")).toBe(false);
  });

  it("es idempotente sobre los nombres ya oficiales", () => {
    for (const comuna of TODAS_LAS_COMUNAS) {
      expect(comunaCanonica(comuna)).toBe(comuna);
    }
    for (const region of NOMBRES_REGIONES) {
      expect(regionCanonica(region)).toBe(region);
    }
  });
});

describe("NOMBRES_REGIONES", () => {
  it("va de norte a sur", () => {
    expect(NOMBRES_REGIONES[0]).toBe("Arica y Parinacota");
    expect(NOMBRES_REGIONES.at(-1)).toBe("Magallanes y de la Antártica Chilena");
    expect(NOMBRES_REGIONES).toHaveLength(16);
  });
});
