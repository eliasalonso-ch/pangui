// Regression: the export's "Fecha completación" must read completado_en, not
// updated_at. updated_at is "last touched by anything", so the 2026-08-11
// backfill migration stamped 385 completed OTs with its own timestamp and every
// one of them reported 11-08-2026 as its completion date.

import { describe, it, expect } from "vitest";
import { buildOrdenesCsv } from "@/lib/csv-export-shared";
import type { OrdenInput } from "@/lib/excel-export-shared";

const base: OrdenInput = {
  id: "ot-1", numero: 143, titulo: "T", descripcion: null,
  estado: "completado", prioridad: "media", tipo_trabajo: null,
  fecha_termino: null, created_at: "2026-05-13T00:00:00Z",
  updated_at: "2026-08-11T18:50:58Z",      // bulk-migration timestamp
  completado_en: "2026-05-26T14:00:00Z",   // real completion
  asignados_ids: null,
};

const cols = { numero: true, fecha_completacion: true } as const;
// buildOrdenesCsv returns UTF-8 bytes (it feeds an email attachment), so decode
// before asserting on text.
const csvFor = (o: OrdenInput) =>
  new TextDecoder().decode(
    buildOrdenesCsv({ ordenes: [o], usuarios: [], cols }) as unknown as Uint8Array,
  );

describe("export completion date", () => {
  it("uses completado_en, not the bulk-update updated_at", () => {
    const csv = csvFor(base);
    expect(csv).toContain("26-05-2026");
    expect(csv).not.toContain("11-08-2026");
  });

  it("falls back to updated_at when completado_en is absent", () => {
    const csv = csvFor({ ...base, completado_en: null });
    expect(csv).toContain("11-08-2026");
  });

  it("shows nothing for OTs that are not completed", () => {
    const csv = csvFor({ ...base, estado: "en_curso" });
    expect(csv).not.toContain("26-05-2026");
  });
});
