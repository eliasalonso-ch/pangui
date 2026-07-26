import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  edit: vi.fn(),
  transition: vi.fn(),
  rollout: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/work-orders/commands-v1", () => ({
  WORK_ORDER_COMMANDS_V1_ENABLED: true,
  createWorkOrderV1: vi.fn(),
  editWorkOrderV1: mocks.edit,
  transitionWorkOrderV1: mocks.transition,
}));

vi.mock("@/lib/work-orders/rollout-v1", () => ({
  getWorkOrderRolloutV1: mocks.rollout,
}));

vi.mock("@/lib/supabase", () => ({
  createClient: () => ({ from: mocks.from }),
}));

vi.mock("@/lib/supabase-auth-retry", () => ({
  withSupabaseAuthRetry: (operation: () => PromiseLike<unknown>) => operation(),
}));

vi.mock("@/lib/notificar", () => ({
  notifyOTCreada: vi.fn(),
  notifyOTEstadoCambiado: vi.fn(),
}));

vi.mock("@/lib/cuotas-client", () => ({
  ensureOtCategoria: vi.fn(),
}));

import { completarOrden, iniciarOrden, updateOrden } from "@/lib/ordenes-api";

function currentOrderQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.single.mockResolvedValue({
    data: { workspace_id: "ws-1", updated_at: "2026-07-26T00:00:00Z" },
    error: null,
  });
  return query;
}

describe("updateOrden canonical routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rollout.mockResolvedValue({
      edit_enabled: true,
      transition_enabled: true,
      kill_switch: false,
    });
    mocks.edit.mockResolvedValue({
      data: { work_order: { id: "ot-1", titulo: "Editada" } },
    });
    mocks.transition.mockResolvedValue({ data: { work_order: { id: "ot-1" } } });
  });

  it("routes edits through edit_work_order_v1 and leaves next-date derivation to Postgres", async () => {
    const query = currentOrderQuery();
    mocks.from.mockReturnValue(query);

    const result = await updateOrden("ot-1", "user-1", {
      descripcion: "EDITADA V1",
      recurrencia: "semanal",
      recurrencia_config: { interval: 1, unit: "week", weekdays: [1] },
      fecha_inicio: "2026-07-25",
    });

    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({
      contract_version: 1,
      workspace_id: "ws-1",
      actor_id: "user-1",
      payload: {
        ot_id: "ot-1",
        expected_updated_at: "2026-07-26T00:00:00Z",
        changes: {
          descripcion: "EDITADA V1",
          recurrencia: "semanal",
          recurrencia_config: { interval: 1, unit: "week", weekdays: [1] },
          fecha_inicio: "2026-07-25",
        },
      },
    }));
    expect(result).toEqual({ id: "ot-1", titulo: "Editada" });
  });

  it("routes start and completion through transition_work_order_v1 without legacy writes", async () => {
    mocks.from.mockImplementation(() => currentOrderQuery());

    await iniciarOrden("ot-1", "user-1");
    await completarOrden("ot-1", "user-1", "Trabajo terminado", 120);

    expect(mocks.transition).toHaveBeenNthCalledWith(1, expect.objectContaining({
      workspace_id: "ws-1",
      actor_id: "user-1",
      payload: {
        ot_id: "ot-1",
        expected_updated_at: "2026-07-26T00:00:00Z",
        action: "start",
      },
    }));
    expect(mocks.transition).toHaveBeenNthCalledWith(2, expect.objectContaining({
      workspace_id: "ws-1",
      actor_id: "user-1",
      payload: {
        ot_id: "ot-1",
        expected_updated_at: "2026-07-26T00:00:00Z",
        action: "complete",
        comment: "Trabajo terminado",
      },
    }));
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
});
