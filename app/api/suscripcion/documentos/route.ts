/**
 * GET /api/suscripcion/documentos
 *
 * Lista los documentos tributarios (facturas / boletas) del workspace.
 *
 * Distinto de /api/suscripcion/invoices, que lista los COBROS de Flow: un
 * cobro es el movimiento de dinero y un documento tributario es la factura
 * ante el SII. Normalmente hay uno por cada uno, pero no siempre —un cobro
 * puede estar pagado y su factura todavía pendiente de emisión.
 */
import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";

const PAGE_SIZE = 12;
const SCHEMA_MISMATCH_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;

  const requested = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requested) && requested > 0 ? requested : 1;
  const desde = (page - 1) * PAGE_SIZE;

  const { data, error, count } = await adminSupabase()
    .from("documentos_tributarios")
    .select(
      "id, tipo_dte, folio, periodo_inicio, periodo_fin, neto_clp, iva_clp, total_clp, " +
      "usuarios_facturados, estado, emitido_at",
      { count: "exact" },
    )
    .eq("workspace_id", auth.ctx.workspaceId)
    .order("periodo_inicio", { ascending: false })
    .range(desde, desde + PAGE_SIZE - 1);

  if (error) {
    // La migración 20260817120000 puede no estar aplicada todavía. Igual que
    // en billing-profile, se responde vacío en vez de romper la pantalla.
    if (SCHEMA_MISMATCH_CODES.has(error.code ?? "")) {
      console.warn("[documentos] schema not ready", { code: error.code, message: error.message });
      return NextResponse.json({ data: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
    }
    console.error("[documentos] GET failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "No se pudieron cargar los documentos tributarios." }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    data: data ?? [],
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

export const dynamic = "force-dynamic";
