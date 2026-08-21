import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser, shouldRedirectToLogin } from "@/lib/supabase-server";
import SesionNoDisponible from "@/components/SesionNoDisponible";
import { esAdmin } from "@/lib/roles";
import PapeleraView from "./PapeleraView";

export default async function PapeleraPage() {
  const [sb, auth] = await Promise.all([createServerSupabase(), getServerUser()]);

  // Only a positively-confirmed "no session" redirects. A transient auth
  // failure renders a retry screen instead of silently signing the user out.
  if (shouldRedirectToLogin(auth)) redirect("/login");
  if (!auth.user) return <SesionNoDisponible />;
  const user = auth.user;

  const { data: perfil, error: perfilError } = await sb
    .from("usuarios")
    .select("workspace_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  // A failed query is not proof the user has no workspace. Only an actual
  // row with no workspace_id is; anything else would log them out on a blip.
  if (perfilError) return <SesionNoDisponible />;
  if (!perfil?.workspace_id) redirect("/login");
  // Trash is an owner/admin recovery + cleanup view.
  if (!esAdmin(perfil.rol)) redirect("/ordenes");

  return <PapeleraView workspaceId={perfil.workspace_id} />;
}
