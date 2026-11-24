// Armado del feed iCalendar (RFC 5545) de "Mis pendientes". Puro: sin Deno ni
// red, así lo prueban los tests de vitest (tests/lib/ics-pendientes.test.ts).
//
// Las horas van en UTC ("Z"), convertidas desde la hora de Santiago: Google,
// Apple y Outlook las leen igual, sin depender de que entiendan un TZID.

export interface PendienteIcs {
  id: string;
  nota: string;
  fecha: string;        // YYYY-MM-DD (fecha de Santiago)
  hora: string | null;  // HH:MM[:SS] de Santiago; null = evento de todo el día
  estado: string;
  prioridad: string;
  orden_id: string;
  ot_numero: number | null;
  ot_titulo: string | null;
  /** Quién lo creó: el feed es de todo el workspace. */
  usuario_nombre: string | null;
}

const ZONA = "America/Santiago";
const DURACION_MIN = 30;
const APP_URL = "https://app.getpangui.com";

const ESTADO: Record<string, string> = { por_hacer: "Por hacer", en_curso: "En curso", hecho: "Hecho", cancelado: "Cancelado" };
const PRIORIDAD: Record<string, string> = { baja: "Baja", media: "Media", alta: "Alta", urgente: "Emergencia" };

const dos = (n: number) => String(n).padStart(2, "0");

/** Fecha y hora de Santiago → instante UTC, respetando el horario de verano. */
export function utcDeSantiago(fecha: string, hora: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const supuesto = Date.UTC(y, m - 1, d, h, mi);
  // Qué hora marca Santiago en ese instante; la diferencia es el desfase.
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(new Date(supuesto)).map(x => [x.type, x.value]),
  );
  const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(supuesto - (visto - supuesto));
}

const utcIcs = (d: Date) =>
  `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}T${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}${dos(d.getUTCSeconds())}Z`;
const fechaIcs = (ymd: string) => ymd.replaceAll("-", "");
function diaSiguiente(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, d + 1));
  return `${s.getUTCFullYear()}${dos(s.getUTCMonth() + 1)}${dos(s.getUTCDate())}`;
}

/** Texto de una propiedad: \ ; , y saltos de línea escapados (RFC 5545 §3.3.11). */
export function escapar(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Corta líneas a 75 octetos (UTF-8), continuando con un espacio (§3.1). */
export function plegar(linea: string): string {
  const enc = new TextEncoder();
  const partes: string[] = [];
  let actual = "", bytes = 0;
  for (const ch of linea) {
    const n = enc.encode(ch).length;
    const limite = partes.length === 0 ? 75 : 74; // las de continuación llevan el espacio
    if (bytes + n > limite) { partes.push(actual); actual = ""; bytes = 0; }
    actual += ch;
    bytes += n;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

/** Título, descripción y link: los mismos en el .ics y en Google Calendar. */
function textos(p: PendienteIcs) {
  const ot = p.ot_numero ? `OT #${p.ot_numero}` : "OT";
  const url = `${APP_URL}/ordenes?id=${encodeURIComponent(p.orden_id)}`;
  const quien = p.usuario_nombre?.trim() || null;
  const descripcion = [
    ...(quien ? [`De: ${quien}`] : []),
    p.ot_titulo?.trim() ? `${ot} · ${p.ot_titulo.trim()}` : ot,
    `Estado: ${ESTADO[p.estado] ?? p.estado} · Prioridad: ${PRIORIDAD[p.prioridad] ?? p.prioridad}`,
    url,
  ].join("\n");
  // En un calendario de equipo, de quién es se lee en el título.
  const titulo = quien ? `${p.nota} — ${quien.split(" ")[0]}` : p.nota;
  return { titulo, descripcion, url };
}

/** Sin hora, el push de Pangui sale a esta hora (pendientes_avisar). */
const HORA_DEFECTO = "08:30";

/** Lo máximo que Google acepta en un aviso: 4 semanas. Más allá avisa Pangui. */
const AVISO_MAX_GOOGLE = 40_320;

/**
 * Aviso del evento = el del pendiente (ot_pendientes.aviso_minutos), con el
 * tope de Google. Solo rige para la cuenta conectada: la API no fija los avisos
 * de los demás que ven el calendario.
 */
export function avisoGoogle(avisoMinutos: number) {
  return { useDefault: false, overrides: [{ method: "popup", minutes: Math.min(Math.max(avisoMinutos, 0), AVISO_MAX_GOOGLE) }] };
}

/**
 * Cuerpo de un evento de la Calendar API (events.insert / events.patch).
 *
 * Sin hora va a las 08:30 (30 min) y no de día completo: en un evento de día
 * completo Google cuenta el aviso desde la medianoche y no acepta negativos,
 * así que "1 hora antes" sonaría a las 23:00 del día anterior. Además 08:30 es
 * la hora a la que Pangui manda el push de un pendiente sin hora.
 */
export function eventoGoogle(p: PendienteIcs, avisoMinutos = 0) {
  const { titulo, descripcion, url } = textos(p);
  const ini = utcDeSantiago(p.fecha, (p.hora ?? HORA_DEFECTO).slice(0, 5));
  const fin = new Date(ini.getTime() + DURACION_MIN * 60_000);
  return {
    summary: titulo,
    description: descripcion,
    start: { dateTime: ini.toISOString() },
    end: { dateTime: fin.toISOString() },
    source: { title: "Abrir en Pangui", url },
    reminders: avisoGoogle(avisoMinutos),
    extendedProperties: { private: { pangui_pendiente_id: p.id } },
  };
}

function evento(p: PendienteIcs, sello: string): string[] {
  const { titulo, descripcion, url } = textos(p);

  const cuando = p.hora
    ? (() => {
        const ini = utcDeSantiago(p.fecha, p.hora.slice(0, 5));
        const fin = new Date(ini.getTime() + DURACION_MIN * 60_000);
        return [`DTSTART:${utcIcs(ini)}`, `DTEND:${utcIcs(fin)}`];
      })()
    : [`DTSTART;VALUE=DATE:${fechaIcs(p.fecha)}`, `DTEND;VALUE=DATE:${diaSiguiente(p.fecha)}`];

  return [
    "BEGIN:VEVENT",
    `UID:${p.id}@getpangui.com`,
    `DTSTAMP:${sello}`,
    ...cuando,
    `SUMMARY:${escapar(titulo)}`,
    `DESCRIPTION:${escapar(descripcion)}`,
    `URL:${url}`,
    "END:VEVENT",
  ];
}

/** El .ics completo. Un pendiente que deja de venir en el feed desaparece del calendario. */
export function construirIcs(pendientes: PendienteIcs[], ahora: Date, nombre = "Pangui · Pendientes"): string {
  const sello = utcIcs(ahora);
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pangui//Pendientes//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapar(nombre)}`,
    `X-WR-TIMEZONE:${ZONA}`,
    // Cada cuánto pedirlo de nuevo. Apple y Outlook lo respetan; Google decide solo.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...pendientes.flatMap(p => evento(p, sello)),
    "END:VCALENDAR",
  ];
  return lineas.map(plegar).join("\r\n") + "\r\n";
}
