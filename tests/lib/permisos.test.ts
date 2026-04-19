import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { usePermisos } from "@/lib/permisos";

const mockGetUser    = vi.fn();
const mockFrom       = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

function makeFromChain(data: any, error: any = null) {
  const chain: any = {
    select: () => chain,
    eq:     () => chain,
    maybeSingle: () => Promise.resolve({ data, error }),
    then: (res: any) => Promise.resolve({ data, error }).then(res),
  };
  return chain;
}

beforeEach(() => vi.clearAllMocks());

describe("usePermisos", () => {
  it("starts loading with permisos=null", () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockFrom.mockReturnValue(makeFromChain(null));

    const { result } = renderHook(() => usePermisos());
    expect(result.current.permisos).toBeNull();
  });

  it("sets empty permisos when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { result } = renderHook(() => usePermisos());
    await waitFor(() => expect(result.current.permisos).not.toBeNull());
    expect(result.current.permisos).toEqual({});
  });

  it("sets userRol from perfil row", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "usuarios") return makeFromChain({ rol: "admin" });
      // permisos_usuario — return array style
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    });

    const { result } = renderHook(() => usePermisos());
    await waitFor(() => expect(result.current.userRol).toBe("admin"));
  });

  it("puedeVer returns true for admin regardless of permisos rows", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "usuarios") return makeFromChain({ rol: "admin" });
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [{ modulo: "inventario", puede_ver: false }], error: null }),
        }),
      };
    });

    const { result } = renderHook(() => usePermisos());
    await waitFor(() => result.current.permisos !== null);
    expect(result.current.puedeVer("inventario")).toBe(true);
  });

  it("puedeVer returns false when tecnico has puede_ver=false", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u2" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "usuarios") return makeFromChain({ rol: "tecnico" });
      return {
        select: () => ({
          eq: () => Promise.resolve({
            data: [{ modulo: "inventario", puede_ver: false }],
            error: null,
          }),
        }),
      };
    });

    const { result } = renderHook(() => usePermisos());
    // Wait until both userRol AND permisos map are set
    await waitFor(() => {
      expect(result.current.userRol).toBe("tecnico");
      expect(result.current.permisos).not.toBeNull();
    });
    expect(result.current.puedeVer("inventario")).toBe(false);
  });

  it("puedeVer defaults to true when no row exists for module", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u3" } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === "usuarios") return makeFromChain({ rol: "tecnico" });
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    });

    const { result } = renderHook(() => usePermisos());
    await waitFor(() => result.current.permisos !== null);
    expect(result.current.puedeVer("reportes")).toBe(true);
  });

  it("puedeVer returns true optimistically while loading (permisos=null)", () => {
    // Never resolves — stays in loading state
    mockGetUser.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePermisos());
    expect(result.current.permisos).toBeNull();
    expect(result.current.puedeVer("inventario")).toBe(true);
  });
});
