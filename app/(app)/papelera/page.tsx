import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase-server";
import { esAdmin } from "@/lib/roles";
import PapeleraView from "./PapeleraView";

export default async function PapeleraPage() {
  const [sb, user] = await Promise.all([createServerSupabase(), getServerUser()]);

  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");
  // Trash is an owner/admin recovery + cleanup view.
  if (!esAdmin(perfil.rol)) redirect("/ordenes");

  return <PapeleraView workspaceId={perfil.workspace_id} />;
}
