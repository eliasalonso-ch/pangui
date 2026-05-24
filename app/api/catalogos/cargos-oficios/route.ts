/**
 * GET /api/catalogos/cargos-oficios
 *
 * Public read of the global (workspace_id IS NULL) cargos and oficios catalogs.
 * Used by the public /registro signup form to populate dropdowns. The DB tables
 * have RLS restricting SELECT to authenticated; we read them with service-role
 * here so anonymous signups can still see the canonical options.
 *
 * Response shape:
 *   { cargos: [{id, nombre, slug, nivel}], oficios: [{id, nombre, slug}] }
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  const [{ data: cargos }, { data: oficios }] = await Promise.all([
    admin
      .from("cargos")
      .select("id, nombre, slug, nivel")
      .is("workspace_id", null)
      .eq("activo", true)
      .order("nivel", { ascending: true })
      .order("nombre", { ascending: true }),
    admin
      .from("oficios")
      .select("id, nombre, slug")
      .is("workspace_id", null)
      .eq("activo", true)
      .order("nombre", { ascending: true }),
  ]);

  return NextResponse.json({
    cargos:  cargos  ?? [],
    oficios: oficios ?? [],
  }, {
    headers: {
      // Catalog is global and rarely changes — let the CDN cache for a few minutes.
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
