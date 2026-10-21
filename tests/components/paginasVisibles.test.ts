import { describe, it, expect } from "vitest";
import { paginasVisibles } from "@/components/tabla/DataTable";

describe("paginasVisibles", () => {
  it("con 7 páginas o menos las muestra todas", () => {
    expect(paginasVisibles(0, 1)).toEqual([0]);
    expect(paginasVisibles(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("primera, última, la actual con sus vecinas y … en los saltos", () => {
    expect(paginasVisibles(0, 12)).toEqual([0, 1, "…", 11]);
    expect(paginasVisibles(5, 12)).toEqual([0, "…", 4, 5, 6, "…", 11]);
    expect(paginasVisibles(11, 12)).toEqual([0, "…", 10, 11]);
  });

  it("no pone … cuando no hay hueco", () => {
    expect(paginasVisibles(2, 12)).toEqual([0, 1, 2, 3, "…", 11]);
  });
});
