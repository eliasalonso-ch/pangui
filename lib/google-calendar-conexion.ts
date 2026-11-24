import { createClient } from "@/lib/supabase";
import type { EstadoVisible } from "@/lib/meconecta-conexion";

/**
 * Integración Google Calendar, lado cliente (/integraciones/google-calendar).
 * Lo que la UI puede ver de la conexión: el refresh token nunca sale de Vault.
 * RLS: cada persona ve solo su conexión y su link (calendario_google, calendario_feeds).
 */
export interface ConexionGoogle {
  google_email: string;
  calendar_id: string | null;
  calendar_nombre: string | null;
  estado: "activo" | "revocado" | "error";
  ultimo_error: string | null;
  updated_at: string;
}

export interface CalendarioGoogle { id: string; nombre: string; principal: boolean }

export async function leerConexionGoogle(): Promise<ConexionGoogle | null> {
  const { data, error } = await createClient()
    .from("calendario_google")
    .select("google_email, calendar_id, calendar_nombre, estado, ultimo_error, updated_at")
    .maybeSingle();
  if (error) throw error;
  return data as ConexionGoogle | null;
}

/** Para la insignia de estado (mismos colores que MeConecta). */
export function estadoGoogle(c: ConexionGoogle | null): { estado: EstadoVisible; label?: string } {
  if (!c) return { estado: "sin_conexion" };
  if (c.estado === "revocado") return { estado: "credenciales_invalidas", label: "Reconectar" };
  if (!c.calendar_id) return { estado: "pendiente", label: "Elige calendario" };
  if (c.ultimo_error) return { estado: "error" };
  return { estado: "conectado" };
}

/** Mensaje de la vuelta de Google (/api/google/callback → ?calendario=…). */
export const MENSAJE_VUELTA: Record<string, { texto: string; ok: boolean }> = {
  conectado: { texto: "Google Calendar conectado. Ahora elige el calendario.", ok: true },
  cancelado: { texto: "Cancelaste la conexión con Google.", ok: false },
  permisos: { texto: "Faltó aceptar los permisos. Vuelve a conectar y deja marcadas las dos casillas.", ok: false },
  invalido: { texto: "El enlace de conexión venció o no es válido. Vuelve a intentarlo.", ok: false },
  error: { texto: "No se pudo conectar con Google. Vuelve a intentarlo.", ok: false },
};

export async function listarCalendariosGoogle(): Promise<{ calendarios: CalendarioGoogle[] } | { revocado: true }> {
  const r = await fetch("/api/google/calendarios");
  const j = await r.json();
  if (r.status === 409) return { revocado: true };
  if (!r.ok) throw new Error(j.error ?? "No se pudieron leer los calendarios");
  return { calendarios: j.calendarios };
}

export async function elegirCalendarioGoogle(c: CalendarioGoogle): Promise<void> {
  const { error } = await createClient().rpc("gcal_elegir_calendario", { p_id: c.id, p_nombre: c.nombre });
  if (error) throw error;
}

export async function desconectarGoogle(): Promise<void> {
  const r = await fetch("/api/google/desconectar", { method: "POST" });
  if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo desconectar");
}

// ── Link .ics de solo lectura (calendario_feeds) ─────────────────────────────

export const urlFeed = (token: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pendientes-ics/${token}.ics`;

export async function leerTokenFeed(): Promise<string | null> {
  const { data, error } = await createClient().from("calendario_feeds").select("token").maybeSingle();
  if (error) throw error;
  return data?.token ?? null;
}

export async function crearTokenFeed(): Promise<void> {
  const { error } = await createClient().from("calendario_feeds").insert({});
  if (error) throw error;
}

/** Borrar y crear: el link anterior deja de funcionar para todos. */
export async function regenerarTokenFeed(actual: string): Promise<void> {
  const { error } = await createClient().from("calendario_feeds").delete().eq("token", actual);
  if (error) throw error;
  await crearTokenFeed();
}
