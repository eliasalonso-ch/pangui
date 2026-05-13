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

export async function uploadToR2(
  file: File,
  folder: string = "fotos",
): Promise<string> {
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