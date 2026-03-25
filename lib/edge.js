import { createClient } from "@/lib/supabase";

const BASE     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Call a Supabase Edge Function with the current user's JWT.
 * Supabase requires both Authorization (JWT) and apikey (anon key) headers.
 */
export async function callEdge(fnName, body) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? ANON_KEY;

  return fetch(`${BASE}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "apikey": ANON_KEY,
    },
    body: JSON.stringify(body),
  });
}
