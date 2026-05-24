/**
 * GET /api/suscripcion/seed-planes
 *
 * Creates the 3 self-serve plans (basic / esencial / pro) in Flow.cl.
 * Plan amount = price per user / month. The user count is reflected via
 * subscription_items at billing time (see lib/flow-sync.ts).
 *
 * Run once per Flow account (sandbox + prod separately). Copy the returned
 * env-var lines into .env.local and restart.
 */
import { NextResponse } from "next/server";
import { flow, FlowError } from "@/lib/flow";
import { SELF_SERVE_PLANS } from "@/lib/flow-plans";

export async function GET() {
  if (!process.env.FLOW_API_KEY || !process.env.FLOW_SECRET_KEY) {
    return NextResponse.json(
      { error: "FLOW_API_KEY / FLOW_SECRET_KEY no configurados en .env.local" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL no configurado (necesario para urlCallback)" },
      { status: 500 }
    );
  }

  const urlCallback = `${appUrl}/api/suscripcion/webhook`;
  const results: Record<string, unknown> = {};
  const envLines: string[] = [];

  for (const plan of SELF_SERVE_PLANS) {
    try {
      const created = await flow.createPlan({
        planId:         plan.key,
        name:           plan.name,
        amount:         plan.pricePerUser,
        currency:       "CLP",
        interval:       3,                // 3 = monthly
        interval_count: 1,
        urlCallback,
      });
      results[plan.key] = { ok: true, planId: created.planId, amount: created.amount };
      if (plan.envVar) envLines.push(`${plan.envVar}=${created.planId}`);
    } catch (err) {
      const fe = err as FlowError;
      results[plan.key] = { ok: false, message: fe.message, status: fe.status };
    }
  }

  return NextResponse.json({
    instruccion: "Copia estas líneas a .env.local y reinicia el servidor.",
    env: envLines.join("\n"),
    planes: results,
  });
}
