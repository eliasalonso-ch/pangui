// Supabase Edge Function — runs daily via pg_cron / Supabase cron dashboard.
// Permanently deletes OTs that have been in the trash (papelera) for more than
// 30 days, cleaning up their R2 photos first.
//
// Suggested schedule: every day at 04:00 UTC.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const R2_DELETE_ENDPOINT = `${SUPABASE_URL}/functions/v1/r2-delete`;

const RETENTION_DAYS = 30;

async function deleteFromR2(url: string): Promise<void> {
  try {
    await fetch(R2_DELETE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
      },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    // Best-effort — a failed photo delete shouldn't block purging the row.
    console.error("[purge-papelera] R2 delete failed for", url, err);
  }
}

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Fetch the trashed rows old enough to purge, with their photo URLs.
  const { data: rows, error: fetchErr } = await supabase
    .from("ordenes_trabajo")
    .select("id, imagen_url, fotos_urls")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .limit(500);

  if (fetchErr) {
    console.error("[purge-papelera] fetch error:", fetchErr);
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ purged: 0 }), { status: 200 });
  }

  // Clean up R2 photos (best-effort) before removing the rows.
  for (const row of rows) {
    const urls: string[] = [];
    if (row.imagen_url) urls.push(row.imagen_url);
    if (Array.isArray(row.fotos_urls)) urls.push(...row.fotos_urls);
    await Promise.allSettled(urls.map((u: string) => deleteFromR2(u)));
  }

  const ids = rows.map((r) => r.id);
  const { error: delErr } = await supabase
    .from("ordenes_trabajo")
    .delete()
    .in("id", ids);

  if (delErr) {
    console.error("[purge-papelera] delete error:", delErr);
    return new Response(JSON.stringify({ error: delErr.message }), { status: 500 });
  }

  console.log(`[purge-papelera] purged ${ids.length} OTs older than ${RETENTION_DAYS} days`);
  return new Response(JSON.stringify({ purged: ids.length }), { status: 200 });
});
