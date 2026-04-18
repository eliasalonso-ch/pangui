import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

export default async function OrdenesCrearPage() {
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");

  redirect("/ordenes?panel=crear");
}
