import { createClient } from "@/lib/supabase";
import type { Activo, AssetAttachment, AssetCriticality, AssetStatus, Fabricante, Modelo, Proveedor } from "@/types/ordenes";

export const ACTIVO_SELECT = `
  id, workspace_id, nombre, codigo, descripcion, imagen_url,
  ubicacion_id, sociedad_id, fabricante_id, modelo_id, proveedor_id, responsable_id,
  activo_padre_id, criticidad, numero_serie, año_fabricacion,
  estado, codigo_sap, fecha_garantia, archivo_url, archivo_nombre,
  adjuntos, activo, created_at,
  ubicacion:ubicaciones(id, edificio, piso),
  sociedad:sociedades(id, nombre, imagen_url),
  fabricante:fabricantes(id, nombre),
  modelo:modelos(id, nombre),
  proveedor:proveedores(id, nombre),
  responsable:usuarios!responsable_id(id, nombre),
  parent:activos!activo_padre_id(id, nombre, codigo)
`;

export interface ActivoInput {
  nombre: string;
  codigo?: string | null;
  descripcion?: string | null;
  imagen_url?: string | null;
  ubicacion_id?: string | null;
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
  codigo_sap?: string | null;
  fecha_garantia?: string | null;
  archivo_url?: string | null;
  archivo_nombre?: string | null;
  adjuntos?: AssetAttachment[];
}

function cleanInput(input: ActivoInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.nombre !== undefined) out.nombre = input.nombre.trim();
  if (input.codigo !== undefined) out.codigo = input.codigo?.toString().trim() || null;
  if (input.descripcion !== undefined) out.descripcion = input.descripcion?.toString().trim() || null;
  if (input.imagen_url !== undefined) out.imagen_url = input.imagen_url ?? null;
  if (input.ubicacion_id !== undefined) out.ubicacion_id = input.ubicacion_id ?? null;
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
  if (input.codigo_sap !== undefined) out.codigo_sap = input.codigo_sap?.toString().trim() || null;
  if (input.fecha_garantia !== undefined) out.fecha_garantia = input.fecha_garantia ?? null;
  if (input.archivo_url !== undefined) out.archivo_url = input.archivo_url ?? null;
  if (input.archivo_nombre !== undefined) out.archivo_nombre = input.archivo_nombre ?? null;
  if (input.adjuntos !== undefined) out.adjuntos = input.adjuntos;
  return out;
}

export async function createActivo(workspaceId: string, input: ActivoInput): Promise<Activo> {
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

export async function fetchFabricantes(): Promise<Fabricante[]> {
  const sb = createClient();
  const { data, error } = await sb.from("fabricantes").select("id, nombre, pais, created_at").order("nombre");
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
