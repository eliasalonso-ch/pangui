// Supabase Edge Function — on-demand "Revisar meconecta".
//
// Reconciles the meconecta (UdeC) portal against Electrilam's own OTs so no
// solicitud is ever silently missed. Invoked by the web app's
// /api/meconecta/check route (service-role, server-to-server); the user-facing
// auth, role checks and rate limiting happen there.
//
// Why a live scrape instead of reading uni_solicitudes_vistas: that table is an
// append-only "already seen" log written by meconecta-scrape-cron. Its `estado`
// is frozen at first sight, so a solicitud closed upstream would still look
// pending. This check answers "what is pending RIGHT NOW", so the portal is the
// source of truth. As a side effect we refresh the stored estado.
//
// Matching: the portal folio (e.g. SF920260627986) is stored on the OT in
// `n_serie` ("N° de Serie / Folio"), where Electrilam types it today.
//
// EXCLUSIVE to the Electrilam workspace.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchOrders, login, detalleUrl, type ScrapedRow } from "../_shared/meconecta-scrape.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MECONECTA_EMAIL    = Deno.env.get("MECONECTA_EMAIL") ?? "";
const MECONECTA_PASSWORD = Deno.env.get("MECONECTA_PASSWORD") ?? "";

// Electrilam — the only workspace this feature serves.
const ELECTRILAM_WS = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

/**
 * Portal estados that mean "still needs work from us". Anything else (resuelta,
 * anulada, …) is treated as closed upstream. Permissive on purpose: an unknown
 * estado counts as pending so we surface it rather than hide it.
 */
function esPendiente(estado: string): boolean {
  const e = estado.toLowerCase();
  if (!e) return true;
  return !/resuel|anul|cerrad|rechaz|finaliz/.test(e);
}

/** Folios are compared loosely — the portal and hand-typed n_serie disagree on case/spacing. */
function normFolio(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Date key ("YYYY-MM-DD") for a portal fecha, which arrives as
 * "2026-07-29 11:11:15". Compared as strings — the format is fixed-width and
 * already sorts correctly, so no Date parsing (and no timezone shifting of a
 * value that is already local Chile time) is needed.
 */
function fechaKey(fecha: string | null): string | null {
  if (!fecha) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(fecha.trim());
  return m ? m[1] : null;
}

/**
 * Rows outside the requested window are dropped before comparison. A row with
 * an unparseable fecha is KEPT: the point of this feature is not to miss
 * anything, so when in doubt we surface it rather than filter it away.
 */
function enRango(fecha: string | null, desde: string | null, hasta: string | null): boolean {
  if (!desde && !hasta) return true;
  const key = fechaKey(fecha);
  if (!key) return true;
  if (desde && key < desde) return false;
  if (hasta && key > hasta) return false;
  return true;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (!MECONECTA_EMAIL || !MECONECTA_PASSWORD) {
    return json({ ok: false, error: "MECONECTA_EMAIL / MECONECTA_PASSWORD not configured" }, 503);
  }

  // Optional { desde, hasta } window as "YYYY-MM-DD" (inclusive on both ends).
  // Anything malformed is ignored rather than rejected — a bad date should not
  // block the check, it should just widen it.
  let desde: string | null = null;
  let hasta: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.desde === "string" && DATE_RE.test(body.desde)) desde = body.desde;
    if (typeof body?.hasta === "string" && DATE_RE.test(body.hasta)) hasta = body.hasta;
  } catch {
    // no/invalid body — check everything
  }
  if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Scrape the portal ──
  let scraped: ScrapedRow[];
  try {
    scraped = await fetchOrders(await login(MECONECTA_EMAIL, MECONECTA_PASSWORD));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ ok: false, error: `No se pudo consultar MeConecta: ${msg}` }, 502);
  }

  // The window scopes which solicitudes we hold ourselves accountable for.
  const enVentana = scraped.filter((r) => enRango(r.fecha, desde, hasta));
  const pendientes = enVentana.filter((r) => esPendiente(r.estado));

  // ── Electrilam's OTs, indexed by folio ──
  // Deleted OTs don't count as coverage: if it was trashed, the solicitud is
  // effectively unattended again and must show up as missing.
  const { data: ordenes } = await supabase
    .from("ordenes_trabajo")
    .select("id, numero, titulo, estado, n_serie")
    .eq("workspace_id", ELECTRILAM_WS)
    .is("deleted_at", null)
    .not("n_serie", "is", null);

  const byFolio = new Map<string, true>();
  for (const o of ordenes ?? []) {
    const key = normFolio(o.n_serie as string | null);
    if (key) byFolio.set(key, true);
  }

  // Pending upstream but no OT here — the ones they'd otherwise miss.
  const faltantes = pendientes
    .filter((r) => !byFolio.has(normFolio(r.folio)))
    .map((r) => ({
      folio: r.folio,
      idExterno: r.idExterno,
      fecha: r.fecha,
      estado: r.estado,
      url: detalleUrl(r.detalleHref),
    }));

  // The reverse leak: an OT still open here whose folio is no longer pending
  // upstream (resolved or withdrawn in meconecta) — worth closing or verifying.
  // "Known to the portal" is deliberately judged against the FULL scrape, not
  // the window: a folio outside the window is still a folio the portal knows
  // about, and calling it orphaned would be wrong. Only the in-window subset is
  // reported, so the answer stays scoped to what the user asked about.
  const portalPendingFolios = new Set(pendientes.map((r) => normFolio(r.folio)));
  const portalAllFolios     = new Set(scraped.map((r) => normFolio(r.folio)));
  const windowFolios        = new Set(enVentana.map((r) => normFolio(r.folio)));
  const huerfanas = (ordenes ?? [])
    .filter((o) => {
      const key = normFolio(o.n_serie as string | null);
      if (!key || !key.startsWith("SF")) return false;  // only meconecta folios
      if (!portalAllFolios.has(key)) return false;      // unknown to the portal — leave it alone
      if (!windowFolios.has(key)) return false;         // outside the requested period
      if (portalPendingFolios.has(key)) return false;   // still pending upstream, fine
      return o.estado !== "completado";                 // open here, closed there
    })
    .map((o) => ({
      id: o.id as string,
      folio: (o.n_serie as string) ?? "",
      numero: o.numero as number | null,
      titulo: o.titulo as string,
      estado: o.estado as string,
    }));

  // Keep the seen-log's estado fresh for rows we already track. Best-effort —
  // a failure here must not fail the check the user actually asked for.
  try {
    const ids = scraped.map((r) => r.idExterno);
    if (ids.length > 0) {
      const { data: known } = await supabase
        .from("uni_solicitudes_vistas")
        .select("id_externo")
        .in("id_externo", ids);
      const knownIds = new Set((known ?? []).map((r: { id_externo: number }) => r.id_externo));
      await Promise.all(
        scraped
          .filter((r) => knownIds.has(r.idExterno))
          .map((r) =>
            supabase
              .from("uni_solicitudes_vistas")
              .update({ estado: r.estado, folio: r.folio, fecha: r.fecha })
              .eq("id_externo", r.idExterno)
          ),
      );
    }
  } catch {
    // ignore — refreshing the log is a bonus, not the job
  }

  return json({
    ok: true,
    checkedAt: new Date().toISOString(),
    desde,
    hasta,
    portalPending: pendientes.length,   // pending within the window
    portalTotal: scraped.length,        // everything the portal returned
    portalInWindow: enVentana.length,
    matched: pendientes.length - faltantes.length,
    faltantes,
    huerfanas,
  });
});
