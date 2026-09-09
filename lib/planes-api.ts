import { createClient } from "@/lib/supabase";
import type {
  PlanMantencion,
  PlanListItem,
  PlanOcurrencia,
  PlanForm,
  PlanMaterial,
  PlanMaterialForm,
} from "@/types/planes";

const PLAN_SELECT = `
  id, workspace_id, numero, nombre, descripcion, activo_id,
  recurrencia, recurrencia_config, fecha_inicio, fecha_fin, hora_vencimiento,
  dias_apertura_previa, dias_aviso_previo, horizonte_dias,
  titulo_ot, descripcion_ot, categoria_id, ubicacion_id,
  tipo_trabajo, prioridad, proveedor_id, imagen_url, adjuntos,
  asignados_ids, procedimiento_ids,
  duracion_estimada_horas, activo, creado_por, actualizado_por, created_at, updated_at,
  creador:usuarios!creado_por(id, nombre),
  actualizador:usuarios!actualizado_por(id, nombre)
`;

/**
 * Lista los planes del workspace con el nombre del activo y el próximo
 * vencimiento pendiente.
 *
 * La próxima fecha se resuelve en una segunda consulta en vez de embeberla:
 * PostgREST no sabe traer "la primera fila hija que cumple X ordenada por Y",
 * y traer todas las ocurrencias para quedarse con una es exactamente el patrón
 * de egreso que ya costó caro en /ordenes.
 */
/** Filas por página en la lista de planes. */
export const PLANES_PAGE_SIZE = 20;

/**
 * Una página de planes. `desde` es el offset: la lista crece de a
 * PLANES_PAGE_SIZE y el llamador sabe si hay más porque recibió una página
 * completa.
 *
 * Se pagina por offset y no por cursor porque el orden es `created_at desc` y
 * la lista casi no cambia mientras se navega; un cursor solo agregaría estado
 * a cambio de robustez que aquí no hace falta.
 */
export async function listPlanes(
  incluirInactivos = false,
  desde = 0,
  limite = PLANES_PAGE_SIZE,
): Promise<PlanListItem[]> {
  const sb = createClient();

  let q = sb
    .from("planes_mantencion")
    .select(`
      id, numero, nombre, descripcion, activo_id, recurrencia, recurrencia_config,
      fecha_inicio, fecha_fin, activo, dias_aviso_previo, created_at,
      activos ( nombre, imagen_url, numero_serie )
    `)
    .order("created_at", { ascending: false })
    .range(desde, desde + limite - 1);

  if (!incluirInactivos) q = q.eq("activo", true);

  const { data, error } = await q;
  if (error) throw error;

  const filas = (data ?? []) as any[];
  if (filas.length === 0) return [];

  // Una sola consulta para todos los planes: se piden las ocurrencias
  // pendientes ordenadas por fecha y se toma la primera de cada plan.
  const { data: ocurrencias, error: ocErr } = await sb
    .from("plan_ocurrencias")
    .select("plan_id, fecha_programada")
    .in("plan_id", filas.map(f => f.id))
    .in("estado", ["programada", "avisada"])
    .gte("fecha_programada", new Date().toISOString().slice(0, 10))
    .order("fecha_programada", { ascending: true });
  if (ocErr) throw ocErr;

  const proxima = new Map<string, string>();
  for (const o of (ocurrencias ?? []) as any[]) {
    if (!proxima.has(o.plan_id)) proxima.set(o.plan_id, o.fecha_programada);
  }

  return filas.map(f => ({
    id: f.id,
    numero: f.numero,
    nombre: f.nombre,
    descripcion: f.descripcion,
    activo_id: f.activo_id,
    recurrencia: f.recurrencia,
    recurrencia_config: f.recurrencia_config,
    fecha_inicio: f.fecha_inicio,
    fecha_fin: f.fecha_fin,
    activo: f.activo,
    dias_aviso_previo: f.dias_aviso_previo,
    created_at: f.created_at,
    activo_nombre: f.activos?.nombre ?? null,
    activo_imagen: f.activos?.imagen_url ?? null,
    activo_serie: f.activos?.numero_serie ?? null,
    proxima_fecha: proxima.get(f.id) ?? null,
  }));
}

export async function getPlan(id: string): Promise<PlanMantencion | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from("planes_mantencion")
    .select(PLAN_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PlanMantencion) ?? null;
}

/**
 * El plan con lo que el panel de detalle necesita mostrar: nombres del activo,
 * categoría, ubicación y asignados, más las ocurrencias.
 *
 * Los nombres se resuelven aquí y no en el componente porque son cuatro
 * consultas que el panel pediría igual; hacerlas juntas evita la cascada de
 * spinners y deja al componente solo pintando.
 */
export async function getPlanDetalle(id: string): Promise<{
  plan: PlanMantencion;
  activoNombre: string | null;
  activoImagen: string | null;
  activoEstado: string | null;
  categoriaNombre: string | null;
  ubicacionNombre: string | null;
  asignados: { id: string; nombre: string }[];
  ocurrencias: PlanOcurrencia[];
} | null> {
  const sb = createClient();

  const { data, error } = await sb
    .from("planes_mantencion")
    .select(`${PLAN_SELECT}, activos(nombre, imagen_url, estado), categorias_ot(nombre), ubicaciones(edificio)`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const fila = data as any;
  const plan = fila as unknown as PlanMantencion;

  // Los asignados son un uuid[] en la fila, no una relación, así que no se
  // pueden embeber: se resuelven aparte y solo si hay alguno.
  let asignados: { id: string; nombre: string }[] = [];
  if (plan.asignados_ids?.length) {
    const { data: usrs } = await sb
      .from("usuarios")
      .select("id, nombre")
      .in("id", plan.asignados_ids);
    // Se ordenan como quedaron en el plan, no como los devuelve la base.
    const porId = new Map((usrs ?? []).map((u: any) => [u.id, u.nombre]));
    asignados = plan.asignados_ids
      .filter(uid => porId.has(uid))
      .map(uid => ({ id: uid, nombre: porId.get(uid)! }));
  }

  const ocurrencias = await listOcurrencias(id);

  return {
    plan,
    activoNombre: fila.activos?.nombre ?? null,
    activoImagen: fila.activos?.imagen_url ?? null,
    activoEstado: fila.activos?.estado ?? null,
    categoriaNombre: fila.categorias_ot?.nombre ?? null,
    ubicacionNombre: fila.ubicaciones?.edificio ?? null,
    asignados,
    ocurrencias,
  };
}

/**
 * Materiales del plan, con lo que hace falta para decidir una compra: nombre,
 * unidad y stock actual del catálogo.
 */
export async function listPlanMateriales(planId: string): Promise<PlanMaterial[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("plan_materiales")
    .select("id, plan_id, parte_id, cantidad, partes ( nombre, unidad, stock_actual, imagen_url )")
    .eq("plan_id", planId);
  if (error) throw error;

  return ((data ?? []) as any[]).map(m => ({
    id: m.id,
    plan_id: m.plan_id,
    parte_id: m.parte_id,
    cantidad: Number(m.cantidad),
    nombre: m.partes?.nombre ?? "Material",
    unidad: m.partes?.unidad ?? null,
    stock_actual: m.partes?.stock_actual != null ? Number(m.partes.stock_actual) : null,
    imagen_url: m.partes?.imagen_url ?? null,
  }));
}

/**
 * Reemplaza los materiales del plan por la lista dada.
 *
 * Borrar y reinsertar en vez de calcular el diff: son pocas filas y el estado
 * final es lo único que importa. El UNIQUE (plan_id, parte_id) impide duplicar
 * el mismo insumo si la UI lo dejara pasar.
 */
export async function setPlanMateriales(
  planId: string,
  materiales: PlanMaterialForm[],
): Promise<void> {
  const sb = createClient();

  const { error: delErr } = await sb.from("plan_materiales").delete().eq("plan_id", planId);
  if (delErr) throw delErr;

  const filas = materiales
    .filter(m => m.parte_id && m.cantidad > 0)
    .map(m => ({ plan_id: planId, parte_id: m.parte_id, cantidad: m.cantidad }));
  if (filas.length === 0) return;

  const { error } = await sb.from("plan_materiales").insert(filas);
  if (error) throw error;
}

/** Una mantención futura que todavía no tiene OT, lista para pintar. */
export interface OcurrenciaFutura {
  id: string;
  plan_id: string;
  plan_numero: number | null;
  fecha_programada: string;
  fecha_apertura: string;
  estado: string;
  titulo: string;
  activo_nombre: string | null;
  prioridad: string | null;
  tipo_trabajo: string | null;
}

/**
 * Mantenciones planificadas que aún no se convirtieron en OT.
 *
 * El calendario las pinta como previsualización, igual que las recurrentes.
 * A diferencia de esas —que se calculan en el cliente proyectando la
 * recurrencia— estas ya existen como filas, así que basta con leerlas: la
 * fecha que muestra el calendario es exactamente la que el cron va a usar.
 *
 * Se excluyen las que ya tienen orden_id: esas se ven como OT real.
 */
export async function listOcurrenciasFuturas(
  desde: string,
  hasta: string,
): Promise<OcurrenciaFutura[]> {
  const sb = createClient();

  const { data, error } = await sb
    .from("plan_ocurrencias")
    .select(`
      id, plan_id, fecha_programada, fecha_apertura, estado,
      planes_mantencion ( numero, nombre, titulo_ot, prioridad, tipo_trabajo, activo, activos ( nombre ) )
    `)
    .is("orden_id", null)
    .in("estado", ["programada", "avisada"])
    .gte("fecha_programada", desde)
    .lte("fecha_programada", hasta)
    .order("fecha_programada");
  if (error) throw error;

  return ((data ?? []) as any[])
    // Un plan pausado deja de generar: mostrar sus fechas prometería trabajo
    // que no va a existir.
    .filter(o => o.planes_mantencion?.activo)
    .map(o => {
      const p = o.planes_mantencion;
      return {
        id: o.id,
        plan_id: o.plan_id,
        plan_numero: p?.numero ?? null,
        fecha_programada: o.fecha_programada,
        fecha_apertura: o.fecha_apertura,
        estado: o.estado,
        titulo: (p?.titulo_ot?.trim() || p?.nombre) ?? "Mantención",
        activo_nombre: p?.activos?.nombre ?? null,
        prioridad: p?.prioridad ?? null,
        tipo_trabajo: p?.tipo_trabajo ?? null,
      };
    });
}

export async function listOcurrencias(planId: string): Promise<PlanOcurrencia[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("plan_ocurrencias")
    .select("*")
    .eq("plan_id", planId)
    .order("iteracion", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlanOcurrencia[];
}

/**
 * Crea el plan y materializa sus primeras ocurrencias.
 *
 * El RPC va después del insert y no dentro de un trigger a propósito: si
 * fallara, el plan queda creado y sin fechas — un estado visible y reparable
 * (volver a llamar el RPC) en vez de un insert que se revierte entero y deja al
 * usuario sin saber qué pasó. El RPC es idempotente, así que reintentarlo es
 * seguro.
 */
export async function createPlan(form: PlanForm): Promise<PlanMantencion> {
  const sb = createClient();

  const { data: userRes } = await sb.auth.getUser();
  const uid = userRes?.user?.id ?? null;

  const { data: perfil, error: perfilErr } = await sb
    .from("usuarios")
    .select("workspace_id")
    .eq("id", uid ?? "")
    .maybeSingle();
  if (perfilErr) throw perfilErr;
  if (!perfil?.workspace_id) throw new Error("No se pudo determinar el espacio de trabajo.");

  const { data, error } = await sb
    .from("planes_mantencion")
    .insert({
      workspace_id: perfil.workspace_id,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion?.trim() || null,
      activo_id: form.activo_id,
      recurrencia: form.recurrencia,
      recurrencia_config: form.recurrencia_config ?? null,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
      hora_vencimiento: form.hora_vencimiento || null,
      dias_apertura_previa: form.dias_apertura_previa ?? 1,
      dias_aviso_previo: form.dias_aviso_previo ?? 30,
      horizonte_dias: form.horizonte_dias ?? 365,
      titulo_ot: form.titulo_ot?.trim() || null,
      descripcion_ot: form.descripcion_ot?.trim() || null,
      categoria_id: form.categoria_id || null,
      ubicacion_id: form.ubicacion_id || null,
      // Siempre preventiva: la base lo exige y los KPIs dependen de ello.
      tipo_trabajo: "preventiva",
      proveedor_id: form.proveedor_id || null,
      imagen_url: form.imagen_url || null,
      adjuntos: form.adjuntos ?? [],
      prioridad: form.prioridad ?? null,
      asignados_ids: form.asignados_ids ?? [],
      procedimiento_ids: form.procedimiento_ids ?? [],
      duracion_estimada_horas: form.duracion_estimada_horas ?? null,
      creado_por: uid,
    })
    .select(PLAN_SELECT)
    .single();
  if (error) throw error;

  const plan = data as unknown as PlanMantencion;

  if (form.materiales?.length) {
    await setPlanMateriales(plan.id, form.materiales);
  }

  const { error: rpcErr } = await sb.rpc("plan_materializar_ocurrencias", {
    p_plan_id: plan.id,
    p_horizonte_dias: null,
  });
  if (rpcErr) {
    // No se relanza: el plan existe y es válido. La pantalla avisa que las
    // fechas quedaron pendientes de generar.
    console.error("[planes] no se pudieron materializar las ocurrencias", rpcErr);
  }

  return plan;
}

/**
 * Guarda cambios del plan y resincroniza sus fechas futuras.
 *
 * Cambiar la recurrencia, la fecha de inicio o el offset de apertura invalida
 * las ocurrencias ya calculadas, así que se borran y se vuelven a generar. Solo
 * las PENDIENTES: una ocurrencia que ya generó su OT es historia y se conserva,
 * porque borrarla dejaría a esa orden huérfana de la fecha que la originó.
 *
 * `reprogramar` es explícito y no se deduce del patch: editar solo el título de
 * la OT no tiene por qué tocar el calendario.
 */
export async function updatePlan(
  id: string,
  patch: Partial<PlanForm>,
  reprogramar = false,
): Promise<void> {
  const sb = createClient();

  // `materiales` no es una columna del plan: se guarda en su propia tabla y no
  // debe viajar en el UPDATE.
  const { materiales, ...resto } = patch;
  const limpio: Record<string, unknown> = { ...resto };
  if (typeof limpio.nombre === "string") limpio.nombre = limpio.nombre.trim();
  for (const k of ["descripcion", "titulo_ot", "descripcion_ot"]) {
    if (typeof limpio[k] === "string") limpio[k] = (limpio[k] as string).trim() || null;
  }
  for (const k of ["fecha_fin", "hora_vencimiento", "categoria_id", "ubicacion_id"]) {
    if (limpio[k] === "") limpio[k] = null;
  }

  const { error } = await sb.from("planes_mantencion").update(limpio).eq("id", id);
  if (error) throw error;

  if (materiales) await setPlanMateriales(id, materiales);

  if (!reprogramar) return;

  const { error: delErr } = await sb
    .from("plan_ocurrencias")
    .delete()
    .eq("plan_id", id)
    .in("estado", ["programada", "avisada"])
    .is("orden_id", null);
  if (delErr) throw delErr;

  const { error: rpcErr } = await sb.rpc("plan_materializar_ocurrencias", {
    p_plan_id: id,
    p_horizonte_dias: null,
  });
  if (rpcErr) throw rpcErr;
}

/**
 * Pausar en vez de borrar: un plan archivado deja de generar ocurrencias pero
 * conserva el historial de lo que ya se ejecutó bajo él.
 */
export async function archivePlan(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("planes_mantencion").update({ activo: false }).eq("id", id);
  if (error) throw error;
}

/**
 * Borra el plan definitivamente.
 *
 * Sus ocurrencias se van con él por el ON DELETE CASCADE, pero las órdenes de
 * trabajo que alcanzó a generar NO: esa relación es al revés
 * (plan_ocurrencias.orden_id ON DELETE SET NULL), así que el trabajo ya hecho y
 * su historial sobreviven al plan que los originó.
 *
 * Distinto de archivePlan: pausar conserva el plan y sus fechas para poder
 * reactivarlo; esto lo elimina. Para dejar de generar órdenes, pausar es lo
 * correcto casi siempre.
 */
export async function deletePlan(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("planes_mantencion").delete().eq("id", id);
  if (error) throw error;
}

/** Rellena el horizonte de un plan. Idempotente. */
export async function materializarOcurrencias(planId: string, horizonteDias?: number): Promise<number> {
  const sb = createClient();
  const { data, error } = await sb.rpc("plan_materializar_ocurrencias", {
    p_plan_id: planId,
    p_horizonte_dias: horizonteDias ?? null,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
