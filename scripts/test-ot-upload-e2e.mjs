import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const required = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "OT_UPLOAD_CRON_SECRET"];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
}

const url = process.env.SUPABASE_URL.replace(/\/$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const cronSecret = process.env.OT_UPLOAD_CRON_SECRET;
const edgeUrl = `${url}/functions/v1/ot-upload-v1`;
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const suffix = randomUUID();
const userId = randomUUID();
const workspaceId = randomUUID();
const password = `Local-${randomUUID()}-Aa1!`;
const email = `ot-upload-${suffix}@test.local`;

function command(actorId, payload) {
  return { contract_version: 1, command_id: randomUUID(), workspace_id: workspaceId, actor_id: actorId, payload };
}

async function edge(body, token, headers = {}) {
  const response = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.ok, true, `${response.status}: ${JSON.stringify(data)}`);
  return data;
}

let orderId;
try {
  const { error: authError } = await admin.auth.admin.createUser({ id: userId, email, password, email_confirm: true });
  if (authError) throw authError;
  const { error: workspaceError } = await admin.from("workspaces").insert({ id: workspaceId, nombre: "OT upload E2E" });
  if (workspaceError) throw workspaceError;
  const { error: profileError } = await admin.from("usuarios").insert({
    id: userId, nombre: "Upload tester", rol: "owner", workspace_id: workspaceId, activo: true,
  });
  if (profileError) throw profileError;

  const userClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: session, error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError ?? new Error("No local session returned");
  const token = session.session.access_token;

  const createEnvelope = command(userId, { titulo: "OT upload E2E" });
  const { data: created, error: createError } = await userClient.rpc("create_work_order_v1", { p_command: createEnvelope });
  if (createError) throw createError;
  orderId = created.data.work_order.id;

  const pdf = Buffer.from("%PDF-1.4\n% Pangui local upload contract\n%%EOF\n", "utf8");
  const prepareEnvelope = command(userId, {
    ot_id: orderId,
    kind: "work_order_attachment",
    extension: "pdf",
    size: pdf.byteLength,
    original_name: "prueba-e2e.pdf",
  });
  const prepared = await edge({ action: "prepare", command: prepareEnvelope }, token);
  assert.ok(prepared.data.upload_url);
  const upload = await fetch(prepared.data.upload_url, {
    method: "PUT",
    headers: { "content-type": prepared.data.content_type, "content-length": String(pdf.byteLength) },
    body: pdf,
  });
  assert.equal(upload.ok, true, `S3 upload failed with ${upload.status}: ${await upload.text()}`);

  const finalized = await edge({ action: "finalize", intent_id: prepared.data.intent_id }, token);
  assert.equal(finalized.data.kind, "work_order_attachment");
  const { data: storedOrder, error: storedError } = await admin.from("ordenes_trabajo").select("links").eq("id", orderId).single();
  if (storedError) throw storedError;
  assert.equal(storedOrder.links.length, 1);
  assert.equal(storedOrder.links[0].nombre, "prueba-e2e.pdf");
  assert.equal(storedOrder.links[0].origen, "ejecucion");

  const expiringEnvelope = command(userId, {
    ot_id: orderId,
    kind: "work_order_attachment",
    extension: "txt",
    size: 5,
    original_name: "expira.txt",
  });
  const expiring = await edge({ action: "prepare", command: expiringEnvelope }, token);
  const { error: expiryError } = await admin
    .from("ot_upload_intents")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", expiring.data.intent_id);
  if (expiryError) throw expiryError;
  await edge({ action: "reconcile", limit: 100 }, null, { "x-cron-secret": cronSecret });
  const { data: expired, error: expiredError } = await admin
    .from("ot_upload_intents")
    .select("status")
    .eq("id", expiring.data.intent_id)
    .single();
  if (expiredError) throw expiredError;
  assert.equal(expired.status, "expired");

  console.log(JSON.stringify({ ok: true, uploaded: "pdf", metadata: "verified", cleanup: "verified" }));
} finally {
  if (workspaceId) await admin.from("workspaces").delete().eq("id", workspaceId);
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}
