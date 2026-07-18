import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";

const FIELDS = "billing_email, razon_social, rut, giro, direccion, comuna, ciudad, region, pais, receive_pdf_invoices, invoice_language";

export async function GET() {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const { data, error } = await adminSupabase()
    .from("billing_profiles")
    .select(FIELDS)
    .eq("workspace_id", auth.ctx.workspaceId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "No se pudieron cargar los datos de facturación." }, { status: 500 });
  return NextResponse.json(data ?? { billing_email: auth.ctx.email, pais: "Chile", receive_pdf_invoices: true, invoice_language: "es" });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });
  const value = (key: string, required = false) => {
    const result = typeof body[key] === "string" ? body[key].trim() : "";
    if (required && !result) throw new Error(`El campo ${key} es obligatorio.`);
    return result || null;
  };
  try {
    const profile = {
      workspace_id: auth.ctx.workspaceId,
      billing_email: value("billing_email", true),
      razon_social: value("razon_social"),
      rut: value("rut"),
      giro: value("giro"),
      direccion: value("direccion"),
      comuna: value("comuna"),
      ciudad: value("ciudad"),
      region: value("region"),
      pais: value("pais") ?? "Chile",
      receive_pdf_invoices: body.receive_pdf_invoices !== false,
      invoice_language: body.invoice_language === "en" ? "en" : "es",
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await adminSupabase()
      .from("billing_profiles")
      .upsert(profile, { onConflict: "workspace_id" })
      .select(FIELDS)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo guardar." }, { status: 400 });
  }
}
