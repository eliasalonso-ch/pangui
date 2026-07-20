import { createClient } from "@/lib/supabase";
import { ensureActivosCatalogo } from "@/lib/cuotas-client";
import type { Activo, AssetAttachment, AssetCriticality, AssetStatus, Fabricante, Modelo, Proveedor } from "@/types/ordenes";

export const ACTIVO_SELECT = `
  id, workspace_id, nombre, descripcion, imagen_url,
  ubicacion_id, lugar_id, sociedad_id, fabricante_id, modelo_id, proveedor_id, responsable_id,
  activo_padre_id, criticidad, numero_serie, año_fabricacion,
  estado, fecha_garantia, archivo_url, archivo_nombre,
  adjuntos, activo, created_at,
  ubicacion:ubicaciones(id, edificio, detalle),
  lugar:lugares(id, nombre),
  sociedad:sociedades(id, nombre, imagen_url),
  fabricante:fabricantes(id, nombre),
  modelo:modelos(id, nombre),
  proveedor:proveedores(id, nombre),
  responsable:usuarios!responsable_id(id, nombre),
  parent:activos!activo_padre_id(id, nombre)
`;

export interface ActivoInput {
  nombre: string;
  descripcion?: string | null;
  imagen_url?: string | null;
  ubicacion_id?: string | null;
  lugar_id?: string | null;
  sociedad_id?: string | null;
  fabricante_id?: string | null;
  modelo_id?: string | null;
  proveedor_id?: string | null;
  responsable_id?: string | null;
  activo_padre_id?: string | null;
  criticidad?: AssetCriticality | null;
  numero_serie?: string | null;
  año_fabricacion?: number | null;
  estado?: AssetStatus | string | null;
  fecha_garantia?: string | null;
  archivo_url?: string | null;
  archivo_nombre?: string | null;
  adjuntos?: AssetAttachment[];
}

function cleanInput(input: ActivoInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.nombre !== undefined) out.nombre = input.nombre.trim();
  if (input.descripcion !== undefined) out.descripcion = input.descripcion?.toString().trim() || null;
  if (input.imagen_url !== undefined) out.imagen_url = input.imagen_url ?? null;
  if (input.ubicacion_id !== undefined) out.ubicacion_id = input.ubicacion_id ?? null;
  if (input.lugar_id !== undefined) out.lugar_id = input.lugar_id ?? null;
  if (input.sociedad_id !== undefined) out.sociedad_id = input.sociedad_id ?? null;
  if (input.fabricante_id !== undefined) out.fabricante_id = input.fabricante_id ?? null;
  if (input.modelo_id !== undefined) out.modelo_id = input.modelo_id ?? null;
  if (input.proveedor_id !== undefined) out.proveedor_id = input.proveedor_id ?? null;
  if (input.responsable_id !== undefined) out.responsable_id = input.responsable_id ?? null;
  if (input.activo_padre_id !== undefined) out.activo_padre_id = input.activo_padre_id ?? null;
  if (input.criticidad !== undefined) out.criticidad = input.criticidad ?? null;
  if (input.numero_serie !== undefined) out.numero_serie = input.numero_serie?.toString().trim() || null;
  if (input.año_fabricacion !== undefined) out["año_fabricacion"] = input.año_fabricacion ?? null;
  if (input.estado !== undefined) out.estado = input.estado ?? null;
  if (input.fecha_garantia !== undefined) out.fecha_garantia = input.fecha_garantia ?? null;
  if (input.archivo_url !== undefined) out.archivo_url = input.archivo_url ?? null;
  if (input.archivo_nombre !== undefined) out.archivo_nombre = input.archivo_nombre ?? null;
  if (input.adjuntos !== undefined) out.adjuntos = input.adjuntos;
  return out;
}

export async function createActivo(workspaceId: string, input: ActivoInput): Promise<Activo> {
  await ensureActivosCatalogo();
  const sb = createClient();
  const payload: Record<string, unknown> = {
    workspace_id: workspaceId,
    activo: true,
    ...cleanInput(input),
  };
  if (!payload.criticidad) payload.criticidad = "no_critico";
  if (!payload.estado) payload.estado = "operativo";

  const { data, error } = await sb
    .from("activos")
    .insert(payload)
    .select(ACTIVO_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Activo;
}

export async function updateActivo(id: string, input: ActivoInput): Promise<Activo> {
  const sb = createClient();
  const { data, error } = await sb
    .from("activos")
    .update(cleanInput(input))
    .eq("id", id)
    .select(ACTIVO_SELECT)
    .single();

  if (error) throw error;
  return data as unknown as Activo;
}

export async function deleteActivo(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("activos").update({ activo: false }).eq("id", id);
  if (error) throw error;
}

// ── OT history (all OTs linked to an asset) ────────────────────────────────────

const HISTORY_SELECT = `
  id, titulo, numero, estado, tipo_trabajo,
  fecha_inicio, fecha_termino, iniciado_at, completado_en,
  tiempo_total_segundos, parent_id, costo_total, asignados_ids,
  creado_por, completado_por,
  creador:usuarios!creado_por(id, nombre),
  completador:usuarios!completado_por(id, nombre)
`;

export interface ActivoOTHistoryRow {
  id: string;
  titulo: string | null;
  numero: number | null;
  estado: string;
  tipo_trabajo: string | null;
  fecha_inicio: string | null;
  fecha_termino: string | null;
  iniciado_at: string | null;
  completado_en: string | null;
  tiempo_total_segundos: number | null;
  parent_id: string | null;
  costo_total: number | null;
  asignados_ids: string[] | null;
  creado_por: string | null;
  completado_por: string | null;
  creador?: { id: string; nombre: string } | null;
  completador?: { id: string; nombre: string } | null;
}

/** All OTs (incl. sub-OTs) that touched this activo, newest completion first. */
export async function fetchActivoOTHistory(activoId: string, limit = 200): Promise<ActivoOTHistoryRow[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("ordenes_trabajo")
    .select(HISTORY_SELECT)
    .eq("activo_id", activoId)
    .order("completado_en", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ActivoOTHistoryRow[];
}

// ── Asset activity log (actividad_activo) ──────────────────────────────────────

export type ActivoActividadTipo =
  | "creado"
  | "editado"
  | "estado_cambiado"
  | "eliminado"
  | "ot_vinculada"
  | "ot_completada";

export interface ActivoActividadRow {
  id: string;
  activo_id: string;
  usuario_id: string | null;
  tipo: ActivoActividadTipo;
  comentario: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
  usuario?: { id: string; nombre: string } | null;
}

const ACTIVIDAD_SELECT = `
  id, activo_id, usuario_id, tipo, comentario, meta, created_at,
  usuario:usuarios!usuario_id(id, nombre)
`;

/** One page of an asset's activity log, newest first. */
export async function fetchActivoActividadPage(
  activoId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: ActivoActividadRow[]; nextPage: number | null }> {
  const sb = createClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error } = await sb
    .from("actividad_activo")
    .select(ACTIVIDAD_SELECT)
    .eq("activo_id", activoId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  const rows = (data ?? []) as unknown as ActivoActividadRow[];
  const nextPage = rows.length === pageSize ? page + 1 : null;
  return { rows, nextPage };
}

export async function fetchFabricantes(): Promise<Fabricante[]> {
  const sb = createClient();
  const { data, error } = await sb.from("fabricantes").select("id, nombre, created_at").order("nombre");
  if (error) throw error;
  return (data ?? []) as Fabricante[];
}

export async function fetchModelos(fabricanteId?: string | null): Promise<Modelo[]> {
  const sb = createClient();
  let q = sb.from("modelos").select("id, fabricante_id, nombre, created_at, fabricante:fabricantes(id, nombre)").order("nombre");
  if (fabricanteId) q = q.eq("fabricante_id", fabricanteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Modelo[];
}

export async function fetchProveedores(workspaceId: string): Promise<Proveedor[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("proveedores")
    .select("id, workspace_id, nombre, contacto, email, telefono, created_at")
    .eq("workspace_id", workspaceId)
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Proveedor[];
}
