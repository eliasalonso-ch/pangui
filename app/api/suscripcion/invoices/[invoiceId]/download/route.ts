import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { adminSupabase, requireAdminOfWorkspace } from "../../../_helpers";
import { flow, FlowError } from "@/lib/flow";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function date(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "long", year: "numeric" })
    .format(new Date(value.replace(" ", "T") + (value.includes("T") ? "" : "Z")));
}

export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;

  const { invoiceId: rawInvoiceId } = await context.params;
  const invoiceId = Number(rawInvoiceId);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: "Documento no válido." }, { status: 400 });
  }

  const { data: subscription } = await adminSupabase()
    .from("subscriptions")
    .select("flow_subscription_id")
    .eq("workspace_id", auth.ctx.workspaceId)
    .not("flow_subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription?.flow_subscription_id) {
    return NextResponse.json({ error: "No hay una suscripción de Flow.cl." }, { status: 404 });
  }

  try {
    const invoice = await flow.getInvoice(invoiceId);
    if (invoice.subscriptionId !== subscription.flow_subscription_id) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }

    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const left = 48;
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.text("Pangui", left, 58);
    pdf.setFontSize(16);
    pdf.text("Comprobante de cobro de suscripción", left, 92);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Documento Flow N° ${invoice.id}`, left, 111);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(left, 130, 547, 130);

    const rows = [
      ["Fecha", date(invoice.created)],
      ["Estado", invoice.status === 1 ? "Pagado" : invoice.status === 2 ? "Anulado" : "Pendiente"],
      ["Período", `${date(invoice.period_start)} – ${date(invoice.period_end)}`],
      ["Descripción", invoice.subject || "Suscripción Pangui"],
      ["Monto", money(Number(invoice.amount), invoice.currency || "CLP")],
    ];
    let y = 162;
    for (const [label, value] of rows) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(71, 85, 105);
      pdf.text(label, left, y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(15, 23, 42);
      pdf.text(pdf.splitTextToSize(value, 350), 180, y);
      y += 30;
    }

    if (invoice.items?.length) {
      y += 10;
      pdf.setFont("helvetica", "bold");
      pdf.text("Detalle", left, y);
      y += 24;
      for (const item of invoice.items) {
        pdf.setFont("helvetica", "normal");
        pdf.text(pdf.splitTextToSize(item.subject, 350), left, y);
        pdf.text(money(Number(item.amount), item.currency || invoice.currency), 547, y, { align: "right" });
        y += 24;
      }
    }

    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Pago procesado por Flow.cl. Pangui no almacena datos completos de tarjetas.", left, 760);
    pdf.text("Este comprobante es informativo y no reemplaza un documento tributario electrónico (DTE).", left, 776);

    const body = Buffer.from(pdf.output("arraybuffer"));
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="pangui-flow-${invoice.id}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const flowError = error as FlowError;
    console.error("[suscripcion/invoices/download]", flowError);
    return NextResponse.json({ error: "No se pudo generar el documento." }, { status: 502 });
  }
}
