import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const refreshSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ auth: { getSession, refreshSession } }),
}));

import {
  BrowserSessionUnavailableError,
  isSupabaseAuthError,
  withSupabaseAuthRetry,
} from "@/lib/supabase-auth-retry";

describe("withSupabaseAuthRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({
      data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600 } },
      error: null,
    });
  });

  it("runs a query once when the current session is valid", async () => {
    const operation = vi.fn().mockResolvedValue({ data: ["ok"], error: null });
    await expect(withSupabaseAuthRetry(operation)).resolves.toEqual({ data: ["ok"], error: null });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes and retries once when PostgREST rejects the JWT", async () => {
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null });
    const operation = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST301", message: "JWT expired" } })
      .mockResolvedValueOnce({ data: ["ok"], error: null });

    await expect(withSupabaseAuthRetry(operation)).resolves.toEqual({ data: ["ok"], error: null });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("refreshes before querying when the locally stored JWT is expiring", async () => {
    getSession.mockResolvedValue({
      data: { session: { expires_at: Math.floor(Date.now() / 1000) + 5 } },
      error: null,
    });
    refreshSession.mockResolvedValue({ data: { session: { access_token: "fresh" } }, error: null });
    const operation = vi.fn().mockResolvedValue({ data: [], error: null });

    await withSupabaseAuthRetry(operation);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("does not issue a database request after the user session is gone", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const operation = vi.fn();

    await expect(withSupabaseAuthRetry(operation)).rejects.toBeInstanceOf(BrowserSessionUnavailableError);
    expect(operation).not.toHaveBeenCalled();
  });
});

describe("isSupabaseAuthError", () => {
  it("recognizes PostgREST JWT failures without treating regular errors as auth failures", () => {
    expect(isSupabaseAuthError({ status: 401 })).toBe(true);
    expect(isSupabaseAuthError({ code: "PGRST301", message: "JWT expired" })).toBe(true);
    expect(isSupabaseAuthError({ code: "42501", message: "RLS denied" })).toBe(false);
  });
});
