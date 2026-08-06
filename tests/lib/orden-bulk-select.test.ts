import { describe, it, expect } from "vitest";
import { ORDEN_BULK_SELECT, ORDEN_CALENDAR_EXTRA_SELECT, matchesSearch } from "@/lib/ordenes-api";

/**
 * Top-level column names, with the contents of any join parens removed so
 * `edificio` inside `ubicaciones (edificio, detalle)` isn't mistaken for a
 * column of ordenes_trabajo itself.
 */
function topLevelColumns(select: string): string[] {
  return select
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

// Estas columnas se RENDERIZAN o se FILTRAN. Sacar cualquiera del bulk select
// vacía la UI en silencio cuando hay un filtro activo, porque ahí la lista pasa
// a alimentarse del snapshot del workspace en vez de la página paginada.
const REQUIRED = [
  "id", "titulo", "descripcion", "estado", "prioridad", "tipo_trabajo",
  "clasificacion", "fecha_inicio", "fecha_termino", "created_at",
  "asignados_ids", "ubicacion_id", "numero", "parent_id",
  "iniciado_at", "en_ejecucion", "tiempo_total_segundos",
  "recurrencia", "proxima_ejecucion", "recurrencia_origen_id",
];

describe("ORDEN_BULK_SELECT", () => {
  it.each(REQUIRED)("incluye %s", (col) => {
    expect(topLevelColumns(ORDEN_BULK_SELECT)).toContain(col);
  });

  // OTRow dibuja el chip de ubicación, la tarjeta de kanban muestra
  // "edificio · detalle", y el orden por "Ubicación" compara edificio.
  it("conserva el join de ubicaciones", () => {
    expect(ORDEN_BULK_SELECT).toMatch(/ubicaciones\s*\(\s*edificio\s*,\s*detalle\s*\)/);
  });

  it("excluye lo que sólo leen el calendario y el export", () => {
    expect(ORDEN_BULK_SELECT).not.toMatch(/recurrencia_config/);
    expect(ORDEN_BULK_SELECT).not.toMatch(/categorias_ot/);
    expect(ORDEN_BULK_SELECT).not.toMatch(/activos\s*\(/);
  });
});

describe("ORDEN_CALENDAR_EXTRA_SELECT", () => {
  it("trae el id para poder mezclar, más las columnas que el bulk omite", () => {
    expect(topLevelColumns(ORDEN_CALENDAR_EXTRA_SELECT)).toContain("id");
    expect(ORDEN_CALENDAR_EXTRA_SELECT).toMatch(/recurrencia_config/);
    expect(ORDEN_CALENDAR_EXTRA_SELECT).toMatch(/activos\s*\(\s*nombre\s*\)/);
  });
});

// Esta es la razón por la que `descripcion` NO puede salir del bulk select: el
// N° OT vive embebido en el texto y es el identificador principal del cliente.
describe("matchesSearch depende de descripcion", () => {
  const ot = {
    titulo: "Revisión bomba",
    numero: 12,
    descripcion: "N° OT: SF-4471 | Solicitante: Juan\n\ncuerpo de la descripción",
  };

  it("encuentra una OT por su N° OT, que vive dentro de descripcion", () => {
    expect(matchesSearch(ot, "SF-4471")).toBe(true);
  });

  it("deja de encontrarla si descripcion no viene: la regresión que esto previene", () => {
    expect(matchesSearch({ ...ot, descripcion: null }, "SF-4471")).toBe(false);
  });
});
