import { describe, it, expect } from "vitest";
import { mergeCalendarExtras } from "@/lib/orden-merge";
import type { OrdenCalendarExtra } from "@/types/ordenes";

type Row = { id: string; titulo: string; recurrencia_config?: unknown; activos?: unknown };

const rows: Row[] = [
  { id: "a", titulo: "Bomba" },
  { id: "b", titulo: "Tablero" },
];

function extras(entries: [string, OrdenCalendarExtra][]) {
  return new Map<string, OrdenCalendarExtra>(entries);
}

describe("mergeCalendarExtras", () => {
  // El calendario se abre pocas veces; la lista y el kanban se renderizan
  // constantemente. Si esto devolviera un array nuevo cada vez, cada render
  // invalidaría los memos de esas vistas sin que haya nada que mezclar.
  it("devuelve la MISMA referencia cuando no hay extras", () => {
    expect(mergeCalendarExtras(rows, null)).toBe(rows);
    expect(mergeCalendarExtras(rows, undefined)).toBe(rows);
    expect(mergeCalendarExtras(rows, extras([]))).toBe(rows);
  });

  it("mezcla recurrencia_config y activos sobre la fila que corresponde", () => {
    const merged = mergeCalendarExtras(
      rows,
      extras([["a", { recurrencia_config: { interval: 2 }, activos: { nombre: "Bomba 1" } } as OrdenCalendarExtra]]),
    );
    expect(merged[0]).toMatchObject({
      id: "a",
      titulo: "Bomba",
      recurrencia_config: { interval: 2 },
      activos: { nombre: "Bomba 1" },
    });
  });

  it("deja intactas las filas sin extra y conserva el orden", () => {
    const merged = mergeCalendarExtras(
      rows,
      extras([["a", { recurrencia_config: null, activos: null } as OrdenCalendarExtra]]),
    );
    expect(merged.map(r => r.id)).toEqual(["a", "b"]);
    expect(merged[1]).toBe(rows[1]);
  });

  it("ignora un extra cuyo id no está en las filas: no inventa filas", () => {
    const merged = mergeCalendarExtras(
      rows,
      extras([["zzz", { recurrencia_config: null, activos: null } as OrdenCalendarExtra]]),
    );
    expect(merged).toHaveLength(2);
    expect(merged.map(r => r.id)).toEqual(["a", "b"]);
  });
});
