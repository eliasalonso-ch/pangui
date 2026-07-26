import { createClient } from "@/lib/supabase";

type QueryError = {
  code?: string;
  message?: string;
  status?: number;
};

type QueryResult = {
  error: QueryError | null;
};

const EXPIRY_SAFETY_WINDOW_SECONDS = 30;
let refreshPromise: Promise<boolean> | null = null;

export class BrowserSessionUnavailableError extends Error {
  constructor() {
    super("No hay una sesión activa disponible para consultar Supabase.");
    this.name = "BrowserSessionUnavailableError";
  }
}

export function isSupabaseAuthError(error: QueryError | null | undefined): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return error.status === 401
    || error.code === "PGRST301"
    || message.includes("jwt expired")
    || message.includes("invalid jwt")
    || message.includes("unauthorized");
}

async function refreshBrowserSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshPromise) return refreshPromise;

  const sb = createClient();
  refreshPromise = sb.auth.refreshSession()
    .then(({ data, error }) => !error && Boolean(data.session))
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function prepareBrowserSession(): Promise<void> {
  if (typeof window === "undefined") return;

  const sb = createClient();
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session) throw new BrowserSessionUnavailableError();

  const expiresAt = data.session.expires_at;
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt <= now + EXPIRY_SAFETY_WINDOW_SECONDS) {
    const refreshed = await refreshBrowserSession();
    if (!refreshed) throw new BrowserSessionUnavailableError();
  }
}

/**
 * Runs an authenticated browser query after checking that its JWT is usable.
 * A server-rejected JWT is refreshed and retried once. The refresh is shared
 * between concurrent callers so waking a background tab cannot create a token
 * refresh stampede.
 */
export async function withSupabaseAuthRetry<T extends QueryResult>(
  operation: () => PromiseLike<T>,
): Promise<T> {
  await prepareBrowserSession();
  const first = await operation();
  if (!isSupabaseAuthError(first.error)) return first;

  const refreshed = await refreshBrowserSession();
  if (!refreshed) return first;
  return operation();
}
