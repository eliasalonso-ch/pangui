import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll()      { return cookieStore.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    }
  );
}

function formatId(id, tipo, createdAt) {
  const year = new Date(createdAt).getFullYear();
  const suffix = id.slice(-4).toUpperCase();
  return `${tipo === "emergencia" ? "EM" : "OT"}-${year}-${suffix}`;
}

export async function POST(request) {
  if (!process.env.RESEND_API_KEY) {
    // Resend not configured — silently skip
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { data: perfil } = await supabase
      .from("usuarios")
      .select("rol, plantas(nombre)")
      .eq("id", user.id)
      .maybeSingle();

    if (!perfil || perfil.rol !== "jefe") {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const { ordenId, to, toNombre, cliente, descripcion, tecnico } = await request.json();
    if (!to || !ordenId) return NextResponse.json({ error: "Faltan campos." }, { status: 400 });

    // Get order details for the ID format
    const { data: orden } = await supabase
      .from("ordenes_trabajo")
      .select("tipo, created_at")
      .eq("id", ordenId)
      .maybeSingle();

    const otId = orden ? formatId(ordenId, orden.tipo, orden.created_at) : ordenId.slice(-8).toUpperCase();
    const planta = perfil.plantas?.nombre ?? "Pangui";

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:#273D88;padding:24px 32px;">
      <p style="color:#fff;font-size:22px;font-weight:700;margin:0;">Pangui</p>
      <p style="color:#a5b4fc;font-size:13px;margin:4px 0 0;">Gestión de Órdenes de Trabajo</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="color:#1a1a1a;font-size:16px;margin:0 0 8px;">Hola${toNombre ? ` <strong>${toNombre}</strong>` : ""},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Tu solicitud de trabajo ha sido registrada en el sistema. A continuación los detalles:
      </p>

      <div style="background:#f1f5f9;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:12px;font-weight:600;color:#6b7280;padding:4px 0;width:40%;">N° Orden</td>
            <td style="font-size:14px;color:#1a1a1a;font-weight:700;padding:4px 0;">${otId}</td>
          </tr>
          <tr>
            <td style="font-size:12px;font-weight:600;color:#6b7280;padding:4px 0;">Empresa</td>
            <td style="font-size:14px;color:#1a1a1a;padding:4px 0;">${planta}</td>
          </tr>
          ${tecnico ? `<tr>
            <td style="font-size:12px;font-weight:600;color:#6b7280;padding:4px 0;">Técnico asignado</td>
            <td style="font-size:14px;color:#1a1a1a;padding:4px 0;">${tecnico}</td>
          </tr>` : ""}
          <tr>
            <td style="font-size:12px;font-weight:600;color:#6b7280;padding:4px 0;vertical-align:top;">Descripción</td>
            <td style="font-size:14px;color:#374151;padding:4px 0;line-height:1.5;">${descripcion}</td>
          </tr>
        </table>
      </div>

      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        Si tienes dudas sobre esta orden, contacta directamente con ${planta}.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">
        Este correo fue generado automáticamente por Pangui · Sistema de gestión de órdenes de trabajo.
      </p>
    </div>
  </div>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Pangui <noreply@pangui.cl>",
        to: [to],
        subject: `Orden de trabajo ${otId} registrada — ${planta}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      console.error("Resend error:", err);
      return NextResponse.json({ error: "Error al enviar email." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err?.message ?? "Error interno." }, { status: 500 });
  }
}
