/**
 * Client-side helper that calls /api/notificar (Next.js route) to send
 * in-app + push notifications. Fire-and-forget — never throws.
 */

interface NotificarPayload {
  titulo: string;
  mensaje: string;
  url?: string;
  urgente?: boolean;
  tipo?: string;
  // Target: exactly one of the following
  usuario_id?: string;
  usuario_ids?: string[];
  workspace_id_todos_tecnicos?: string;
  workspace_id_jefe?: string;
}

async function notificar(payload: NotificarPayload): Promise<void> {
  try {
    await fetch("/api/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort — never block the caller
  }
}

export function notifyOTCreada(opts: {
  workspaceId: string;
  ordenId: string;
  titulo: string;
  urgente?: boolean;
}) {
  const urgente = opts.urgente ?? false;
  notificar({
    titulo: urgente ? "⚡ OT urgente creada" : "Nueva orden de trabajo",
    mensaje: opts.titulo,
    url: `/ordenes?id=${opts.ordenId}`,
    urgente,
    workspace_id_todos_tecnicos: opts.workspaceId,
  });
  // Also notify jefe
  notificar({
    titulo: urgente ? "⚡ OT urgente creada" : "Nueva orden de trabajo",
    mensaje: opts.titulo,
    url: `/ordenes?id=${opts.ordenId}`,
    urgente,
    workspace_id_jefe: opts.workspaceId,
  });
}

export function notifyOTAsignada(opts: {
  asignadosIds: string[];
  ordenId: string;
  titulo: string;
}) {
  if (!opts.asignadosIds.length) return;
  notificar({
    titulo: "Se te asignó una OT",
    mensaje: opts.titulo,
    url: `/ordenes?id=${opts.ordenId}`,
    usuario_ids: opts.asignadosIds,
  });
}

export function notifyOTEstadoCambiado(opts: {
  asignadosIds: string[];
  workspaceId: string;
  ordenId: string;
  titulo: string;
  estado: string;
  changedByUserId: string;
}) {
  const ESTADO_LABELS: Record<string, string> = {
    pendiente:  "Abierta",
    en_espera:  "En espera",
    en_curso:   "En curso",
    completado: "Completada",
  };
  const label = ESTADO_LABELS[opts.estado] ?? opts.estado;
  const completado = opts.estado === "completado";

  // Notify assigned technicians (excluding the one who made the change)
  const targets = opts.asignadosIds.filter((id) => id !== opts.changedByUserId);
  if (targets.length) {
    notificar({
      titulo: `OT ${completado ? "completada ✓" : `pasó a ${label}`}`,
      mensaje: opts.titulo,
      url: `/ordenes?id=${opts.ordenId}`,
      usuario_ids: targets,
    });
  }

  // Always notify jefe on status change
  notificar({
    titulo: `OT ${completado ? "completada ✓" : `→ ${label}`}`,
    mensaje: opts.titulo,
    url: `/ordenes?id=${opts.ordenId}`,
    workspace_id_jefe: opts.workspaceId,
  });
}

export function notifyOTCompletada(opts: {
  workspaceId: string;
  ordenId: string;
  titulo: string;
  changedByUserId: string;
}) {
  notifyOTEstadoCambiado({ ...opts, asignadosIds: [], estado: "completado" });
}

export function notifySolicitudMateriales(opts: {
  workspaceId: string;
  ordenId: string;
  titulo: string;
}) {
  notificar({
    tipo: "solicitud_materiales",
    titulo: "Solicitud de materiales",
    mensaje: opts.titulo,
    url: `/ordenes/${opts.ordenId}`,
    workspace_id_jefe: opts.workspaceId,
  });
}

export function notifyClasificacionCambiada(opts: {
  workspaceId: string;
  ordenId: string;
  titulo: string;
  clasificacion: "levantamiento" | "ejecucion";
}) {
  const label = opts.clasificacion === "levantamiento" ? "levantamiento" : "ejecución";
  notificar({
    tipo: "tipo_trabajo_actualizado",
    titulo: `OT marcada como ${label}`,
    mensaje: opts.titulo,
    url: `/ordenes/${opts.ordenId}`,
    workspace_id_jefe: opts.workspaceId,
  });
}

export function notifyClasificacionSolicitada(opts: {
  workspaceId: string;
  ordenId: string;
  titulo: string;
  solicitanteNombre: string;
}) {
  notificar({
    tipo: "tipo_trabajo_actualizado",
    titulo: "Solicitud: cambiar a orden de trabajo",
    mensaje: `${opts.solicitanteNombre} solicitó cambiar "${opts.titulo}" de levantamiento a ejecución`,
    url: `/ordenes/${opts.ordenId}`,
    workspace_id_jefe: opts.workspaceId,
  });
}
