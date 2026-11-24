// Supabase Edge Function — correo diario de pendientes (de OT y sin OT).
//
// La llama el cron 'pendientes-tick' (días hábiles, 08:30 Chile) justo
// después del push. Un correo por persona con sus pendientes de hoy o
// atrasados que nadie ha marcado hechos. El push avisa una vez; el correo
// insiste todos los días hasta que el pendiente se resuelve.
//
// Quien no tiene nada pendiente no recibe correo: uno vacío enseña a ignorarlo.
//
// Auth: solo el cron, con el JWT service_role (verify_jwt activo; ver _shared/es-service-role.ts).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withCronMonitor } from "../_shared/sentry-cron.ts";
import { esServiceRole } from "../_shared/es-service-role.ts";
import { utcDeSantiago } from "../_shared/ics-pendientes.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM  = Deno.env.get("RESEND_FROM") ?? "Pangui <noreply@getpangui.com>";
const APP_URL      = "https://app.getpangui.com";

interface Fila {
  orden_id: string | null; // null = tarea sin OT
  usuario_id: string;
  fecha: string;
  hora: string | null; // "HH:MM:SS"
  nota: string;
  aviso_minutos: number;
  ordenes_trabajo: { numero: number | null; titulo: string | null; descripcion: string | null; deleted_at: string | null } | null;
}

function hoySantiago(): string {
  // en-CA da YYYY-MM-DD, el mismo formato que la columna date.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
}

function masDias(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function cuando(fecha: string, hora: string | null, hoy: string): string {
  const d = diasEntre(fecha, hoy);
  // Negativo: todavía no llega, pero su aviso ya se cumplió ("avisarme 1 semana antes").
  if (d < 0) return d === -1 ? "Mañana" : `En ${-d} días`;
  if (d === 0) return hora ? `Hoy · ${hora.slice(0, 5)}` : "Hoy";
  return d === 1 ? "Atrasado 1 día" : `Atrasado ${d} días`;
}

function htmlCorreo(nombre: string, filas: Fila[], hoy: string): string {
  const items = filas.map(f => {
    const o = f.ordenes_trabajo;
    const ot = o?.titulo?.trim() || o?.descripcion?.trim().slice(0, 80) || "OT";
    const num = o?.numero ? `OT #${o.numero} · ` : "";
    const atrasado = diasEntre(f.fecha, hoy) > 0;
    const enlace = f.orden_id
      ? `<a href="${APP_URL}/ordenes/${f.orden_id}" style="font-size:13px;color:#0e6b7e">${esc(num + ot)}</a>`
      : `<a href="${APP_URL}/pendientes" style="font-size:13px;color:#0e6b7e">Tarea sin OT</a>`;
    return `
      <tr><td style="padding:12px 0;border-bottom:1px solid #e5e7eb">
        <div style="font-size:12px;color:${atrasado ? "#b45309" : "#0e6b7e"};font-weight:600">${esc(cuando(f.fecha, f.hora, hoy))}</div>
        <div style="font-size:15px;color:#111827;margin:2px 0">${esc(f.nota)}</div>
        ${enlace}
      </td></tr>`;
  }).join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
    <table width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:20px 24px">
      <tr><td>
        <p style="font-size:15px;color:#111827;margin:0 0 4px">Hola ${esc(nombre)},</p>
        <p style="font-size:14px;color:#4b5563;margin:0 0 12px">Estos pendientes te piden atención. Márcalos hechos o pospónlos en Pangui.</p>
      </td></tr>
      ${items}
      <tr><td style="padding-top:16px;font-size:12px;color:#9ca3af">Te llega porque creaste estos pendientes en Pangui. Mientras no los marques hechos, aparecerán aquí cada día hábil. <a href="${APP_URL}/pendientes" style="color:#0e6b7e">Ver todos mis pendientes</a></td></tr>
    </table></body></html>`;
}

Deno.serve(async (req) => {
  if (!esServiceRole(req)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return await withCronMonitor(
    "pendientes-digest",
    { schedule: "30 11,12 * * 1-5", maxRuntime: 5 },
    async () => {
      if (!RESEND_KEY) return new Response("RESEND_API_KEY no configurada", { status: 200 });

      const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const hoy = hoySantiago();

      const { data, error } = await sb
        .from("ot_pendientes")
        .select("orden_id, usuario_id, fecha, hora, nota, aviso_minutos, ordenes_trabajo(numero, titulo, descripcion, deleted_at)")
        .in("estado", ["por_hacer", "en_curso"])
        .eq("correo", true)
        // El aviso puede ser de hasta un año antes; el corte exacto va abajo.
        .lte("fecha", masDias(hoy, 366))
        .order("fecha")
        .order("hora", { nullsFirst: true });
      if (error) throw error;

      const porUsuario = new Map<string, Fila[]>();
      for (const f of (data ?? []) as unknown as Fila[]) {
        // Los de OT, solo si la OT sigue existiendo; los sin OT, siempre.
        if (f.orden_id && (!f.ordenes_trabajo || f.ordenes_trabajo.deleted_at)) continue;
        // Sale en el correo desde que se cumple su aviso: fecha + hora (08:30 si no tiene) − aviso.
        const momento = utcDeSantiago(f.fecha, (f.hora ?? "08:30").slice(0, 5)).getTime() - f.aviso_minutos * 60_000;
        if (momento > Date.now()) continue;
        porUsuario.set(f.usuario_id, [...(porUsuario.get(f.usuario_id) ?? []), f]);
      }

      let enviados = 0;
      const fallos: string[] = [];
      for (const [uid, filas] of porUsuario) {
        const [{ data: u }, { data: perfil }] = await Promise.all([
          sb.auth.admin.getUserById(uid),
          sb.from("usuarios").select("nombre, activo").eq("id", uid).maybeSingle(),
        ]);
        const email = u?.user?.email;
        if (!email || perfil?.activo === false) continue;

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
          body: JSON.stringify({
            from: RESEND_FROM,
            to: [email],
            subject: filas.length === 1 ? "1 pendiente te pide atención hoy" : `${filas.length} pendientes te piden atención hoy`,
            html: htmlCorreo(perfil?.nombre?.split(" ")[0] ?? "", filas, hoy),
          }),
        });
        if (res.ok) enviados++;
        else fallos.push(`${uid}: ${res.status} ${await res.text()}`);
      }

      // Que Sentry vea el fallo, pero sin perder los correos que sí salieron.
      if (fallos.length) throw new Error(`pendientes-digest: ${fallos.length} correos fallaron\n${fallos.join("\n")}`);
      return new Response(JSON.stringify({ usuarios: porUsuario.size, enviados }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  );
});
