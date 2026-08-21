import { describe, it, expect, beforeEach } from "vitest";
import {
  readLocalBorrador,
  writeLocalBorrador,
  clearLocalBorrador,
} from "@/lib/ot-borrador-local";

const U = "user-1";
const W = "ws-1";

describe("localStorage draft mirror", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns null when nothing was written", () => {
    expect(readLocalBorrador(U, W)).toBeNull();
  });

  it("round-trips a payload synchronously", () => {
    writeLocalBorrador(U, W, { titulo: "Test" });
    expect(readLocalBorrador(U, W)?.payload.titulo).toBe("Test");
  });

  it("stamps actualizado_at", () => {
    writeLocalBorrador(U, W, { titulo: "Test" });
    const at = readLocalBorrador(U, W)?.actualizado_at;
    expect(at).toBeTruthy();
    expect(Number.isNaN(Date.parse(at!))).toBe(false);
  });

  it("scopes drafts per user and per workspace", () => {
    writeLocalBorrador(U, W, { titulo: "Mío" });
    expect(readLocalBorrador("otro-user", W)).toBeNull();
    expect(readLocalBorrador(U, "otro-ws")).toBeNull();
  });

  it("clears on discard", () => {
    writeLocalBorrador(U, W, { titulo: "Test" });
    clearLocalBorrador(U, W);
    expect(readLocalBorrador(U, W)).toBeNull();
  });

  it("ignores a mirror written by an older schema version", () => {
    window.localStorage.setItem(
      `pangui:ot-borrador:${U}:${W}`,
      JSON.stringify({ v: 0, actualizado_at: new Date().toISOString(), payload: { titulo: "viejo" } }),
    );
    expect(readLocalBorrador(U, W)).toBeNull();
  });

  it("survives corrupt JSON without throwing", () => {
    window.localStorage.setItem(`pangui:ot-borrador:${U}:${W}`, "{not json");
    expect(() => readLocalBorrador(U, W)).not.toThrow();
    expect(readLocalBorrador(U, W)).toBeNull();
  });

  it("rejects a non-object payload", () => {
    window.localStorage.setItem(
      `pangui:ot-borrador:${U}:${W}`,
      JSON.stringify({ v: 1, actualizado_at: new Date().toISOString(), payload: ["a"] }),
    );
    expect(readLocalBorrador(U, W)).toBeNull();
  });

  it("does not write an oversized payload", () => {
    writeLocalBorrador(U, W, { titulo: "x".repeat(70 * 1024) });
    expect(readLocalBorrador(U, W)).toBeNull();
  });

  it("is a no-op without a user or workspace", () => {
    expect(() => writeLocalBorrador("", W, { titulo: "x" })).not.toThrow();
    expect(readLocalBorrador("", W)).toBeNull();
  });
});
