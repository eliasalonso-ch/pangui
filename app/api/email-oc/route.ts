import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const PDF_SERVICE_URL = "https://pdf.getpangui.com/generate-oc-pdf";

/**
 * Envía la orden de compra al proveedor, con el PDF adjunto.
 *
 * Va por API route y no desde el browser porque la RESEND_API_KEY no puede
 * viajar al cliente. El PDF se pide aquí también: adjuntarlo desde el browser
 * significaría subir el binario de vuelta al servidor para nada.
 *
 * El DESTINATARIO se resuelve en el servidor contra la base. Si viniera en el
 * request, cualquiera podría mandar la orden de compra a donde quisiera.
 */
export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "El envío de correo no está configurado." }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { ocId } = await req.json();
  if (!ocId) return NextResponse.json({ error: "Falta ocId." }, { status: 400 });

  // Comprar compromete plata: enviar es de owner/admin, igual que la RLS.
  const { data: perfil } = await supabase
    .from("usuarios").select("nombre, rol, workspace_id").eq("id", user.id).maybeSingle();
  if (!perfil || !["owner", "admin"].includes(perfil.rol)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  // RLS ya acota al workspace del usuario; esto solo trae la fila.
  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("id, numero, numero_manual, estado, fecha_emision, fecha_entrega_esperada, condiciones_pago, direccion_despacho, neto, descuento, otros_costos, iva, total, observaciones, cotizacion_numero, cotizacion_fecha, precios_confirmados, proveedor_id, workspace_id")
    .eq("id", ocId).maybeSingle();
  if (!oc) return NextResponse.json({ error: "No se encontró la orden de compra." }, { status: 404 });

  if (oc.estado !== "aprobada") {
    return NextResponse.json({ error: "Solo se puede enviar una orden aprobada." }, { status: 409 });
  }

  // Ultima barrera antes de que el documento salga de la empresa: una OC afirma
  // precios acordados. Aprobar ya lo exige, pero se revalida aca porque este
  // endpoint es lo unico que separa la base de datos del buzon del proveedor.
  if (!oc.precios_confirmados) {
    return NextResponse.json(
      { error: "Los precios no están confirmados con el proveedor." },
      { status: 409 },
    );
  }

  const [{ data: lineas }, { data: emisor }, { data: proveedor }] = await Promise.all([
    supabase.from("ordenes_compra_lineas")
      .select("id, descripcion, codigo, unidad, cantidad, precio_unitario, descuento, total, orden")
      .eq("orden_compra_id", ocId).order("orden"),
    supabase.from("workspaces")
      .select("nombre, razon_social, rut, giro, direccion, telefono, email_contacto, sitio_web, logo_url")
      .eq("id", oc.workspace_id).maybeSingle(),
    oc.proveedor_id
      ? supabase.from("proveedores")
          .select("nombre, rut, giro, contacto, direccion, comuna, ciudad, telefono, email")
          .eq("id", oc.proveedor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const destino = proveedor?.email;
  if (!destino) {
    return NextResponse.json(
      { error: "El proveedor no tiene correo registrado. Agrégalo en Proveedores." },
      { status: 400 },
    );
  }

  let pdfBase64: string;
  try {
    const pdfRes = await fetch(PDF_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        oc, lineas: lineas ?? [], emisor, proveedor,
        exportadoPor: perfil.nombre ?? "Sistema",
        logoUrl: emisor?.logo_url ?? null,
      }),
      cache: "no-store",
    });
    if (!pdfRes.ok) throw new Error(`servicio PDF ${pdfRes.status}`);
    pdfBase64 = Buffer.from(await pdfRes.arrayBuffer()).toString("base64");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `No se pudo generar el PDF: ${msg}` }, { status: 502 });
  }

  const numero = oc.numero_manual || (oc.numero != null ? `#${oc.numero}` : "");
  const empresa = emisor?.razon_social || emisor?.nombre || "Pangui";
  const nombreArchivo = `OC-${oc.numero_manual || oc.numero || ocId.slice(-8)}.pdf`;
  const entrega = oc.fecha_entrega_esperada
    ? oc.fecha_entrega_esperada.split("-").reverse().join("-")
    : null;

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#273D88;padding:24px 32px;">
      <p style="color:#fff;font-size:22px;font-weight:700;margin:0;">${empresa}</p>
      <p style="color:#a5b4fc;font-size:13px;margin:4px 0 0;">Orden de compra ${numero}</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#1a1a1a;font-size:16px;margin:0 0 8px;">Estimados${proveedor?.nombre ? ` <strong>${proveedor.nombre}</strong>` : ""},</p>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Adjuntamos la orden de compra ${numero}. El detalle completo está en el PDF adjunto.
      </p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="font-size:12px;font-weight:600;color:#6b7280;padding:4px 0;width:45%;">Total</td>
            <td style="font-size:14px;color:#1a1a1a;font-weight:700;padding:4px 0;">$${Number(oc.total).toLocaleString("es-CL")}</td>
          </tr>
          ${entrega ? `<tr>
            <td style="font-size:12px;font-weight:600;color:#6b7280;padding:4px 0;">Fecha de entrega</td>
            <td style="font-size:14px;color:#1a1a1a;padding:4px 0;">${entrega}</td>
          </tr>` : ""}
          ${oc.condiciones_pago ? `<tr>
            <td style="font-size:12px;font-weight:600;color:#6b7280;padding:4px 0;">Condiciones de pago</td>
            <td style="font-size:14px;color:#1a1a1a;padding:4px 0;">${oc.condiciones_pago}</td>
          </tr>` : ""}
        </table>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        Ante cualquier consulta, responde a este correo o contacta a ${perfil.nombre ?? "nuestro equipo"}${emisor?.telefono ? ` (${emisor.telefono})` : ""}.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:11px;margin:0;">Enviado desde Pangui por ${empresa}.</p>
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
      from: process.env.RESEND_FROM ?? "Pangui <noreply@getpangui.com>",
      to: [destino],
      // Las respuestas del proveedor van a la empresa, no al buzón de Pangui.
      ...(emisor?.email_contacto ? { reply_to: emisor.email_contacto } : {}),
      subject: `Orden de compra ${numero} — ${empresa}`,
      html,
      attachments: [{ filename: nombreArchivo, content: pdfBase64 }],
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.text();
    console.error("[email-oc] Resend error:", err);
    return NextResponse.json({ error: "No se pudo enviar el correo." }, { status: 502 });
  }

  // Solo se sella como enviada si el correo salió de verdad.
  const { error: updErr } = await supabase
    .from("ordenes_compra")
    .update({
      estado: "enviada",
      enviada_at: new Date().toISOString(),
      enviada_por: user.id,
      enviada_a_email: destino,
    })
    .eq("id", ocId);
  if (updErr) console.error("[email-oc] no se pudo sellar el envío:", updErr);

  return NextResponse.json({ ok: true, to: destino });
}
