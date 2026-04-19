import { createClient } from "@/lib/supabase";
import type {
  OrdenTrabajo, OrdenListItem, ActividadOT, ActividadTipo,
  Estado, Prioridad, TipoTrabajo, Recurrencia,
} from "@/types/ordenes";

// ── Desc-meta helpers ─────────────────────────────────────────────────────────

export interface DescMeta {
  nOT:            string | null;
  solicitante:    string | null;
  hito:           string | null;
  ubicacionTexto: string | null;
  lugar:          string | null;
  descripcion:    string | null;
}

export function parseDescMeta(raw: string | null): DescMeta {
  const empty: DescMeta = { nOT: null, solicitante: null, hito: null, ubicacionTexto: null, lugar: null, descripcion: null };
  if (!raw) return empty;
  const parts = raw.split("\n\n");
  const firstLine = parts[0];
  const rest = parts.slice(1).join("\n\n") || null;
  const hasMeta =
    firstLine.includes("N° OT: ") ||
    firstLine.includes("Solicitante: ") ||
    firstLine.includes("Hito: ") ||
    firstLine.includes("Ubicación: ") ||
    firstLine.includes("Lugar: ");
  if (!hasMeta) return { ...empty, descripcion: raw };
  const result: DescMeta = { ...empty, descripcion: rest };
  firstLine.split(" | ").forEach(seg => {
    if (seg.startsWith("N° OT: "))      result.nOT = seg.slice("N° OT: ".length);
    if (seg.startsWith("Solicitante: "))result.solicitante = seg.slice("Solicitante: ".length);
    if (seg.startsWith("Hito: "))       result.hito = seg.slice("Hito: ".length);
    if (seg.startsWith("Ubicación: "))  result.ubicacionTexto = seg.slice("Ubicación: ".length);
    if (seg.startsWith("Lugar: "))      result.lugar = seg.slice("Lugar: ".length);
  });
  return result;
}

export function buildDescripcion(opts: {
  nOT: string;
  solicitante: string;
  hito: string;
  body: string;
}): string {
  const segs: string[] = [];
  if (opts.nOT.trim())          segs.push(`N° OT: ${opts.nOT.trim()}`);
  if (opts.solicitante.trim())  segs.push(`Solicitante: ${opts.solicitante.trim()}`);
  if (opts.hito.trim())         segs.push(`Hito: ${opts.hito.trim()}`);
  const header = segs.join(" | ");
  const body = opts.body.trim();
  if (header && body) return `${header}\n\n${body}`;
  if (header) return header;
  return body;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcProximaEjecucion(recurrencia: Recurrencia): string | null {
  if (recurrencia === "ninguna") return null;
  const d = new Date();
  switch (recurrencia) {
    case "diaria":    d.setDate(d.getDate() + 1); break;
    case "semanal":   d.setDate(d.getDate() + 7); break;
    case "quincenal": d.setDate(d.getDate() + 15); break;
    case "mensual":   d.setMonth(d.getMonth() + 1); break;
  }
  return d.toISOString();
}

// ── Select fragments ──────────────────────────────────────────────────────────

export const ORDEN_SELECT = `
  id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo,
  fecha_inicio, fecha_termino, created_at, updated_at,
  creado_por, asignados_ids, workspace_id,
  numero, categoria_id, ubicacion_id, activo_id, lugar_id, sociedad_id,
  iniciado_at, pausado_at, en_ejecucion, tiempo_total_segundos,
  recurrencia, proxima_ejecucion, parent_id,
  imagen_url, fotos_urls,
  activos (id, nombre, codigo),
  ubicaciones (id, edificio, piso, sociedad_id, sociedades(nombre)),
  lugar:lugares!lugar_id(id, nombre, imagen_url),
  sociedad:sociedades!sociedad_id(id, nombre, imagen_url),
  categorias_ot (id, nombre, icono, color),
  creador:usuarios!creado_por (id, nombre)
`;

export const LIST_SELECT = `
  id, titulo, descripcion, estado, prioridad, tipo, tipo_trabajo,
  fecha_termino, recurrencia, created_at,
  categoria_id, ubicacion_id, activo_id, creado_por, asignados_ids,
  numero, parent_id,
  categorias_ot (nombre, icono, color),
  ubicaciones (edificio, piso),
  activos (nombre)
`;

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function fetchOrdenes(wsId: string): Promise<OrdenListItem[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(LIST_SELECT)
    .eq("workspace_id", wsId)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as unknown as OrdenListItem[];
}

export async function fetchOrden(id: string): Promise<OrdenTrabajo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(ORDEN_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as OrdenTrabajo;
}

export async function fetchSubOrdenes(parentId: string): Promise<OrdenTrabajo[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(ORDEN_SELECT)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as OrdenTrabajo[];
}

export async function fetchActividad(ordenId: string): Promise<ActividadOT[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("actividad_ot")
    .select("id, orden_id, tipo, comentario, usuario_id, created_at, usuario:usuarios!usuario_id(id, nombre)")
    .eq("orden_id", ordenId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ActividadOT[];
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createOrden(payload: {
  workspaceId: string;
  creadoPor: string;
  titulo: string;
  descripcion?: string;
  prioridad: Prioridad;
  tipo_trabajo: TipoTrabajo | "";
  categoria_id?: string | null;
  recurrencia?: Recurrencia;
  ubicacion_id?: string | null;
  lugar_id?: string | null;
  sociedad_id?: string | null;
  activo_id?: string | null;
  asignados_ids?: string[] | null;
  fecha_inicio?: string | null;
  fecha_termino?: string | null;
}): Promise<OrdenTrabajo> {
  const sb = createClient();
  const recurrencia = payload.recurrencia ?? "ninguna";
  const proxima_ejecucion = calcProximaEjecucion(recurrencia);

  const { data, error } = await sb
    .from("ordenes_trabajo")
    .insert({
      workspace_id:       payload.workspaceId,
      creado_por:         payload.creadoPor,
      titulo:             payload.titulo,
      descripcion:        payload.descripcion ?? "",
      tipo:               "solicitud",
      tipo_trabajo:       payload.tipo_trabajo || "reactiva",
      estado:             "pendiente",
      prioridad:          payload.prioridad,
      recurrencia,
      proxima_ejecucion,
      estado_cobro:       "no_cobrable",
      ...(payload.categoria_id  ? { categoria_id:  payload.categoria_id  } : {}),
      ...(payload.ubicacion_id  ? { ubicacion_id:  payload.ubicacion_id  } : {}),
      ...(payload.lugar_id      ? { lugar_id:      payload.lugar_id      } : {}),
      ...(payload.sociedad_id   ? { sociedad_id:   payload.sociedad_id   } : {}),
      ...(payload.activo_id     ? { activo_id:     payload.activo_id     } : {}),
      ...(payload.asignados_ids?.length ? { asignados_ids: payload.asignados_ids } : {}),
      ...(payload.fecha_inicio  ? { fecha_inicio:  payload.fecha_inicio  } : {}),
      ...(payload.fecha_termino ? { fecha_termino: payload.fecha_termino } : {}),
    })
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;
  const orden = data as unknown as OrdenTrabajo;

  await insertActividad(orden.id, payload.creadoPor, "creado", payload.titulo);
  if (payload.asignados_ids?.length) {
    await insertActividad(orden.id, payload.creadoPor, "asignado", payload.asignados_ids.join(","));
  }
  return orden;
}

export async function createSubOrden(
  parentId: string,
  titulo: string,
  parent: OrdenTrabajo,
): Promise<OrdenTrabajo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .insert({
      workspace_id:  parent.workspace_id,
      creado_por:    parent.creado_por,
      titulo:        titulo.trim(),
      descripcion:   "",
      tipo:          "solicitud",
      tipo_trabajo:  parent.tipo_trabajo ?? "reactiva",
      estado:        "pendiente",
      prioridad:     parent.prioridad,
      recurrencia:   "ninguna",
      estado_cobro:  "no_cobrable",
      parent_id:     parentId,
      asignados_ids: parent.asignados_ids ?? [],
      ubicacion_id:  parent.ubicacion_id ?? null,
      lugar_id:      parent.lugar_id ?? null,
      sociedad_id:   parent.sociedad_id ?? null,
      fecha_inicio:  parent.fecha_inicio ?? null,
      fecha_termino: parent.fecha_termino ?? null,
    })
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;
  const sub = data as unknown as OrdenTrabajo;
  await insertActividad(sub.id, parent.creado_por ?? "", "creado", titulo);
  return sub;
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateOrden(
  id: string,
  userId: string,
  payload: {
    titulo?: string;
    descripcion?: string;
    prioridad?: Prioridad;
    tipo_trabajo?: TipoTrabajo | null;
    categoria_id?: string | null;
    recurrencia?: Recurrencia;
    proxima_ejecucion?: string | null;
    fecha_inicio?: string | null;
    fecha_termino?: string | null;
    ubicacion_id?: string | null;
    lugar_id?: string | null;
    sociedad_id?: string | null;
    activo_id?: string | null;
    asignados_ids?: string[] | null;
  },
  prevAsignadosIds?: string[] | null,
): Promise<OrdenTrabajo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .update(payload)
    .eq("id", id)
    .select(ORDEN_SELECT)
    .single();

  if (error) throw error;

  if (payload.prioridad !== undefined) {
    const PRIORIDAD_LABELS: Record<Prioridad, string> = {
      ninguna: "Sin prioridad", baja: "Baja", media: "Media", alta: "Alta", urgente: "Urgente",
    };
    await insertActividad(id, userId, "prioridad_cambiada", PRIORIDAD_LABELS[payload.prioridad]);
  }
  if (payload.ubicacion_id !== undefined || payload.lugar_id !== undefined) {
    await insertActividad(id, userId, "ubicacion_cambiada");
  }
  if (payload.asignados_ids !== undefined) {
    const prev = new Set(prevAsignadosIds ?? []);
    const next = new Set(payload.asignados_ids ?? []);
    const added = [...next].filter((uid) => !prev.has(uid));
    if (added.length > 0) {
      await insertActividad(id, userId, "asignado", added.join(","));
    }
  }
  if (payload.titulo !== undefined || payload.descripcion !== undefined || payload.tipo_trabajo !== undefined) {
    await insertActividad(id, userId, "editado");
  }
  return data as unknown as OrdenTrabajo;
}

export async function updateOrdenEstado(id: string, estado: Estado, userId: string): Promise<void> {
  const ESTADO_LABELS: Record<Estado, string> = {
    pendiente:   "Abierta",
    en_espera:   "En espera",
    en_curso:    "En curso",
    completado:  "Completada",
  };
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").update({ estado }).eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "estado_cambiado", ESTADO_LABELS[estado]);
}

export async function updateOrdenPrioridad(id: string, prioridad: Prioridad, userId: string): Promise<void> {
  const PRIORIDAD_LABELS: Record<Prioridad, string> = {
    ninguna: "Sin prioridad",
    baja:    "Baja",
    media:   "Media",
    alta:    "Alta",
    urgente: "Urgente",
  };
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").update({ prioridad }).eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "prioridad_cambiada", PRIORIDAD_LABELS[prioridad]);
}

// ── Timer operations ──────────────────────────────────────────────────────────

export async function iniciarOrden(id: string, userId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ en_ejecucion: true, iniciado_at: new Date().toISOString(), estado: "en_curso" })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "iniciado");
}

export async function pausarOrden(
  id: string,
  userId: string,
  comentario: string,
  segundosAcumulados: number,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion:          false,
      pausado_at:            new Date().toISOString(),
      tiempo_total_segundos: segundosAcumulados,
      estado:                "en_espera",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "pausado", comentario || undefined);
}

export async function reanudarOrden(id: string, userId: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion: true,
      pausado_at:   null,
      iniciado_at:  new Date().toISOString(),
      estado:       "en_curso",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "reanudado");
}

export async function completarOrden(
  id: string,
  userId: string,
  comentario: string | undefined,
  segundosAcumulados: number,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({
      en_ejecucion:          false,
      fecha_termino:         new Date().toISOString(),
      tiempo_total_segundos: segundosAcumulados,
      estado:                "completado",
    })
    .eq("id", id);
  if (error) throw error;
  await insertActividad(id, userId, "completado", comentario);
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteOrden(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("ordenes_trabajo").delete().eq("id", id);
  if (error) throw error;
}

// ── Photos ────────────────────────────────────────────────────────────────────

// ── Storage upload ────────────────────────────────────────────────────────────

export async function uploadOrdenFoto(orderId: string, file: File): Promise<string> {
  const { uploadToR2 } = await import("@/lib/r2");
  return uploadToR2(file, `ordenes/${orderId}`);
}

export async function addOrdenFoto(orderId: string, url: string): Promise<void> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("ordenes_trabajo")
    .select("fotos_urls")
    .eq("id", orderId)
    .single();
  if (fetchError) throw fetchError;

  const current: string[] = (data as { fotos_urls: string[] | null }).fotos_urls ?? [];
  const { error } = await sb
    .from("ordenes_trabajo")
    .update({ fotos_urls: [...current, url] })
    .eq("id", orderId);
  if (error) throw error;
}

export async function removeOrdenFoto(orderId: string, url: string): Promise<void> {
  const sb = createClient();
  const { data, error: fetchError } = await sb
    .from("ordenes_trabajo")
    .select("imagen_url, fotos_urls")
    .eq("id", orderId)
    .single();
  if (fetchError) throw fetchError;

  const row = data as { imagen_url: string | null; fotos_urls: string[] | null };

  if (row.imagen_url === url) {
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({ imagen_url: null })
      .eq("id", orderId);
    if (error) throw error;
  } else {
    const updated = (row.fotos_urls ?? []).filter((u) => u !== url);
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({ fotos_urls: updated })
      .eq("id", orderId);
    if (error) throw error;
  }

  const { deleteFromR2 } = await import("@/lib/r2");
  await deleteFromR2(url);
}

// ── Activity / Comments ───────────────────────────────────────────────────────

export async function addComentario(ordenId: string, userId: string, comentario: string): Promise<void> {
  await insertActividad(ordenId, userId, "comentario", comentario);
}

export async function insertActividad(
  ordenId: string,
  userId: string,
  tipo: ActividadTipo,
  comentario?: string,
): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("actividad_ot").insert({
    orden_id:   ordenId,
    usuario_id: userId,
    tipo,
    comentario: comentario ?? null,
  });
  if (error) throw error;
}
