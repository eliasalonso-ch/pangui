import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser, shouldRedirectToLogin } from "@/lib/supabase-server";
import SesionNoDisponible from "@/components/SesionNoDisponible";
import OTCrearPageClient from "./OTCrearPageClient";
import type { Usuario, Ubicacion, LugarEspecifico, Sociedad, Activo, CategoriaOT } from "@/types/ordenes";

export default async function OrdenesCrearPage() {
  const [sb, auth] = await Promise.all([createServerSupabase(), getServerUser()]);
  // Only a positively-confirmed "no session" redirects. A transient auth
  // failure renders a retry screen instead of silently signing the user out.
  if (shouldRedirectToLogin(auth)) redirect("/login");
  if (!auth.user) return <SesionNoDisponible />;
  const user = auth.user;

  const { data: perfil, error: perfilError } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", user.id)
    .maybeSingle();

  // A failed query is not proof the user has no workspace. Only an actual
  // row with no workspace_id is; anything else would log them out on a blip.
  if (perfilError) return <SesionNoDisponible />;
  if (!perfil?.workspace_id) redirect("/login");
  const wsId = perfil.workspace_id;

  const [usuarios, ubicaciones, lugares, sociedades, activos, categorias] = await Promise.all([
    sb.from("usuarios")
      // Incluye a los dados de baja a proposito: son necesarios para mostrar el
      // nombre de quien hizo una OT vieja. Los selectores de asignacion los
      // filtran por `deleted_at` en la UI; sacarlos de la consulta hacia que el
      // responsable de una OT completada desapareciera de la tarjeta.
      .select("id,nombre,rol,deleted_at")
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
