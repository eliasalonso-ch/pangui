import { createClient } from "@/lib/supabase";
import { withSupabaseAuthRetry } from "@/lib/supabase-auth-retry";

/**
 * The persisted half of the OT creation form.
 *
 * Deliberately only the JSON-serializable fields. The photo groups hold
 * browser `File` objects and blob: preview URLs — neither survives a reload
 * nor a round-trip through the database, so they are not persisted and the
 * user re-attaches photos if a draft is restored.
 */
export interface BorradorPayload {
  titulo?: string;
  n_ot?: string;
  solicitante?: string;
  solicitante_telefono?: string;
  solicitante_email?: string;
  hito?: string;
  presupuesto?: string;
  descripcion?: string;
  ubicacion_id?: string;
  lugar_id?: string;
  sociedad_id?: string;
  activo_id?: string;
  asignados_ids?: string[];
  fecha_termino?: string;
  fecha_inicio?: string;
  recurrencia?: string;
  recurrencia_config?: unknown;
  tipo_trabajo?: string;
  prioridad?: string;
  categoria_id?: string;
  // Links live inside FormState in OTCrearPanel, so they persist too.
  links?: unknown[];
}

export interface Borrador {
  payload: BorradorPayload;
  actualizado_at: string;
}

/** Guards the CHECK constraint on the table (64 KB) before we hit the network. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

export async function fetchBorrador(
  userId: string,
  wsId: string,
): Promise<Borrador | null> {
  const sb = createClient();
  const { data, error } = await withSupabaseAuthRetry(() =>
    sb
      .from("ot_borradores")
      .select("payload, actualizado_at")
      .eq("user_id", userId)
      .eq("workspace_id", wsId)
      .maybeSingle(),
  );
  if (error) throw error;
  if (!data) return null;
  return data as Borrador;
}

/**
 * Upsert on the (user_id, workspace_id) primary key. Atomic: no
 * select-then-insert race between two tabs autosaving at the same time.
 */
export async function saveBorrador(
  userId: string,
  wsId: string,
  payload: BorradorPayload,
): Promise<void> {
  const sb = createClient();

  // Oversized payload would be rejected by the CHECK constraint anyway; fail
  // here rather than burning a request and surfacing a raw Postgres error.
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    throw new Error("El borrador excede el tamano maximo permitido.");
  }

  const { error } = await withSupabaseAuthRetry(() =>
    sb.from("ot_borradores").upsert(
      {
        user_id: userId,
        workspace_id: wsId,
        payload,
        actualizado_at: new Date().toISOString(),
      },
      { onConflict: "user_id,workspace_id" },
    ),
  );
  if (error) throw error;
}

/** Called once the OT is actually created, and when the user discards. */
export async function deleteBorrador(userId: string, wsId: string): Promise<void> {
  const sb = createClient();
  const { error } = await withSupabaseAuthRetry(() =>
    sb.from("ot_borradores").delete().eq("user_id", userId).eq("workspace_id", wsId),
  );
  if (error) throw error;
}

/** True when the draft holds anything the user would care about losing. */
export function borradorTieneContenido(payload: BorradorPayload): boolean {
  return Object.entries(payload).some(([key, value]) => {
    if (value == null) return false;
    // Defaults that are present on a blank form and mean "untouched".
    if (key === "recurrencia" && value === "ninguna") return false;
    if (key === "prioridad" && value === "ninguna") return false;
    // OTCrearPanel seeds tipo_trabajo to "reactiva", not "". Treating that as
    // content would make every freshly-opened form save an empty draft.
    if (key === "tipo_trabajo" && value === "reactiva") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}
