import { describe, it, expect } from "vitest";
import {
  needsBulkSnapshot,
  shouldRefetchBulk,
  BULK_MIN_INTERVAL_MS,
} from "@/app/(app)/ordenes/bulk-refresh";

const PAGE_SIZE = 300;

describe("needsBulkSnapshot", () => {
  it("no hace falta cuando la primera página vino corta: ya es el workspace completo", () => {
    expect(needsBulkSnapshot(150, PAGE_SIZE)).toBe(false);
  });

  it("hace falta cuando la primera página vino llena: puede haber página 2", () => {
    expect(needsBulkSnapshot(PAGE_SIZE, PAGE_SIZE)).toBe(true);
  });

  it("un workspace vacío no dispara el fetch caro", () => {
    expect(needsBulkSnapshot(0, PAGE_SIZE)).toBe(false);
  });
});

describe("shouldRefetchBulk", () => {
  it("siempre permite el primer fetch (lastFetchMs === 0)", () => {
    expect(shouldRefetchBulk(0, 0)).toBe(true);
    expect(shouldRefetchBulk(5_000, 0)).toBe(true);
  });

  it("bloquea dentro de la ventana de enfriamiento", () => {
    const last = 1_000_000;
    expect(shouldRefetchBulk(last + 1_000, last)).toBe(false);
    expect(shouldRefetchBulk(last + BULK_MIN_INTERVAL_MS - 1, last)).toBe(false);
  });

  it("permite justo al cumplirse el intervalo", () => {
    const last = 1_000_000;
    expect(shouldRefetchBulk(last + BULK_MIN_INTERVAL_MS, last)).toBe(true);
  });

  it("respeta un intervalo explícito", () => {
    expect(shouldRefetchBulk(5_000, 1_000, 10_000)).toBe(false);
    expect(shouldRefetchBulk(11_000, 1_000, 10_000)).toBe(true);
  });
});
