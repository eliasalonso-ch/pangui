import { createClient } from "@/lib/supabase";
import { ELECTRILAM_WORKSPACE_ID } from "@/lib/itos-gate";

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
