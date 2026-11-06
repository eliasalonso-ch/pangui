// Firma SigV4 para Cloudflare R2, compartida por r2-presign (el cliente sube
// directo con una URL firmada) y los crons que copian archivos al bucket
// (meconecta-scrape-cron). Vive una sola vez: el secreto y la firma no se
// duplican entre funciones.

const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "pangui-bucket";
export const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") ?? "https://cdn.getpangui.com";

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
export async function buildPresignedPutUrl(opts: {
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

/** Sube bytes a R2 desde el servidor y devuelve la URL pública. */
export async function subirR2(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const url = await buildPresignedPutUrl({ key, contentType, expiresIn: 300 });
  const res = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: bytes });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${R2_PUBLIC_URL}/${key}`;
}
