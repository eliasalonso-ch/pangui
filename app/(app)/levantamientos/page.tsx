import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase-server";
import LevantamientosBandeja from "./LevantamientosBandeja";
import { LEV_SELECT } from "@/lib/levantamientos-api";
import type { Levantamiento } from "@/types/levantamientos";
import type { Usuario, Ubicacion, Sociedad } from "@/types/ordenes";

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function LevantamientosPage({ searchParams }: PageProps) {
  const { id: selectedId } = await searchParams;
  const [sb, user] = await Promise.all([createServerSupabase(), getServerUser()]);
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id, rol, nombre")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");
  const wsId = perfil.workspace_id;

  const [levantamientos, usuarios, ubicaciones, sociedades] = await Promise.all([
    sb.from("levantamientos")
      .select(LEV_SELECT)
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(r => (r.data ?? []) as unknown as Levantamiento[]),

    sb.from("usuarios")
      .select("id,nombre,rol")
      .eq("workspace_id", wsId)
      .order("nombre")
      .then(r => (r.data ?? []) as Usuario[]),

    sb.from("ubicaciones")
      .select("id,edificio,piso,detalle,activa,sociedad_id,sociedades(id,nombre)")
      .eq("workspace_id", wsId)
      .eq("activa", true)
      .order("edificio")
      .then(r => (r.data ?? []) as unknown as Ubicacion[]),

    sb.from("sociedades")
      .select("id,nombre,activa")
      .eq("workspace_id", wsId)
      .eq("activa", true)
      .order("nombre")
      .then(r => (r.data ?? []) as unknown as Sociedad[]),
  ]);

  return (
    <LevantamientosBandeja
      initialLevantamientos={levantamientos}
      usuarios={usuarios}
      ubicaciones={ubicaciones}
      sociedades={sociedades}
      myId={user.id}
      myRol={perfil.rol}
      wsId={wsId}
      initialSelectedId={selectedId ?? null}
    />
  );
}
