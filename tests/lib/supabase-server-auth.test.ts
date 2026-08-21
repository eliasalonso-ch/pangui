import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AuthSessionMissingError,
  AuthRetryableFetchError,
  AuthApiError,
} from "@supabase/supabase-js";

const getUser = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser } }),
}));

// React.cache memoizes per-render; in tests it must not dedupe across cases.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: (fn: unknown) => fn };
});

const { getServerUser, shouldRedirectToLogin } = await import("@/lib/supabase-server");

describe("getServerUser — transient failure must not look like a logout", () => {
  beforeEach(() => {
    getUser.mockReset();
    // A reset mock returns undefined, which would throw on destructuring in
    // whichever test runs next. Default to a benign signed-out response.
    getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  it("classifies a real missing session as anonymous", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    const auth = await getServerUser();
    expect(auth.status).toBe("anonymous");
    expect(shouldRedirectToLogin(auth)).toBe(true);
  });

  it("does NOT sign the user out on a retryable network error", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("network down", 503),
    });
    const auth = await getServerUser();
    expect(auth.status).toBe("error");
    expect(shouldRedirectToLogin(auth)).toBe(false);
  });

  it("does NOT sign the user out on a 429 rate limit", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("rate limited", 429, "over_request_rate_limit"),
    });
    const auth = await getServerUser();
    expect(auth.status).toBe("error");
    expect(shouldRedirectToLogin(auth)).toBe(false);
  });

  it("does NOT sign the user out when the auth server 500s", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("boom", 500, "unexpected_failure"),
    });
    const auth = await getServerUser();
    expect(auth.status).toBe("error");
    expect(shouldRedirectToLogin(auth)).toBe(false);
  });

  it("keeps the session when the auth host is unreachable (fetch failed)", async () => {
    // What auth-js actually produces when DNS fails or the connection is
    // refused: a wrapped TypeError with status 0. This is the shape that a
    // deploy-time blip takes, and the one that used to log people out.
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    const auth = await getServerUser();
    expect(auth.status).toBe("error");
    expect(shouldRedirectToLogin(auth)).toBe(false);
  });

  it("signs the user out when the token itself is rejected (401)", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError("bad jwt", 401, "invalid_jwt"),
    });
    const auth = await getServerUser();
    expect(auth.status).toBe("anonymous");
    expect(shouldRedirectToLogin(auth)).toBe(true);
  });

  it("treats a thrown exception as unverified, not as a logout", async () => {
    // Rejects asynchronously so the failure travels the same path a real
    // aborted fetch would, and vitest does not see a bare rejected promise.
    getUser.mockImplementation(async () => {
      await Promise.resolve();
      throw new Error("fetch failed");
    });
    const auth = await getServerUser();
    expect(auth.status).toBe("error");
    expect(shouldRedirectToLogin(auth)).toBe(false);
  });

  it("returns the user when authenticated", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const auth = await getServerUser();
    expect(auth.status).toBe("authenticated");
    expect(auth.user?.id).toBe("u1");
    expect(shouldRedirectToLogin(auth)).toBe(false);
  });
});
