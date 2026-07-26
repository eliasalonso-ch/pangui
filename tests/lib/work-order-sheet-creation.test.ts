import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HOJA_TEMPLATES } from "@/lib/hojas-api";

describe("work-order sheet creation policy", () => {
  it("offers the three explicit sheet templates", () => {
    expect(Object.keys(HOJA_TEMPLATES)).toEqual([
      "general",
      "materiales_usados",
      "materiales_solicitados",
    ]);
    expect(HOJA_TEMPLATES.materiales_solicitados.nombre).toBe("Solicitud de materiales");
  });

  it("removes automatic root and sub-work-order sheets from the canonical command", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260725170000_work_order_create_commands_v1.sql"), "utf8");
    expect(sql).not.toContain("INSERT INTO public.hojas_inventario");
    expect(sql).not.toContain("Hoja de materiales");
  });
});
