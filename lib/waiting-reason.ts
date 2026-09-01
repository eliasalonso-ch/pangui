/**
 * Por qué está pausada una OT.
 *
 * El motivo no es un campo: se deduce del comentario que el técnico escribe al
 * pausar (`actividad_ot` con `tipo='pausado'`). Vive acá y no dentro de una
 * página porque lo usan la bandeja de /ordenes y el panel de /inicio, y
 * duplicarlo garantizaba que las dos vistas terminaran clasificando distinto.
 *
 * Ojo: es heurística sobre texto libre. Un campo `motivo_pausa` real sería
 * mejor, pero mientras el móvil siga escribiendo prosa, esto es lo que hay.
 */

export type WaitingReasonKey = "materiales" | "acceso" | "reprogramar" | "otro";

export interface WaitingReason {
  key: WaitingReasonKey;
  label: string;
}

export function classifyWaitingReason(comment: string | null | undefined): WaitingReason {
  const c = (comment ?? "").toLowerCase();
  if (c.includes("material")) return { key: "materiales", label: "Faltan materiales" };
  // "coordinad" cubre coordinado/coordinada/coordinados/coordinadas: la gente
  // escribe libre, y "Coordinado para las 17:00hrs" es una reprogramación
  // aunque el prefijo automático del móvil sea "Reprogramar:".
  if (c.includes("reprogram") || c.includes("reagend") || c.includes("coordinad") || c.includes("coordino") || c.includes("coordinó")) {
    return { key: "reprogramar", label: "Reprogramar" };
  }
  if (c.includes("acceso") || c.includes("ingresar") || c.includes("instalacion") || c.includes("instalación")) {
    return { key: "acceso", label: "Sin acceso" };
  }
  return { key: "otro", label: "Otro motivo" };
}

/** Color de la etiqueta según qué tan accionable es el motivo. */
export function waitingReasonColor(key: WaitingReasonKey): string {
  switch (key) {
    // Faltan materiales y sin acceso son bloqueos que alguien tiene que
    // destrabar; reprogramar ya tiene una fecha acordada.
    case "materiales": return "var(--danger)";
    case "acceso":     return "var(--warning)";
    case "reprogramar": return "var(--brand)";
    default:            return "var(--fg-4)";
  }
}
