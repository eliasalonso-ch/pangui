import { NextRequest, NextResponse } from "next/server";

const PDF_SERVICE_URL = "https://pdf.getpangui.com/generate-pdf";

export async function POST(req: NextRequest) {
  const body = await req.text();

  let res: Response;
  try {
    res = await fetch(PDF_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo conectar al servicio PDF: ${msg}` }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `Error del servicio PDF: ${res.status}\n${text}` }, { status: res.status });
  }

  const pdf = await res.arrayBuffer();
  return new NextResponse(pdf, {
    status: 200,
    headers: { "Content-Type": "application/pdf" },
  });
}
