import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";

const FIELDS = "billing_email, razon_social, rut, giro, direccion, comuna, ciudad, region, pais, receive_pdf_invoices, invoice_language";
const LEGACY_FIELDS = "billing_email, razon_social, rut, giro, direccion, comuna, ciudad, region, pais";
const SCHEMA_MISMATCH_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

function emptyProfile(email: string) {
  return { billing_email: email, pais: "Chile", receive_pdf_invoices: true, invoice_language: "es" };
}

export async function GET() {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;
  const admin = adminSupabase();
  const { data, error } = await admin
    .from("billing_profiles")
    .select(FIELDS)
    .eq("workspace_id", auth.ctx.workspaceId)
    .maybeSingle();
  if (!error) return NextResponse.json(data ?? emptyProfile(auth.ctx.email));

  if (error.code === "42703" || error.code === "PGRST204") {
    const legacy = await admin
      .from("billing_profiles")
      .select(LEGACY_FIELDS)
      .eq("workspace_id", auth.ctx.workspaceId)
      .maybeSingle();
    if (!legacy.error) {
      return NextResponse.json({ ...emptyProfile(auth.ctx.email), ...(legacy.data ?? {}) });
    }
  }

  if (SCHEMA_MISMATCH_CODES.has(error.code ?? "")) {
    console.warn("[billing-profile] schema not ready", { code: error.code, message: error.message });
    return NextResponse.json(emptyProfile(auth.ctx.email));
  }

  console.error("[billing-profile] GET failed", { code: error.code, message: error.message, details: error.details });
  return NextResponse.json({ error: "No se pudieron cargar los datos de facturación." }, { status: 500 });
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
