import { describe, it, expect, vi } from "vitest";
import { pageThroughAll, ORDENES_PAGE_SIZE } from "@/lib/ordenes-api";

type Row = { id: string; created_at: string };

function makePage(ids: string[]): Row[] {
  return ids.map((id, i) => ({ id, created_at: `2026-08-0${(i % 9) + 1}T00:00:00Z` }));
}

function fullPage(prefix: string): Row[] {
  return makePage(Array.from({ length: ORDENES_PAGE_SIZE }, (_, i) => `${prefix}-${i}`));
}

describe("pageThroughAll", () => {
  it("se detiene en la primera página corta", async () => {
    const fetchPage = vi.fn<(before: string | null) => Promise<Row[]>>()
      .mockResolvedValueOnce(makePage(["a", "b"]));

    const all = await pageThroughAll(fetchPage);

    expect(all.map(r => r.id)).toEqual(["a", "b"]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("sigue paginando mientras las páginas vengan llenas", async () => {
    const fetchPage = vi.fn<(before: string | null) => Promise<Row[]>>()
      .mockResolvedValueOnce(fullPage("p1"))
      .mockResolvedValueOnce(makePage(["last"]));

    const all = await pageThroughAll(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(all).toHaveLength(ORDENES_PAGE_SIZE + 1);
    expect(all.at(-1)?.id).toBe("last");
  });

  it("deduplica por id entre páginas", async () => {
    const overlapping = fullPage("p1");
    const fetchPage = vi.fn<(before: string | null) => Promise<Row[]>>()
      .mockResolvedValueOnce(overlapping)
      .mockResolvedValueOnce(makePage([overlapping[0].id, "nueva"]));

    const all = await pageThroughAll(fetchPage);

    const ids = all.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("nueva");
  });

  // La primera página ya la tiene el llamador (SSR). Volver a pedirla era
  // exactamente el desperdicio que este trabajo vino a eliminar.
  it("reutiliza firstPage sin volver a pedirla, y no pagina si vino corta", async () => {
    const fetchPage = vi.fn<(before: string | null) => Promise<Row[]>>();

    const all = await pageThroughAll(fetchPage, makePage(["a", "b"]));

    expect(fetchPage).not.toHaveBeenCalled();
    expect(all.map(r => r.id)).toEqual(["a", "b"]);
  });

  it("con firstPage llena, sigue desde el cursor de esa página", async () => {
    const first = fullPage("p1");
    const fetchPage = vi.fn<(before: string | null) => Promise<Row[]>>()
      .mockResolvedValueOnce(makePage(["siguiente"]));

    const all = await pageThroughAll(fetchPage, first);

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(first.at(-1)?.created_at);
    expect(all).toHaveLength(ORDENES_PAGE_SIZE + 1);
  });

  it("corta en el techo de 100 páginas aunque el cursor nunca avance", async () => {
    const fetchPage = vi.fn<(before: string | null) => Promise<Row[]>>()
      .mockImplementation(async () => fullPage(`p${fetchPage.mock.calls.length}`));

    await pageThroughAll(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(100);
  });
});
