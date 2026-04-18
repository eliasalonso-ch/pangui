/**
 * Cloudflare R2 upload/delete via S3-compatible API.
 * Uses AWS Signature Version 4 with the Web Crypto API (available in all modern browsers + Node 18+).
 */

const R2_ACCOUNT_ID     = "20b08b7b6b21457b0631fd4c0cc7f9a5";
const R2_ACCESS_KEY_ID  = "7ea7770f51e9651c0fda04cf294da924";
const R2_SECRET_ACCESS_KEY = "614e112d8c8e39db4a9bb4f73fd9aaf17618b238ff421ec11b1d4bf766eb836c";
const R2_BUCKET         = "pangui-bucket";
const R2_PUBLIC_URL     = "https://cdn.getpangui.com";
const R2_ENDPOINT       = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// ── Crypto helpers ────────────────────────────────────────────────────────────

const enc = (s: string) => new TextEncoder().encode(s);

async function sha256Hex(data: BufferSource): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(key: BufferSource, data: BufferSource): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, data);
}

async function signingKey(secretKey: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
  const k1 = await hmacSha256(enc(`AWS4${secretKey}`), enc(date));
  const k2 = await hmacSha256(k1, enc(region));
  const k3 = await hmacSha256(k2, enc(service));
  return hmacSha256(k3, enc("aws4_request"));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function contentTypeForExt(ext: string): string {
  if (ext === "png")  return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif")  return "image/gif";
  return "image/jpeg";
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToR2(
  file: File,
  folder: string = "fotos",
): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
  const contentType = contentTypeForExt(safeExt);
  const key = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${safeExt}`;

  const bytes = new Uint8Array(await file.arrayBuffer());

  const now = new Date();
  const date     = now.toISOString().slice(0, 10).replace(/-/g, "");
  const datetime = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const region   = "auto";
  const service  = "s3";
  const host     = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url      = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

  const payloadHash = await sha256Hex(bytes);
  const credScope   = `${date}/${region}/${service}/aws4_request`;

  const canonicalReq = [
    "PUT",
    `/${R2_BUCKET}/${key}`,
    "",
    `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetime}\n`,
    "content-type;host;x-amz-content-sha256;x-amz-date",
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    credScope,
    await sha256Hex(enc(canonicalReq)),
  ].join("\n");

  const sk  = await signingKey(R2_SECRET_ACCESS_KEY, date, region, service);
  const sig = toHex(await hmacSha256(sk, enc(stringToSign)));

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type":           contentType,
      "x-amz-date":             datetime,
      "x-amz-content-sha256":   payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credScope}, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
    },
    body: bytes,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 upload failed (${res.status}): ${text}`);
  }

  return `${R2_PUBLIC_URL}/${key}`;
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteFromR2(publicUrl: string): Promise<void> {
  const key = publicUrl.replace(`${R2_PUBLIC_URL}/`, "");
  if (!key || key === publicUrl) return;

  const now = new Date();
  const date     = now.toISOString().slice(0, 10).replace(/-/g, "");
  const datetime = now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
  const region   = "auto";
  const service  = "s3";
  const host     = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const url      = `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

  const payloadHash = await sha256Hex(new Uint8Array(0));
  const credScope   = `${date}/${region}/${service}/aws4_request`;

  const canonicalReq = [
    "DELETE",
    `/${R2_BUCKET}/${key}`,
    "",
    `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetime}\n`,
    "host;x-amz-content-sha256;x-amz-date",
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    datetime,
    credScope,
    await sha256Hex(enc(canonicalReq)),
  ].join("\n");

  const sk  = await signingKey(R2_SECRET_ACCESS_KEY, date, region, service);
  const sig = toHex(await hmacSha256(sk, enc(stringToSign)));

  await fetch(url, {
    method: "DELETE",
    headers: {
      "x-amz-date":           datetime,
      "x-amz-content-sha256": payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${sig}`,
    },
  });
}
