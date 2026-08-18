import { createClient } from "@/lib/supabase";
import type { CategoriaOT } from "@/types/ordenes";

/**
 * Categorías de OT.
 *
 * El contrato con el servidor es el mismo que ya usa la app móvil
 * (`features/categorias/api.ts`): mismas columnas, mismo insert, mismo
 * fallback de icono. Cualquier cambio acá tiene que replicarse allá.
 */

export interface CategoriaConUso extends CategoriaOT {
  workspace_id: string | null;
  es_default: boolean;
  created_at: string;
  archivada: boolean;
}

const SELECT = "id, workspace_id, nombre, icono, color, es_default, created_at, archivada";

/**
 * `icono` es NOT NULL en la base. Móvil documenta que mandar null rompía el
 * insert, así que el fallback vive en la capa de datos y no en el formulario:
 * así ningún llamador nuevo puede reintroducir el bug.
 */
export const ICONO_POR_DEFECTO = "flash-outline";

/**
 * Categorías visibles para el espacio de trabajo.
 *
 * OJO con el filtro: las categorías por defecto viven con `workspace_id = NULL`
 * y las comparten todos los espacios. Un `.eq("workspace_id", …)` a secas las
 * deja fuera —NULL nunca iguala— y la lista aparece vacía. Por eso se piden
 * explícitamente las propias MÁS las globales.
 *
 * El móvil resuelve lo mismo sin filtro, apoyándose en RLS; acá se es explícito
 * para que el criterio se lea en el código y no dependa de la política.
 */
export async function listCategorias(workspaceId: string): Promise<CategoriaConUso[]> {
  const sb = createClient();
  const [{ data, error }, { data: ocultas }] = await Promise.all([
    sb.from("categorias_ot")
      .select(SELECT)
      .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
      .eq("archivada", false)
      .order("nombre", { ascending: true }),
    sb.from("categorias_ocultas").select("categoria_id").eq("workspace_id", workspaceId),
  ]);
  if (error) throw error;

  // Las por defecto que este espacio decidió no mostrar (ver `archivarCategoria`).
  const escondidas = new Set((ocultas ?? []).map(o => (o as { categoria_id: string }).categoria_id));
  return ((data ?? []) as CategoriaConUso[]).filter(c => !escondidas.has(c.id));
}

export async function createCategoria(
  workspaceId: string,
  nombre: string,
  color: string,
  icono?: string | null,
): Promise<CategoriaConUso> {
  const sb = createClient();
  const { data, error } = await sb
    .from("categorias_ot")
    .insert({
      workspace_id: workspaceId,
      nombre: nombre.trim(),
      color,
      icono: icono ?? ICONO_POR_DEFECTO,
    })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as CategoriaConUso;
}

/**
 * ¿Es una categoría global (`workspace_id = NULL`) del catálogo por defecto?
 *
 * Estas filas las comparten TODOS los espacios de trabajo. Se pueden editar,
 * pero NO en el lugar: ver `guardarCategoria`.
 */
export function esGlobal(cat: { workspace_id: string | null }): boolean {
  return cat.workspace_id === null;
}

/**
 * Guarda los cambios de una categoría, sea propia o por defecto.
 *
 * Las categorías por defecto viven con `workspace_id = NULL` y las comparten
 * todos los espacios de trabajo. Editarlas en el lugar le cambiaría el nombre y
 * el color a los demás clientes, así que se usa copy-on-write:
 *
 *   - categoría propia  → UPDATE normal.
 *   - categoría global  → se crea una copia de este workspace con los cambios y
 *     se reapuntan las OTs locales a la copia. La fila compartida queda intacta
 *     para los otros espacios.
 *
 * Devuelve la categoría resultante y, cuando hubo copia, el id de la global que
 * reemplaza, para que la lista la saque de pantalla.
 */
export async function guardarCategoria(
  workspaceId: string,
  cat: CategoriaConUso,
  patch: { nombre: string; color: string; icono: string },
): Promise<{ categoria: CategoriaConUso; reemplazaId?: string }> {
  if (!esGlobal(cat)) {
    return { categoria: await updateCategoria(cat.id, patch) };
  }

  const copia = await createCategoria(workspaceId, patch.nombre, patch.color, patch.icono);
  await reapuntarOrdenes(workspaceId, cat.id, copia.id);
  return { categoria: copia, reemplazaId: cat.id };
}

/**
 * Mueve las OTs del workspace de una categoría a otra, en las dos columnas.
 *
 * `categoria_ids` es un arreglo: se reescribe fila por fila reemplazando el id
 * viejo por el nuevo, sin perder las otras categorías de la OT.
 */
async function reapuntarOrdenes(
  workspaceId: string,
  desdeId: string,
  haciaId: string,
): Promise<void> {
  const sb = createClient();

  await sb
    .from("ordenes_trabajo")
    .update({ categoria_id: haciaId })
    .eq("workspace_id", workspaceId)
    .eq("categoria_id", desdeId);

  const { data } = await sb
    .from("ordenes_trabajo")
    .select("id, categoria_ids")
    .eq("workspace_id", workspaceId)
    .contains("categoria_ids", [desdeId]);

  for (const fila of (data ?? []) as { id: string; categoria_ids: string[] | null }[]) {
    const actualizados = (fila.categoria_ids ?? []).map(id => (id === desdeId ? haciaId : id));
    await sb.from("ordenes_trabajo").update({ categoria_ids: actualizados }).eq("id", fila.id);
  }
}

export async function updateCategoria(
  id: string,
  patch: { nombre?: string; color?: string; icono?: string | null },
): Promise<CategoriaConUso> {
  const sb = createClient();
  const payload: Record<string, string> = {};
  if (patch.nombre !== undefined) payload.nombre = patch.nombre.trim();
  if (patch.color !== undefined) payload.color = patch.color;
  if (patch.icono !== undefined) payload.icono = patch.icono ?? ICONO_POR_DEFECTO;

  const { data, error } = await sb
    .from("categorias_ot")
    .update(payload)
    .eq("id", id)
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as CategoriaConUso;
}

/**
 * Cuántas OTs usan esta categoría, mirando las dos columnas: la simple
 * (`categoria_id`) y la múltiple (`categoria_ids`), que conviven en el modelo.
 */
export async function contarOrdenesDeCategoria(
  workspaceId: string,
  categoriaId: string,
): Promise<number> {
  const sb = createClient();
  const { count, error } = await sb
    .from("ordenes_trabajo")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .or(`categoria_id.eq.${categoriaId},categoria_ids.cs.{${categoriaId}}`);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Elimina una categoría del catálogo conservándola en las OTs que la usan.
 *
 * NO se borra la fila: `ordenes_trabajo.categoria_id` la referencia con
 * ON DELETE SET NULL, así que un DELETE real se la quitaría a todas las OTs
 * históricas. Desaparece del selector y del catálogo, pero las OTs siguen
 * mostrándola con su nombre, ícono y color.
 *
 * Según de quién sea la categoría se usa un mecanismo distinto:
 *
 *   - propia del workspace → `archivada = true` sobre la fila.
 *   - por defecto (compartida entre espacios) → NO se toca la fila, porque
 *     archivarla la escondería para todos los clientes. Se registra en
 *     `categorias_ocultas` que este espacio no quiere verla.
 */
export async function archivarCategoria(
  workspaceId: string,
  cat: CategoriaConUso,
): Promise<void> {
  const sb = createClient();

  if (esGlobal(cat)) {
    const { error } = await sb
      .from("categorias_ocultas")
      .upsert({ workspace_id: workspaceId, categoria_id: cat.id });
    if (error) throw error;
    return;
  }

  const { error } = await sb
    .from("categorias_ot")
    .update({ archivada: true })
    .eq("id", cat.id);
  if (error) throw error;
}
