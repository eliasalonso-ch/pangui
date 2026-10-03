// Credenciales MeConecta guardadas por Electrilam (Vault) y estado de la conexión.
//
// La clave se lee con get_meconecta_credentials(), que solo service_role puede
// ejecutar. Nunca se registra ni se devuelve en una respuesta.

import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Supabase = ReturnType<typeof createClient>;

// Electrilam — el único workspace con esta integración.
export const ELECTRILAM_WS = "f1b64714-6de2-4d49-b6e4-5959553e94d7";

export type EstadoConexion = "pendiente" | "conectado" | "credenciales_invalidas" | "error";

export interface Credenciales {
  username: string;
  password: string;
  status: EstadoConexion;
  authorized_at: string;
}

/** null when Electrilam has not connected MeConecta. */
export async function getCredenciales(supabase: Supabase): Promise<Credenciales | null> {
  const { data, error } = await supabase.rpc("get_meconecta_credentials");
  if (error) throw new Error(`get_meconecta_credentials: ${error.message}`);
  const row: unknown = Array.isArray(data) ? data[0] : null;
  return (row as Credenciales | undefined) ?? null;
}

/**
 * Updates the connection's status. Conditioned on authorized_at so a run that
 * started with the old password can't overwrite a password saved meanwhile.
 * Returns false when that happened (nothing was updated).
 */
export async function marcarEstado(
  supabase: Supabase,
  creds: Credenciales,
  patch: { status?: EstadoConexion; last_sync_at?: string; last_error?: string | null },
): Promise<boolean> {
  const { data } = await supabase
    .from("integration_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("workspace_id", ELECTRILAM_WS)
    .eq("provider", "meconecta")
    .eq("authorized_at", creds.authorized_at)
    .select("id");
  return (data?.length ?? 0) > 0;
}

export function describirError(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}
