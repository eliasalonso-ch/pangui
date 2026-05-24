/**
 * POST /api/suscripcion/check-cuota
 *
 * Body: { kind: "ot_categoria" | "procedimientos" | "activos", categoria?: CategoriaOT }
 *
 * Cheap server-side check used by client-side API libs (ordenes-api, foto-grupos-api,
 * procedimientos-api) before they perform a write. Returns the current quota usage
 * plus a `permitido` boolean. Auth required.
 */
import { NextResponse } from "next/server";
import { adminSupabase, serverSupabase } from "../_helpers";
import { cuotaOtsCategoria, cuotaProcedimientos, cuotaActivos, type CategoriaOT } from "@/lib/cuotas-mensuales";

export async function POST(req: Request) {
  const sb = await serverSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { data: perfil } = await sb
    .from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle();
  if (!perfil?.workspace_id) {
    return NextResponse.json({ error: "Sin workspace." }, { status: 400 });
  }

  const admin = adminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_key, status")
    .eq("workspace_id", perfil.workspace_id)
    .neq("status", "canceled")
    .maybeSingle();

  const planKey    = sub?.plan_key ?? "basic";
  const planStatus = sub?.status ?? null;

  const body = await req.json().catch(() => ({}));
  const kind = body.kind as string;

  if (kind === "ot_categoria") {
    const cat = body.categoria as CategoriaOT;
    if (!["con_procedimientos", "con_fotos", "repetitivas"].includes(cat)) {
      return NextResponse.json({ error: "categoria inválida" }, { status: 400 });
    }
    const r = await cuotaOtsCategoria(perfil.workspace_id, planKey, planStatus, cat);
    return NextResponse.json(r);
  }
  if (kind === "procedimientos") {
    const r = await cuotaProcedimientos(perfil.workspace_id, planKey, planStatus);
    return NextResponse.json(r);
  }
  if (kind === "activos") {
    const r = await cuotaActivos(perfil.workspace_id, planKey, planStatus);
    return NextResponse.json(r);
  }
  return NextResponse.json({ error: "kind inválido" }, { status: 400 });
}
