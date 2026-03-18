import { NextResponse } from "next/server";
import { getToken, SF_BASE } from "../_token";

export async function GET() {
  try {
    const token = await getToken();
    const rut   = process.env.SIMPLEFACTURA_RUT_EMISOR?.trim();

    const res  = await fetch(`${SF_BASE}/sucursales/${rut}`, {
      method:  "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
    const body = await res.json();
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
