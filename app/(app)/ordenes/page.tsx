import { redirect } from "next/navigation";
import { createServerSupabase, getServerUser, shouldRedirectToLogin } from "@/lib/supabase-server";
import SesionNoDisponible from "@/components/SesionNoDisponible";
import OrdenesBandeja from "./OrdenesBandeja";
import type { OrdenListItem, Usuario, Ubicacion, Activo, CategoriaOT, LugarEspecifico, Sociedad } from "@/types/ordenes";
import { LIST_SELECT, ORDENES_PAGE_SIZE } from "@/lib/ordenes-api";
import { chileDateKey } from "./date-utils";

interface PageProps {
  searchParams: Promise<{ id?: string; panel?: string }>;
}

export default async function OrdenesPage({ searchParams }: PageProps) {
  const { id: selectedId, panel } = await searchParams;
  const [sb, auth] = await Promise.all([createServerSupabase(), getServerUser()]);

  // Only a positively-confirmed "no session" redirects. A transient auth
  // failure renders a retry screen instead of silently signing the user out.
  if (shouldRedirectToLogin(auth)) redirect("/login");
  if (!auth.user) return <SesionNoDisponible />;
  const user = auth.user;

  const { data: perfil, error: perfilError } = await sb
    .from("usuarios")
    .select("workspace_id, rol, nombre, plan, plan_status, solo_asignadas")
    .eq("id", user.id)
    .maybeSingle();

  // A failed query is not proof the user has no workspace. Only an actual
  // row with no workspace_id is; anything else would log them out on a blip.
  if (perfilError) return <SesionNoDisponible />;
  if (!perfil?.workspace_id) redirect("/login");
  const wsId = perfil.workspace_id;

  // A `member` with solo_asignadas only sees the OTs assigned to them. This
  // list is server-rendered and handed to the client as `initialOrdenes`, so it
  // has to apply the filter itself — the client-side helper in ordenes-api runs
  // only on subsequent fetches and cannot retro-filter this payload.
  const soloAsignadasId =
    perfil.rol === "member" && perfil.solo_asignadas === true ? user.id : null;

  const [ordenes, usuarios, ubicaciones, lugares, sociedades, activos, categorias] = await Promise.all([
    (() => {
      const q = sb.from("ordenes_trabajo")
        .select(LIST_SELECT)
        .eq("workspace_id", wsId)
        .is("parent_id", null)
        .is("deleted_at", null);
      return (soloAsignadasId ? q.contains("asignados_ids", [soloAsignadasId]) : q)
        .order("created_at", { ascending: false })
        .limit(ORDENES_PAGE_SIZE)
        .then(r => (r.data ?? []) as unknown as OrdenListItem[]);
    })(),

    sb.from("usuarios")
      // Incluye a los dados de baja a proposito: son necesarios para mostrar el
      // nombre de quien hizo una OT vieja. Los selectores de asignacion los
      // filtran por `deleted_at` en la UI; sacarlos de la consulta hacia que el
      // responsable de una OT completada desapareciera de la tarjeta.
      .select("id,nombre,rol,deleted_at")
      .eq("workspace_id", wsId)
      .order("nombre")
      .then(r => (r.data ?? []) as Usuario[]),

    sb.from("ubicaciones")
      .select("id,edificio,detalle,activa,sociedad_id,sociedades(id,nombre)")
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
      .select("id,nombre,numero_serie")
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
      todayKey={chileDateKey()}
    />
  );
}
