import { createClient } from "@/lib/supabase";
import type { CommandEnvelope, CommandResult } from "./commands-v1";

export const WORK_ORDER_UPLOAD_INTENTS_V1_ENABLED =
  process.env.NEXT_PUBLIC_WORK_ORDER_UPLOAD_INTENTS_V1 === "true";

export type OtUploadKindV1 = "photo_group_item" | "work_order_photo" | "work_order_attachment";

export type PrepareOtUploadPayloadV1 = {
  ot_id: string;
  kind: OtUploadKindV1;
  extension: string;
  size: number;
  original_name?: string;
  target?: { grupo_id?: string; item_id?: string; orden_display?: number };
};

export type PreparedOtUploadV1 = {
  intent_id: string;
  object_key: string;
  content_type: string;
  size: number;
  expires_at: string;
  upload_url: string;
  public_url: string;
  upload_url_expires_at: string;
};

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await createClient().functions.invoke("ot-upload-v1", { body });
  if (error) throw error;
  return data as T;
}

export function prepareOtUploadV1(command: CommandEnvelope<PrepareOtUploadPayloadV1>) {
  return invoke<CommandResult<PreparedOtUploadV1>>({ action: "prepare", command });
}

export function finalizeOtUploadV1(intentId: string) {
  return invoke<CommandResult<{
    orden_id: string;
    kind: OtUploadKindV1;
    public_url: string;
    activity_id: string;
    notification_outbox_ids: string[];
  }>>({ action: "finalize", intent_id: intentId });
}
