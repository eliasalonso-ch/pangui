import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/(app)/ordenes/OTDetail.tsx"),
  "utf8",
);

describe("OT detail pause parity", () => {
  it("offers the same pause reasons as mobile and records the selected reason", () => {
    expect(source).toContain('type PauseReason = "acceso" | "materiales" | "reprogramar" | "otro"');
    expect(source).toContain('label: "Sin acceso"');
    expect(source).toContain('label: "Faltan materiales"');
    expect(source).toContain('label: "Reprogramar"');
    expect(source).toContain('label: "Otro motivo"');
    expect(source).toContain("await pausarOrden(orden.id, myId, comment, elapsed)");
  });

  it("fills a material-request sheet before pausing", () => {
    expect(source).toContain('createHoja(wsId, "materiales_solicitados", myId, orden.id)');
    expect(source).toContain("setPendingMaterialRequestSheetId(hoja.id)");
    expect(source).toContain('await pausarOrden(orden.id, myId, "Faltan materiales", elapsed)');
    expect(source).toContain("onSheetContentSaved={handleSheetContentSaved}");
  });

  it("does not render requirement notices inside the materials tab", () => {
    const materialsStart = source.indexOf('{tab === "materiales" && (');
    const proceduresStart = source.indexOf('{tab === "procedimientos" && (', materialsStart);
    const materialsSection = source.slice(materialsStart, proceduresStart);

    expect(materialsSection).not.toContain("Esta orden está completada. Puedes seguir consultando los materiales registrados.");
    expect(materialsSection).not.toContain("Esta OT requiere al menos un material registrado para poder cerrarse.");
    expect(materialsSection).not.toContain("Esta OT requiere completar la hoja de cálculo antes de poder cerrarse.");
    expect(materialsSection).not.toContain("Esta OT requiere al menos una foto antes de poder cerrarse.");
  });
});
