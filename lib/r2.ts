/**
 * Cloudflare R2 client (web). Uploads and deletes go through Supabase Edge
 * Functions (`r2-presign` and `r2-delete`) so the R2 access keys never ship
 * in the browser bundle.
 *
 * Flow for uploadToR2:
 *   1. Call /functions/v1/r2-presign with the user's JWT. Edge Function
 *      authenticates, signs a SigV4 PUT URL, returns it.
 *   2. PUT the file bytes directly to R2 with that presigned URL.
 *   3. On success the file is publicly readable at `publicUrl`.
 *
 * R2 must have a CORS policy allowing PUT/GET/HEAD/DELETE from the web app's
 * origin (configured at the bucket level in the Cloudflare dashboard).
 */

import { createClient } from "@/lib/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PRESIGN_ENDPOINT = `${SUPABASE_URL}/functions/v1/r2-presign`;
const DELETE_ENDPOINT = `${SUPABASE_URL}/functions/v1/r2-delete`;

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

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadToR2(
  file: File,
  folder: string = "fotos",
): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
  const authHeader = await getAuthHeader();

  // Step 1: ask the Edge Function for a presigned PUT URL.
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

  // Step 2: PUT the file directly to R2 using the presigned URL. The browser
  // attaches CORS preflight; R2's bucket-level CORS policy must allow the
  // origin and headers used here.
  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": presign.contentType,
    },
    body: file,
  });

  if (!putRes.ok) {
    const text = await putRes.text();
    throw new Error(`R2 upload failed (${putRes.status}): ${text}`);
  }

  return presign.publicUrl;
}

// ── Delete ────────────────────────────────────────────────────────────────────

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
