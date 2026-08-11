import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ rpc }),
}));

import {
  createSubWorkOrderV1,
  createWorkOrderV1,
  editWorkOrderV1,
  transitionWorkOrderV1,
  type CommandEnvelope,
  type CreateWorkOrderPayloadV1,
} from "@/lib/work-orders/commands-v1";

describe("work-order command v1 web adapter", () => {
  beforeEach(() => rpc.mockReset());

  it("sends the complete envelope to create_work_order_v1", async () => {
    const command: CommandEnvelope<CreateWorkOrderPayloadV1> = {
      contract_version: 1,
      command_id: "4d718d2d-bd1f-47d6-aed2-8b0e9cd3cd69",
      workspace_id: "f1b64714-6de2-4d49-b6e4-5959553e94d7",
      actor_id: "17929bdc-a2c0-4139-8469-a239feaa0f44",
      payload: { titulo: "Revisar tablero", prioridad: "alta" },
    };
    const result = { contract_version: 1, command_id: command.command_id, replayed: false, data: {} };
    rpc.mockResolvedValue({ data: result, error: null });

    await expect(createWorkOrderV1(command)).resolves.toEqual(result);
    expect(rpc).toHaveBeenCalledWith("create_work_order_v1", { p_command: command });
  });

  it("uses the sub-work-order RPC without remapping its inheritance policy", async () => {
    const command = {
      contract_version: 1 as const,
      command_id: "d736a648-a75d-484b-a50d-c2278e5b07c0",
      workspace_id: "f1b64714-6de2-4d49-b6e4-5959553e94d7",
      actor_id: "17929bdc-a2c0-4139-8469-a239feaa0f44",
      payload: {
        parent_id: "f2326b35-dae7-4c18-b10a-aa9202e33e66",
        titulo: "Subtarea",
        inheritance_policy: "operational" as const,
        include_all_procedures: true,
      },
    };
    rpc.mockResolvedValue({ data: { replayed: true }, error: null });

    await createSubWorkOrderV1(command);
    expect(rpc).toHaveBeenCalledWith("create_sub_work_order_v1", { p_command: command });
  });

  it("surfaces the stable server error", async () => {
    const error = { code: "P0001", message: "COMMAND_PAYLOAD_MISMATCH" };
    rpc.mockResolvedValue({ data: null, error });
    const command = {
      contract_version: 1 as const,
      command_id: "4d718d2d-bd1f-47d6-aed2-8b0e9cd3cd69",
      workspace_id: "f1b64714-6de2-4d49-b6e4-5959553e94d7",
      actor_id: "17929bdc-a2c0-4139-8469-a239feaa0f44",
      payload: { titulo: "OT" },
    };

    await expect(createWorkOrderV1(command)).rejects.toMatchObject({
      name: "WorkOrderCommandError",
      code: "COMMAND_PAYLOAD_MISMATCH",
      message: expect.any(String),
    });
  });

  it("turns requirement codes into user-facing errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "PROCEDURES_INCOMPLETE" } });
    const command = {
      contract_version: 1 as const,
      command_id: "61c13332-b8a4-43c9-a9fd-e210ecb9bc43",
      workspace_id: "f1b64714-6de2-4d49-b6e4-5959553e94d7",
      actor_id: "17929bdc-a2c0-4139-8469-a239feaa0f44",
      payload: { ot_id: "f2326b35-dae7-4c18-b10a-aa9202e33e66", expected_updated_at: "2026-07-25T18:00:00Z", action: "start" as const },
    };

    await expect(transitionWorkOrderV1(command)).rejects.toMatchObject({
      code: "PROCEDURES_INCOMPLETE",
      message: "Debes completar los procedimientos obligatorios antes de continuar.",
    });
  });

  it("sends optimistic concurrency data to the edit command", async () => {
    const command = {
      contract_version: 1 as const,
      command_id: "805a0e11-822f-49f8-9599-c25d194660ec",
      workspace_id: "f1b64714-6de2-4d49-b6e4-5959553e94d7",
      actor_id: "17929bdc-a2c0-4139-8469-a239feaa0f44",
      payload: {
        ot_id: "f2326b35-dae7-4c18-b10a-aa9202e33e66",
        expected_updated_at: "2026-07-25T18:00:00.000Z",
        changes: { prioridad: "urgente" },
      },
    };
    rpc.mockResolvedValue({ data: { replayed: false }, error: null });
    await editWorkOrderV1(command);
    expect(rpc).toHaveBeenCalledWith("edit_work_order_v1", { p_command: command });
  });

  it("does not send client-computed elapsed seconds to transitions", async () => {
    const command = {
      contract_version: 1 as const,
      command_id: "cf7cd555-cbd5-4852-8081-f46949517b79",
      workspace_id: "f1b64714-6de2-4d49-b6e4-5959553e94d7",
      actor_id: "17929bdc-a2c0-4139-8469-a239feaa0f44",
      payload: {
        ot_id: "f2326b35-dae7-4c18-b10a-aa9202e33e66",
        expected_updated_at: "2026-07-25T18:00:00.000Z",
        action: "complete" as const,
        comment: "Trabajo finalizado",
      },
    };
    rpc.mockResolvedValue({ data: { replayed: false }, error: null });
    await transitionWorkOrderV1(command);
    expect(rpc).toHaveBeenCalledWith("transition_work_order_v1", { p_command: command });
    expect(command.payload).not.toHaveProperty("tiempo_total_segundos");
  });
});

describe("canonical create-command migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260725170000_work_order_create_commands_v1.sql"),
    "utf8",
  );

  it("has an idempotency ledger and mismatch guard", () => {
    expect(sql).toContain("PRIMARY KEY (workspace_id, command_id)");
    expect(sql).toContain("COMMAND_PAYLOAD_MISMATCH");
    expect(sql).toContain("FOR UPDATE");
  });

  it("authenticates server-side and serializes OT number allocation", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("v_envelope_actor_id IS DISTINCT FROM v_actor_id");
  });

  it("revalidates tenant-owned references inside the definer function", () => {
    expect(sql).toContain("Every assignee must be an active member of this workspace");
    expect(sql).toContain("lugar_id is not valid for this workspace and location");
    expect(sql).toContain("Every category must belong to this workspace");
  });

  it("keeps domain effects in the same PostgreSQL command", () => {
    expect(sql).toContain("INSERT INTO public.ordenes_trabajo");
    expect(sql).toContain("INSERT INTO public.actividad_ot");
    expect(sql).not.toContain("INSERT INTO public.hojas_inventario");
    expect(sql).toContain("INSERT INTO public.work_order_notification_outbox");
  });

  it("implements optimistic edits and server-owned transition time", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.edit_work_order_v1");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.transition_work_order_v1");
    expect(sql).toContain("v_before.updated_at IS DISTINCT FROM v_expected_updated_at");
    expect(sql).toContain("EXTRACT(EPOCH FROM (v_now - v_before.iniciado_at))");
  });

  it("enforces canonical completion requirements", () => {
    expect(sql).toContain("PROCEDURES_INCOMPLETE");
    expect(sql).toContain("MATERIALS_REQUIRED");
    expect(sql).toContain("SHEET_REQUIRED");
    expect(sql).toContain("PHOTOS_REQUIRED");
    expect(sql).toContain("completado_por = CASE WHEN v_action = 'complete' THEN v_actor_id");
  });

  it("does not expose command or outbox tables to authenticated clients", () => {
    expect(sql).toContain("REVOKE ALL ON TABLE public.work_order_commands FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("REVOKE ALL ON TABLE public.work_order_notification_outbox FROM PUBLIC, anon, authenticated");
  });
});

describe("admin force-close override migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260811164444_ot_force_close_override.sql"),
    "utf8",
  );

  it("restricts the override to elevated roles and demands a justification", () => {
    expect(sql).toContain("FORCE_CLOSE_FORBIDDEN");
    expect(sql).toContain("FORCE_CLOSE_REASON_REQUIRED");
    expect(sql).toContain("COALESCE(v_user.rol, '') NOT IN ('owner', 'admin')");
  });

  it("only lets the override apply to a completion", () => {
    expect(sql).toContain("force_close is only valid with the complete action");
  });

  it("still enforces every requisito when the close is not forced", () => {
    expect(sql).toContain("IF NOT v_force_close THEN");
    expect(sql).toContain("PROCEDURES_INCOMPLETE");
    expect(sql).toContain("MATERIALS_REQUIRED");
    expect(sql).toContain("SHEET_REQUIRED");
    expect(sql).toContain("PHOTOS_REQUIRED");
  });

  it("keeps the state machine intact when forcing a close", () => {
    // The transition guard sits above the `IF NOT v_force_close` block, so a
    // forced close still cannot resurrect a terminal or invalid-state OT.
    const completeBranch = sql.slice(sql.indexOf("WHEN 'complete' THEN"));
    const stateGuard = completeBranch.indexOf("complete is not valid from the current state");
    const overrideGuard = completeBranch.indexOf("IF NOT v_force_close THEN");
    expect(stateGuard).toBeGreaterThan(-1);
    expect(overrideGuard).toBeGreaterThan(stateGuard);
  });

  it("records the override on the row, not only in the activity log", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS cierre_forzado boolean NOT NULL DEFAULT false");
    expect(sql).toContain("cierre_forzado_motivo");
    expect(sql).toContain("cierre_forzado_por");
    expect(sql).toContain("'Cierre forzado: ' || v_force_reason");
  });

  it("clears the override when the OT is reopened", () => {
    expect(sql).toContain("WHEN v_action = 'reopen' THEN false");
  });

  it("lets the photo trigger stand down only for a verified elevated override", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_ot_photo_completion");
    expect(sql).toContain("COALESCE(u.rol, '') IN ('owner', 'admin')");
    expect(sql).toContain("u.workspace_id = NEW.workspace_id");
    // A bare flag flip must not be enough: a reason and an actor are required too.
    expect(sql).toContain("NULLIF(btrim(COALESCE(NEW.cierre_forzado_motivo, '')), '') IS NOT NULL");
    expect(sql).toContain("RAISE EXCEPTION 'Esta OT requiere al menos una foto subida antes de completarse'");
  });
});
