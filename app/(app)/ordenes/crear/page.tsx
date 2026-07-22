import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser } from "@/lib/supabase-server";
import OTCrearPageClient from "./OTCrearPageClient";
import type { Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT } from "@/types/ordenes";

export default async function OrdenesCrearPage() {
  const [sb, user] = await Promise.all([createServerSupabase(), getServerUser()]);
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");
  const wsId = perfil.workspace_id;

  const [usuarios, ubicaciones, lugares, sociedades, activos, categorias] = await Promise.all([
    sb.from("usuarios")
      .select("id,nombre,rol")
      .eq("workspace_id", wsId)
      .order("nombre")
      .then(result => (result.data ?? []) as Usuario[]),
    sb.from("ubicaciones")
      .select("id,edificio,detalle,activa,sociedad_id,sociedades(id,nombre)")
      .eq("workspace_id", wsId)
      .eq("activa", true)
      .order("edificio")
      .then(result => (result.data ?? []) as unknown as Ubicacion[]),
    sb.from("lugares")
      .select("id,nombre,ubicacion_id,activo,imagen_url,descripcion,ubicaciones(id,edificio)")
      .eq("workspace_id", wsId)
      .eq("activo", true)
      .order("nombre")
      .then(result => (result.data ?? []) as unknown as LugarEspecifico[]),
    sb.from("sociedades")
      .select("id,nombre,activa,imagen_url")
      .eq("workspace_id", wsId)
      .eq("activa", true)
      .order("nombre")
      .then(result => (result.data ?? []) as unknown as Sociedad[]),
    sb.from("activos")
      .select("id,nombre,numero_serie")
      .eq("workspace_id", wsId)
      .eq("activo", true)
      .order("nombre")
      .then(result => (result.data ?? []) as Activo[]),
    sb.from("categorias_ot")
      .select("id,nombre,icono,color")
      .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
      .order("nombre")
      .then(result => (result.data ?? []) as CategoriaOT[]),
  ]);

  return (
    <OTCrearPageClient
      usuarios={usuarios}
      ubicaciones={ubicaciones}
      lugares={lugares}
      sociedades={sociedades}
      activos={activos}
      categorias={categorias}
      myId={user.id}
      wsId={wsId}
    />
  );
}
