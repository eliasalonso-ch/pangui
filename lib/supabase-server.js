import { createServerClient } from "@supabase/ssr";
import { isAuthSessionMissingError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        // Server Components cannot write cookies — Next.js forbids it outside
        // route handlers and server actions. `proxy.js` is what actually
        // persists refreshed tokens; it runs on every matched request and has
        // a real setAll. This no-op exists so @supabase/ssr does not warn, and
        // so nobody "fixes" the missing setAll by making pages write cookies.
        setAll: () => {},
      },
    },
  );
}

/** @typedef {{ status: "anonymous", user: null }} AnonymousAuth */
/** @typedef {{ status: "error", user: null }} ErrorAuth */
/** @typedef {{ status: "authenticated", user: import("@supabase/supabase-js").User }} AuthenticatedAuth */
/** @typedef {AnonymousAuth | ErrorAuth | AuthenticatedAuth} ServerAuth */

/** @type {AnonymousAuth} */
const ANONYMOUS = { status: "anonymous", user: null };
/** @type {ErrorAuth} */
const TRANSIENT_ERROR = { status: "error", user: null };

/**
 * Result of resolving the current user on the server.
 *
 *   authenticated — a verified user; `user` is non-null.
 *   anonymous     — no session at all (signed out, or never signed in).
 *   error         — the auth server could not be reached or answered with a
 *                   transient failure. The session may well be perfectly
 *                   valid; we simply could not confirm it right now.
 *
 * WHY THIS IS A UNION AND NOT `User | null`:
 * The previous version returned null on ANY error, so "network blip" and
 * "signed out" were indistinguishable. Every page did `if (!user) redirect
 * ("/login")`, which meant a single failed fetch logged the user out and
 * discarded whatever they were typing. Nothing appeared in the Supabase auth
 * logs because the failure was swallowed here, client-side of the auth server.
 *
 * That also silently overrode `proxy.js`, which deliberately fails OPEN on
 * these errors ("failing closed only amplifies the storm"). The proxy would
 * correctly let the request through and then the page would redirect anyway.
 */
/** @returns {Promise<ServerAuth>} */
export const getServerUser = cache(async () => {
  try {
    const sb = await createServerSupabase();
    const { data, error } = await sb.auth.getUser();

    if (error) {
      // The only error that genuinely means "not signed in".
      if (isAuthSessionMissingError(error)) return ANONYMOUS;

      // Network failure / 5xx / 429. Explicitly NOT a logout.
      if (isAuthRetryableFetchError(error)) return TRANSIENT_ERROR;

      // A 400/401/403 from the auth API means the token itself was rejected —
      // expired or revoked refresh token. Treat as signed out.
      const status = error.status ?? 0;
      if (status === 400 || status === 401 || status === 403) {
        return ANONYMOUS;
      }

      // Anything else (5xx, unknown) is not proof of a dead session.
      return TRANSIENT_ERROR;
    }

    if (!data?.user) return ANONYMOUS;
    return /** @type {AuthenticatedAuth} */ ({ status: "authenticated", user: data.user });
  } catch {
    // Thrown rather than returned (DNS failure, aborted fetch). Same reasoning:
    // an exception is not evidence that the user is signed out.
    return TRANSIENT_ERROR;
  }
});

/**
 * True only when we positively know there is no session. A transient failure
 * returns false, so callers gate on real evidence instead of on an absence.
 */
/** @param {ServerAuth} auth */
export function shouldRedirectToLogin(auth) {
  return auth.status === "anonymous";
}
