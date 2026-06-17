import { createClient } from "@/lib/supabase";

export interface Solicitante {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}

/** Workspace solicitante catalog (autocomplete source for the OT requester field). */
export async function fetchSolicitantes(wsId: string): Promise<Solicitante[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("solicitantes")
    .select("id, nombre, telefono, email")
    .eq("workspace_id", wsId)
    .order("nombre", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Solicitante[];
}

/**
 * Create a solicitante, or update its contact info if the name already exists in
 * the workspace (case-insensitive). Keeps the catalog the single source of truth
 * for reusable contact info while the OT keeps its own frozen snapshot.
 */
export async function upsertSolicitante(
  wsId: string,
  nombre: string,
  telefono: string | null,
  email: string | null,
): Promise<Solicitante> {
  const sb = createClient();
  const trimmed = nombre.trim();
  const tel = telefono?.trim() || null;
  const mail = email?.trim() || null;

  const { data: existing } = await sb
    .from("solicitantes")
    .select("id, nombre, telefono, email")
    .eq("workspace_id", wsId)
    .ilike("nombre", trimmed)
    .maybeSingle();

  if (existing) {
    // Only patch when the contact info actually changed, to avoid useless writes.
    if ((existing.telefono ?? null) !== tel || (existing.email ?? null) !== mail) {
      const { data, error } = await sb
        .from("solicitantes")
        .update({ telefono: tel, email: mail })
        .eq("id", existing.id)
        .select("id, nombre, telefono, email")
        .single();
      if (error) throw error;
      return data as Solicitante;
    }
    return existing as Solicitante;
  }

  const { data, error } = await sb
    .from("solicitantes")
    .insert({ workspace_id: wsId, nombre: trimmed, telefono: tel, email: mail })
    .select("id, nombre, telefono, email")
    .single();
  if (error) throw error;
  return data as Solicitante;
}
