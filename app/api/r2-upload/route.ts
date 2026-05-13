import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PRESIGN_ENDPOINT = `${SUPABASE_URL}/functions/v1/r2-presign`;

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  expiresAt: string;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "missing_authorization" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") || "fotos");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
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
    const detail = await presignRes.text();
    return NextResponse.json({ error: "r2_presign_failed", detail }, { status: presignRes.status });
  }

  const presign = (await presignRes.json()) as PresignResponse;
  const bytes = await file.arrayBuffer();
  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": presign.contentType,
    },
    body: bytes,
  });

  if (!putRes.ok) {
    const detail = await putRes.text();
    return NextResponse.json({ error: "r2_upload_failed", detail }, { status: 502 });
  }

  return NextResponse.json({ publicUrl: presign.publicUrl, expiresAt: presign.expiresAt });
}
