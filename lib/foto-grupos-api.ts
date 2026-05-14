import { createClient } from "@/lib/supabase";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";

export interface FotoGrupo {
  id: string;
  orden_id: string;
  workspace_id: string;
  titulo: string;
  descripcion: string;
  tipo?: "referencia" | "evidencia";
  orden_display: number;
  locked: boolean;
  created_by: string | null;
  created_at: string;
  items?: FotoGrupoItem[];
}

export interface FotoGrupoItem {
  id: string;
  grupo_id: string;
  url: string;
  orden_display: number;
  created_at: string;
}

export async function fetchFotoGrupos(ordenId: string): Promise<FotoGrupo[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("foto_grupos")
    .select("*, items:foto_grupo_items(id, grupo_id, url, orden_display, created_at)")
    .eq("orden_id", ordenId)
    .order("orden_display", { ascending: true })
    .order("created_at", { referencedTable: "foto_grupo_items", ascending: true });
  if (error) throw error;
  return (data ?? []) as FotoGrupo[];
}

export async function createFotoGrupo(
  ordenId: string,
  workspaceId: string,
  userId: string,
  titulo: string,
  descripcion: string,
  ordenDisplay: number,
  tipo: "referencia" | "evidencia" = "evidencia",
): Promise<FotoGrupo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("foto_grupos")
    .insert({ orden_id: ordenId, workspace_id: workspaceId, created_by: userId, titulo, descripcion, tipo, orden_display: ordenDisplay })
    .select()
    .single();
  if (error) throw error;
  return data as FotoGrupo;
}

export async function updateFotoGrupo(id: string, patch: { titulo?: string; descripcion?: string }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("foto_grupos").update(patch).eq("id", id);
  if (error) throw error;
}

export async function toggleFotoGrupoLocked(id: string, locked: boolean): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("foto_grupos").update({ locked }).eq("id", id);
  if (error) throw error;
}

export async function deleteFotoGrupo(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("foto_grupos").delete().eq("id", id);
  if (error) throw error;
}

export async function addFotoToGrupo(grupoId: string, url: string, ordenDisplay: number): Promise<FotoGrupoItem> {
  const sb = createClient();
  const { data, error } = await sb
    .from("foto_grupo_items")
    .insert({ grupo_id: grupoId, url, orden_display: ordenDisplay })
    .select()
    .single();
  if (error) throw error;
  return data as FotoGrupoItem;
}

export async function removeFotoFromGrupo(itemId: string, url?: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("foto_grupo_items").delete().eq("id", itemId);
  if (error) throw error;
  if (url) await deleteFromR2(url).catch(() => {});
}

export async function uploadFotoGrupo(ordenId: string, file: File): Promise<string> {
  return uploadToR2(file, `ordenes/${ordenId}/grupos`);
}
