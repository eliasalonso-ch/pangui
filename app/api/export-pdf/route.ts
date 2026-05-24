import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PDF_SERVICE_URL = "https://pdf.getpangui.com/generate-pdf";

export async function POST(req: NextRequest) {
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

  // Inspect the payload to see what the web app is sending
  try {
    const parsed = JSON.parse(body);
    const proc = parsed.procedimientos?.[0];
    const respuestas = proc?.ejecucion?.respuestas ?? [];
    const fotoRespuestas = respuestas.filter((r: { foto_url?: string }) => r.foto_url);
    console.log(`[export-pdf] payload summary:`, {
      bytes: body.length,
      procedimientos: parsed.procedimientos?.length,
      pasosEnPrimerProc: proc?.procedimiento?.pasos?.length,
      respuestas: respuestas.length,
      respuestasConFoto: fotoRespuestas.length,
      sampleFotoUrl: fotoRespuestas[0]?.foto_url?.slice(0, 80),
      fields: parsed.fields,
      fotoGruposItems: parsed.fotoGrupos?.reduce((n: number, g: { foto_grupo_items?: unknown[] }) => n + (g.foto_grupo_items?.length ?? 0), 0),
    });
  } catch {}

  const pdf = await res.arrayBuffer();
  console.log(`[export-pdf] received ${pdf.byteLength} bytes from ${PDF_SERVICE_URL}`);
  return new NextResponse(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
