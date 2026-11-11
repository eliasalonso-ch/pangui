import { createClient } from "@/lib/supabase";
import { ELECTRILAM_WORKSPACE_ID } from "@/lib/itos-gate";
import { normMaterial, type Uso } from "@/lib/materiales-busqueda";

/**
 * Catálogo de códigos de material para autocompletar en la hoja de cobro.
 *
 * Acá viven SÓLO código, descripción y unidad. Los precios se quedan en la app
 * local de cobros de Electrilam: son información comercial y no tienen por qué
 * salir de su equipo. Este catálogo existe únicamente para que quien llena la
 * hoja de una OT pueda elegir el material sin saberse 1.500 códigos de memoria.
 */
export interface MaterialCatalogo {
  codigo: string;
  descripcion: string;
  unidad: string;
  clasificacion: string;
}

/** La hoja de cobro es, por ahora, exclusiva de Electrilam — igual que los ITOs. */
export function tieneCobros(workspaceId: string | null | undefined): boolean {
  return workspaceId === ELECTRILAM_WORKSPACE_ID;
}

/** Busca por código o descripción. Devuelve pocos resultados: alimenta un autocompletar. */
export async function buscarMateriales(
  workspaceId: string,
  texto: string,
  limite = 20,
): Promise<MaterialCatalogo[]> {
  const q = texto.trim();
  if (q.length < 2) return [];
  const sb = createClient();

  // En un filtro `or` de PostgREST la coma separa condiciones y el paréntesis
  // las agrupa: un código como "bor2,5g" partiría la consulta en dos. Entre
  // comillas dobles el valor se toma literal; el % y el _ son comodines de
  // ilike y se escapan aparte.
  const patron = q.replace(/[%_\\]/g, (m) => "\\" + m).replace(/"/g, "");
  const { data, error } = await sb
    .from("catalogo_materiales")
    .select("codigo, descripcion, unidad, clasificacion")
    .eq("workspace_id", workspaceId)
    .or(`codigo.ilike."%${patron}%",descripcion.ilike."%${patron}%"`)
    .order("codigo")
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as MaterialCatalogo[];
}

/** Trae los códigos exactos que pide una hoja, para resolver descripciones de golpe. */
export async function materialesPorCodigo(
  workspaceId: string,
  codigos: string[],
): Promise<Map<string, MaterialCatalogo>> {
  const unicos = [...new Set(codigos.filter(Boolean))];
  if (!unicos.length) return new Map();
  const sb = createClient();
  const out = new Map<string, MaterialCatalogo>();
  // Se pagina por si una hoja trae muchas líneas: `in` con cientos de valores
  // arma una URL demasiado larga para PostgREST.
  for (let i = 0; i < unicos.length; i += 100) {
    const { data, error } = await sb
      .from("catalogo_materiales")
      .select("codigo, descripcion, unidad, clasificacion")
      .eq("workspace_id", workspaceId)
      .in("codigo", unicos.slice(i, i + 100));
    if (error) throw error;
    (data ?? []).forEach((m) => out.set((m as MaterialCatalogo).codigo, m as MaterialCatalogo));
  }
  return out;
}

/** El catálogo entero (~1.500 códigos), de a 1.000: es el tope por consulta de PostgREST. */
export async function todoElCatalogo(workspaceId: string): Promise<MaterialCatalogo[]> {
  const sb = createClient();
  const out: MaterialCatalogo[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb
      .from("catalogo_materiales")
      .select("codigo, descripcion, unidad, clasificacion")
      .eq("workspace_id", workspaceId)
      .order("codigo")
      .range(desde, desde + 999);
    if (error) throw error;
    out.push(...((data ?? []) as MaterialCatalogo[]));
    if (!data || data.length < 1000) return out;
  }
}

/** Alias aprendidos (texto del maestro → código), con la clave normalizada como la busca el picker. */
export async function fetchAlias(workspaceId: string): Promise<Map<string, string>> {
  const { data, error } = await createClient().from("material_alias").select("texto_norm, codigo").eq("workspace_id", workspaceId);
  if (error) throw error;
  return new Map((data ?? []).map((a) => [normMaterial(a.texto_norm), a.codigo]));
}

/** Cuántas veces usó cada código este usuario y el equipo (RPC material_usos). */
export async function fetchUsos(): Promise<Map<string, Uso>> {
  const { data, error } = await createClient().rpc("material_usos");
  if (error) throw error;
  return new Map(((data ?? []) as Uso[]).map((u) => [u.codigo, u]));
}

/** Fila de hoja con Material escrito y Código vacío: un material "no listado" por resolver. */
export interface Pendiente {
  fila_id: string; hoja_id: string; orden_id: string | null; numero: number | null;
  autor: string | null; fecha: string; texto: string; cantidad: string | null;
}

export async function fetchPendientes(): Promise<Pendiente[]> {
  const { data, error } = await createClient().rpc("materiales_pendientes");
  if (error) throw error;
  return (data ?? []) as Pendiente[];
}

/** Escribe Material + Código en la fila y aprende el alias (RPC, una transacción). */
export async function resolverPendiente(filaId: string, codigo: string): Promise<void> {
  const { error } = await createClient().rpc("resolver_material_pendiente", { p_fila_id: filaId, p_codigo: codigo });
  if (error) throw error;
}

/** Código nuevo en el catálogo (sólo owner/admin, por RLS). */
export async function crearMaterial(workspaceId: string, m: MaterialCatalogo): Promise<void> {
  const { error } = await createClient().from("catalogo_materiales").insert({ workspace_id: workspaceId, ...m });
  if (error) throw error;
}

/**
 * Publica el catálogo desde la app de cobros. Reemplaza por código (upsert),
 * así un código que cambia de descripción se actualiza y los que ya no existen
 * se pueden limpiar aparte sin perder los que sí.
 */
export async function publicarCatalogo(
  workspaceId: string,
  materiales: MaterialCatalogo[],
): Promise<number> {
  const sb = createClient();
  let escritos = 0;
  for (let i = 0; i < materiales.length; i += 500) {
    const lote = materiales.slice(i, i + 500).map((m) => ({ ...m, workspace_id: workspaceId }));
    const { error } = await sb
      .from("catalogo_materiales")
      .upsert(lote, { onConflict: "workspace_id,codigo" });
    if (error) throw error;
    escritos += lote.length;
  }
  return escritos;
}
