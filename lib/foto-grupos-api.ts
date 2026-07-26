import { createClient } from "@/lib/supabase";
import { uploadToR2, deleteFromR2 } from "@/lib/r2";
import { ensureOtCategoria } from "@/lib/cuotas-client";
import { getWorkOrderRolloutV1 } from "@/lib/work-orders/rollout-v1";
import { finalizeOtUploadV1, prepareOtUploadV1 } from "@/lib/work-orders/uploads-v1";

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
  // Skip the check if this OT already has groups (we only count "OTs with photos
  // this month" — once an OT has a group, adding more is free).
  const { count } = await sb.from("foto_grupos").select("id", { count: "exact", head: true }).eq("orden_id", ordenId);
  if (!count || count === 0) {
    await ensureOtCategoria("con_fotos", "OT con fotos adjuntas");
  }
  const { data, error } = await sb
    .from("foto_grupos")
    .insert({ orden_id: ordenId, workspace_id: workspaceId, created_by: userId, titulo, descripcion, tipo, orden_display: ordenDisplay })
    .select()
    .single();
  if (error) throw error;
  return data as FotoGrupo;
}

export async function updateFotoGrupo(id: string, patch: { titulo?: string; descripcion?: string; tipo?: "referencia" | "evidencia" }): Promise<void> {
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

export async function uploadAndAddFotoToGrupo(
  ordenId: string,
  grupoId: string,
  file: File,
  ordenDisplay: number,
): Promise<FotoGrupoItem> {
  const rollout = await getWorkOrderRolloutV1();
  if (!rollout.upload_enabled || rollout.kill_switch) {
    const url = await uploadFotoGrupo(ordenId, file);
    return addFotoToGrupo(grupoId, url, ordenDisplay);
  }

  const sb = createClient();
  const [{ data: authData, error: authError }, { data: group, error: groupError }] = await Promise.all([
    sb.auth.getUser(),
    sb.from("foto_grupos").select("workspace_id, orden_id").eq("id", grupoId).single(),
  ]);
  if (authError || !authData.user) throw authError ?? new Error("La sesión expiró antes de subir la foto.");
  if (groupError) throw groupError;
  if (group.orden_id !== ordenId) throw new Error("La carpeta no pertenece a esta OT.");

  const commandId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  const extension = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const prepared = await prepareOtUploadV1({
    contract_version: 1,
    command_id: commandId,
    workspace_id: group.workspace_id,
    actor_id: authData.user.id,
    payload: {
      ot_id: ordenId,
      kind: "photo_group_item",
      extension,
      size: file.size,
      original_name: file.name,
      target: { grupo_id: grupoId, item_id: itemId, orden_display: ordenDisplay },
    },
  });
  const upload = await fetch(prepared.data.upload_url, {
    method: "PUT",
    headers: { "Content-Type": prepared.data.content_type },
    body: file,
  });
  if (!upload.ok) throw new Error(`No se pudo subir la foto (${upload.status}).`);
  const finalized = await finalizeOtUploadV1(prepared.data.intent_id);
  return {
    id: itemId,
    grupo_id: grupoId,
    url: finalized.data.public_url,
    orden_display: ordenDisplay,
    created_at: new Date().toISOString(),
  };
}
