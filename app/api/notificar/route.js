import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  const {
    usuario_id,
    usuario_ids,
    workspace_id_todos_tecnicos,
    workspace_id_jefe,
    titulo,
    mensaje,
    url,
    urgente,
    tipo: tipoPayload,
  } = await req.json();

  let userIds = [];

  if (usuario_id) {
    userIds = [usuario_id];
  } else if (usuario_ids?.length) {
    userIds = usuario_ids;
  } else if (workspace_id_todos_tecnicos) {
    const { data } = await adminClient
      .from("usuarios")
      .select("id")
      .eq("workspace_id", workspace_id_todos_tecnicos)
      .eq("rol", "tecnico");
    userIds = (data ?? []).map((u) => u.id);
  } else if (workspace_id_jefe) {
    const { data } = await adminClient
      .from("usuarios")
      .select("id")
      .eq("workspace_id", workspace_id_jefe)
      .eq("rol", "jefe");
    userIds = (data ?? []).map((u) => u.id);
  }

  if (!userIds.length) {
    return NextResponse.json({ ok: true, enviados: 0 });
  }

  await adminClient.from("notifications").insert(
    userIds.map((uid) => ({
      usuario_id: uid,
      titulo,
      mensaje,
      url: url || "/",
      tipo: tipoPayload ?? (urgente ? "emergencia" : "ot"),
    }))
  );

  return NextResponse.json({ ok: true, enviados: userIds.length });
}
