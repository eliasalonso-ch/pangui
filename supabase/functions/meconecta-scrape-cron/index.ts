// Supabase Edge Function — runs every 15 min via pg_cron.
//
// Scrapes the UdeC "meconecta" maintenance portal for the Electrilam account,
// detects newly-appeared maintenance requests (solicitudes), and creates in-app
// notifications for Electrilam's owners + admins.
//
// EXCLUSIVE to the Electrilam workspace. The workspace id is hard-coded; this
// feature does not exist for any other workspace.
//
// Flow:
//   1. POST credentials to rmgf_login.php -> capture PHPSESSID cookie.
//   2. GET the "asignadas" orders page with that cookie -> HTML table.
//   3. Parse rows: fecha (col 1), folio (col 2), estado (col 5), and the
//      base64-encoded internal id from the "Ver solicitud" link (ids=...).
//   4. Diff against uni_solicitudes_vistas.
//   5. First run (table empty for this workspace): seed silently, no notifs.
//      Otherwise: insert new rows + a notification per new order for the
//      owners/admins of Electrilam.
//
// Credentials come from function secrets MECONECTA_EMAIL / MECONECTA_PASSWORD.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withCronMonitor } from "../_shared/sentry-cron.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MECONECTA_EMAIL    = Deno.env.get("MECONECTA_EMAIL") ?? "";
const MECONECTA_PASSWORD = Deno.env.get("MECONECTA_PASSWORD") ?? "";

// Electrilam — the only workspace this feature serves.
const ELECTRILAM_WS = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

const BASE = "https://meconecta.udec.cl";
const LOGIN_URL   = `${BASE}/response/rmgf_login.php?accion=login`;
// accion=YXNpZ25hZGFz -> base64 "asignadas"
const ORDERS_URL  = `${BASE}/index.php?accion=YXNpZ25hZGFz&boton=2&submenu=2`;
const UA = "Mozilla/5.0 (compatible; PanguiBot/1.0; +https://getpangui.com)";

interface ScrapedRow {
  idExterno: number;
  folio: string;
  fecha: string | null;   // ISO-ish "2026-06-24 17:03:40"
  estado: string;
  detalleHref: string;    // "?accion=...&ids=..." for the notification link
}

// ── Login: returns the PHPSESSID cookie string to reuse, or throws ──
async function login(): Promise<string> {
  const body = new URLSearchParams({
    email: MECONECTA_EMAIL,
    password: MECONECTA_PASSWORD,
  }).toString();

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": UA,
      "Origin": BASE,
      "Referer": `${BASE}/login.php`,
      "Accept": "application/json, text/javascript, */*; q=0.01",
    },
    body,
    redirect: "manual",
  });

  // Collect Set-Cookie (Deno exposes getSetCookie()).
  const setCookies: string[] =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""].filter(Boolean);

  const sess = setCookies
    .map((c) => /PHPSESSID=([^;]+)/.exec(c)?.[1])
    .find(Boolean);

  const text = await res.text().catch(() => "");
  if (!sess) {
    throw new Error(`login: no PHPSESSID returned (status ${res.status}, body ${text.slice(0, 120)})`);
  }
  return `PHPSESSID=${sess}`;
}

// ── Fetch + parse the orders table ──
async function fetchOrders(cookie: string): Promise<ScrapedRow[]> {
  const res = await fetch(ORDERS_URL, {
    headers: { "Cookie": cookie, "User-Agent": UA, "Accept": "text/html" },
  });
  if (!res.ok) throw new Error(`orders fetch ${res.status}`);
  const html = await res.text();

  // If we got bounced to the login page, the session didn't take.
  if (/rmgf_login|name=["']?password/i.test(html) && !/<tbody/i.test(html)) {
    throw new Error("orders fetch: session not authenticated (got login page)");
  }

  return parseRows(html);
}

// Parse each <tr> in the first <tbody>. Regex-based (no DOM dep) — the table
// markup is stable and simple. Each row: 6 <td>; we need cols 1, 2, 5 and the
// ids= param from the detail link in col 6.
function parseRows(html: string): ScrapedRow[] {
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(html);
  if (!tbodyMatch) return [];
  const tbody = tbodyMatch[1];

  const rows: ScrapedRow[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = trRe.exec(tbody)) !== null) {
    const tr = m[1];
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1]);
    if (tds.length < 6) continue;

    const fecha  = stripTags(tds[0]).trim() || null;
    const folio  = stripTags(tds[1]).trim();
    const estado = stripTags(tds[4]).trim();

    // Detail link: href="?accion=...&ids=<base64>"
    const hrefMatch = /href=["']([^"']*ids=([^"'&]+)[^"']*)["']/i.exec(tds[5]);
    if (!hrefMatch) continue;
    const detalleHref = decodeEntities(hrefMatch[1]);
    const idExterno = decodeBase64Int(hrefMatch[2]);
    if (!Number.isFinite(idExterno)) continue;

    rows.push({ idExterno, folio, fecha, estado, detalleHref });
  }
  return rows;
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
function decodeBase64Int(b64: string): number {
  try { return parseInt(atob(b64), 10); } catch { return NaN; }
}

// ── Recipients: Electrilam owners + admins ──
async function getRecipientUserIds(
  supabase: ReturnType<typeof createClient>,
): Promise<string[]> {
  const { data } = await supabase
    .from("usuarios")
    .select("id")
    .eq("workspace_id", ELECTRILAM_WS)
    .in("rol", ["owner", "admin"]);
  return (data ?? []).map((u: { id: string }) => u.id);
}

Deno.serve(async (_req) => {
  return await withCronMonitor(
    "meconecta-scrape-cron",
    { schedule: "*/15 * * * *", maxRuntime: 5 },
    async () => {
      if (!MECONECTA_EMAIL || !MECONECTA_PASSWORD) {
        throw new Error("MECONECTA_EMAIL / MECONECTA_PASSWORD not configured");
      }
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const cookie = await login();
      const scraped = await fetchOrders(cookie);

      if (scraped.length === 0) {
        return new Response(JSON.stringify({ scraped: 0, new: 0, note: "no rows parsed" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Which ids do we already know about?
      const ids = scraped.map((r) => r.idExterno);
      const { data: existing } = await supabase
        .from("uni_solicitudes_vistas")
        .select("id_externo")
        .in("id_externo", ids);
      const known = new Set((existing ?? []).map((r: { id_externo: number }) => r.id_externo));

      // First run for this workspace? If the table is entirely empty, seed
      // silently so we don't notify for the whole existing backlog.
      const { count: totalSeen } = await supabase
        .from("uni_solicitudes_vistas")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", ELECTRILAM_WS);
      const firstRun = (totalSeen ?? 0) === 0;

      const fresh = scraped.filter((r) => !known.has(r.idExterno));
      if (fresh.length === 0) {
        return new Response(JSON.stringify({ scraped: scraped.length, new: 0 }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Record the new rows.
      await supabase.from("uni_solicitudes_vistas").insert(
        fresh.map((r) => ({
          id_externo: r.idExterno,
          workspace_id: ELECTRILAM_WS,
          folio: r.folio,
          fecha: r.fecha,
          estado: r.estado,
        })),
      );

      let notified = 0;
      if (!firstRun) {
        const userIds = await getRecipientUserIds(supabase);
        if (userIds.length > 0) {
          const notifRows = [];
          for (const r of fresh) {
            const url = r.detalleHref.startsWith("http")
              ? r.detalleHref
              : `${BASE}/index.php${r.detalleHref.startsWith("?") ? "" : "?"}${r.detalleHref.replace(/^\?/, "")}`;
            for (const uid of userIds) {
              notifRows.push({
                usuario_id: uid,
                titulo: "Nueva solicitud meconecta",
                mensaje: `${r.folio}${r.estado ? ` · ${r.estado}` : ""}${r.fecha ? ` · ${r.fecha}` : ""}`,
                url,
                tipo: "meconecta",
              });
            }
          }
          if (notifRows.length > 0) {
            await supabase.from("notifications").insert(notifRows);
            notified = notifRows.length;
          }
        }
      }

      return new Response(
        JSON.stringify({ scraped: scraped.length, new: fresh.length, seeded: firstRun, notified }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  );
});
