import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "../suscripcion/_helpers";

export const dynamic = "force-dynamic";

const PDF_SERVICE_URL = "https://pdf.getpangui.com/generate-pdf";

export async function POST(req: NextRequest) {
  // Sin esta verificación la ruta es un relay abierto: cualquiera en internet
  // puede POSTear y quemar el servicio de PDFs, que se paga por invocación.
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.text();

  let res: Response;
  try {
    res = await fetch(PDF_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
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
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
