import { createClient } from "@/lib/supabase";
import { isExpectedCommandCode } from "@/lib/work-orders/expected-codes";
import type { OrdenTrabajo, OTLink, Recurrencia, RecurrenciaConfig } from "@/types/ordenes";

export const WORK_ORDER_COMMANDS_V1_ENABLED =
  process.env.NEXT_PUBLIC_WORK_ORDER_COMMANDS_V1 === "true";

export type CommandEnvelope<T> = {
  contract_version: 1;
  command_id: string;
  workspace_id: string;
  actor_id: string;
  payload: T;
};

export type WorkOrderCommandData = {
  work_order: OrdenTrabajo;
  activity_ids: string[];
  sheet_id: string | null;
  procedure_ids?: string[];
  notification_outbox_ids: string[];
};

export type CommandResult<T> = {
  contract_version: 1;
  command_id: string;
  replayed: boolean;
  data: T;
};

export type CreateWorkOrderPayloadV1 = {
  titulo: string;
  descripcion?: string;
  n_serie?: string | null;
  solicitante?: string | null;
  solicitante_telefono?: string | null;
  solicitante_email?: string | null;
  hito?: string | null;
  presupuesto?: string | null;
  prioridad?: string;
  tipo_trabajo?: string;
  clasificacion?: string | null;
  categoria_id?: string | null;
  categoria_ids?: string[] | null;
  recurrencia?: Recurrencia;
  recurrencia_config?: RecurrenciaConfig | null;
  ubicacion_id?: string | null;
  lugar_id?: string | null;
  sociedad_id?: string | null;
  activo_id?: string | null;
  asignados_ids?: string[] | null;
  fecha_inicio?: string | null;
  fecha_termino?: string | null;
  imagen_url?: string | null;
  links?: OTLink[];
};

export type CreateSubWorkOrderPayloadV1 = {
  parent_id: string;
  titulo: string;
  inheritance_policy: "operational" | "minimal";
  include_all_procedures?: boolean;
};

export type EditWorkOrderChangesV1 = Omit<Partial<CreateWorkOrderPayloadV1>, "tipo_trabajo"> & {
  tipo_trabajo?: string | null;
  requiere_materiales?: boolean;
  requiere_hoja?: boolean;
  requiere_fotos?: boolean;
};

export type EditWorkOrderPayloadV1 = {
  ot_id: string;
  expected_updated_at: string;
  changes: EditWorkOrderChangesV1;
};

export type WorkOrderActionV1 =
  | "assign"
  | "wait"
  | "start"
  | "pause"
  | "resume"
  | "request_review"
  | "complete"
  | "cancel"
  | "reopen";

export type TransitionWorkOrderPayloadV1 = {
  ot_id: string;
  expected_updated_at: string;
  action: WorkOrderActionV1;
  comment?: string;
  asignados_ids?: string[];
  /**
   * Owner/admin escape hatch for completing an OT whose requisitos can no longer
   * be satisfied. The server re-checks the actor's role and demands a reason, so
   * setting this from a non-elevated client only earns a FORCE_CLOSE_FORBIDDEN.
   */
  force_close?: boolean;
  force_close_reason?: string;
};

type CommandRpcName =
  | "create_work_order_v1"
  | "create_sub_work_order_v1"
  | "edit_work_order_v1"
  | "transition_work_order_v1";

const COMMAND_ERROR_MESSAGES: Record<string, string> = {
  PROCEDURES_INCOMPLETE: "Debes completar los procedimientos obligatorios antes de continuar.",
  MATERIALS_REQUIRED: "Esta OT requiere registrar al menos un material antes de completarla.",
  SHEET_REQUIRED: "Esta OT requiere completar la hoja de cálculo antes de cerrarla.",
  PHOTOS_REQUIRED: "Esta OT requiere al menos una foto de evidencia antes de cerrarla.",
  FORCE_CLOSE_FORBIDDEN: "Solo un propietario o administrador puede cerrar una OT con requisitos pendientes.",
  FORCE_CLOSE_REASON_REQUIRED: "Debes indicar un motivo para forzar el cierre de la OT.",
  CONFLICT: "La OT cambió desde que la abriste. Recárgala e intenta nuevamente.",
  INVALID_STATE_TRANSITION: "Este cambio de estado no es válido desde el estado actual de la OT.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  OT_NOT_FOUND: "La orden de trabajo ya no está disponible.",
  WORKSPACE_MISMATCH: "La información seleccionada no pertenece a este espacio de trabajo.",
  COMMAND_PAYLOAD_MISMATCH: "La solicitud ya fue utilizada con información diferente. Intenta nuevamente.",
};

export class WorkOrderCommandError extends Error {
  readonly code: string;
  readonly details?: string;
  /** True when this is a business rule the user can act on, not a fault. */
  readonly expected: boolean;

  constructor(code: string, details?: string) {
    super(COMMAND_ERROR_MESSAGES[code] ?? details ?? "No se pudo completar la acción sobre la OT.");
    this.name = "WorkOrderCommandError";
    this.code = code;
    this.details = details;
    this.expected = isExpectedCommandCode(code);
  }
}

async function executeCommand<TPayload>(
  rpcName: CommandRpcName,
  command: CommandEnvelope<TPayload>,
): Promise<CommandResult<WorkOrderCommandData>> {
  const sb = createClient();
  // Generated database types intentionally remain untouched until the
  // canonical migration is deployed and types can be regenerated from it.
  const { data, error } = await sb.rpc(rpcName as never, { p_command: command } as never);
  if (error) {
    const serverCode = error.message || error.code || "UNKNOWN";
    const log = COMMAND_ERROR_MESSAGES[serverCode] ? console.info : console.error;
    log("[work-order-command-v1] rejected", {
      rpcName,
      commandId: command.command_id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    if (error.details && !error.message.includes(error.details)) {
      error.message = `${error.message} — ${error.details}`;
    }
    throw new WorkOrderCommandError(serverCode, error.details ?? undefined);
  }
  return data as unknown as CommandResult<WorkOrderCommandData>;
}

export function createWorkOrderV1(
  command: CommandEnvelope<CreateWorkOrderPayloadV1>,
): Promise<CommandResult<WorkOrderCommandData>> {
  return executeCommand("create_work_order_v1", command);
}

export function createSubWorkOrderV1(
  command: CommandEnvelope<CreateSubWorkOrderPayloadV1>,
): Promise<CommandResult<WorkOrderCommandData>> {
  return executeCommand("create_sub_work_order_v1", command);
}

export function editWorkOrderV1(
  command: CommandEnvelope<EditWorkOrderPayloadV1>,
): Promise<CommandResult<WorkOrderCommandData>> {
  return executeCommand("edit_work_order_v1", command);
}

export function transitionWorkOrderV1(
  command: CommandEnvelope<TransitionWorkOrderPayloadV1>,
): Promise<CommandResult<WorkOrderCommandData>> {
  return executeCommand("transition_work_order_v1", command);
}
