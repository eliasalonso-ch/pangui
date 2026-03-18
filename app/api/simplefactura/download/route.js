import { NextResponse } from "next/server";
import { getToken, SF_BASE } from "../_token";

// GET /api/simplefactura/download?folio=123&tipo=33&format=pdf|xml
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const folio   = parseInt(searchParams.get("folio"), 10);
    const tipo    = parseInt(searchParams.get("tipo") ?? "33", 10);
    const format  = searchParams.get("format") ?? "pdf";
    const ambiente = parseInt(process.env.SIMPLEFACTURA_AMBIENTE ?? "0", 10);

    if (!folio) return NextResponse.json({ error: "Falta folio" }, { status: 400 });

    const token = await getToken();

    const sfBody = {
      credenciales: { rutEmisor: process.env.SIMPLEFACTURA_RUT_EMISOR?.trim() },
      dteReferenciadoExterno: { folio, codigoTipoDte: tipo, ambiente },
    };

    const endpoint = format === "xml" ? `${SF_BASE}/dte/xml` : `${SF_BASE}/dte/pdf`;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(sfBody),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: text.slice(0, 300) }, { status: 400 });
    }

    const blob        = await res.arrayBuffer();
    const contentType = format === "xml" ? "application/xml" : "application/pdf";
    const filename    = `DTE_${tipo}_${folio}.${format}`;

    return new Response(blob, {
      headers: {
        "Content-Type":        contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
