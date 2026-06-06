/**
 * GET /api/health
 *
 * Lightweight, public health check for uptime monitoring (Better Stack etc.).
 * Returns 200 only when the app AND the database are reachable, so a green
 * monitor genuinely means "customers can work" — not just "a page loaded".
 *
 * - No auth (must be reachable by external monitors). Listed as public in proxy.js.
 * - No sensitive data exposed: only an ok/degraded status + latency.
 * - Cheap DB probe: a HEAD count on a tiny global table, capped at 0 rows.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Don't cache — the monitor needs a live signal every check.
export const dynamic = "force-dynamic";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  const startedAt = Date.now();

  // Cheapest possible DB round-trip: count rows on a small global table with
  // head:true (no body) and a 0-row range. Confirms Postgres is reachable.
  const { error } = await admin
    .from("cargos")
    .select("id", { count: "exact", head: true });

  const dbLatencyMs = Date.now() - startedAt;

  if (error) {
    return NextResponse.json(
      { status: "degraded", db: "down", error: error.message, dbLatencyMs },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { status: "ok", db: "up", dbLatencyMs },
    { status: 200 }
  );
}
