// Which OT status a status-event row in Actividad refers to, so the row can
// carry that status's color (the --st-*-dot tokens). null = not a status row.

export type TonoEstado = "open" | "wait" | "progress" | "review" | "done" | "cancel";

const POR_ESTADO: Record<string, TonoEstado> = {
  pendiente: "open", sin_asignar: "open",
  en_espera: "wait",
  en_curso: "progress",
  en_revision: "review",
  completado: "done", completada: "done",
  cancelado: "cancel", cancelada: "cancel",
};

export function tonoDeActividad(tipo: string, comentario: string | null): TonoEstado | null {
  switch (tipo) {
    case "pausado": return "wait";
    case "iniciado":
    case "reanudado": return "progress";
    case "completado": return "done";
    case "cancelado": return "cancel";
    case "estado_cambiado": {
      // comentario holds the new status, as a label ("En espera") or a key
      // ("en_espera") depending on who wrote the row.
      const clave = (comentario ?? "")
        .trim().toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, "_");
      return POR_ESTADO[clave] ?? null;
    }
    default: return null;
  }
}
