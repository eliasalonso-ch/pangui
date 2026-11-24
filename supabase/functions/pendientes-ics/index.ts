// Supabase Edge Function — feed iCalendar de los pendientes de una persona.
//
//   GET /functions/v1/pendientes-ics/<token>.ics
//
// Público a propósito (Google, Apple y Outlook lo piden sin sesión): el token
// de calendario_feeds es el secreto, de 64 hex. Devuelve los pendientes
// abiertos de la persona dueña del token; los de OTs en la papelera no.
// Un pendiente que se cierra o se borra deja de venir y desaparece del calendario.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { construirIcs, type PendienteIcs } from "../_shared/ics-pendientes.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Fila {
  id: string;
  nota: string;
  fecha: string;
  hora: string | null;
  estado: string;
  prioridad: string;
  orden_id: string;
  usuario: { nombre: string } | null;
  ordenes_trabajo: { numero: number | null; titulo: string | null } | null;
}

const noEncontrado = () => new Response("Calendario no encontrado", { status: 404 });

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Método no permitido", { status: 405 });

  const token = new URL(req.url).pathname.split("/").pop()?.replace(/\.ics$/i, "") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return noEncontrado();

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: feed, error: e1 } = await sb
    .from("calendario_feeds")
    .select("usuario_id, workspaces(nombre)")
    .eq("token", token)
    .maybeSingle();
  if (e1) return new Response("Error", { status: 500 });
  if (!feed) return noEncontrado();

  const { data, error } = await sb
    .from("ot_pendientes")
    .select("id, nota, fecha, hora, estado, prioridad, orden_id, usuario:usuarios(nombre), ordenes_trabajo!inner(numero, titulo)")
    .eq("usuario_id", feed.usuario_id)
    .in("estado", ["por_hacer", "en_curso"])
    .is("ordenes_trabajo.deleted_at", null)
    .order("fecha");
  if (error) return new Response("Error", { status: 500 });

  const pendientes: PendienteIcs[] = ((data ?? []) as unknown as Fila[]).map(f => ({
    id: f.id, nota: f.nota, fecha: f.fecha, hora: f.hora, estado: f.estado, prioridad: f.prioridad,
    orden_id: f.orden_id, ot_numero: f.ordenes_trabajo?.numero ?? null, ot_titulo: f.ordenes_trabajo?.titulo ?? null,
    usuario_nombre: f.usuario?.nombre ?? null,
  }));

  // deno-lint-ignore no-explicit-any
  const ws = (feed as any).workspaces?.nombre as string | undefined;
  const ics = construirIcs(pendientes, new Date(), ws ? `Pangui · ${ws}` : "Pangui · Pendientes");

  return new Response(req.method === "HEAD" ? null : ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="pangui-pendientes.ics"',
      // Corto: los calendarios lo piden de nuevo cada cierto tiempo y debe verse fresco.
      "Cache-Control": "public, max-age=300",
    },
  });
});
