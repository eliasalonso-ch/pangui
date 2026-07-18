import { NextRequest, NextResponse } from "next/server";
import { adminSupabase, requireAdminOfWorkspace } from "../_helpers";
import { flow, FlowError, type FlowInvoice } from "@/lib/flow";

const PAGE_SIZE = 10;

function invoiceId(value: FlowInvoice | { id?: number; invoiceId?: number }): number | null {
  const id = value.id ?? value.invoiceId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminOfWorkspace();
  if (auth.error) return auth.error;

  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const { data: subscription } = await adminSupabase()
    .from("subscriptions")
    .select("flow_subscription_id")
    .eq("workspace_id", auth.ctx.workspaceId)
    .not("flow_subscription_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription?.flow_subscription_id) {
    return NextResponse.json({ data: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  }

  try {
    const flowSubscription = await flow.getSubscription(subscription.flow_subscription_id);
    const refs = [...(flowSubscription.invoices ?? [])].reverse();
    const total = refs.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const pageRefs = refs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const invoices = await Promise.all(pageRefs.map(async ref => {
      const id = invoiceId(ref);
      if (id == null) return null;
      // Flow sometimes embeds complete invoices and sometimes only references.
      if ("created" in ref && "status" in ref && "amount" in ref) return ref as FlowInvoice;
      return flow.getInvoice(id);
    }));

    return NextResponse.json({
      data: invoices.filter((invoice): invoice is FlowInvoice => invoice !== null).map(invoice => ({
        id: invoice.id,
        created: invoice.created,
        subject: invoice.subject,
        currency: invoice.currency,
        amount: Number(invoice.amount),
        status: invoice.status,
        period_start: invoice.period_start ?? null,
        period_end: invoice.period_end ?? null,
      })),
      page: safePage,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
    });
  } catch (error) {
    const flowError = error as FlowError;
    console.error("[suscripcion/invoices]", flowError);
    return NextResponse.json(
      { error: "No se pudieron cargar los documentos de Flow.cl." },
      { status: flowError.status >= 400 && flowError.status < 500 ? 502 : 500 },
    );
  }
}
