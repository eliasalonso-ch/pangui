import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import OTDetailClient from "./OTDetailClient";

export default async function OTDetallePage({ params }) {
  const { id } = await params;
  const sb = await createServerSupabase();

  const [
    { data: { user } },
    { data: orden },
    { data: archivos },
    { data: comentarios },
  ] = await Promise.all([
    sb.auth.getUser(),
    sb.from("ordenes_trabajo")
      .select("*, categorias_ot(id,nombre,icono,color), ubicaciones(id,edificio,piso,detalle), activos(id,nombre,codigo), plantillas_procedimiento(id,nombre)")
      .eq("id", id).maybeSingle(),
    sb.from("archivos_orden").select("*").eq("orden_id", id).order("created_at"),
    sb.from("comentarios_orden")
      .select("id, tipo, contenido, created_at, usuario_id")
      .eq("orden_id", id).order("created_at"),
  ]);

  if (!orden) notFound();

  const [{ data: usuarios }, { data: pasos }] = await Promise.all([
    orden.workspace_id
      ? sb.from("usuarios").select("id, nombre, rol").eq("workspace_id", orden.workspace_id).order("nombre")
      : Promise.resolve({ data: [] }),
    orden.plantilla_id
      ? sb.from("pasos_plantilla").select("*").eq("plantilla_id", orden.plantilla_id).order("orden")
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <OTDetailClient
      id={id}
      initialOrden={orden}
      initialArchivos={archivos ?? []}
      initialComentarios={comentarios ?? []}
      initialPasos={pasos ?? []}
      usuarios={usuarios ?? []}
      myId={user?.id ?? null}
    />
  );
}
