import { describe, expect, it } from "vitest";
import { buscarEnCatalogo, columnasMaterial, normMaterial, type Material, type Uso } from "@/lib/materiales-busqueda";

const m = (codigo: string, descripcion: string, clasificacion = "Protecciones"): Material =>
  ({ codigo, descripcion, unidad: "un", clasificacion });
const catalogo = [
  m("ITM1x10a", "Interruptor termomagnético 1x10A"),
  m("ITM1x16a", "Interruptor termomagnético 1x16A"),
  m("tab12", "Tablero 12 módulos", "Tablero"),
  m("tab24", "Tablero 24 módulos", "Tablero"),
  m("cajpla", "Caja plástica chuqui", "Caja"),
];
const AHORA = Date.parse("2026-11-10T12:00:00Z");
const usos = (...u: [string, number, number, string | null][]) =>
  new Map(u.map(([codigo, mios, equipo, ultimo_mio]) => [codigo.toLowerCase(), { codigo: codigo.toLowerCase(), mios, equipo, ultimo_mio } as Uso]));
const buscar = (texto: string, extra: Partial<Parameters<typeof buscarEnCatalogo>[0]> = {}) =>
  buscarEnCatalogo({ texto, catalogo, alias: new Map(), usos: new Map(), ahora: AHORA, ...extra }).map((x) => x.codigo);

describe("buscarEnCatalogo", () => {
  it("código exacto primero aunque otro se use más", () => {
    expect(buscar("itm1x16a", { usos: usos(["ITM1x10a", 50, 50, "2026-11-01"]) })[0]).toBe("ITM1x16a");
  });
  it("lo mío antes que lo del equipo, y lo del equipo antes que lo no usado", () => {
    expect(buscar("tablero", { usos: usos(["tab24", 3, 3, "2026-11-01"]) })).toEqual(["tab24", "tab12"]);
    expect(buscar("tablero", { usos: usos(["tab12", 0, 40, null]) })).toEqual(["tab12", "tab24"]);
    expect(buscar("tablero", { usos: usos(["tab24", 1, 1, "2026-11-09"], ["tab12", 0, 5, null]) })).toEqual(["tab24", "tab12"]);
  });
  it("lo reciente pesa más que lo viejo", () => {
    const u = usos(["tab12", 4, 4, "2026-02-01"], ["tab24", 3, 3, "2026-11-05"]);
    expect(buscar("tablero", { usos: u })[0]).toBe("tab24");
  });
  it("todas las palabras en cualquier parte, sin tildes", () => {
    expect(buscar("interr termo 10")).toEqual(["ITM1x10a"]);
    expect(buscar("modulos")).toEqual(["tab12", "tab24"]);
  });
  it("alias y diccionario", () => {
    expect(buscar("caja chuky")).toContain("cajpla");
    expect(buscar("la cosa gris", { alias: new Map([["la cosa gris", "tab12"]]) })).toEqual(["tab12"]);
  });
  it("chip de categoría sin texto: la categoría entera, lo usado arriba y sin tope", () => {
    expect(buscar("", { categoria: "Tablero", usos: usos(["tab24", 2, 2, "2026-11-01"], ["cajpla", 9, 9, "2026-11-01"]) })).toEqual(["tab24", "tab12"]);
    expect(buscar("", { categoria: "Protecciones", limite: 1 })).toEqual(["ITM1x10a", "ITM1x16a"]);
  });
  it("sin texto ni categoría: sólo lo usado", () => {
    expect(buscar("", { usos: usos(["cajpla", 1, 1, "2026-11-01"]) })).toEqual(["cajpla"]);
    expect(buscar("")).toEqual([]);
  });
  it("chip de categoría con texto: filtra dentro de la categoría", () => {
    expect(buscar("24", { categoria: "Tablero" })).toEqual(["tab24"]);
  });
});

describe("columnasMaterial", () => {
  it("detecta por label, sin tildes", () => {
    expect(columnasMaterial([{ id: "a", label: "Material" }, { id: "b", label: "Código" }])).toEqual({ material: "a", codigo: "b" });
    expect(columnasMaterial([{ id: "a", label: "Ítem" }, { id: "b", label: "codigo" }])).toEqual({ material: "a", codigo: "b" });
    expect(columnasMaterial([{ id: "a", label: "Material" }])).toBeNull();
  });
  it("normMaterial", () => expect(normMaterial("  Caja CHUKY ")).toBe("caja chuky"));
});
