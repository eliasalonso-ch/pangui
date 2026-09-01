import type { OrdenListItem } from "@/types/ordenes";
import { dateKey } from "./date-utils";

export type PendingScopeKey =
  | "en_curso" | "sin_asignar" | "sin_progreso" | "vencidas" | "reprogramadas"
  | "materiales" | "levantamientos" | "presupuestos" | "otras";

/**
 * The only fields bucketing reads. Declared structurally rather than as
 * `OrdenListItem` so these helpers also accept the lean `OrdenBulkItem` rows
 * from the workspace-wide snapshot, which omits export-only columns like
 * `tipo` — none of which matter here.
 */
export type ScopeableOrden = Pick<
  OrdenListItem,
  | "id" | "estado" | "clasificacion" | "tipo_trabajo" | "asignados_ids"
  | "fecha_termino" | "en_ejecucion" | "iniciado_at" | "tiempo_total_segundos"
>;

// "Sin progreso": nobody has touched the OT yet — it's still in its initial
// `pendiente` state AND the timer was never started. Any state change
// (en_espera / en_curso / completado) or any timer activity counts as progress.
// Gating on `estado === "pendiente"` is the primary, always-present signal;
// the timer fields catch a pendiente OT that was started then reset.
export function sinProgreso(o: ScopeableOrden): boolean {
  if (o.estado !== "pendiente") return false;
  if (o.en_ejecucion) return false;
  if (o.iniciado_at) return false;
  if ((o.tiempo_total_segundos ?? 0) > 0) return false;
  return true;
}

/** "Vencida": has a due date in the past and isn't completed. */
export function estaVencida(o: ScopeableOrden, todayKey: string): boolean {
  if (o.estado === "completado" || !o.fecha_termino) return false;
  const dueKey = dateKey(o.fecha_termino);
  return !!dueKey && dueKey < todayKey;
}

export function esLevantamiento(o: ScopeableOrden): boolean {
  return o.clasificacion === "levantamiento" || o.tipo_trabajo === "levantamiento";
}

export function esPresupuesto(o: ScopeableOrden): boolean {
  return o.tipo_trabajo === "presupuesto";
}

/**
 * "En curso": alguien la está trabajando ahora.
 *
 * Se define por `estado`, no por `en_ejecucion` (el cronómetro), a propósito:
 * el chip de estado que se ve en cada tarjeta lee `estado`, así que atarlo al
 * cronómetro dejaría OTs en este bucket mostrando "En espera" en su tarjeta.
 */
export function estaEnCurso(o: ScopeableOrden): boolean {
  return o.estado === "en_curso";
}

/**
 * Bucket de una OT pendiente.
 *
 * Cadena de prioridad: cada OT cae en un solo bucket, el primero que calce,
 * así los contadores suman el total sin duplicar.
 *
 * El orden importa:
 *  - "En curso" va primero de todo: la pregunta que responde es "¿quién está
 *    trabajando ahora?", y una OT que se está ejecutando no está detenida por
 *    ningún motivo. Esto saca de "Vencidas" a las OTs vencidas que alguien ya
 *    está resolviendo — que es correcto: ya no requieren acción del planner.
 *  - Levantamiento y presupuesto van después porque describen QUÉ es el
 *    trabajo, no por qué está detenido.
 *  - "Faltan materiales" y "Reprogramada" van antes que vencida, sin asignar
 *    y sin progreso porque describen POR QUÉ está detenida, que es lo
 *    accionable: una OT vencida esperando materiales se resuelve consiguiendo
 *    los materiales, no mirándola en "Vencidas".
 */
export function pendingScopeFor(
  o: ScopeableOrden,
  reprogramadaIds: Set<string>,
  faltanMaterialesIds: Set<string>,
  todayKey: string,
): PendingScopeKey {
  if (estaEnCurso(o)) return "en_curso";
  if (esLevantamiento(o)) return "levantamientos";
  if (esPresupuesto(o)) return "presupuestos";
  if (faltanMaterialesIds.has(o.id)) return "materiales";
  if (reprogramadaIds.has(o.id)) return "reprogramadas";
  if (estaVencida(o, todayKey)) return "vencidas";
  if (!o.asignados_ids || o.asignados_ids.length === 0) return "sin_asignar";
  if (sinProgreso(o)) return "sin_progreso";
  return "otras";
}
