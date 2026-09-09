// Returns a presigned URL the authenticated client can PUT a file to directly
// in Cloudflare R2. The signing secret never leaves the Edge Function.
//
// Request:
//   POST /functions/v1/r2-presign
//   Authorization: Bearer <user JWT>
//   { ext: "jpg", folder: "ordenes/abc/grupos" }
//
// Response:
//   { uploadUrl, publicUrl, contentType, expiresAt }
//
// The client then performs:
//   PUT <uploadUrl>
//   Content-Type: <contentType>
//   body: <raw bytes>
//
// On success the file lives at <publicUrl>. The presigned URL expires in
// 5 minutes — long enough for slow rural uploads, short enough that a
// stolen URL is useless tomorrow.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "pangui-bucket";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") ?? "https://cdn.getpangui.com";

const PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes

const MIME_MAP: Record<string, string> = {
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  gif:  "image/gif",
  pdf:  "application/pdf",
  doc:  "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls:  "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt:  "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt:  "text/plain",
  csv:  "text/csv",
  dwg:  "application/acad",
  dxf:  "application/dxf",
  zip:  "application/zip",
};

const ALLOWED_FOLDER_RE = /^[a-zA-Z0-9._\-/]+$/;
// Carpeta temporal para subir archivos antes de que exista la fila: el cliente
// genera `draft-<timestamp>-<random>`. Se acepta solo esta forma exacta, no un
// id arbitrario, y el archivo queda referenciado por la URL guardada al crear.
const DRAFT_ID_RE = /^draft-\d{10,}-[a-z0-9]{4,12}$/;
const SAFE_OBJECT_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function canWriteFolder(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  folder: string,
): Promise<boolean> {
  const parts = folder.split("/");
  // Creation flows upload before their database resource exists. Keep these
  // exact legacy roots available to authenticated users; arbitrary caller-
  // chosen paths remain forbidden. Existing-resource paths are checked below.
  //
  // `cuadrillas` sigue la misma regla que `sociedades` / `ubicaciones` /
  // `lugares`: la foto se sube desde el formulario ANTES de que exista la fila,
  // asi que no hay id contra el cual validar. Sin esto, subir la foto de una
  // cuadrilla devolvia 403 forbidden_folder.
  if (["scans", "partes", "adjuntos", "solicitudes", "sociedades", "ubicaciones", "lugares", "cuadrillas"].includes(folder)) return true;
  if (parts[0] === "ordenes" && parts[1]) {
    const { data: order } = await supabase.from("ordenes_trabajo").select("id").eq("id", parts[1]).maybeSingle();
    if (!order) return false;
    // Folder photos have tighter application permissions than generic OT media.
    if (parts[2] === "grupos" && parts[3]) {
      const { data: group } = await supabase
        .from("foto_grupos")
        .select("id, orden_id, locked, created_by")
        .eq("id", parts[3])
        .eq("orden_id", parts[1])
        .maybeSingle();
      if (!group) return false;
      const { data: profile } = await supabase.from("usuarios").select("rol").eq("id", userId).maybeSingle();
      return group.created_by === userId || profile?.rol === "admin" || profile?.rol === "owner";
    }
    return true;
  }
  if (parts[0] === "activos" && parts[1]) {
    // Crear un activo sube la foto antes de que exista la fila, igual que
    // `scans` / `partes` / `solicitudes`, que ya son raices libres para
    // usuarios autenticados.
    if (DRAFT_ID_RE.test(parts[1])) return true;
    const { data } = await supabase.from("activos").select("id").eq("id", parts[1]).maybeSingle();
    return Boolean(data);
  }
  if (parts[0] === "levantamientos" && parts[1]) {
    const { data } = await supabase.from("levantamientos").select("id").eq("id", parts[1]).maybeSingle();
    return Boolean(data);
  }
  return false;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// AWS SigV4 signing helpers using native WebCrypto (Deno).
const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
}

async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(message));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveSigningKey(date: string, region: string, service: string): Promise<ArrayBuffer> {
  const k1 = await hmac(enc.encode(`AWS4${R2_SECRET_ACCESS_KEY}`), date);
  const k2 = await hmac(k1, region);
  const k3 = await hmac(k2, service);
  return hmac(k3, "aws4_request");
}

// Builds an AWS SigV4 presigned URL for a PUT request to R2.
// Reference: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
async function buildPresignedPutUrl(opts: {
  key: string;
  contentType: string;
  expiresIn: number;
  contentLength?: number;
}): Promise<string> {
  const region = "auto";
  const service = "s3";
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const datetime = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const credScope = `${date}/${region}/${service}/aws4_request`;
  const credential = `${R2_ACCESS_KEY_ID}/${credScope}`;
  const signedHeaders = opts.contentLength
    ? "content-length;content-type;host"
    : "content-type;host";

  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": datetime,
    "X-Amz-Expires": String(opts.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  // URLSearchParams already URL-encodes; AWS expects RFC 3986 — we need to
  // ensure '/' in the credential is escaped. URLSearchParams does this for us
  // (it produces %2F).
  const canonicalQueryString = queryParams.toString();

  const canonicalHeaders = opts.contentLength
    ? `content-length:${opts.contentLength}\ncontent-type:${opts.contentType}\nhost:${host}\n`
    : `content-type:${opts.contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT",
    `/${R2_BUCKET}/${opts.key}`,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    credScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(date, region, service);
  const signature = toHex(await hmac(signingKey, stringToSign));

  return `https://${host}/${R2_BUCKET}/${opts.key}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Authenticate the user via the Bearer token. Anonymous access is forbidden.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing_authorization" }, 401);
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonResponse({ error: "unauthenticated" }, 401);
  }

  let body: { ext?: string; folder?: string; objectId?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const ext = (body.ext ?? "jpg").toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(MIME_MAP, ext)) {
    return jsonResponse({ error: "unsupported_extension", ext }, 400);
  }
  const folder = body.folder ?? "fotos";
  if (!ALLOWED_FOLDER_RE.test(folder) || folder.includes("..")) {
    return jsonResponse({ error: "invalid_folder", folder }, 400);
  }
  if (body.size != null && (!Number.isFinite(body.size) || body.size <= 0 || body.size > MAX_UPLOAD_BYTES)) {
    return jsonResponse({ error: "invalid_file_size", maxBytes: MAX_UPLOAD_BYTES }, 413);
  }
  if (!(await canWriteFolder(supabase, userData.user.id, folder))) {
    console.warn("[r2-presign] forbidden", { userId: userData.user.id, folder });
    return jsonResponse({ error: "forbidden_folder" }, 403);
  }
  if (body.objectId && !SAFE_OBJECT_ID_RE.test(body.objectId)) {
    return jsonResponse({ error: "invalid_object_id" }, 400);
  }

  const contentType = MIME_MAP[ext];
  const objectName = body.objectId ?? `${Date.now()}_${crypto.randomUUID().slice(0, 12)}`;
  const objectKey = `${folder}/${objectName}.${ext}`;
  console.log("[r2-presign] issued", {
    userId: userData.user.id,
    folder,
    objectId: body.objectId ?? null,
    ext,
    size: body.size ?? null,
  });

  const uploadUrl = await buildPresignedPutUrl({
    key: objectKey,
    contentType,
    expiresIn: PRESIGN_EXPIRY_SECONDS,
    contentLength: body.size,
  });
  const publicUrl = `${R2_PUBLIC_URL}/${objectKey}`;
  const expiresAt = new Date(Date.now() + PRESIGN_EXPIRY_SECONDS * 1000).toISOString();

  return jsonResponse({ uploadUrl, publicUrl, contentType, expiresAt });
});
