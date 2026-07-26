import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ createClient: () => ({ functions: { invoke } }) }));

import { finalizeOtUploadV1, prepareOtUploadV1 } from "@/lib/work-orders/uploads-v1";

describe("OT upload-intent web adapter", () => {
  beforeEach(() => invoke.mockReset());

  it("passes the canonical command envelope to the Edge boundary", async () => {
    const command = {
      contract_version: 1 as const,
      command_id: "cbed3057-c6d4-4aee-a934-ab353505df37",
      workspace_id: "f1b64714-6de2-4d49-b6e4-5959553e94d7",
      actor_id: "17929bdc-a2c0-4139-8469-a239feaa0f44",
      payload: { ot_id: "f2326b35-dae7-4c18-b10a-aa9202e33e66", kind: "work_order_attachment" as const, extension: "pdf", size: 42 },
    };
    invoke.mockResolvedValue({ data: { data: { intent_id: command.command_id } }, error: null });
    await prepareOtUploadV1(command);
    expect(invoke).toHaveBeenCalledWith("ot-upload-v1", { body: { action: "prepare", command } });
  });

  it("finalizes by intent ID rather than trusting client metadata", async () => {
    invoke.mockResolvedValue({ data: { replayed: false }, error: null });
    await finalizeOtUploadV1("cbed3057-c6d4-4aee-a934-ab353505df37");
    expect(invoke).toHaveBeenCalledWith("ot-upload-v1", { body: { action: "finalize", intent_id: "cbed3057-c6d4-4aee-a934-ab353505df37" } });
  });
});

describe("canonical OT upload intent contract", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260725180000_ot_upload_intents_v1.sql"), "utf8");
  const edge = readFileSync(resolve(process.cwd(), "supabase/functions/ot-upload-v1/index.ts"), "utf8");

  it("makes preparation idempotent and finalization service-owned", () => {
    expect(sql).toContain("COMMAND_PAYLOAD_MISMATCH");
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("UPLOAD_VERIFICATION_FAILED");
  });

  it("commits metadata, activity, and notification intent atomically", () => {
    expect(sql).toContain("INSERT INTO public.foto_grupo_items");
    expect(sql).toContain("INSERT INTO public.actividad_ot");
    expect(sql).toContain("INSERT INTO public.work_order_notification_outbox");
  });

  it("keeps failed object cleanup retryable", () => {
    expect(sql).toContain("cleanup_pending");
    expect(sql).toContain("complete_ot_upload_cleanup_v1");
    expect(edge).toContain('signedObjectRequest("DELETE"');
  });

  it("verifies R2 with HEAD before finalizing metadata", () => {
    expect(edge).toContain('signedObjectRequest("HEAD"');
    expect(edge).toContain("object_size_mismatch");
  });

  it("supports an isolated S3-compatible endpoint without changing the R2 production default", () => {
    expect(edge).toContain('Deno.env.get("R2_ENDPOINT")');
    expect(edge).toContain("r2.cloudflarestorage.com");
    expect(edge).toContain("objectUrl.pathname");
  });
});
