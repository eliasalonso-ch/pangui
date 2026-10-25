/**
 * Foto obligatoria en pasos con evidencia (inspección, sí/no/N-A, medidor).
 */
import { describe, it, expect } from "vitest";
import { faltaFoto } from "@/lib/procedimientos-reglas";

describe("faltaFoto", () => {
  it("sin el switch nunca falta", () => {
    expect(faltaFoto({ tipo: "si_no_na" }, { valor_json: {} })).toBe(false);
  });

  it("no aplica a tipos sin fotos adjuntas", () => {
    expect(faltaFoto({ tipo: "texto", foto_requerida: true }, undefined)).toBe(false);
  });

  it("sí/no y medidor: basta una foto en evidence_images o foto_url", () => {
    const paso = { tipo: "si_no_na" as const, foto_requerida: true };
    expect(faltaFoto(paso, { valor_json: { evidence_images: [] } })).toBe(true);
    expect(faltaFoto(paso, { valor_json: { evidence_images: ["a.jpg"] } })).toBe(false);
    expect(faltaFoto({ tipo: "medidor", foto_requerida: true }, { foto_url: "a.jpg" })).toBe(false);
  });

  it("inspección: cada ítem evaluado necesita su foto", () => {
    const paso = { tipo: "inspeccion" as const, foto_requerida: true };
    expect(faltaFoto(paso, undefined)).toBe(true);
    expect(faltaFoto(paso, { valor_json: { items: [
      { item: "A", result: "pass", foto_urls: ["a.jpg"] },
      { item: "B", result: "fail" },
    ] } })).toBe(true);
    expect(faltaFoto(paso, { valor_json: { items: [
      { item: "A", result: "pass", foto_urls: ["a.jpg"] },
      { item: "B", result: "fail", foto_urls: ["b.jpg"] },
    ] } })).toBe(false);
  });
});
