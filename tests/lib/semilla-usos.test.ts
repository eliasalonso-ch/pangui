import { describe, expect, it } from "vitest";
import { semilla } from "@/scripts/semilla-usos-materiales";

const cat = [{ codigo: "cajpla", descripcion: "Caja plástica chuqui", unidad: "un", clasificacion: "Caja" }];
const fila = (u: string, item: string, fecha: string) =>
  ({ created_by: u, columnas: [{ id: "a", label: "Ítem" }, { id: "b", label: "Cantidad" }], celdas: { a: item, b: "1" }, updated_at: fecha });

describe("semilla", () => {
  it("cuenta por maestro y código, con la última fecha", () => {
    expect(semilla([fila("u1", "caja chuky", "2026-07-01"), fila("u1", "2 uni caja chuqui", "2026-08-01"), fila("u2", "cosa rara", "2026-08-01")], cat))
      .toEqual([{ usuario_id: "u1", codigo: "cajpla", veces: 2, ultimo_uso: "2026-08-01" }]);
  });
  it("también cuenta el texto idéntico a la descripción del catálogo", () => {
    expect(semilla([fila("u2", "Caja plástica chuqui", "2026-09-01")], cat)).toEqual([{ usuario_id: "u2", codigo: "cajpla", veces: 1, ultimo_uso: "2026-09-01" }]);
  });
});
