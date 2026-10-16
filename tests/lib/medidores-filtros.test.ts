/**
 * Filtros de /medidores: "uno de" dentro de un filtro, "todos" entre filtros.
 */
import { describe, it, expect } from "vitest";
import { FILTROS_VACIOS, aplicarFiltros, opcionesFiltro } from "@/app/(app)/medidores/filtros";
import type { MedidorConUltima } from "@/lib/medidores-api";

function medidor(p: Partial<MedidorConUltima>): MedidorConUltima {
  return {
    id: "m", workspace_id: "w", nombre: "M", descripcion: null, tipo: "manual", unidad: "h",
    activo_id: null, ubicacion_id: null, token: null, advertencia: null, critico: null,
    frecuencia_dias: null, frecuencia_minutos: null, intervalo_ot: null, ultimo_disparo_ot: null,
    activo: true, creado_por: null, created_at: "2026-01-01T00:00:00Z", ultima: null,
    ...p,
  };
}

const lectura = (valor: number) => ({
  id: "l", medidor_id: "m", valor, ts: new Date().toISOString(),
  foto_url: null, creado_por: null, paso_respuesta_id: null, created_at: "",
});

const a = medidor({ id: "a", activo_id: "x", activo_nombre: "Bomba", unidad: "h", frecuencia_minutos: 1440, ultima: lectura(5) });
const b = medidor({ id: "b", activo_id: "y", activo_nombre: "Motor", unidad: "mm/s", frecuencia_minutos: 60, critico: 9, ultima: lectura(10) });
const c = medidor({ id: "c", tipo: "automatizado", unidad: "h" });
const todos = [a, b, c];
const ids = (ms: MedidorConUltima[]) => ms.map(m => m.id);

describe("aplicarFiltros", () => {
  it("sin filtros devuelve todo", () => {
    expect(ids(aplicarFiltros(todos, FILTROS_VACIOS))).toEqual(["a", "b", "c"]);
  });

  it("dentro de un filtro es 'uno de'", () => {
    expect(ids(aplicarFiltros(todos, { ...FILTROS_VACIOS, activos: ["x", "y"] }))).toEqual(["a", "b"]);
  });

  it("entre filtros es 'todos'", () => {
    expect(ids(aplicarFiltros(todos, { ...FILTROS_VACIOS, unidades: ["h"], tipos: ["manual"] }))).toEqual(["a"]);
  });

  it("'Sin activo' encuentra a los que no cuelgan de nada", () => {
    expect(ids(aplicarFiltros(todos, { ...FILTROS_VACIOS, activos: ["sin"] }))).toEqual(["c"]);
  });

  it("estado: crítico y sin lecturas", () => {
    expect(ids(aplicarFiltros(todos, { ...FILTROS_VACIOS, estados: ["critico"] }))).toEqual(["b"]);
    expect(ids(aplicarFiltros(todos, { ...FILTROS_VACIOS, estados: ["sin-lecturas"] }))).toEqual(["c"]);
  });
});

describe("opcionesFiltro", () => {
  it("frecuencias por duración y 'Sin ronda' al final", () => {
    expect(opcionesFiltro(todos).frecuencias.map(o => o.label)).toEqual(["Cada hora", "Diaria", "Sin ronda"]);
  });

  it("solo ofrece lo que existe", () => {
    expect(opcionesFiltro(todos).unidades.map(o => o.id)).toEqual(["h", "mm/s"]);
    expect(opcionesFiltro(todos).activos.map(o => o.label)).toEqual(["Bomba", "Motor", "Sin activo"]);
  });
});
