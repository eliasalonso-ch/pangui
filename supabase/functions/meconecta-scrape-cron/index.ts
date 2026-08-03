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
import { fetchOrders, login, detalleUrl } from "../_shared/meconecta-scrape.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MECONECTA_EMAIL    = Deno.env.get("MECONECTA_EMAIL") ?? "";
const MECONECTA_PASSWORD = Deno.env.get("MECONECTA_PASSWORD") ?? "";

// Electrilam — the only workspace this feature serves.
const ELECTRILAM_WS = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

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

      const cookie = await login(MECONECTA_EMAIL, MECONECTA_PASSWORD);
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
            const url = detalleUrl(r.detalleHref);
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
