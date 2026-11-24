// Supabase Edge Function — pendientes → Google Calendar y Google Tasks (OAuth).
//
// La llama un trigger de ot_pendientes apenas algo cambia (pg_net, segundos
// después del commit) y el cron 'gcal-sync' cada minuto como red de seguridad
// (migración 20261124250000). Pueden correr varias a la vez: cada pendiente lo
// toma una sola corrida (gcal_reclamar, FOR UPDATE SKIP LOCKED).
// Por cada persona conectada (la conexión es personal; un mismo token sirve
// para los dos destinos):
//   1. Pide un access token con el refresh token de Vault.
//   2. Borra en Google los eventos y tareas de pendientes eliminados (gcal_borrados).
//   3. Sube los pendientes encolados (gcal_sync = 'pendiente') al destino que
//      eligió la persona (gcal_destino):
//      - 'calendar' → evento: los abiertos se crean o actualizan; los cerrados,
//        o de OTs en la papelera, se borran.
//      - 'tasks' → tarea: abiertos y hechos se crean o actualizan (hecho = tarea
//        completada); los cancelados, o de OTs en la papelera, se borran.
//      - 'ninguno', o un destino que la persona no ha conectado: no se escribe.
//      Si el destino cambió, primero se borra lo que había del otro lado
//      (gcal_remoto_tipo dice dónde vive).
// Errores por pendiente: reintento en el próximo tick del cron, hasta MAX_INTENTOS.
// Si el pendiente cambió mientras se subía (gcal_version), queda encolado otra vez.
// Token revocado (invalid_grant): la conexión queda 'revocado' y se avisa a esa persona.
//
// Auth: solo la base (cron y trigger), con el JWT service_role (verify_jwt activo;
// ver _shared/es-service-role.ts). El trigger manda { origen: "trigger" }: esas
// corridas no pasan por el monitor de Sentry, que mide solo el cron.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withCronMonitor } from "../_shared/sentry-cron.ts";
import { esServiceRole } from "../_shared/es-service-role.ts";
import { eventoGoogle, tareaGoogle } from "../_shared/ics-pendientes.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLIENT_ID    = Deno.env.get("GOOGLE_CLIENT_ID");
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

const LOTE = 50;
const MAX_INTENTOS = 5;
const ABIERTOS = ["por_hacer", "en_curso"];

interface Fila {
  id: string; nota: string; fecha: string; hora: string | null; estado: string; prioridad: string;
  orden_id: string | null; gcal_event_id: string | null; gcal_intentos: number; aviso_minutos: number;
  gcal_destino: "calendar" | "tasks" | "ninguno"; gcal_remoto_tipo: "evento" | "tarea" | null;
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
  const { origen } = await req.json().catch(() => ({})) as { origen?: string };
  const correr = (job: () => Promise<Response>) =>
    origen === "trigger" ? job() : withCronMonitor("gcal-sync", { schedule: "* * * * *", maxRuntime: 3 }, job);
  return await correr(async () => {
    if (!CLIENT_ID || !CLIENT_SECRET) return new Response("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", { status: 200 });
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: conexiones, error } = await sb
      .from("calendario_google")
      .select("usuario_id, calendar_id, tasklist_id")
      .eq("estado", "activo")
      .or("calendar_id.not.is.null,tasklist_id.not.is.null");
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
            titulo: "Tu cuenta de Google se desconectó",
            mensaje: `Tus pendientes dejaron de llegar a Google. Reconéctala en Integraciones → ${c.calendar_id ? "Google Calendar" : "Google Tasks"}.`,
            tipo: "integracion",
            url: c.calendar_id ? "/integraciones/google-calendar" : "/integraciones/google-tasks",
          });
        } else {
          await marcarConexion("activo", e instanceof Error ? e.message : String(e));
        }
        continue;
      }

      // Eventos del calendario elegido y tareas de la lista elegida; null = ese destino no está listo.
      const bases: Record<"evento" | "tarea", string | null> = {
        evento: c.calendar_id ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendar_id)}/events` : null,
        tarea: c.tasklist_id ? `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(c.tasklist_id)}/tasks` : null,
      };
      const google = (base: string, metodo: string, ruta: string, body?: unknown) => fetch(`${base}${ruta}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${access}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const borrar = async (base: string, remotoId: string) => {
        const res = await google(base, "DELETE", `/${encodeURIComponent(remotoId)}`);
        // 404/410: ya no estaba. Para nosotros es lo mismo que borrarlo.
        if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`DELETE ${res.status}: ${await res.text()}`);
      };
      // Crea o actualiza; si lo borraron a mano en Google, lo crea de nuevo. Devuelve el id remoto.
      const escribir = async (base: string, remotoId: string | null, cuerpo: unknown): Promise<string> => {
        let res = remotoId ? await google(base, "PATCH", `/${encodeURIComponent(remotoId)}`, cuerpo) : null;
        if (!res || res.status === 404 || res.status === 410) res = await google(base, "POST", "", cuerpo);
        if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
        return (await res.json()).id;
      };

      // 2. Eventos y tareas de pendientes borrados. Si su destino ya no está
      // (se cambió o se apagó), no hay dónde borrarlo: se descarta.
      const { data: borrados } = await sb.from("gcal_borrados").select("id, event_id, intentos, tipo").eq("usuario_id", yo).limit(LOTE);
      for (const b of borrados ?? []) {
        try {
          const base = bases[b.tipo as "evento" | "tarea"];
          if (base) await borrar(base, b.event_id);
          await sb.from("gcal_borrados").delete().eq("id", b.id);
          r.borrados++;
        } catch {
          r.errores++;
          if (b.intentos + 1 >= MAX_INTENTOS) await sb.from("gcal_borrados").delete().eq("id", b.id);
          else await sb.from("gcal_borrados").update({ intentos: b.intentos + 1 }).eq("id", b.id);
        }
      }

      // 3. Pendientes encolados, reclamados para esta corrida. Los de un destino
      // sin conectar quedan 'ok' sin id: al elegir ese calendario o lista, la
      // base los vuelve a encolar.
      const { data: reclamados, error: e1 } = await sb.rpc("gcal_reclamar", { p_usuario: yo, p_limite: LOTE });
      if (e1) throw e1;
      const version = new Map((reclamados ?? []).map((x: { id: string; version: number }) => [x.id, x.version]));
      if (!version.size) { if (!r.errores) await marcarConexion("activo", null); continue; }
      const { data, error: e2 } = await sb
        .from("ot_pendientes")
        .select("id, nota, fecha, hora, estado, prioridad, orden_id, gcal_event_id, gcal_intentos, aviso_minutos, gcal_destino, gcal_remoto_tipo, usuario:usuarios(nombre), ordenes_trabajo(numero, titulo, deleted_at)")
        .in("id", [...version.keys()]);
      if (e2) throw e2;

      for (const f of (data ?? []) as unknown as Fila[]) {
        try {
          let eventId: string | null = f.gcal_event_id;
          let tipo: "evento" | "tarea" | null = eventId ? (f.gcal_remoto_tipo ?? (f.orden_id ? "evento" : "tarea")) : null;
          const destino = f.gcal_destino === "calendar" ? "evento" : f.gcal_destino === "tasks" ? "tarea" : null;
          const base = destino ? bases[destino] : null;

          // Cambió de destino (o se apagó): se borra lo que había del otro lado.
          if (eventId && tipo !== destino) {
            if (bases[tipo!]) await borrar(bases[tipo!]!, eventId);
            eventId = null;
            tipo = null;
          }

          const enPapelera = !!f.ordenes_trabajo?.deleted_at;
          // Evento: solo abiertos. Tarea: también hechos (quedan completados).
          const visible = !enPapelera && (destino === "tarea" ? f.estado !== "cancelado" : ABIERTOS.includes(f.estado));
          if (base && visible) {
            const cuerpo = destino === "tarea" ? tareaGoogle(f) : eventoGoogle({
              id: f.id, nota: f.nota, fecha: f.fecha, hora: f.hora, estado: f.estado, prioridad: f.prioridad,
              orden_id: f.orden_id, ot_numero: f.ordenes_trabajo?.numero ?? null, ot_titulo: f.ordenes_trabajo?.titulo ?? null,
              usuario_nombre: f.usuario?.nombre ?? null,
            }, f.aviso_minutos);
            eventId = await escribir(base, eventId, cuerpo);
            tipo = destino;
          } else if (base && eventId) {
            await borrar(base, eventId);
            eventId = null;
            tipo = null;
          }

          // 'ok' solo si nadie lo cambió mientras se subía (misma versión). Si
          // cambió, vuelve a la cola con el id remoto guardado: la próxima
          // corrida (que ese mismo cambio ya empujó) actualiza en vez de duplicar.
          const { data: hecho } = await sb.from("ot_pendientes")
            .update({ gcal_event_id: eventId, gcal_remoto_tipo: tipo, gcal_sync: "ok", gcal_intentos: 0, gcal_error: null, gcal_reclamado_at: null })
            .eq("id", f.id).eq("gcal_version", version.get(f.id)!)
            .select("id");
          if (!hecho?.length) {
            await sb.from("ot_pendientes")
              .update({ gcal_event_id: eventId, gcal_remoto_tipo: tipo, gcal_sync: "pendiente", gcal_reclamado_at: null })
              .eq("id", f.id);
          }
          r.subidos++;
        } catch (e) {
          r.errores++;
          const intentos = f.gcal_intentos + 1;
          // gcal_intentos > 0: el trigger no empuja los reintentos; los hace el cron.
          await sb.from("ot_pendientes").update({
            gcal_intentos: intentos,
            gcal_sync: intentos >= MAX_INTENTOS ? "error" : "pendiente",
            gcal_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
            gcal_reclamado_at: null,
          }).eq("id", f.id);
        }
      }

      if (!r.errores) await marcarConexion("activo", null);
    }

    return new Response(JSON.stringify(resumen), { headers: { "Content-Type": "application/json" } });
  });
});
