/**
 * POST /api/meconecta/check
 *
 * "Revisar meconecta" — reconciles the meconecta (UdeC) portal against this
 * workspace's OTs so Electrilam never silently misses a solicitud.
 *
 * This route owns the user-facing concerns only: session auth, the Electrilam
 * gate, the role check and rate limiting. The scrape + comparison run in the
 * `meconecta-check` edge function, which is where the MECONECTA_EMAIL /
 * MECONECTA_PASSWORD secrets already live (shared with meconecta-scrape-cron).
 * Keeping the portal credentials in exactly one system is the whole point —
 * do not re-add them to the web env.
 *
 * Response (pass-through from the edge function):
 *   {
 *     ok: true,
 *     checkedAt: ISO string,
 *     portalPending, portalTotal, matched: number,
 *     faltantes: [{ folio, idExterno, fecha, estado, url }],  // no OT yet
 *     huerfanas: [{ id, folio, numero, titulo, estado }],     // OT, not pending upstream
 *   }
 */
import { NextResponse } from "next/server";
import { createServerSupabase, getServerUser } from "@/lib/supabase-server";
import { ELECTRILAM_WORKSPACE_ID } from "@/lib/ordenes-api";
import { esAdmin } from "@/lib/roles";

// Server-side cooldown. The button is throttled in the UI too, but that only
// protects us from one honest tab — this is what actually stops hammering the
// university's portal from repeated clients or a reloaded page.
const COOLDOWN_MS = 5_000;
const lastRunAtByWorkspace = new Map<string, number>();

const FUNCTION_TIMEOUT_MS = 30_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  // ── Auth: real session, Electrilam only, no requesters ──
  const [sb, user] = await Promise.all([createServerSupabase(), getServerUser()]);
  if (!user) {
    return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
  }

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id || perfil.workspace_id !== ELECTRILAM_WORKSPACE_ID) {
    return NextResponse.json({ ok: false, error: "No disponible" }, { status: 403 });
  }
  // Owners and admins only. This reconciles the whole workspace against the
  // portal — including OTs a member may not be assigned to — so it is not a
  // member-level action. `esAdmin` covers owner too.
  if (!esAdmin(perfil.rol)) {
    return NextResponse.json({ ok: false, error: "Sin permiso" }, { status: 403 });
  }

  // Optional { desde, hasta } window as "YYYY-MM-DD". Validated here so a
  // malformed value never reaches the function; invalid input is dropped
  // rather than rejected, which widens the check instead of blocking it.
  let desde: string | null = null;
  let hasta: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.desde === "string" && DATE_RE.test(body.desde)) desde = body.desde;
    if (typeof body?.hasta === "string" && DATE_RE.test(body.hasta)) hasta = body.hasta;
  } catch {
    // no body — check everything
  }

  // ── Cooldown ──
  const now = Date.now();
  const elapsed = now - (lastRunAtByWorkspace.get(perfil.workspace_id) ?? 0);
  if (elapsed < COOLDOWN_MS) {
    const retryIn = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
    return NextResponse.json(
      { ok: false, error: `Espera ${retryIn}s antes de revisar de nuevo`, retryIn },
      { status: 429, headers: { "Retry-After": String(retryIn) } }
    );
  }
  lastRunAtByWorkspace.set(perfil.workspace_id, now);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    lastRunAtByWorkspace.delete(perfil.workspace_id);
    return NextResponse.json(
      { ok: false, error: "Supabase no está configurado en el servidor" },
      { status: 503 }
    );
  }

  // ── Delegate to the edge function ──
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FUNCTION_TIMEOUT_MS);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/meconecta-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ desde, hasta }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      // A failed run shouldn't burn the cooldown — let the next click retry.
      lastRunAtByWorkspace.delete(perfil.workspace_id);
      return NextResponse.json(
        { ok: false, error: data?.error ?? `La revisión falló (HTTP ${res.status})` },
        { status: res.status === 503 ? 503 : 502 }
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    lastRunAtByWorkspace.delete(perfil.workspace_id);
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: aborted ? "La revisión tardó demasiado" : "No se pudo contactar el servicio de revisión" },
      { status: 504 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
