import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import OrdenesBandeja from "./OrdenesBandeja";
import type { OrdenListItem, Usuario, Ubicacion, Activo, CategoriaOT, LugarEspecifico, Sociedad } from "@/types/ordenes";
import { LIST_SELECT } from "@/lib/ordenes-api";

interface PageProps {
  searchParams: Promise<{ id?: string; panel?: string }>;
}

export default async function OrdenesPage({ searchParams }: PageProps) {
  const { id: selectedId, panel } = await searchParams;
  const sb = await createServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id, rol, nombre, plan, plan_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil?.workspace_id) redirect("/login");
  const wsId = perfil.workspace_id;

  const [ordenes, usuarios, ubicaciones, lugares, sociedades, activos, categorias] = await Promise.all([
    sb.from("ordenes_trabajo")
      .select(LIST_SELECT)
      .eq("workspace_id", wsId)
      .is("parent_id", null)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(r => (r.data ?? []) as unknown as OrdenListItem[]),

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

  return (
    <OrdenesBandeja
      initialOrdenes={ordenes}
      usuarios={usuarios}
      ubicaciones={ubicaciones}
      lugares={lugares}
      sociedades={sociedades}
      activos={activos}
      categorias={categorias}
      myId={user.id}
      myRol={perfil.rol}
      wsId={wsId}
      initialSelectedId={selectedId ?? null}
      initialPanel={panel === "crear" ? "create" : null}
    />
  );
}
