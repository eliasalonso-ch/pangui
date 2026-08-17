import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";
import { rutEsValido, normalizarRut } from "@/lib/tributario";
import { NOMBRES_REGIONES, comunaPerteneceARegion } from "@/lib/regiones-comunas";

// Receptor de la factura electrónica afecta a IVA: el SII exige RUT, razón
// social, giro y dirección completa. Ver migraciones 20260728180754,
// 20260810120000 y 20260817120000_facturacion_spa_iva.
const FIELDS = "billing_email, razon_social, rut, giro, domicilio, region, comuna, ciudad, tipo_receptor";
const SCHEMA_MISMATCH_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

function emptyProfile(email: string) {
  return { billing_email: email };
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
    // El RUT se valida y normaliza en el servidor: el cliente ya lo valida,
    // pero un RUT inválido no se descubre al guardar sino al emitir la
    // factura, cuando el SII la rechaza y el cobro ya ocurrió.
    const rut = value("rut");
    if (rut && !rutEsValido(rut)) {
      throw new Error("El RUT no es válido. Revisa el número y el dígito verificador.");
    }

    const tipoReceptor = value("tipo_receptor");
    if (tipoReceptor && !["empresa", "persona"].includes(tipoReceptor)) {
      throw new Error("El tipo de receptor debe ser 'empresa' o 'persona'.");
    }

    // Región y comuna tienen que ser consistentes entre sí: el formulario ya
    // encadena los selectores, pero una dirección imposible en un documento
    // tributario no puede depender solo del cliente.
    const region = value("region");
    const comuna = value("comuna");
    if (region && !NOMBRES_REGIONES.includes(region)) {
      throw new Error(`La región "${region}" no existe.`);
    }
    if (comuna && region && !comunaPerteneceARegion(comuna, region)) {
      throw new Error(`La comuna "${comuna}" no pertenece a la región ${region}.`);
    }

    const profile = {
      workspace_id: auth.ctx.workspaceId,
      billing_email: value("billing_email", true),
      razon_social: value("razon_social"),
      rut: rut ? normalizarRut(rut) : null,
      giro: value("giro"),
      domicilio: value("domicilio"),
      region,
      comuna,
      ciudad: value("ciudad"),
      tipo_receptor: tipoReceptor ?? "empresa",
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
