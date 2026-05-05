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

// Deduplicates getUser() across all server components in a single request.
// React cache() memoizes per-request so the network call happens only once.
export const getServerUser = cache(async () => {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  return user;
});
