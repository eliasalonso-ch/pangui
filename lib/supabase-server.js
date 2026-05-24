import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

/**
 * Deduplicates getUser() across all server components in a single request.
 * React's cache() memoizes per-request so the underlying call happens at most once.
 *
 * IMPORTANT: returns null on ANY error (stale refresh token, network blip, 429).
 * Server components rendering with no user are expected to either gate on the
 * result or let middleware redirect to /login. Throwing here would cascade into
 * more refresh attempts and reignite the loop that produced the 429 storm.
 */
export const getServerUser = cache(async () => {
  try {
    const sb = await createServerSupabase();
    const { data: { user }, error } = await sb.auth.getUser();
    if (error) return null;
    return user;
  } catch {
    return null;
  }
});
