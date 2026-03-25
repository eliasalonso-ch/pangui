import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import BandejaOrdenesClient from "./BandejaOrdenesClient";

export default async function BandejaOrdenesPage() {
  const sb = await createServerSupabase();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await sb
    .from("usuarios")
    .select("workspace_id, plan_status, trial_end, rol, plan")
    .eq("id", user.id)
    .maybeSingle();

  const plantaId = perfil?.workspace_id ?? null;

  // Compute trial banner data server-side
  let trialDays = null;
  let trialEnd = null;
  if (perfil?.plan_status === "trial" && perfil?.trial_end) {
    const days = Math.ceil((new Date(perfil.trial_end) - Date.now()) / 86400000);
    if (days <= 1) {
      trialDays = Math.max(0, days);
      trialEnd = perfil.trial_end;
    }
  }

  if (!plantaId) {
    return (
      <BandejaOrdenesClient
        myId={user.id}
        myRol={perfil?.rol ?? null}
        plantaId={null}
        plan={perfil?.plan ?? "basic"}
        planStatus={perfil?.plan_status ?? null}
        trialDays={trialDays}
        trialEnd={trialEnd}
        initialOrdenes={[]}
        initialUsuarios={[]}
        initialUbicaciones={[]}
        initialActivos={[]}
        initialCategorias={[]}
        initialPlantillas={[]}
        initialPartesCatalogo={[]}
      />
    );
  }

  // Parallel fetch of all catalog data + ordenes (last 200 rows)
  const results = await Promise.allSettled([
    sb.from("ordenes_trabajo")
      .select("id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo, fecha_termino, recurrencia, created_at, categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids, categorias_ot(nombre,icono,color), ubicaciones(edificio), activos(nombre)")
      .eq("workspace_id", plantaId)
      .order("created_at", { ascending: false })
      .limit(200),
    sb.from("ubicaciones").select("id, edificio, piso, detalle").eq("workspace_id", plantaId).eq("activa", true),
    sb.from("activos").select("id, nombre, codigo").eq("workspace_id", plantaId).eq("activo", true),
    sb.from("categorias_ot").select("id, nombre, icono, color").or(`workspace_id.is.null,workspace_id.eq.${plantaId}`).order("nombre"),
    sb.from("plantillas_procedimiento").select("id, nombre").eq("workspace_id", plantaId).order("nombre"),
    sb.from("partes").select("id, nombre, unidad, codigo, stock_actual").eq("workspace_id", plantaId).eq("activo", true).order("nombre"),
    sb.from("usuarios").select("id, nombre, rol").eq("workspace_id", plantaId).order("nombre"),
  ]);

  const val = (r) => (r.status === "fulfilled" ? r.value?.data : null);

  const ordenes        = val(results[0]) ?? [];
  const ubicaciones    = val(results[1]) ?? [];
  const activos        = val(results[2]) ?? [];
  const categorias     = val(results[3]) ?? [];
  const plantillas     = val(results[4]) ?? [];
  const partesCatalogo = val(results[5]) ?? [];
  const usuarios       = val(results[6]) ?? [];

  return (
    <BandejaOrdenesClient
      myId={user.id}
      myRol={perfil?.rol ?? null}
      plantaId={plantaId}
      plan={perfil?.plan ?? "basic"}
      planStatus={perfil?.plan_status ?? null}
      trialDays={trialDays}
      trialEnd={trialEnd}
      initialOrdenes={ordenes}
      initialUsuarios={usuarios}
      initialUbicaciones={ubicaciones}
      initialActivos={activos}
      initialCategorias={categorias}
      initialPlantillas={plantillas}
      initialPartesCatalogo={partesCatalogo}
    />
  );
}
