/**
 * GET/POST /api/suscripcion/card/change/callback
 *
 * Flow redirects here after a card-update attempt. Unlike the initial register
 * callback, we do NOT create a subscription — we only refresh the stored card
 * metadata on flow_customers and bounce the user back to the dashboard.
 */
import { NextResponse } from "next/server";
import { adminSupabase } from "../../../_helpers";
import { flow, FlowError } from "@/lib/flow";

async function readToken(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  let token: string | null = url.searchParams.get("token");
  if (!token && req.method === "POST") {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const form = await req.formData();
      token = form.get("token")?.toString() ?? null;
    } else if (ct.includes("application/json")) {
      const json = await req.json().catch(() => ({} as { token?: string }));
      token = json.token ?? null;
    }
  }
  return token;
}

export async function GET(req: Request)  { return handle(req); }
export async function POST(req: Request) { return handle(req); }

async function handle(req: Request) {
  const token  = await readToken(req);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const back = (status: string, reason?: string) =>
    NextResponse.redirect(
      `${appUrl}/configuracion/suscripcion?status=${status}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`,
      303
    );

  if (!token) return back("error", "missing_token");

  try {
    const reg = await flow.getRegisterStatus(token);
    if (reg.status !== "1" || !reg.customerId) return back("error", "card_not_registered");

    const admin = adminSupabase();
    const { data: customerRow } = await admin
      .from("flow_customers")
      .select("workspace_id")
      .eq("flow_customer_id", reg.customerId)
      .maybeSingle();
    if (!customerRow?.workspace_id) return back("error", "customer_not_found");

    const cardBrand = reg.creditCardType ?? reg.card?.type ?? null;
    const cardLast4 = reg.last4CardDigits ?? reg.card?.last4Digits ?? null;
    let finalBrand = cardBrand;
    let finalLast4 = cardLast4;
    if (!finalBrand || !finalLast4) {
      const customer = await flow.getCustomer(reg.customerId).catch(() => null);
      finalBrand = finalBrand ?? customer?.creditCardType ?? null;
      finalLast4 = finalLast4 ?? customer?.last4CardDigits ?? null;
    }

    await admin.from("flow_customers").update({
      has_card:   true,
      card_brand: finalBrand,
      card_last4: finalLast4,
      updated_at: new Date().toISOString(),
    }).eq("workspace_id", customerRow.workspace_id);

    return back("card_updated");
  } catch (err) {
    const fe = err as FlowError;
    console.error("[suscripcion/card/change/callback]", fe);
    return back("error", fe.message ?? "flow_error");
  }
}
