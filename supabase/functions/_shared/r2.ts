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

async function deriveSigningKey(
  date: string,
  region: string,
  service: string,
  secret: string = R2_SECRET_ACCESS_KEY,
): Promise<ArrayBuffer> {
  const k1 = await hmac(enc.encode(`AWS4${secret}`), date);
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

// ── Borrado y listado ────────────────────────────────────────────────────────
// Lo usan r2-delete (un objeto, pedido por un usuario) y purge-papelera (la
// carpeta entera de una OT borrada). Antes cada función traía su propia copia
// de la firma.

function encodeRfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * Firma SigV4 por cabecera (no presignada) para una petición sin cuerpo.
 * Pura: recibe credenciales y fecha, así se puede probar contra el vector
 * publicado por AWS.
 */
export async function firmarSigV4(opts: {
  method: string;
  host: string;
  /** Sin codificar; se codifica segmento a segmento. */
  path: string;
  query?: Record<string, string>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const service = "s3";
  const date = opts.now.toISOString().slice(0, 10).replace(/-/g, "");
  const datetime = opts.now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const credScope = `${date}/${opts.region}/${service}/aws4_request`;
  const payloadHash = await sha256Hex("");

  const canonicalUri = opts.path.split("/").map(encodeRfc3986).join("/");
  const canonicalQuery = Object.entries(opts.query ?? {})
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    `host:${opts.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${datetime}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", datetime, credScope, await sha256Hex(canonicalRequest)].join("\n");
  const signingKey = await deriveSigningKey(date, opts.region, service, opts.secretAccessKey);
  const signature = toHex(await hmac(signingKey, stringToSign));

  return {
    url: `https://${opts.host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ""}`,
    headers: {
      "x-amz-date": datetime,
      "x-amz-content-sha256": payloadHash,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${opts.accessKeyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function pedirR2(method: string, path: string, query?: Record<string, string>): Promise<Response> {
  const { url, headers } = await firmarSigV4({
    method,
    host: `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${R2_BUCKET}${path}`,
    query,
    region: "auto",
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    now: new Date(),
  });
  return fetch(url, { method, headers });
}

/** Una clave que se puede borrar: no vacía, sin segmentos vacíos ni `..`. */
export function claveValida(clave: string): boolean {
  return clave.length > 0 && clave.split("/").every((p) => p !== "" && p !== "..");
}

/** Borra un objeto. Que ya no exista (404) cuenta como borrado. */
export async function borrarObjetoR2(clave: string): Promise<void> {
  if (!claveValida(clave)) throw new Error(`clave R2 inválida: ${clave}`);
  const res = await pedirR2("DELETE", `/${clave}`);
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

function desescaparXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Extrae las claves y el token de continuación de un ListObjectsV2. */
export function parsearListado(xml: string): { claves: string[]; siguiente: string | null } {
  const claves = [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => desescaparXml(m[1]));
  const truncado = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const token = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1];
  return { claves, siguiente: truncado && token ? desescaparXml(token) : null };
}

/**
 * Único prefijo que se permite borrar entero: la carpeta de UNA orden.
 * Un prefijo vacío o más corto listaría (y borraría) el bucket completo, así
 * que todo lo que no calce exacto se rechaza.
 */
const PREFIJO_OT = /^ordenes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/;
export function esPrefijoDeOrden(prefijo: string): boolean {
  return PREFIJO_OT.test(prefijo);
}

/** Borra todo lo que hay bajo `ordenes/<id>/`. Devuelve cuántos objetos borró. */
export async function borrarCarpetaDeOrden(prefijo: string): Promise<number> {
  if (!esPrefijoDeOrden(prefijo)) throw new Error(`prefijo R2 no permitido: ${prefijo}`);

  let borrados = 0;
  let token: string | null = null;
  do {
    const query: Record<string, string> = { "list-type": "2", prefix: prefijo };
    if (token) query["continuation-token"] = token;
    const res = await pedirR2("GET", "", query);
    if (!res.ok) throw new Error(`R2 LIST ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const { claves, siguiente } = parsearListado(await res.text());

    // De a 10: una OT puede tener cientos de fotos.
    for (let i = 0; i < claves.length; i += 10) {
      // El prefijo va firmado, pero se revisa igual: nada fuera de la carpeta.
      const tanda = claves.slice(i, i + 10).filter((c) => c.startsWith(prefijo));
      await Promise.all(tanda.map(borrarObjetoR2));
      borrados += tanda.length;
    }
    token = siguiente;
  } while (token);
  return borrados;
}
