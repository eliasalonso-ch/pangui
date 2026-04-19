import { describe, it, expect, vi, beforeEach } from "vitest";
import { callEdge } from "@/lib/edge";

const mockGetSession = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    auth: { getSession: mockGetSession },
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => vi.clearAllMocks());

describe("callEdge", () => {
  it("calls the correct edge function URL", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt-token" } } });
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await callEdge("invitar", { email: "a@b.cl" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/functions/v1/invitar"),
      expect.any(Object),
    );
  });

  it("sends Authorization header with JWT", async () => {
    mockGetSession.mockResolvedValue({ data: { session: { access_token: "my-jwt" } } });
    mockFetch.mockResolvedValue({ ok: true });

    await callEdge("test-fn", {});

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer my-jwt");
  });

  it("falls back to anon key when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockFetch.mockResolvedValue({ ok: true });

    await callEdge("test-fn", {});

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["Authorization"]).toBe("Bearer test-anon-key");
  });

  it("sends JSON body", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockFetch.mockResolvedValue({ ok: true });

    await callEdge("invitar", { nombre: "Carlos", rol: "tecnico" });

    const [, options] = mockFetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ nombre: "Carlos", rol: "tecnico" });
  });

  it("sends POST method", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockFetch.mockResolvedValue({ ok: true });
    await callEdge("fn", {});
    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("POST");
  });

  it("includes apikey header", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockFetch.mockResolvedValue({ ok: true });
    await callEdge("fn", {});
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers["apikey"]).toBe("test-anon-key");
  });
});
