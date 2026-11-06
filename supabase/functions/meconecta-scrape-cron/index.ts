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
//      Otherwise each new solicitud becomes an OT (_shared/meconecta-ot.ts):
//      its "Ver solicitud" page is parsed field by field (no AI, no PDF), the
//      ITO comes from "Nombre Resolutor", and attached photos are copied to a
//      "Fotos MeConecta" referencia group. Owners/admins get a notification
//      that opens the OT. If anything fails, they get the old portal-link
//      notification instead, so a solicitud is never lost.
//
// Credentials: Vault, entered by Electrilam in /integraciones/meconecta (see
// _shared/meconecta-conexion.ts). A rejected password stops the cron until an
// admin reconnects.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withCronMonitor } from "../_shared/sentry-cron.ts";
import { fetchDetalle, fetchOrders, login, detalleUrl, MeconectaAuthError, type ScrapedRow } from "../_shared/meconecta-scrape.ts";
import { ELECTRILAM_WS, getCredenciales, marcarEstado, describirError } from "../_shared/meconecta-conexion.ts";
import { crearOtDesdeSolicitud, previsualizarOt } from "../_shared/meconecta-ot.ts";

function hoyEnChile(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Interruptor de la creación automática de OTs: `supabase secrets set
// MECONECTA_CREAR_OT=si` la enciende, unset la apaga (vuelve el aviso con link
// al portal) sin redeploy.
const CREAR_OT = Deno.env.get("MECONECTA_CREAR_OT") === "si";
const ACCION_DETALLE = btoa("solicitudMosResolutor");

/**
 * ¿El request trae un JWT de service_role? Solo leer el claim es seguro porque
 * la función se despliega con verify_jwt = true: el gateway ya verificó la firma.
 * (Comparar contra SUPABASE_SERVICE_ROLE_KEY no sirve: la clave del Vault que
 * usa pg_cron no es el mismo string que la del entorno de la función.)
 */
function esServiceRole(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).role === "service_role";
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function avisoPortal(r: ScrapedRow) {
  return {
    titulo: "Nueva solicitud meconecta",
    mensaje: `${r.folio}${r.estado ? ` · ${r.estado}` : ""}${r.fecha ? ` · ${r.fecha}` : ""}`,
    url: detalleUrl(r.detalleHref),
    tipo: "meconecta",
  };
}

/**
 * Prueba manual (solo con la service role key: la respuesta trae datos
 * personales del portal):
 *   { "probar": [30825, 28531] }  → la OT que se crearía para esos ids internos,
 *                                    sin escribir en la base.
 *   { "probar": true }            → lo mismo, para las solicitudes asignadas
 *                                    que todavía no tienen OT en Pangui.
 *   … + "crear": true             → las crea de verdad (sin duplicar folios).
 */
async function probar(supabase: ReturnType<typeof createClient>, ids: number[] | true, crear: boolean): Promise<Response> {
  const creds = await getCredenciales(supabase);
  if (!creds) return json({ error: "sin_conexion" }, 409);
  const cookie = await login(creds.username, creds.password);

  let objetivos: { idExterno: number; href: string; fecha: string }[];
  if (ids === true) {
    const [filas, { data: ots }] = await Promise.all([
      fetchOrders(cookie),
      supabase.from("ordenes_trabajo").select("n_serie").eq("workspace_id", ELECTRILAM_WS).ilike("n_serie", "SF%").is("deleted_at", null),
    ]);
    const conOt = new Set((ots ?? []).map((o: { n_serie: string }) => o.n_serie.trim().toUpperCase()));
    objetivos = filas.filter((r) => !conOt.has(r.folio.trim().toUpperCase()))
      .map((r) => ({ idExterno: r.idExterno, href: r.detalleHref, fecha: r.fecha?.slice(0, 10) || hoyEnChile() }));
  } else {
    objetivos = ids.map((id) => ({ idExterno: id, href: `?accion=${ACCION_DETALLE}&ids=${btoa(String(id))}`, fecha: hoyEnChile() }));
  }

  const resultados = [];
  for (const o of objetivos.slice(0, 5)) {
    try {
      const d = await fetchDetalle(cookie, o.href);
      resultados.push(crear
        ? { folio: d.folio, ...(await crearOtDesdeSolicitud(supabase, cookie, d, o.fecha, o.idExterno)) }
        : await previsualizarOt(supabase, cookie, d, o.fecha, o.idExterno));
    } catch (e) {
      resultados.push({ idExterno: o.idExterno, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ crearOtActivo: CREAR_OT, encontradas: objetivos.length, resultados });
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

// One notice per rejection: after this the cron skips until someone reconnects.
async function notificarClaveRechazada(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const userIds = await getRecipientUserIds(supabase);
  if (userIds.length === 0) return;
  await supabase.from("notifications").insert(
    userIds.map((uid) => ({
      usuario_id: uid,
      titulo: "MeConecta rechazó la clave",
      mensaje: "Pangui dejó de revisar MeConecta. Vuelve a conectarlo en Integraciones.",
      url: "/integraciones/meconecta",
      tipo: "meconecta",
    })),
  );
}

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({})) as { probar?: unknown; crear?: unknown };
  if (body.probar === true || Array.isArray(body.probar)) {
    if (!esServiceRole(req)) return json({ error: "forbidden" }, 403);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const ids = body.probar === true ? true : body.probar.map(Number).filter(Number.isInteger);
    return await probar(supabase, ids, body.crear === true);
  }

  return await withCronMonitor(
    "meconecta-scrape-cron",
    { schedule: "*/15 * * * *", maxRuntime: 5 },
    async () => {
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Not connected, or the password was rejected: do nothing until an admin
      // (re)connects. Retrying a rejected password every 15 min would look like
      // a brute-force attempt in the university's logs and could lock the account.
      const creds = await getCredenciales(supabase);
      if (!creds || creds.status === "credenciales_invalidas") {
        return new Response(JSON.stringify({ skipped: creds ? "credenciales_invalidas" : "sin_conexion" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      let scraped: ScrapedRow[];
      let cookie: string;
      try {
        cookie = await login(creds.username, creds.password);
        scraped = await fetchOrders(cookie);
      } catch (e) {
        if (e instanceof MeconectaAuthError) {
          // Only notify if this run's password is still the current one — an
          // admin may have saved a new one while we were logging in.
          const vigente = await marcarEstado(supabase, creds, {
            status: "credenciales_invalidas", last_error: describirError(e),
          });
          if (vigente) await notificarClaveRechazada(supabase);
          return new Response(JSON.stringify({ authFailed: true }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        await marcarEstado(supabase, creds, { status: "error", last_error: describirError(e) });
        throw e;
      }
      await marcarEstado(supabase, creds, {
        status: "conectado", last_sync_at: new Date().toISOString(), last_error: null,
      });

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
      let creadas = 0;
      if (!firstRun) {
        // Cada solicitud nueva se convierte en OT. Si algo falla (detalle,
        // catálogo, insert), cae al aviso de siempre con el link al portal:
        // nunca se pierde una solicitud, y "Revisar MeConecta" la marca faltante.
        const avisos: { titulo: string; mensaje: string; url: string; tipo: string }[] = [];
        for (const r of fresh) {
          let aviso = avisoPortal(r);
          if (CREAR_OT) {
            try {
              const d = await fetchDetalle(cookie, r.detalleHref);
              const fecha = r.fecha?.slice(0, 10) || hoyEnChile();
              const ot = await crearOtDesdeSolicitud(supabase, cookie, d, fecha, r.idExterno);
              if (!ot.existente) creadas += 1;
              aviso = {
                titulo: ot.existente ? `${d.folio} ya tenía OT #${ot.numero}` : `OT #${ot.numero} creada desde MeConecta`,
                mensaje: [d.folio, d.titulo, ...ot.pendientes].filter(Boolean).join(" · "),
                url: `/ordenes?id=${ot.id}`,
                tipo: "orden",
              };
            } catch (e) {
              console.error(`[meconecta-scrape-cron] ${r.folio}: no se pudo crear la OT`, e);
            }
          }
          avisos.push(aviso);
        }

        const userIds = await getRecipientUserIds(supabase);
        const notifRows = avisos.flatMap((a) => userIds.map((uid) => ({ usuario_id: uid, ...a })));
        if (notifRows.length > 0) {
          await supabase.from("notifications").insert(notifRows);
          notified = notifRows.length;
        }
      }

      return new Response(
        JSON.stringify({ scraped: scraped.length, new: fresh.length, seeded: firstRun, creadas, notified }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  );
});
