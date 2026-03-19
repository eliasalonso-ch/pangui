import { createClient } from "@/lib/supabase";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * Call a Supabase Edge Function with the current user's JWT.
 * Falls back to the legacy Next.js API route if the env var is missing.
 */
export async function callEdge(fnName, body) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? "";

  const url = `${BASE}/functions/v1/${fnName}`;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
