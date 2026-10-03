import { createClient } from "@/lib/supabase";

export type EstadoConexion = "pendiente" | "conectado" | "credenciales_invalidas" | "error";
export type EstadoVisible = EstadoConexion | "sin_conexion";

/** Lo que la UI puede ver de la conexión. La clave nunca sale de Vault. */
export interface ConexionMeconecta {
  username: string;
  status: EstadoConexion;
  last_sync_at: string | null;
  last_error: string | null;
  authorized_at: string;
}

export const ESTADO_VISIBLE: Record<EstadoVisible, { label: string; bg: string; fg: string }> = {
  conectado:              { label: "Conectado",       bg: "var(--success-bg)", fg: "var(--success)" },
  pendiente:              { label: "Verificando",     bg: "var(--st-wait-bg)", fg: "var(--st-wait-fg)" },
  credenciales_invalidas: { label: "Clave rechazada", bg: "var(--danger-bg)",  fg: "var(--danger)" },
  error:                  { label: "Con errores",     bg: "var(--danger-bg)",  fg: "var(--danger)" },
  sin_conexion:           { label: "Sin conectar",    bg: "var(--surface-2)",  fg: "var(--fg-3)" },
};

export function estadoVisible(c: ConexionMeconecta | null): EstadoVisible {
  return c ? c.status : "sin_conexion";
}

/** RLS limita la lectura a owners/admins del propio workspace. */
export async function getConexionMeconecta(): Promise<ConexionMeconecta | null> {
  const { data, error } = await createClient()
    .from("integration_connections")
    .select("username, status, last_sync_at, last_error, authorized_at")
    .eq("provider", "meconecta")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConexionMeconecta | null) ?? null;
}

/** Va directo del navegador a Vault vía RPC; no pasa por el servidor Next. */
export async function guardarCredencialesMeconecta(usuario: string, clave: string, autoriza: boolean): Promise<void> {
  const { error } = await createClient().rpc("set_meconecta_credentials", {
    p_usuario: usuario, p_clave: clave, p_autoriza: autoriza,
  });
  if (error) throw new Error(error.message);
}

export async function desconectarMeconecta(): Promise<void> {
  const { error } = await createClient().rpc("disconnect_meconecta");
  if (error) throw new Error(error.message);
}

/** Login + lectura de prueba en el servidor; actualiza el estado de la conexión. */
export async function probarMeconecta(): Promise<{ ok: boolean; error?: string; code?: string }> {
  try {
    const res = await fetch("/api/meconecta/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soloProbar: true }),
    });
    const data = await res.json().catch(() => null);
    if (data?.ok) return { ok: true };
    return { ok: false, code: data?.code, error: data?.error ?? "No se pudo probar la conexión" };
  } catch {
    return { ok: false, error: "No se pudo contactar el servidor" };
  }
}
