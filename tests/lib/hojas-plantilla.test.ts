import { describe, expect, it } from "vitest";
import { columnasDeTipo } from "@/lib/hojas-api";

const ELECTRILAM = "f1b64714-6de2-4d49-b6e4-5959553e94d7";
describe("columnasDeTipo", () => {
  it("Electrilam: usados y solicitados llevan Código después de Material", () => {
    for (const tipo of ["materiales_usados", "materiales_solicitados"] as const) {
      const labels = columnasDeTipo(tipo, ELECTRILAM).map((c) => c.label);
      expect(labels.indexOf("Código")).toBe(labels.indexOf("Material") + 1);
    }
  });
  it("otros workspaces y hoja general: sin Código", () => {
    expect(columnasDeTipo("materiales_usados", "otro").map((c) => c.label)).not.toContain("Código");
    expect(columnasDeTipo("general", ELECTRILAM).map((c) => c.label)).not.toContain("Código");
  });
});
