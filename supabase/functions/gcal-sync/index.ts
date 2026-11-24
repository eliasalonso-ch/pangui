// Supabase Edge Function — pendientes → Google Calendar (etapa 2, OAuth).
//
// La llama el cron 'gcal-sync' cada minuto, solo si hay alguna conexión activa
// con calendario elegido. Por cada persona conectada (la conexión es personal):
//   1. Pide un access token con el refresh token de Vault.
//   2. Borra en Google los eventos de pendientes eliminados (gcal_borrados).
//   3. Sube los pendientes encolados (gcal_sync = 'pendiente'): los abiertos se
//      crean o actualizan; los cerrados, o de OTs en la papelera, se borran.
// Errores por pendiente: reintento en el próximo tick, hasta MAX_INTENTOS.
// Token revocado (invalid_grant): la conexión queda 'revocado' y se avisa a esa persona.
//
// Auth: solo el cron, con el JWT service_role (verify_jwt activo; ver _shared/es-service-role.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withCronMonitor } from "../_shared/sentry-cron.ts";
import { esServiceRole } from "../_shared/es-service-role.ts";
import { eventoGoogle } from "../_shared/ics-pendientes.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID    = Deno.env.get("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

const LOTE = 50;
const MAX_INTENTOS = 5;
const ABIERTOS = ["por_hacer", "en_curso"];

interface Fila {
  id: string; nota: string; fecha: string; hora: string | null; estado: string; prioridad: string;
  orden_id: string; gcal_event_id: string | null; gcal_intentos: number; aviso_minutos: number;
  usuario: { nombre: string } | null;
  ordenes_trabajo: { numero: number | null; titulo: string | null; deleted_at: string | null } | null;
}

class Revocado extends Error {}

async function accessToken(refresh: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID!, client_secret: CLIENT_SECRET!, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const json = await res.json();
  if (json.error === "invalid_grant") throw new Revocado(json.error_description ?? "Acceso revocado");
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? `token ${res.status}`);
  return json.access_token;
}

Deno.serve(async (req) => {
  if (!esServiceRole(req)) return new Response("Unauthorized", { status: 401 });
  return await withCronMonitor("gcal-sync", { schedule: "* * * * *", maxRuntime: 3 }, async () => {
    if (!CLIENT_ID || !CLIENT_SECRET) return new Response("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", { status: 200 });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: conexiones, error } = await sb
      .from("calendario_google")
      .select("usuario_id, calendar_id")
      .eq("estado", "activo")
      .not("calendar_id", "is", null);
    if (error) throw error;

    const resumen: Record<string, { subidos: number; borrados: number; errores: number }> = {};

    for (const c of conexiones ?? []) {
      const yo = c.usuario_id as string;
      const r = resumen[yo] = { subidos: 0, borrados: 0, errores: 0 };
      const marcarConexion = (estado: string, ultimo_error: string | null) =>
        sb.from("calendario_google").update({ estado, ultimo_error, updated_at: new Date().toISOString() }).eq("usuario_id", yo);

      let access: string;
      try {
        const { data: refresh } = await sb.rpc("gcal_refresh_token", { p_usuario: yo });
        if (!refresh) continue;
        access = await accessToken(refresh as string);
      } catch (e) {
        if (e instanceof Revocado) {
          await marcarConexion("revocado", e.message);
          await sb.from("notifications").insert({
            usuario_id: yo,
            titulo: "Google Calendar se desconectó",
            mensaje: "Tus pendientes dejaron de llegar a tu calendario. Reconéctalo en Integraciones → Google Calendar.",
            tipo: "integracion",
            url: "/integraciones/google-calendar",
          });
        } else {
          await marcarConexion("activo", e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendar_id as string)}/events`;
      const google = (metodo: string, ruta: string, body?: unknown) => fetch(`${base}${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${access}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const borrar = async (eventId: string) => {
        const res = await google("DELETE", `/${encodeURIComponent(eventId)}`);
        // 404/410: ya no estaba. Para nosotros es lo mismo que borrarlo.
        if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`DELETE ${res.status}: ${await res.text()}`);
      };

      // 2. Eventos de pendientes borrados.
      const { data: borrados } = await sb.from("gcal_borrados").select("id, event_id, intentos").eq("usuario_id", yo).limit(LOTE);
      for (const b of borrados ?? []) {
        try {
          await borrar(b.event_id);
          await sb.from("gcal_borrados").delete().eq("id", b.id);
          r.borrados++;
        } catch {
          r.errores++;
          if (b.intentos + 1 >= MAX_INTENTOS) await sb.from("gcal_borrados").delete().eq("id", b.id);
          else await sb.from("gcal_borrados").update({ intentos: b.intentos + 1 }).eq("id", b.id);
        }
      }

      // 3. Pendientes encolados.
      const { data, error: e2 } = await sb
        .from("ot_pendientes")
        .select("id, nota, fecha, hora, estado, prioridad, orden_id, gcal_event_id, gcal_intentos, aviso_minutos, usuario:usuarios(nombre), ordenes_trabajo(numero, titulo, deleted_at)")
        .eq("usuario_id", yo)
        .eq("gcal_sync", "pendiente")
        .order("created_at")
        .limit(LOTE);
      if (e2) throw e2;

      for (const f of (data ?? []) as unknown as Fila[]) {
        try {
          const abierto = ABIERTOS.includes(f.estado) && !f.ordenes_trabajo?.deleted_at;
          let eventId: string | null = f.gcal_event_id;
          if (abierto) {
            const cuerpo = eventoGoogle({
              id: f.id, nota: f.nota, fecha: f.fecha, hora: f.hora, estado: f.estado, prioridad: f.prioridad,
              orden_id: f.orden_id, ot_numero: f.ordenes_trabajo?.numero ?? null, ot_titulo: f.ordenes_trabajo?.titulo ?? null,
              usuario_nombre: f.usuario?.nombre ?? null,
            }, f.aviso_minutos);
            let res = eventId ? await google("PATCH", `/${encodeURIComponent(eventId)}`, cuerpo) : null;
            // Sin evento, o lo borraron a mano en Google: se crea de nuevo.
            if (!res || res.status === 404 || res.status === 410) res = await google("POST", "", cuerpo);
            if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
            eventId = (await res.json()).id;
          } else if (eventId) {
            await borrar(eventId);
            eventId = null;
          }

          // Solo se marca 'ok' si el pendiente no cambió mientras se subía; si
          // cambió, el trigger ya lo re-encoló y el próximo tick lo sube. El id
          // del evento se guarda igual, para no duplicarlo.
          let q = sb.from("ot_pendientes")
            .update({ gcal_event_id: eventId, gcal_sync: "ok", gcal_intentos: 0, gcal_error: null })
            .eq("id", f.id).eq("nota", f.nota).eq("fecha", f.fecha).eq("estado", f.estado).eq("prioridad", f.prioridad).eq("aviso_minutos", f.aviso_minutos);
          q = f.hora === null ? q.is("hora", null) : q.eq("hora", f.hora);
          const { data: hecho } = await q.select("id");
          if (!hecho?.length) await sb.from("ot_pendientes").update({ gcal_event_id: eventId }).eq("id", f.id);
          r.subidos++;
        } catch (e) {
          r.errores++;
          const intentos = f.gcal_intentos + 1;
          await sb.from("ot_pendientes").update({
            gcal_intentos: intentos,
            gcal_sync: intentos >= MAX_INTENTOS ? "error" : "pendiente",
            gcal_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
          }).eq("id", f.id);
        }
      }

      if (!r.errores) await marcarConexion("activo", null);
    }

    return new Response(JSON.stringify(resumen), { headers: { "Content-Type": "application/json" } });
  });
});
