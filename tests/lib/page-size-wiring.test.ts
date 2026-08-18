import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ORDENES_PAGE_SIZE, ORDENES_BULK_PAGE_SIZE } from "@/lib/ordenes-api";

/**
 * Guards the list/bulk page-size split.
 *
 * WHY: these two constants were once accidentally swapped — the rendered list
 * paged at 150 and the workspace snapshot at 20, turning the snapshot into ~33
 * sequential requests. Both values are plain numbers in valid positions, so
 * `tsc` and the whole unit suite passed; only a Network capture caught it.
 *
 * Asserted against the source text because the bug was *which constant each
 * function references*, which no runtime assertion on the values can detect.
 */
const SRC = readFileSync(join(process.cwd(), "lib/ordenes-api.ts"), "utf8");

function limitInside(fnName: string): string | null {
  const start = SRC.indexOf(`function ${fnName}(`);
  if (start === -1) return null;
  const body = SRC.slice(start, start + 1600);
  return body.match(/\.limit\((\w+)\)/)?.[1] ?? null;
}

describe("page-size wiring", () => {
  it("keeps the bulk snapshot page larger than the rendered list page", () => {
    expect(ORDENES_PAGE_SIZE).toBeLessThan(ORDENES_BULK_PAGE_SIZE);
  });

  it("stays under the seq-scan cliff (measured between 150 and 300)", () => {
    expect(ORDENES_BULK_PAGE_SIZE).toBeLessThanOrEqual(150);
  });

  it("fetchOrdenesPage pages the rendered list at ORDENES_PAGE_SIZE", () => {
    expect(limitInside("fetchOrdenesPage")).toBe("ORDENES_PAGE_SIZE");
  });

  it("fetchOrdenesBulkPage pages the snapshot at ORDENES_BULK_PAGE_SIZE", () => {
    expect(limitInside("fetchOrdenesBulkPage")).toBe("ORDENES_BULK_PAGE_SIZE");
  });
});
