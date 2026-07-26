import { createClient } from "@/lib/supabase";

export type WorkOrderRolloutV1 = {
  contract_version: 1;
  workspace_id: string | null;
  create_enabled: boolean;
  edit_enabled: boolean;
  transition_enabled: boolean;
  upload_enabled: boolean;
  kill_switch: boolean;
  rollout_percentage: number;
};

export const LEGACY_WORK_ORDER_ROLLOUT: WorkOrderRolloutV1 = {
  contract_version: 1,
  workspace_id: null,
  create_enabled: false,
  edit_enabled: false,
  transition_enabled: false,
  upload_enabled: false,
  kill_switch: false,
  rollout_percentage: 0,
};

export async function getWorkOrderRolloutV1(): Promise<WorkOrderRolloutV1> {
  const { data, error } = await createClient().rpc("get_work_order_rollout_v1" as never);
  if (error || !data) return LEGACY_WORK_ORDER_ROLLOUT;
  return data as unknown as WorkOrderRolloutV1;
}
