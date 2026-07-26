import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ createClient: () => ({ rpc }) }));

import { getWorkOrderRolloutV1, LEGACY_WORK_ORDER_ROLLOUT } from "@/lib/work-orders/rollout-v1";

describe("work-order rollout web adapter", () => {
  beforeEach(() => rpc.mockReset());

  it("fails closed to legacy behavior when config is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
    await expect(getWorkOrderRolloutV1()).resolves.toEqual(LEGACY_WORK_ORDER_ROLLOUT);
  });

  it("uses the server-resolved deterministic cohort", async () => {
    const config = { ...LEGACY_WORK_ORDER_ROLLOUT, workspace_id: "w", create_enabled: true, rollout_percentage: 10 };
    rpc.mockResolvedValue({ data: config, error: null });
    await expect(getWorkOrderRolloutV1()).resolves.toEqual(config);
    expect(rpc).toHaveBeenCalledWith("get_work_order_rollout_v1");
  });
});

describe("canonical rollout controls", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260725190000_work_order_rollout_v1.sql"), "utf8");
  it("defaults every command domain off and provides a kill switch", () => {
    expect(sql).toContain("create_enabled boolean NOT NULL DEFAULT false");
    expect(sql).toContain("upload_enabled boolean NOT NULL DEFAULT false");
    expect(sql).toContain("kill_switch boolean NOT NULL DEFAULT false");
  });
  it("keeps rollout mutation and health private to service role", () => {
    expect(sql).toContain("GRANT ALL ON TABLE public.work_order_rollout_v1 TO service_role");
    expect(sql).toContain("Only operational services may read rollout health");
  });
});
