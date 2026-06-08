import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase-server";
import { ACTIVO_SELECT } from "@/lib/activos-api";
import ActivosBandeja from "./ActivosBandeja";
import type { Activo, Sociedad, Ubicacion, Usuario } from "@/types/ordenes";

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function ActivosPage({ searchParams }: PageProps) {
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

  const [activos, usuarios, ubicaciones, sociedades] = await Promise.all([
    sb.from("activos")
      .select(ACTIVO_SELECT)
      .eq("workspace_id", wsId)
      .eq("activo", true)
      .order("nombre")
      .then(r => (r.data ?? []) as unknown as Activo[]),

    sb.from("usuarios")
      .select("id,nombre,rol")
      .eq("workspace_id", wsId)
      .order("nombre")
      .then(r => (r.data ?? []) as Usuario[]),

    sb.from("ubicaciones")
      .select("id,edificio,detalle,activa,sociedad_id,sociedades(id,nombre)")
      .eq("workspace_id", wsId)
      .eq("activa", true)
      .order("edificio")
      .then(r => (r.data ?? []) as unknown as Ubicacion[]),

    sb.from("sociedades")
      .select("id,nombre,activa,imagen_url,created_at,workspace_id")
      .eq("workspace_id", wsId)
      .eq("activa", true)
      .order("nombre")
      .then(r => (r.data ?? []) as unknown as Sociedad[]),
  ]);

  return (
    <ActivosBandeja
      initialActivos={activos}
      usuarios={usuarios}
      ubicaciones={ubicaciones}
      sociedades={sociedades}
      myRol={perfil.rol}
      wsId={wsId}
      initialSelectedId={selectedId ?? null}
    />
  );
}
