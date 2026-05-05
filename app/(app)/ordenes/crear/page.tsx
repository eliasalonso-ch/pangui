import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase-server";

export default async function OrdenesCrearPage() {
  const [sb, user] = await Promise.all([createServerSupabase(), getServerUser()]);
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");

  redirect("/ordenes?panel=crear");
}
