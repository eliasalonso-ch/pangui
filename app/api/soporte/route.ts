import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TOPICS: Record<string, string> = {
  problema: "Problema con la aplicación",
  pregunta: "Pregunta sobre la aplicación",
  mejora: "Ayúdanos a mejorar",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: "Servicio de correo no configurado" }, { status: 503 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const body = await request.json().catch(() => null) as { topic?: string; message?: string } | null;
  const topic = body?.topic ?? "";
  const message = body?.message?.trim() ?? "";
  if (!TOPICS[topic] || message.length < 5 || message.length > 4000) {
    return NextResponse.json({ error: "El tema o el mensaje no es válido" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("usuarios")
    .select("nombre, rol, workspace_id, workspaces(nombre)")
    .eq("id", user.id)
    .maybeSingle();
  const name = profile?.nombre || user.user_metadata?.nombre || "Usuario de Pangui";
  const workspace = Array.isArray(profile?.workspaces) ? profile.workspaces[0]?.nombre : (profile?.workspaces as { nombre?: string } | null)?.nombre;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? "Pangui <noreply@getpangui.com>",
      to: ["contacto@getpangui.com"],
      reply_to: user.email,
      subject: `[Soporte Pangui] ${TOPICS[topic]} — ${name}`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.55;color:#1f2937"><h2>${escapeHtml(TOPICS[topic])}</h2><p><strong>Usuario:</strong> ${escapeHtml(name)}<br><strong>Email:</strong> ${escapeHtml(user.email ?? "Sin email")}<br><strong>Rol:</strong> ${escapeHtml(profile?.rol ?? "Sin rol")}<br><strong>Espacio:</strong> ${escapeHtml(workspace ?? profile?.workspace_id ?? "Sin espacio")}</p><hr style="border:0;border-top:1px solid #e5e7eb"><p style="white-space:pre-wrap">${escapeHtml(message)}</p></div>`,
    }),
  });
  if (!resendResponse.ok) {
    console.error("[support] Resend failed", resendResponse.status, await resendResponse.text());
    return NextResponse.json({ error: "No se pudo enviar el mensaje" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
