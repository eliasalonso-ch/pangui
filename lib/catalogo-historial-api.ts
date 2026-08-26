import { createClient } from "@/lib/supabase";
import type { OrdenHistorialItem } from "@/components/catalogo/HistorialOT";

/**
 * Historial de OTs de una ficha (Categoría o ITO).
 *
 * Dos consultas con propósitos distintos, para no traer cientos de filas:
 *
 *   - `fetchHistorialPagina` — la lista, de a 20, con scroll infinito.
 *   - `fetchHistorialFechas` — solo las fechas, para dibujar el gráfico.
 *
 * El gráfico necesita el periodo completo (si no, la curva se corta donde
 * alcanzó a paginar la lista), pero NO necesita título, estado ni prioridad:
 * pide dos columnas de fecha y nada más. Un ITO con 207 OTs baja así unos pocos
 * kB en vez de la carga completa, que es justo lo que dispara el egress.
 */

export const HISTORIAL_PAGE_SIZE = 20;

/** Columnas que la lista dibuja. Nada más — cada columna extra es egress. */
const LISTA_SELECT = `
  id, titulo, estado, prioridad, numero, created_at, completado_en, solicitante
`;

/** Solo lo que consume la serie temporal. */
const FECHAS_SELECT = "created_at, completado_en";

/**
 * Filtro por catálogo: categoría (por id, en sus dos columnas), ITO (por texto)
 * o alguno de los catálogos de ubicación, que enlazan por su propia columna.
 */
export type HistorialTarget =
  | { tipo: "categoria"; categoriaId: string }
  | { tipo: "ito"; nombre: string }
  | { tipo: "ubicacion"; ubicacionId: string }
  | { tipo: "lugar"; lugarId: string }
  | { tipo: "sociedad"; sociedadId: string };

function aplicarTarget<T>(query: T, target: HistorialTarget): T {
  const q = query as any;
  switch (target.tipo) {
    case "categoria":
      return q.or(`categoria_id.eq.${target.categoriaId},categoria_ids.cs.{${target.categoriaId}}`);
    case "ubicacion":
      return q.eq("ubicacion_id", target.ubicacionId);
    case "lugar":
      return q.eq("lugar_id", target.lugarId);
    case "sociedad":
      return q.eq("sociedad_id", target.sociedadId);
    default:
      // El vínculo del ITO es por texto: `ilike` iguala sin distinguir
      // mayúsculas, igual que `normalizeIto` en la bandeja.
      return q.ilike("hito", target.nombre.trim());
  }
}

export interface PaginaHistorial {
  filas: OrdenHistorialItem[];
  hayMas: boolean;
}

/**
 * Una página de OTs, más nueva primero.
 *
 * `hayMas` se deduce pidiendo una fila extra: si vuelve, existe otra página.
 * Evita un `count: exact`, que en Postgres obliga a recorrer toda la tabla.
 */
export async function fetchHistorialPagina(
  workspaceId: string,
  target: HistorialTarget,
  offset: number,
  pageSize: number = HISTORIAL_PAGE_SIZE,
): Promise<PaginaHistorial> {
  const sb = createClient();
  const base = sb
    .from("ordenes_trabajo")
    .select(LISTA_SELECT)
    .eq("workspace_id", workspaceId);

  const { data, error } = await aplicarTarget(base, target)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize); // pageSize + 1 filas

  if (error) throw error;
  const filas = (data ?? []) as OrdenHistorialItem[];
  return {
    filas: filas.slice(0, pageSize),
    hayMas: filas.length > pageSize,
  };
}

export interface FechaHistorial {
  created_at: string;
  completado_en: string | null;
}

/**
 * Fechas de todas las OTs del catálogo, para la serie del gráfico.
 *
 * Se acota por `created_at >= desde` para no arrastrar años de historia cuando
 * el usuario mira los últimos 30 días. Las completadas dentro del rango pero
 * creadas antes quedan fuera del recorte; es el mismo criterio con que la lista
 * ordena por creación, así ambas mitades cuentan lo mismo.
 */
export async function fetchHistorialFechas(
  workspaceId: string,
  target: HistorialTarget,
  desde: Date,
): Promise<FechaHistorial[]> {
  const sb = createClient();
  const base = sb
    .from("ordenes_trabajo")
    .select(FECHAS_SELECT)
    .eq("workspace_id", workspaceId)
    .gte("created_at", desde.toISOString());

  const { data, error } = await aplicarTarget(base, target);
  if (error) throw error;
  return (data ?? []) as FechaHistorial[];
}
