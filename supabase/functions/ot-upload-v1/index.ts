import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "pangui-bucket";
const R2_PUBLIC_URL = (Deno.env.get("R2_PUBLIC_URL") ?? "https://cdn.getpangui.com").replace(/\/$/, "");
const R2_ENDPOINT = (
  Deno.env.get("R2_ENDPOINT") ?? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
).replace(/\/$/, "");
const CRON_SECRET = Deno.env.get("OT_UPLOAD_CRON_SECRET") ?? "";
const PRESIGN_SECONDS = 300;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const enc = new TextEncoder();
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function hmac(key: ArrayBuffer | Uint8Array, message: string) {
  const imported = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", imported, enc.encode(message));
}

async function sha256Hex(message: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(message));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signingKey(date: string) {
  const dateKey = await hmac(enc.encode(`AWS4${R2_SECRET_ACCESS_KEY}`), date);
  const regionKey = await hmac(dateKey, "auto");
  const serviceKey = await hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function r2ObjectUrl(key: string) {
  return new URL(`${R2_ENDPOINT}/${R2_BUCKET}/${key}`);
}

function awsTime() {
  const now = new Date();
  return {
    date: now.toISOString().slice(0, 10).replace(/-/g, ""),
    datetime: now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z",
  };
}

async function presignedPut(key: string, contentType: string, size: number) {
  const objectUrl = r2ObjectUrl(key);
  const host = objectUrl.host;
  const { date, datetime } = awsTime();
  const scope = `${date}/auto/s3/aws4_request`;
  const signedHeaders = "content-length;content-type;host";
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${R2_ACCESS_KEY_ID}/${scope}`,
    "X-Amz-Date": datetime,
    "X-Amz-Expires": String(PRESIGN_SECONDS),
    "X-Amz-SignedHeaders": signedHeaders,
  }).toString();
  const canonical = [
    "PUT", objectUrl.pathname, query,
    `content-length:${size}\ncontent-type:${contentType}\nhost:${host}\n`,
    signedHeaders, "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256Hex(canonical)].join("\n");
  const signature = hex(await hmac(await signingKey(date), toSign));
  objectUrl.search = `${query}&X-Amz-Signature=${signature}`;
  return objectUrl.toString();
}

async function signedObjectRequest(method: "HEAD" | "DELETE", key: string) {
  const objectUrl = r2ObjectUrl(key);
  const host = objectUrl.host;
  const { date, datetime } = awsTime();
  const scope = `${date}/auto/s3/aws4_request`;
  const payloadHash = await sha256Hex("");
  const headers = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetime}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, objectUrl.pathname, "", headers, signedHeaders, payloadHash].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", datetime, scope, await sha256Hex(canonical)].join("\n");
  const signature = hex(await hmac(await signingKey(date), toSign));
  return fetch(objectUrl, {
    method,
    headers: {
      "x-amz-date": datetime,
      "x-amz-content-sha256": payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  });
}

async function authenticated(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : { client, user: data.user };
}

async function prepare(req: Request, body: Record<string, unknown>) {
  const auth = await authenticated(req);
  if (!auth) return json({ error: "unauthenticated" }, 401);
  const { data, error } = await auth.client.rpc("prepare_ot_upload_v1", { p_command: body.command });
  if (error) return json({ error: "prepare_failed", details: error }, 400);
  const prepared = data?.data;
  if (!prepared?.object_key || !prepared?.content_type || !prepared?.size) {
    return json({ error: "invalid_prepare_result" }, 500);
  }
  return json({
    ...data,
    data: {
      ...prepared,
      upload_url: await presignedPut(prepared.object_key, prepared.content_type, prepared.size),
      public_url: `${R2_PUBLIC_URL}/${prepared.object_key}`,
      upload_url_expires_at: new Date(Date.now() + PRESIGN_SECONDS * 1000).toISOString(),
    },
  });
}

async function finalize(req: Request, body: Record<string, unknown>) {
  const auth = await authenticated(req);
  if (!auth) return json({ error: "unauthenticated" }, 401);
  const intentId = typeof body.intent_id === "string" ? body.intent_id : "";
  const { data: intent, error } = await admin
    .from("ot_upload_intents")
    .select("id, actor_id, object_key, declared_size, status")
    .eq("id", intentId)
    .maybeSingle();
  if (error || !intent) return json({ error: "upload_intent_not_found" }, 404);
  if (intent.actor_id !== auth.user.id) return json({ error: "forbidden" }, 403);
  if (intent.status === "finalized") {
    const { data, error: replayError } = await admin.rpc("finalize_ot_upload_v1", {
      p_intent_id: intent.id,
      p_actor_id: auth.user.id,
      p_public_url: `${R2_PUBLIC_URL}/${intent.object_key}`,
      p_object_key: intent.object_key,
      p_etag: null,
      p_verified_size: intent.declared_size,
    });
    return replayError ? json({ error: "finalize_failed", details: replayError }, 400) : json(data);
  }
  const object = await signedObjectRequest("HEAD", intent.object_key);
  if (!object.ok) return json({ error: "object_not_available", status: object.status }, 409);
  const size = Number(object.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size !== Number(intent.declared_size)) {
    return json({ error: "object_size_mismatch", expected: intent.declared_size, received: size }, 409);
  }
  const { data, error: finalizeError } = await admin.rpc("finalize_ot_upload_v1", {
    p_intent_id: intent.id,
    p_actor_id: auth.user.id,
    p_public_url: `${R2_PUBLIC_URL}/${intent.object_key}`,
    p_object_key: intent.object_key,
    p_etag: object.headers.get("etag"),
    p_verified_size: size,
  });
  return finalizeError ? json({ error: "finalize_failed", details: finalizeError }, 400) : json(data);
}

async function reconcile(req: Request, body: Record<string, unknown>) {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "forbidden" }, 403);
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
  const { data: pending, error } = await admin.rpc("expire_ot_upload_intents_v1", { p_limit: limit });
  if (error) return json({ error: "reconcile_list_failed", details: error }, 500);
  const completed: string[] = [];
  const failures: Array<{ intent_id: string; status: number }> = [];
  for (const intent of pending ?? []) {
    const response = await signedObjectRequest("DELETE", intent.object_key);
    if (response.ok || response.status === 404) completed.push(intent.intent_id);
    else failures.push({ intent_id: intent.intent_id, status: response.status });
  }
  if (completed.length) {
    const { error: completeError } = await admin.rpc("complete_ot_upload_cleanup_v1", { p_intent_ids: completed });
    if (completeError) return json({ error: "cleanup_ack_failed", details: completeError, failures }, 500);
  }
  return json({ processed: pending?.length ?? 0, completed: completed.length, failures });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  try {
    if (body.action === "prepare") return await prepare(req, body);
    if (body.action === "finalize") return await finalize(req, body);
    if (body.action === "reconcile") return await reconcile(req, body);
    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    console.error("[ot-upload-v1] unexpected", error);
    return json({ error: "unexpected_failure" }, 500);
  }
});
