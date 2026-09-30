import { createClient } from "@/lib/supabase";

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Uploads the workspace logo, saves workspaces.logo_url and returns the new URL. */
export async function subirLogoWorkspace(workspaceId: string, file: File): Promise<string> {
  if (file.size > LOGO_MAX_BYTES) throw new Error("El archivo no puede superar 2 MB.");
  const sb = createClient();
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${workspaceId}/logo.${ext}`;
  const { error: upErr } = await sb.storage.from("workspace-logos").upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;
  const { data: { publicUrl } } = sb.storage.from("workspace-logos").getPublicUrl(path);
  // Same path on re-upload: the query string busts cached copies of the old logo.
  const url = `${publicUrl}?t=${Date.now()}`;
  const { error } = await sb.from("workspaces").update({ logo_url: url }).eq("id", workspaceId);
  if (error) throw error;
  return url;
}
