import { createClient } from "@/lib/supabase";

export interface HojaColumna {
  id: string;
  label: string;
  tipo: "texto" | "numero";
}

export interface Hoja {
  id: string;
  workspace_id: string;
  nombre: string;
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

export async function fetchHojas(workspaceId: string): Promise<Hoja[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hojas_inventario")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Hoja[];
}

export async function createHoja(workspaceId: string, nombre: string, userId: string): Promise<Hoja> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hojas_inventario")
    .insert({ workspace_id: workspaceId, nombre, created_by: userId, columnas: [
      { id: crypto.randomUUID(), label: "Ítem",     tipo: "texto"  },
      { id: crypto.randomUUID(), label: "Cantidad", tipo: "numero" },
      { id: crypto.randomUUID(), label: "Unidad",   tipo: "texto"  },
    ] })
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
