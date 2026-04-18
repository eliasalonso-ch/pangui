import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrdenDetallePage({ params }: Props) {
  const { id } = await params;
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");

  redirect(`/ordenes?id=${id}`);
}
