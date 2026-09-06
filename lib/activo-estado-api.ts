/**
 * Historial de estado de un activo y el tiempo de inactividad que sale de él.
 *
 * La diferencia con `activo-metrics.ts`: ese módulo deriva la disponibilidad
 * del tiempo de reparación de las OTs, que es la disponibilidad *inherente* y
 * queda optimista —no cuenta la espera de repuestos ni de técnico—. Acá el
 * tiempo de parada es el medido: cuánto estuvo el activo efectivamente fuera de
 * servicio, planificado o no.
 */

import { createClient } from "@/lib/supabase";
import type { AssetStatus } from "@/types/ordenes";

/** Clasificación de una parada. `operativo` nunca la lleva. */
export type TipoInactividad = "planeado" | "sin_planear";

export interface EstadoPeriodo {
  id: string;
  activo_id: string;
  estado: AssetStatus;
  tipo_inactividad: TipoInactividad | null;
  inicio: string;
  /** `null` = período abierto: es el estado vigente del activo. */
  fin: string | null;
  notas: string | null;
  creado_por: string | null;
  created_at: string;
  creador?: { id: string; nombre: string } | null;
}

const PERIODO_SELECT = `
  id, activo_id, estado, tipo_inactividad, inicio, fin, notas, creado_por, created_at,
  creador:usuarios!creado_por(id, nombre)
`;

/**
 * Períodos que se solapan con la ventana [desde, hasta].
 *
 * El filtro incluye a propósito el período que empezó ANTES de la ventana y
 * sigue abierto o termina dentro: si solo se pidieran los que arrancan dentro,
 * una parada larga que viene de la semana pasada desaparecería del gráfico
 * justo cuando más importa.
 */
export async function fetchEstadoPeriodos(
  activoId: string,
  desde: Date,
  hasta: Date,
): Promise<EstadoPeriodo[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from("activo_estado_periodos")
    .select(PERIODO_SELECT)
    .eq("activo_id", activoId)
    .lte("inicio", hasta.toISOString())
    .or(`fin.is.null,fin.gte.${desde.toISOString()}`)
    .order("inicio", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as EstadoPeriodo[];
}

/**
 * El período vigente del activo: desde cuándo está en su estado actual y quién
 * lo registró. Es lo que alimenta la línea "última actualización" de la ficha.
 *
 * Devuelve `null` cuando el activo todavía no tiene historial —por ejemplo si
 * se creó antes de la migración y nadie le cambió el estado—, en cuyo caso la
 * ficha simplemente no muestra la línea en vez de inventar una fecha.
 */
export async function fetchPeriodoVigente(activoId: string): Promise<EstadoPeriodo | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from("activo_estado_periodos")
    .select(PERIODO_SELECT)
    .eq("activo_id", activoId)
    .is("fin", null)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as EstadoPeriodo | null;
}

export interface CambioEstadoInput {
  activoId: string;
  estado: AssetStatus;
  tipoInactividad?: TipoInactividad | null;
  /** Permite fechar hacia atrás. `undefined` = ahora. */
  desde?: Date | null;
  notas?: string | null;
}

/**
 * Cierra el período abierto y abre el nuevo. Todo el trabajo ocurre en la
 * función de Postgres para que no exista un instante con dos períodos abiertos
 * (horas duplicadas) ni con ninguno (hueco en el historial).
 */
export async function cambiarEstadoActivo(input: CambioEstadoInput): Promise<string> {
  const sb = createClient();
  const { data, error } = await sb.rpc("cambiar_estado_activo", {
    p_activo: input.activoId,
    p_estado: input.estado,
    p_tipo_inactividad: input.tipoInactividad ?? null,
    p_desde: input.desde ? input.desde.toISOString() : null,
    p_notas: input.notas ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ── Totales ───────────────────────────────────────────────────────────────────

export interface ResumenInactividad {
  /** Horas operativas dentro de la ventana. */
  operativoHoras: number;
  /** Horas de parada sin planear (averías). */
  imprevistoHoras: number;
  /** Horas de parada planificada (mantención programada). */
  planificadoHoras: number;
  /** Disponibilidad 0–100 sobre el tiempo cubierto. `null` si no hay datos. */
  disponibilidadPct: number | null;
  /** Horas de la ventana cubiertas por algún período, excluyendo `baja`. */
  cubiertoHoras: number;
}

const MS_POR_HORA = 3_600_000;

/**
 * Suma las horas de cada estado dentro de la ventana.
 *
 * Cada período se RECORTA a la ventana antes de sumar: un período que empezó
 * hace un mes y sigue abierto solo aporta las horas que caen dentro del rango
 * que se está mirando, no su duración completa. Sin ese recorte, elegir "1D"
 * en un activo parado hace semanas daría cientos de horas de inactividad en un
 * día de 24.
 */
export function resumirInactividad(
  periodos: EstadoPeriodo[],
  desde: Date,
  hasta: Date,
): ResumenInactividad {
  const ventanaInicio = desde.getTime();
  const ventanaFin = Math.min(hasta.getTime(), Date.now());

  let operativoMs = 0;
  let imprevistoMs = 0;
  let planificadoMs = 0;

  for (const p of periodos) {
    const inicio = Math.max(new Date(p.inicio).getTime(), ventanaInicio);
    // Un período abierto se cuenta hasta el final de la ventana (o ahora).
    const fin = Math.min(p.fin ? new Date(p.fin).getTime() : ventanaFin, ventanaFin);
    const ms = fin - inicio;
    if (ms <= 0) continue;

    // `baja` no es tiempo de inactividad: el activo salió de servicio para
    // siempre, no está esperando reparación. Contarlo hundiría la
    // disponibilidad de una máquina dada de baja hace un año, y lo que se está
    // midiendo es el desempeño mientras estuvo en uso. Queda fuera de los tres
    // totales y, por lo tanto, del denominador.
    if (p.estado === "baja") continue;

    if (p.estado === "operativo") operativoMs += ms;
    else if (p.tipo_inactividad === "planeado") planificadoMs += ms;
    else imprevistoMs += ms;
  }

  const cubiertoMs = operativoMs + imprevistoMs + planificadoMs;

  return {
    operativoHoras: operativoMs / MS_POR_HORA,
    imprevistoHoras: imprevistoMs / MS_POR_HORA,
    planificadoHoras: planificadoMs / MS_POR_HORA,
    cubiertoHoras: cubiertoMs / MS_POR_HORA,
    // Sobre el tiempo cubierto, no sobre la ventana: si el activo se creó a
    // mitad del rango, dividir por la ventana completa lo castigaría por no
    // haber existido todavía.
    disponibilidadPct: cubiertoMs > 0 ? (operativoMs / cubiertoMs) * 100 : null,
  };
}

/** "5m", "3h", "2d 4h" — la unidad más grande que tenga sentido. */
export function formatDuracion(horas: number): string {
  if (horas <= 0) return "0h";
  const minutos = Math.round(horas * 60);
  if (minutos < 60) return `${minutos}m`;
  if (horas < 24) {
    const h = Math.floor(horas);
    const m = Math.round((horas - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const dias = Math.floor(horas / 24);
  const resto = Math.round(horas % 24);
  return resto > 0 ? `${dias}d ${resto}h` : `${dias}d`;
}
