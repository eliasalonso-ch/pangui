/**
 * Cloudflare R2 client (web). Uploads and deletes go through Supabase Edge
 * Functions (`r2-presign` and `r2-delete`) so the R2 access keys never ship
 * in the browser bundle.
 *
 * Browser uploads try the direct presigned R2 PUT first. If a browser CORS
 * preflight blocks that request in production, we fall back to a same-origin
 * API route that performs the exact same R2 PUT server-side.
 */

import { createClient } from "@/lib/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PRESIGN_ENDPOINT = `${SUPABASE_URL}/functions/v1/r2-presign`;
const DELETE_ENDPOINT = `${SUPABASE_URL}/functions/v1/r2-delete`;
const UPLOAD_ENDPOINT = "/api/r2-upload";

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresAt: string;
}

async function getAuthHeader(): Promise<string> {
  const sb = createClient();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("R2 upload requires an authenticated session");
  return `Bearer ${token}`;
}

async function uploadViaApiRoute(file: File, folder: string, authHeader: string): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);

  const uploadRes = await fetch(UPLOAD_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: authHeader,
    },
    body: form,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`R2 upload failed (${uploadRes.status}): ${text}`);
  }

  const uploaded = (await uploadRes.json()) as { publicUrl: string };
  return uploaded.publicUrl;
}

// Upload

/**
 * Extensiones de imagen que el presign acepta. Cualquier otra (avif, heic,
 * heif...) se convierte a JPEG antes de subir.
 */
const EXTENSIONES_IMAGEN_OK = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

/**
 * Convierte a JPEG las imagenes en formatos que R2 no acepta.
 *
 * Safari y las camaras de iPhone entregan HEIC, y Chrome exporta AVIF; el
 * presign las rechaza con `unsupported_extension` y la subida moria antes de
 * empezar. Como el navegador ya sabe decodificar cualquier formato que puede
 * mostrar, se redibuja en un canvas y se re-codifica a JPEG.
 *
 * Si el navegador no puede decodificar el archivo se devuelve tal cual: que
 * falle el presign con un mensaje claro es mejor que subir un JPEG vacio.
 */
async function normalizarImagen(file: File): Promise<File> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!file.type.startsWith("image/") || EXTENSIONES_IMAGEN_OK.has(ext)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;

    const nombre = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

export async function uploadToR2(
  original: File,
  folder: string = "fotos",
): Promise<string> {
  const file = await normalizarImagen(original);
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const authHeader = await getAuthHeader();

  const presignRes = await fetch(PRESIGN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ ext, folder }),
  });

  if (!presignRes.ok) {
    const text = await presignRes.text();
    throw new Error(`R2 presign failed (${presignRes.status}): ${text}`);
  }

  const presign = (await presignRes.json()) as PresignResponse;

  try {
    const putRes = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": presign.contentType,
      },
      body: file,
    });

    if (putRes.ok) {
      return presign.publicUrl;
    }
  } catch {
    // Browser CORS failures surface as TypeError: Failed to fetch. Fall back to
    // the same-origin route below, which performs the R2 PUT server-side.
  }

  return uploadViaApiRoute(file, folder, authHeader);
}

// Delete

export async function deleteFromR2(publicUrl: string): Promise<void> {
  const authHeader = await getAuthHeader();

  const res = await fetch(DELETE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ url: publicUrl }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 delete failed (${res.status}): ${text}`);
  }
}