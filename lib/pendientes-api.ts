import { addDays, addHours, addMonths, format, nextMonday } from "date-fns";
import { createClient } from "@/lib/supabase";
import type { Recurrencia, RecurrenciaConfig } from "@/types/ordenes";

/**
 * Pendientes de OT: lo que falta hacer, con fecha y opcionalmente hora. Son
 * personales: el RLS solo deja ver y tocar los propios, y workspace_id /
 * usuario_id los pone la base por defecto. El push lo manda el cron
 * 'pendientes-tick' (cada 15 min) y el correo 'pendientes-correo' (08:30);
 * ver migraciones 20261123120000 y 20261123180000. La recurrencia tiene el
 * mismo formato que la de las OTs (RecurrenceControls / recurrente_advance_date).
 */

/** Sin hora elegida, el push sale a esta hora (debe calzar con pendientes_avisar). */
export const HORA_DEFECTO = "08:30";

/** Estado: la fuente de verdad (hecho_at lo mantiene un trigger). Migración 20261123210000. */
export type EstadoPendiente = "por_hacer" | "en_curso" | "hecho" | "cancelado";
export const ESTADOS_PENDIENTE: [EstadoPendiente, string][] = [
  ["por_hacer", "Por hacer"],
  ["en_curso", "En curso"],
  ["hecho", "Hecho"],
  ["cancelado", "Cancelado"],
];
/** Los que avisan, salen en el correo y en la pestaña de la OT. */
export const ESTADOS_ABIERTOS: EstadoPendiente[] = ["por_hacer", "en_curso"];

/** El mismo vocabulario de prioridad de las OTs ("urgente" se lee "Emergencia"). */
export type PrioridadPendiente = "baja" | "media" | "alta" | "urgente";
export const PRIORIDADES_PENDIENTE: [PrioridadPendiente, string][] = [
  ["baja", "Baja"],
  ["media", "Media"],
  ["alta", "Alta"],
  ["urgente", "Emergencia"],
];

export const etiquetaDe = <K extends string>(lista: [K, string][], k: K) => lista.find(x => x[0] === k)?.[1] ?? k;

export interface DatosPendiente {
  nota: string;
  fecha: string;        // YYYY-MM-DD
  hora: string | null;  // HH:MM; null = HORA_DEFECTO
  recurrencia: Recurrencia;
  recurrencia_config: RecurrenciaConfig | null;
  push: boolean;
  correo: boolean;
  estado: EstadoPendiente;
  prioridad: PrioridadPendiente;
  /** Minutos antes de fecha + hora (sin hora = 08:30). 0 = a la hora. Manda el push, el correo y el aviso de Google. */
  aviso_minutos: number;
}

export interface Pendiente extends DatosPendiente {
  id: string;
  orden_id: string;
  hecho_at: string | null;
  created_at: string;
  usuario: { nombre: string } | null; // quien lo creó (los pendientes son personales)
}

export interface MiPendiente extends Pendiente {
  ordenes_trabajo: { numero: number | null; titulo: string | null; descripcion: string | null; deleted_at: string | null } | null;
}

const COLS = "id, orden_id, fecha, hora, nota, recurrencia, recurrencia_config, push, correo, estado, prioridad, aviso_minutos, hecho_at, created_at, usuario:usuarios(nombre)";

// ── Aviso (puro, testeado) ───────────────────────────────────────────────────

/** Máximo que acepta un aviso de Pangui (1 año) y el que acepta Google (4 semanas). */
export const AVISO_MAX = 525_600;
export const AVISO_MAX_GOOGLE = 40_320;

/** Unidades del aviso personalizado. Un mes = 30 días. */
export const UNIDADES_AVISO: [string, number, string, string][] = [
  // id, minutos, singular, plural
  ["minutos", 1, "minuto", "minutos"],
  ["horas", 60, "hora", "horas"],
  ["dias", 1440, "día", "días"],
  ["semanas", 10_080, "semana", "semanas"],
  ["meses", 43_200, "mes", "meses"],
];

/** Plantillas de aviso del diálogo, en minutos. */
export const PLANTILLAS_AVISO: [number, string][] = [
  [0, "A la hora"],
  [15, "15 min antes"],
  [60, "1 hora antes"],
  [1440, "1 día antes"],
  [10_080, "1 semana antes"],
  [43_200, "1 mes antes"],
];

/** Minutos → la unidad más grande que lo divide exacto: 2880 → { 2, días }. */
export function descomponerAviso(minutos: number): { cantidad: number; unidad: string } {
  for (let i = UNIDADES_AVISO.length - 1; i >= 0; i--) {
    const [id, m] = UNIDADES_AVISO[i];
    if (minutos > 0 && minutos % m === 0) return { cantidad: minutos / m, unidad: id };
  }
  return { cantidad: minutos, unidad: "minutos" };
}

/** "A la hora", "2 días antes", "1 mes antes". */
export function etiquetaAviso(minutos: number): string {
  if (minutos <= 0) return "A la hora";
  const { cantidad, unidad } = descomponerAviso(minutos);
  const [, , sing, plur] = UNIDADES_AVISO.find(u => u[0] === unidad)!;
  return `${cantidad} ${cantidad === 1 ? sing : plur} antes`;
}

// Postgres devuelve time como "HH:MM:SS".
const normalizar = <T extends { hora: string | null }>(p: T): T => ({ ...p, hora: p.hora ? p.hora.slice(0, 5) : null });

// ── Fechas (puras, testeadas) ────────────────────────────────────────────────

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const hm = (d: Date) => format(d, "HH:mm");
// En UTC para que el cambio de horario no corra un día.
const utc = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const diasHasta = (fecha: string, hoy: string) => Math.round((utc(fecha) - utc(hoy)) / 86_400_000);

/** "23 nov 2026, 16:40": cuándo se creó el pendiente, en hora local. */
export function fmtCreado(ts: string): string {
  return new Date(ts).toLocaleString("es-CL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Hoy · 15:00", "Mañana", "En 12 días", "Atrasado 3 días" o la fecha si está lejos. */
export function etiquetaPendiente(fecha: string, hoy: string, hora?: string | null): { texto: string; atrasado: boolean } {
  const dias = diasHasta(fecha, hoy);
  const h = hora ? ` · ${hora}` : "";
  if (dias < 0) return { texto: dias === -1 ? "Atrasado 1 día" : `Atrasado ${-dias} días`, atrasado: true };
  if (dias === 0) return { texto: `Hoy${h}`, atrasado: false };
  if (dias === 1) return { texto: `Mañana${h}`, atrasado: false };
  if (dias <= 30) return { texto: `En ${dias} días`, atrasado: false };
  const texto = new Date(utc(fecha)).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return { texto, atrasado: false };
}

export const GRUPOS_PENDIENTES = [
  ["atrasados", "Atrasados"],
  ["hoy", "Hoy"],
  ["semana", "Próximos 7 días"],
  ["despues", "Más adelante"],
] as const;
export type GrupoPendiente = (typeof GRUPOS_PENDIENTES)[number][0];

export function grupoPendiente(fecha: string, hoy: string): GrupoPendiente {
  const dias = diasHasta(fecha, hoy);
  if (dias < 0) return "atrasados";
  if (dias === 0) return "hoy";
  return dias <= 7 ? "semana" : "despues";
}

/** Redondea hacia arriba al próximo cuarto de hora. */
function alCuarto(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const resto = r.getMinutes() % 15;
  if (resto) r.setMinutes(r.getMinutes() + 15 - resto);
  return r;
}

function aLas(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const r = new Date(d);
  r.setHours(h, m, 0, 0);
  return r;
}

/**
 * Atajos del diálogo. Los de horas fijan día y hora; los de semanas o meses
 * solo el día (sin hora = aviso a las 08:30).
 */
export const RAPIDAS: { id: string; label: string; calc: (ahora: Date) => { fecha: string; hora: string | null } }[] = [
  { id: "1h", label: "En 1 hora", calc: a => { const d = alCuarto(addHours(a, 1)); return { fecha: ymd(d), hora: hm(d) }; } },
  { id: "tarde", label: "Esta tarde", calc: a => {
    const d = a.getHours() < 18 ? aLas(a, "18:00") : aLas(addDays(a, 1), "18:00");
    return { fecha: ymd(d), hora: "18:00" };
  } },
  { id: "manana", label: "Mañana 9:00", calc: a => ({ fecha: ymd(addDays(a, 1)), hora: "09:00" }) },
  { id: "lunes", label: "Próximo lunes", calc: a => ({ fecha: ymd(nextMonday(a)), hora: null }) },
  { id: "1m", label: "En 1 mes", calc: a => ({ fecha: ymd(addMonths(a, 1)), hora: null }) },
  { id: "3m", label: "En 3 meses", calc: a => ({ fecha: ymd(addMonths(a, 3)), hora: null }) },
  { id: "6m", label: "En 6 meses", calc: a => ({ fecha: ymd(addMonths(a, 6)), hora: null }) },
];

/** El atajo que coincide con la fecha y hora elegidas, o null ("Elegir fecha"). */
export function rapidaActiva(fecha: string, hora: string | null, ahora: Date): string | null {
  return RAPIDAS.find(r => { const c = r.calc(ahora); return c.fecha === fecha && c.hora === hora; })?.id ?? null;
}

/**
 * "Te aviso mañana a las 09:00, y después cada semana, por push y correo."
 * Con aviso: "Te aviso 1 día antes, el dom 29 nov a las 15:00, …". Si ese
 * momento ya pasó, avisa al tiro. `repeticion` = etiquetaRecurrencia o null.
 */
export function resumenPendiente(d: Pick<DatosPendiente, "fecha" | "hora" | "push" | "correo" | "aviso_minutos">, repeticion: string | null, ahora: Date): string {
  if (!d.fecha) return "";
  const [h, m] = (d.hora ?? HORA_DEFECTO).split(":").map(Number);
  const [y, mo, dd] = d.fecha.split("-").map(Number);
  const momento = new Date(y, mo - 1, dd, h, m - d.aviso_minutos);
  const hoy = ymd(ahora);
  const fechaAviso = ymd(momento);
  const dias = diasHasta(fechaAviso, hoy);
  const anioDistinto = fechaAviso.slice(0, 4) !== hoy.slice(0, 4);
  const dia = dias === 0 ? "hoy" : dias === 1 ? "mañana"
    : "el " + new Date(utc(fechaAviso)).toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short", ...(anioDistinto ? { year: "numeric" } : {}), timeZone: "UTC" }).replace(",", "");
  const canales = [d.push && "push", d.correo && "correo"].filter(Boolean).join(" y ");
  const rep = repeticion ? `, y después ${repeticion.toLocaleLowerCase("es")}` : "";
  const cuando = momento <= ahora
    ? "apenas lo guardes (ese momento ya pasó)"
    : `${d.aviso_minutos > 0 ? `${etiquetaAviso(d.aviso_minutos)}, ` : ""}${dia} a las ${hm(momento)}`;
  return `Te aviso ${cuando}${rep}${canales ? `, por ${canales}` : ""}.`;
}

/**
 * Por qué no se puede guardar, o null. `chequearPasado` es false al editar sin
 * cambiar fecha ni hora: un pendiente atrasado se puede corregir igual.
 */
export function validarPendiente(d: DatosPendiente, ahora: Date, chequearPasado = true): { campo: "nota" | "fecha" | "canal" | "aviso"; mensaje: string } | null {
  if (!d.nota.trim()) return { campo: "nota", mensaje: "Escribe qué hay que hacer." };
  if (!d.fecha) return { campo: "fecha", mensaje: "Elige el día." };
  if (!d.push && !d.correo) return { campo: "canal", mensaje: "Elige al menos un canal: push o correo." };
  if (!Number.isInteger(d.aviso_minutos) || d.aviso_minutos < 0 || d.aviso_minutos > AVISO_MAX) {
    return { campo: "aviso", mensaje: "El aviso puede ser de hasta 1 año antes." };
  }
  if (chequearPasado) {
    const hoy = ymd(ahora);
    if (d.fecha < hoy) return { campo: "fecha", mensaje: "Ese día ya pasó." };
    if (d.fecha === hoy && d.hora && d.hora <= hm(ahora)) return { campo: "fecha", mensaje: "Esa hora ya pasó." };
  }
  return null;
}

// ── Filtro "Cuándo" en el servidor (puro, testeado) ──────────────────────────

/**
 * Condición PostgREST para `.or()` con los grupos de "Cuándo" elegidos, o null
 * si no hay ninguno. Mismos cortes que grupoPendiente.
 */
export function filtroCuando(grupos: GrupoPendiente[], hoy: string): string | null {
  if (!grupos.length) return null;
  const en7 = ymd(addDays(new Date(utc(hoy) + 12 * 3_600_000), 7)); // mediodía: sin saltos de huso
  const partes: Record<GrupoPendiente, string> = {
    atrasados: `fecha.lt.${hoy}`,
    hoy: `fecha.eq.${hoy}`,
    semana: `and(fecha.gt.${hoy},fecha.lte.${en7})`,
    despues: `fecha.gt.${en7}`,
  };
  return grupos.map(g => partes[g]).join(",");
}

// ── Datos ────────────────────────────────────────────────────────────────────

export type OrdenPendientes = { id: "cuando" | "nota" | "estado" | "prioridad" | "creado"; desc: boolean };

export interface ConsultaPendientes {
  pagina: number;     // desde 0
  porPagina: number;
  busqueda: string;
  estados: EstadoPendiente[];
  prioridades: PrioridadPendiente[];
  cuando: GrupoPendiente[];
  orden: OrdenPendientes | null;
}

/**
 * Una página de "Mis pendientes", paginada, filtrada y ordenada en el
 * servidor (`.range()` + `count: exact`). El RLS deja solo los propios; el
 * `!inner` saca los de OTs en la papelera también del conteo.
 */
export async function fetchMisPendientesPagina(c: ConsultaPendientes, hoy: string): Promise<{ filas: MiPendiente[]; total: number }> {
  let q = createClient()
    .from("ot_pendientes")
    .select(`${COLS}, ordenes_trabajo!inner(numero, titulo, descripcion, deleted_at)`, { count: "exact" })
    .is("ordenes_trabajo.deleted_at", null);

  if (c.busqueda.trim()) q = q.ilike("nota", `%${c.busqueda.trim()}%`);
  if (c.estados.length) q = q.in("estado", c.estados);
  if (c.prioridades.length) q = q.in("prioridad", c.prioridades);
  const cuando = filtroCuando(c.cuando, hoy);
  if (cuando) q = q.or(cuando);

  const asc = !(c.orden?.desc ?? false);
  switch (c.orden?.id ?? "cuando") {
    case "cuando":    q = q.order("fecha", { ascending: asc }).order("hora", { ascending: asc, nullsFirst: asc }); break;
    case "nota":      q = q.order("nota", { ascending: asc }); break;
    case "estado":    q = q.order("estado_orden", { ascending: asc }).order("fecha"); break;
    case "prioridad": q = q.order("prioridad_orden", { ascending: asc }).order("fecha"); break;
    case "creado":    q = q.order("created_at", { ascending: asc }); break;
  }
  // Desempate estable: sin él, dos filas con la misma fecha pueden saltar de página.
  q = q.order("id");

  const desde = c.pagina * c.porPagina;
  const { data, error, count } = await q.range(desde, desde + c.porPagina - 1);
  if (error) throw error;
  return { filas: ((data ?? []) as unknown as MiPendiente[]).map(normalizar), total: count ?? 0 };
}

/** Los abiertos de una OT, en orden de creación. */
export async function fetchPendientes(ordenId: string): Promise<Pendiente[]> {
  const { data, error } = await createClient()
    .from("ot_pendientes")
    .select(COLS)
    .eq("orden_id", ordenId)
    .in("estado", ESTADOS_ABIERTOS)
    .order("created_at");
  if (error) throw error;
  return ((data ?? []) as unknown as Pendiente[]).map(normalizar);
}

export async function crearPendiente(ordenId: string, d: DatosPendiente): Promise<void> {
  const { error } = await createClient()
    .from("ot_pendientes")
    .insert({ orden_id: ordenId, ...d, nota: d.nota.trim() });
  if (error) throw error;
}

/** Si cambian fecha u hora se limpia avisado_at para que vuelva a avisar. */
export async function actualizarPendiente(id: string, d: DatosPendiente, reavisar: boolean): Promise<void> {
  const { error } = await createClient()
    .from("ot_pendientes")
    .update({ ...d, nota: d.nota.trim(), ...(reavisar ? { avisado_at: null } : {}) })
    .eq("id", id);
  if (error) throw error;
}

/** Al pasar a 'hecho', si se repite, la base crea el siguiente (trigger). */
export async function cambiarEstadoPendientes(ids: string[], estado: EstadoPendiente): Promise<void> {
  const { error } = await createClient().from("ot_pendientes").update({ estado }).in("id", ids);
  if (error) throw error;
}

export async function cambiarPrioridadPendientes(ids: string[], prioridad: PrioridadPendiente): Promise<void> {
  const { error } = await createClient().from("ot_pendientes").update({ prioridad }).in("id", ids);
  if (error) throw error;
}

export const marcarPendienteHecho = (id: string) => cambiarEstadoPendientes([id], "hecho");

/** Mover la fecha limpia avisado_at para que la nueva fecha vuelva a avisar. */
export async function posponerPendiente(id: string, fecha: string): Promise<void> {
  const { error } = await createClient()
    .from("ot_pendientes")
    .update({ fecha, avisado_at: null })
    .eq("id", id);
  if (error) throw error;
}

/** Copia abierta del pendiente, en la misma OT. */
export async function duplicarPendiente(p: Pendiente): Promise<void> {
  const { nota, fecha, hora, recurrencia, recurrencia_config, push, correo, prioridad, aviso_minutos } = p;
  await crearPendiente(p.orden_id, { nota, fecha, hora, recurrencia, recurrencia_config, push, correo, prioridad, aviso_minutos, estado: "por_hacer" });
}

export async function borrarPendientes(ids: string[]): Promise<void> {
  const { error } = await createClient().from("ot_pendientes").delete().in("id", ids);
  if (error) throw error;
}
