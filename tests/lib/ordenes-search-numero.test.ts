import { describe, it, expect } from "vitest";
import { parseOrdenNumeroQuery, matchesSearch, buildDescripcion } from "@/lib/ordenes-api";

describe("parseOrdenNumeroQuery", () => {
  it("parses a #-prefixed number", () => {
    expect(parseOrdenNumeroQuery("#123")).toBe(123);
    expect(parseOrdenNumeroQuery("  #7  ")).toBe(7);
    expect(parseOrdenNumeroQuery("# 42")).toBe(42);
  });

  it("parses a bare number", () => {
    expect(parseOrdenNumeroQuery("123")).toBe(123);
  });

  it("rejects anything that is not purely digits", () => {
    expect(parseOrdenNumeroQuery("#12a")).toBeNull();
    expect(parseOrdenNumeroQuery("12 bombas")).toBeNull();
    expect(parseOrdenNumeroQuery("bomba")).toBeNull();
    expect(parseOrdenNumeroQuery("#")).toBeNull();
    expect(parseOrdenNumeroQuery("")).toBeNull();
    expect(parseOrdenNumeroQuery("-5")).toBeNull();
    expect(parseOrdenNumeroQuery("1.5")).toBeNull();
  });

  it("rejects zero and unsafe integers", () => {
    expect(parseOrdenNumeroQuery("0")).toBeNull();
    expect(parseOrdenNumeroQuery("9".repeat(25))).toBeNull();
  });
});

describe("matchesSearch", () => {
  const ot = (over: Partial<Parameters<typeof matchesSearch>[0]> = {}) => ({
    titulo: "Revisar bomba",
    numero: 123,
    descripcion: buildDescripcion({ nOT: "", solicitante: "Ana", hito: "", body: "cambiar sello" }),
    ...over,
  });

  it("matches an exact OT number via #", () => {
    expect(matchesSearch(ot(), "#123")).toBe(true);
  });

  it("does NOT fall back to text when # finds no number match", () => {
    // "#500" must not match "Victoria 500" in the title.
    expect(matchesSearch(ot({ titulo: "Victoria 500", numero: 1 }), "#500")).toBe(false);
  });

  it("falls back to text for a bare number that isn't the OT number", () => {
    expect(matchesSearch(ot({ titulo: "Victoria 500", numero: 1 }), "500")).toBe(true);
  });

  it("matches a bare number against the OT number", () => {
    expect(matchesSearch(ot(), "123")).toBe(true);
  });

  it("still matches on título, solicitante and description", () => {
    expect(matchesSearch(ot(), "bomba")).toBe(true);
    expect(matchesSearch(ot(), "ana")).toBe(true);
    expect(matchesSearch(ot(), "sello")).toBe(true);
    expect(matchesSearch(ot(), "inexistente")).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesSearch(ot(), "")).toBe(true);
    expect(matchesSearch(ot(), "   ")).toBe(true);
  });

  it("handles a null numero", () => {
    expect(matchesSearch(ot({ numero: null }), "#123")).toBe(false);
  });
});
