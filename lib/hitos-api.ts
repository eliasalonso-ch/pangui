import { createClient } from "@/lib/supabase";

/**
 * ITOs.
 *
 * "ITO" es la etiqueta de cara al usuario; el almacenamiento sigue llamándose
 * `hito` (tabla, columna, prefijo). Ver `app/(app)/ordenes/ito-filter.ts`.
 *
 * Mismo contrato que la app móvil (`features/hitos/api.ts`).
 *
 * Ojo con el modelo: las OTs NO apuntan a `hitos.id`. Guardan el nombre del ITO
 * como texto en `ordenes_trabajo.hito`, así que el historial se resuelve por
 * nombre (ver `listOrdenesDeIto`) y renombrar exige arrastrar las OTs.
 */

export interface Hito {
  id: string;
  nombre: string;
  workspace_id: string;
  created_at: string;
  archivada: boolean;
}

const SELECT = "id, nombre, workspace_id, created_at, archivada";

export async function listHitos(workspaceId: string): Promise<Hito[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hitos")
    .select(SELECT)
    .eq("workspace_id", workspaceId)
    .eq("archivada", false)
    .order("nombre");
  if (error) throw error;
  return (data ?? []) as Hito[];
}

export async function createHito(workspaceId: string, nombre: string): Promise<Hito> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hitos")
    .insert({ workspace_id: workspaceId, nombre: nombre.trim() })
    .select(SELECT)
    .single();
  if (error) throw error;
  return data as Hito;
}

/**
 * Cuántas OTs referencian este ITO. Como el vínculo es por texto, se compara
 * el nombre sin distinguir mayúsculas ni espacios sobrantes, igual que
 * `normalizeIto` en `ito-filter.ts`.
 */
export async function contarOrdenesDeIto(
  workspaceId: string,
  nombre: string,
): Promise<number> {
  const sb = createClient();
  const { count, error } = await sb
    .from("ordenes_trabajo")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .ilike("hito", nombre.trim());
  if (error) throw error;
  return count ?? 0;
}

/**
 * Renombra un ITO y arrastra las OTs que lo mencionan.
 *
 * El vínculo es por texto, así que renombrar solo la fila del catálogo dejaría
 * huérfano todo el historial: las OTs seguirían diciendo el nombre viejo y la
 * ficha mostraría cero OTs. Por eso se reescribe también `ordenes_trabajo.hito`
 * y la copia que vive dentro del bloque meta de `descripcion`, que es la que lee
 * la bandeja (ver `ito-filter.ts`).
 *
 * No es atómico —son varias escrituras— pero el orden está elegido para que una
 * caída a medio camino no pierda datos: primero las OTs, después el catálogo. Si
 * falla entremedio, el catálogo conserva el nombre viejo y se puede reintentar;
 * al revés quedarían OTs apuntando a un nombre inexistente.
 */
export async function renameHito(
  workspaceId: string,
  hito: Hito,
  nombreNuevo: string,
): Promise<{ hito: Hito; ordenesActualizadas: number }> {
  const sb = createClient();
  const anterior = hito.nombre.trim();
  const nuevo = nombreNuevo.trim();
  if (!nuevo || nuevo === anterior) return { hito, ordenesActualizadas: 0 };

  const { data: afectadas, error: errBusca } = await sb
    .from("ordenes_trabajo")
    .select("id, descripcion")
    .eq("workspace_id", workspaceId)
    .ilike("hito", anterior);
  if (errBusca) throw errBusca;

  const filas = (afectadas ?? []) as { id: string; descripcion: string | null }[];
  for (const fila of filas) {
    // `descripcion` guarda el ITO como "Hito: <nombre>" dentro de la primera
    // línea de metadatos; se reemplaza solo ese segmento.
    const descripcion = fila.descripcion
      ? reemplazarHitoEnDescripcion(fila.descripcion, anterior, nuevo)
      : fila.descripcion;
    const { error } = await sb
      .from("ordenes_trabajo")
      .update({ hito: nuevo, descripcion })
      .eq("id", fila.id);
    if (error) throw error;
  }

  const { data, error } = await sb
    .from("hitos")
    .update({ nombre: nuevo })
    .eq("id", hito.id)
    .select(SELECT)
    .single();
  if (error) throw error;

  return { hito: data as Hito, ordenesActualizadas: filas.length };
}

/**
 * Reemplaza el segmento "Hito: X" de la primera línea de metadatos.
 *
 * Solo toca esa línea: el cuerpo de la descripción puede mencionar el mismo
 * nombre por casualidad y no debe reescribirse.
 */
export function reemplazarHitoEnDescripcion(
  descripcion: string,
  anterior: string,
  nuevo: string,
): string {
  const partes = descripcion.split("\n\n");
  const primera = partes[0];
  if (!primera.includes("Hito: ")) return descripcion;

  const segmentos = primera.split(" | ").map(seg =>
    seg.startsWith("Hito: ") && seg.slice("Hito: ".length).trim().toLowerCase() === anterior.toLowerCase()
      ? `Hito: ${nuevo}`
      : seg);
  return [segmentos.join(" | "), ...partes.slice(1)].join("\n\n");
}

/**
 * Textos de ITO que aparecen en OTs pero no existen en el catálogo.
 *
 * Ocurre porque el ITO se guarda como texto libre: una tilde o el nombre
 * completo ("Cristián Quijada", "Samuel Esteban Artiaga Ramírez") crean una
 * variante que no calza con ninguna fila de `hitos`. Esas OTs quedarían fuera
 * de todas las fichas sin que nadie se entere, así que la página las muestra
 * aparte en vez de descartarlas en silencio.
 *
 * Se comparan en minúsculas y sin espacios sobrantes, igual que `normalizeIto`.
 */
export async function listItosSinCatalogo(
  workspaceId: string,
  catalogo: Hito[],
): Promise<{ nombre: string; ots: number }[]> {
  const sb = createClient();
  const [{ data, error }, archivados] = await Promise.all([
    sb.from("ordenes_trabajo")
      .select("hito")
      .eq("workspace_id", workspaceId)
      .not("hito", "is", null),
    listHitosArchivados(workspaceId),
  ]);
  if (error) throw error;

  // Los archivados no son "sin catálogo": se quitaron a propósito.
  const conocidos = new Set(
    [...catalogo, ...archivados].map(h => h.nombre.trim().toLowerCase()),
  );
  const sueltos = new Map<string, { nombre: string; ots: number }>();
  for (const row of (data ?? []) as { hito: string | null }[]) {
    const texto = row.hito?.trim();
    if (!texto) continue;
    const clave = texto.toLowerCase();
    if (conocidos.has(clave)) continue;
    const actual = sueltos.get(clave);
    if (actual) actual.ots += 1;
    else sueltos.set(clave, { nombre: texto, ots: 1 });
  }
  return [...sueltos.values()].sort((a, b) => b.ots - a.ots);
}

/**
 * Elimina un ITO del catálogo conservándolo en las OTs que lo mencionan.
 *
 * Se marca `archivada` en vez de borrar la fila. Borrarla no rompería las OTs
 * —el vínculo es por texto— pero el ITO reaparecería en "Sin catálogo", que es
 * un aviso de dato por corregir y no de algo que se quitó a propósito.
 */
export async function archivarHito(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from("hitos").update({ archivada: true }).eq("id", id);
  if (error) throw error;
}

/**
 * Nombres de ITO archivados, para no listarlos como "sin catálogo".
 * Siguen existiendo en OTs históricas, solo que ya no se ofrecen.
 */
export async function listHitosArchivados(workspaceId: string): Promise<Hito[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("hitos")
    .select(SELECT)
    .eq("workspace_id", workspaceId)
    .eq("archivada", true);
  if (error) throw error;
  return (data ?? []) as Hito[];
}
