import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { ORDEN_SELECT } from "@/lib/ordenes-api";
import OTDetailPage from "./OTDetailPage";
import type {
  OrdenTrabajo, Usuario, Ubicacion, Activo, CategoriaOT, LugarEspecifico, Sociedad,
} from "@/types/ordenes";

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
    .select("workspace_id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");
  const wsId = perfil.workspace_id;

  const [ordenRes, usuarios, ubicaciones, lugares, sociedades, activos, categorias] = await Promise.all([
    sb.from("ordenes_trabajo")
      .select(ORDEN_SELECT)
      .eq("id", id)
      .eq("workspace_id", wsId)
      .maybeSingle()
      .then(r => r.data as unknown as OrdenTrabajo | null),

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

    sb.from("lugares")
      .select("id,nombre,ubicacion_id,activo,imagen_url,descripcion,ubicaciones(id,edificio)")
      .eq("workspace_id", wsId)
      .eq("activo", true)
      .order("nombre")
      .then(r => (r.data ?? []) as unknown as LugarEspecifico[]),

    sb.from("sociedades")
      .select("id,nombre,activa,imagen_url")
      .eq("workspace_id", wsId)
      .eq("activa", true)
      .order("nombre")
      .then(r => (r.data ?? []) as unknown as Sociedad[]),

    sb.from("activos")
      .select("id,nombre,codigo")
      .eq("workspace_id", wsId)
      .eq("activo", true)
      .then(r => (r.data ?? []) as Activo[]),

    sb.from("categorias_ot")
      .select("id,nombre,icono,color")
      .or(`workspace_id.is.null,workspace_id.eq.${wsId}`)
      .order("nombre")
      .then(r => (r.data ?? []) as CategoriaOT[]),
  ]);

  if (!ordenRes) notFound();

  return (
    <OTDetailPage
      initialOrden={ordenRes}
      usuarios={usuarios}
      ubicaciones={ubicaciones}
      lugares={lugares}
      sociedades={sociedades}
      activos={activos}
      categorias={categorias}
      myId={user.id}
      myRol={perfil.rol ?? null}
      wsId={wsId}
    />
  );
}
