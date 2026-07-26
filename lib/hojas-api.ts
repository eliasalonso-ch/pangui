import { createClient } from "@/lib/supabase";

export interface HojaColumna {
  id: string;
  label: string;
  tipo: "texto" | "numero";
}

export type HojaTipo = "general" | "materiales_usados" | "materiales_solicitados";

export const HOJA_TEMPLATES: Record<HojaTipo, { nombre: string; columnas: Omit<HojaColumna, "id">[] }> = {
  general: { nombre: "Hoja general", columnas: [
    { label: "Ítem", tipo: "texto" }, { label: "Valor", tipo: "texto" }, { label: "Observación", tipo: "texto" },
  ] },
  materiales_usados: { nombre: "Materiales usados", columnas: [
    { label: "Material", tipo: "texto" }, { label: "Cantidad", tipo: "numero" }, { label: "Unidad", tipo: "texto" },
  ] },
  materiales_solicitados: { nombre: "Solicitud de materiales", columnas: [
    { label: "Material", tipo: "texto" }, { label: "Cantidad", tipo: "numero" }, { label: "Unidad", tipo: "texto" }, { label: "Observación", tipo: "texto" },
  ] },
};

export interface Hoja {
  id: string;
  workspace_id: string;
  nombre: string;
  tipo: HojaTipo;
  columnas: HojaColumna[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface HojaFila {
  id: string;
  hoja_id: string;
  workspace_id: string;
  orden: number;
  celdas: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export async function fetchHojas(workspaceId: string, ordenId: string): Promise<Hoja[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hojas_inventario")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("orden_id", ordenId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Hoja[];
}

export async function createHoja(workspaceId: string, tipo: HojaTipo, userId: string, ordenId: string): Promise<Hoja> {
  const sb = createClient();
  const template = HOJA_TEMPLATES[tipo];
  const columnas = template.columnas.map((columna) => ({ ...columna, id: crypto.randomUUID() }));
  const { data, error } = await sb
    .from("hojas_inventario")
    .insert({ workspace_id: workspaceId, nombre: template.nombre, tipo, created_by: userId, orden_id: ordenId, columnas })
    .select()
    .single();
  if (error) throw error;
  return data as Hoja;
}

export async function updateHoja(id: string, patch: Partial<Pick<Hoja, "nombre" | "columnas">>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("hojas_inventario").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteHoja(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("hojas_inventario").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchFilas(hojaId: string): Promise<HojaFila[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hojas_inventario_filas")
    .select("*")
    .eq("hoja_id", hojaId)
    .order("orden");
  if (error) throw error;
  return (data ?? []) as HojaFila[];
}

export async function createFila(hojaId: string, workspaceId: string, orden: number): Promise<HojaFila> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hojas_inventario_filas")
    .insert({ hoja_id: hojaId, workspace_id: workspaceId, orden, celdas: {} })
    .select()
    .single();
  if (error) throw error;
  return data as HojaFila;
}

export async function updateFila(id: string, celdas: Record<string, string>): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from("hojas_inventario_filas")
    .update({ celdas })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteFila(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("hojas_inventario_filas").delete().eq("id", id);
  if (error) throw error;
}
