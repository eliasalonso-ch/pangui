/**
 * Client-side quota pre-checks. Used by ordenes-api / foto-grupos-api /
 * procedimientos-api before performing writes that would push a workspace over
 * its plan limit.
 *
 * Throws QuotaError with a friendly Spanish message when over quota; callers
 * can either let it bubble or catch and surface their own UI.
 */
import type { CategoriaOT } from "@/lib/cuotas-mensuales";

export class QuotaError extends Error {
  constructor(
    message: string,
    public readonly kind: string,
    public readonly usado:  number,
    public readonly limite: number,
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

interface CheckResult { usado: number; limite: number; permitido: boolean }

async function postCheck(body: object): Promise<CheckResult> {
  const res = await fetch("/api/suscripcion/check-cuota", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // Don't block on a check failure — degrade gracefully (server-side RLS still protects data).
    return { usado: 0, limite: Infinity, permitido: true };
  }
  return res.json();
}

export async function ensureOtCategoria(categoria: CategoriaOT, label: string): Promise<void> {
  const r = await postCheck({ kind: "ot_categoria", categoria });
  if (!r.permitido) {
    throw new QuotaError(
      `Llegaste al límite de ${r.limite} ${label} este mes. Cambia tu plan en Configuración → Suscripción para crear más.`,
      `ot_${categoria}`,
      r.usado, r.limite,
    );
  }
}

export async function ensureProcedimientosCatalogo(): Promise<void> {
  const r = await postCheck({ kind: "procedimientos" });
  if (!r.permitido) {
    throw new QuotaError(
      `Llegaste al límite de ${r.limite} procedimientos en tu plan. Sube de plan para crear más.`,
      "procedimientos",
      r.usado, r.limite,
    );
  }
}

export async function ensureActivosCatalogo(): Promise<void> {
  const r = await postCheck({ kind: "activos" });
  if (!r.permitido) {
    throw new QuotaError(
      `Llegaste al límite de ${r.limite} activos en tu plan. Sube de plan para registrar más.`,
      "activos",
      r.usado, r.limite,
    );
  }
}
