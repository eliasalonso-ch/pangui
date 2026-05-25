"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Loader2, Check, CreditCard, AlertCircle, ArrowLeft, X, Sparkles, ShieldCheck, Pencil, Trash2 } from "lucide-react";
import { SELF_SERVE_PLANS, PLANS, type PlanKey } from "@/lib/flow-plans";
import { resolveCardBrand } from "@/lib/card-brand";
import { CardBrandLogo } from "@/components/CardBrandLogo";

type PendingAction = PlanKey | "cancel" | "card_change" | "card_remove";
type RedirectAction = PlanKey | "card_change";

interface SubStatus {
  rol?: string;
  workspace_id: string | null;
  subscription: {
    id: string;
    plan_key: PlanKey;
    price_per_user_clp: number;
    status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "basic_free";
    trial_end: string | null;
    current_period_end: string | null;
    canceled_at: string | null;
    flow_subscription_id: string | null;
    is_early_customer?: boolean;
    custom_price_note?: string | null;
  } | null;
  customer: { has_card: boolean; card_last4: string | null; card_brand: string | null; email: string; pay_mode?: string | null } | null;
  active_users: number;
  monthly_cost: number;
  effective_plan: PlanKey;
}

const fmtCLP = (n: number) => n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" }) : "-";
const daysUntil = (iso: string | null) => iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0;

export default function SuscripcionPage() {
  return (
    <Suspense fallback={null}>
      <SuscripcionPageInner />
    </Suspense>
  );
}

function SuscripcionPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SubStatus | null>(null);
  const [submitting, setSubmitting] = useState<PendingAction | null>(null);
  const [redirecting, setRedirecting] = useState<RedirectAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [acceptedBilling, setAcceptedBilling] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suscripcion/status", { cache: "no-store" });
    if (!res.ok) {
      setError("No se pudo cargar la suscripción.");
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    const status = search.get("status");
    if (!status) return;
    if (status === "success") setFlash({ kind: "ok", msg: "Suscripción activada. Empieza a usar todas las funciones." });
    else if (status === "card_updated") setFlash({ kind: "ok", msg: "Tarjeta actualizada." });
    else setFlash({ kind: "err", msg: search.get("reason") ?? "Error procesando la suscripción." });

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("status");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ensureBillingAccepted() {
    if (acceptedBilling) return true;
    setError("Antes de continuar debes aceptar los términos, la política de privacidad y el cobro mensual recurrente.");
    return false;
  }

  async function startCheckout(planKey: PlanKey) {
    if (!ensureBillingAccepted()) return;
    setSubmitting(planKey);
    setRedirecting(planKey);
    setError(null);
    try {
      const res = await fetch("/api/suscripcion/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: planKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "No se pudo iniciar el checkout.");
      setTimeout(() => window.location.assign(json.url), 600);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(null);
      setRedirecting(null);
    }
  }

  async function changePlan(planKey: PlanKey) {
    if (!ensureBillingAccepted()) return;
    setSubmitting(planKey);
    setError(null);
    try {
      const res = await fetch("/api/suscripcion/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_key: planKey }),
      });
      const json = await res.json();
      if (res.status === 402) return startCheckout(planKey);
      if (!res.ok) throw new Error(json.error ?? "No se pudo cambiar el plan.");
      setFlash({ kind: "ok", msg: "Plan actualizado." });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  async function changeCard() {
    setSubmitting("card_change");
    setRedirecting("card_change");
    setError(null);
    try {
      const res = await fetch("/api/suscripcion/card/change", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "No se pudo iniciar el cambio de tarjeta.");
      setTimeout(() => window.location.assign(json.url), 600);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(null);
      setRedirecting(null);
    }
  }

  async function removeCard() {
    setSubmitting("card_remove");
    setError(null);
    try {
      const res = await fetch("/api/suscripcion/card/remove", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo quitar la tarjeta.");
      setFlash({ kind: "ok", msg: "Tarjeta eliminada. Agrega una nueva antes del próximo cobro para evitar interrupciones." });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  async function cancelSub() {
    setSubmitting("cancel");
    setError(null);
    try {
      const res = await fetch("/api/suscripcion/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ at_period_end: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cancelar.");
      setFlash({ kind: "ok", msg: "Suscripción cancelada. Tendrás acceso hasta el fin del periodo." });
      setConfirmCancel(false);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) return <Centered><Loader2 size={18} className="animate-spin" /> <span>Cargando...</span></Centered>;

  if (data?.rol && data.rol !== "owner") {
    return <Centered>Solo el owner del workspace puede gestionar la suscripción.</Centered>;
  }

  const sub = data?.subscription;
  const customer = data?.customer;
  const activeUsers = data?.active_users ?? 0;
  const monthlyCost = data?.monthly_cost ?? 0;

  const isTrial = sub?.status === "trialing";
  const isFree = sub?.status === "basic_free";
  const isPaid = sub?.status === "active" || sub?.status === "past_due";
  const trialDaysLeft = isTrial ? daysUntil(sub?.trial_end ?? null) : 0;
  const currentPlan = sub ? PLANS.find(p => p.key === sub.plan_key) : null;
  const currentPrice = sub?.price_per_user_clp ?? currentPlan?.pricePerUser ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", background: "var(--surface-0)" }}>
      {redirecting && <CheckoutRedirectOverlay planKey={redirecting} />}

      <div style={{ flexShrink: 0, borderBottom: "1px solid var(--border)", padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 12, background: "var(--surface-1)" }}>
        <button type="button" onClick={() => router.push("/configuracion")} style={iconBtn} aria-label="Volver a configuración"><ArrowLeft size={16} /></button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>Suscripción</h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "28px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
          {flash && <Notice kind={flash.kind} onClose={() => setFlash(null)}>{flash.msg}</Notice>}
          {error && <Notice kind="err">{error}</Notice>}

          {sub?.is_early_customer && (
            <div style={{
              ...card,
              // Theme-aware: brand-tint switches between pale blue (light) and
              // a deep brand-tinted dark surface (dark) automatically.
              background: "linear-gradient(135deg, var(--brand-tint) 0%, var(--surface-1) 100%)",
              border: "1px solid var(--brand)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Sparkles size={16} style={{ color: "var(--brand)" }} />
                <p style={{ ...sectionLabel, color: "var(--brand-fg)" }}>Cliente fundador</p>
              </div>
              <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0, lineHeight: 1.5 }}>
                {sub.custom_price_note ?? `Precio especial de ${fmtCLP(sub.price_per_user_clp)} por usuario para siempre.`}
              </p>
              <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
                Este precio se mantiene mientras la suscripción siga activa.
              </p>
            </div>
          )}

          {isTrial && (
            <div style={{ ...card, background: "linear-gradient(135deg, var(--brand-tint), var(--surface-1))" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <Sparkles size={16} style={{ color: "var(--brand)" }} />
                <p style={{ ...sectionLabel, color: "var(--brand-fg)" }}>Prueba gratis Pro</p>
              </div>
              <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0 }}>
                Te quedan <strong>{trialDaysLeft} {trialDaysLeft === 1 ? "día" : "días"}</strong> con todas las funciones desbloqueadas. Termina el {fmtDate(sub?.trial_end ?? null)}.
              </p>
              <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "6px 0 0" }}>
                Después pasarás al plan Basic gratuito. Elige un plan abajo para mantener funciones pagadas.
              </p>
            </div>
          )}

          {isFree && (
            <div style={{ ...card, background: "var(--st-wait-bg)", border: "1px solid var(--border-strong)" }}>
              <p style={{ ...sectionLabel, color: "var(--st-wait-fg)" }}>Estás en Basic (gratis)</p>
              <p style={{ fontSize: 14, color: "var(--fg-1)", margin: "6px 0 0" }}>
                Tienes funciones básicas gratis. Sube a un plan pagado para invitar usuarios y desbloquear más capacidades.
              </p>
            </div>
          )}

          {sub && (
            <div style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
                <p style={sectionLabel}>Plan actual</p>
                <span style={statusPill(sub.status)}>{statusLabel(sub.status)}</span>
              </div>
              <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--fg-1)" }}>
                {currentPlan?.name ?? sub.plan_key}
              </p>
              {currentPrice > 0 && (
                <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "4px 0 0" }}>
                  {fmtCLP(currentPrice)} por usuario activo al mes
                </p>
              )}

              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <Row label="Usuarios activos" value={`${activeUsers}`} />
                {isPaid && <Row label="Costo mensual estimado" value={fmtCLP(monthlyCost)} bold />}
                {isTrial && sub.trial_end && <Row label="Prueba termina" value={fmtDate(sub.trial_end)} />}
                {sub.current_period_end && <Row label="Próximo cobro o fin de acceso" value={fmtDate(sub.current_period_end)} />}
                {customer?.has_card && (customer.card_last4 || customer.card_brand) ? (
                  <CardRow
                    brand={customer.card_brand}
                    last4={customer.card_last4}
                    email={customer.email}
                    onChange={changeCard}
                    onRemove={removeCard}
                    changing={submitting === "card_change"}
                    removing={submitting === "card_remove"}
                  />
                ) : (
                  <EmptyCardRow
                    canAddCard={Boolean(customer)}
                    payMode={customer?.pay_mode ?? null}
                    onAddCard={changeCard}
                    adding={submitting === "card_change"}
                  />
                )}
                {sub.canceled_at && <Row label="Cancelada" value={fmtDate(sub.canceled_at)} />}
              </div>

              {isPaid && !sub.canceled_at && (
                confirmCancel ? (
                  <div style={{ marginTop: 16, padding: 12, background: "var(--surface-0)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
                    <p style={{ fontSize: 13, color: "var(--fg-1)", margin: "0 0 10px" }}>
                      ¿Cancelar la suscripción? Mantendrás acceso hasta el {fmtDate(sub.current_period_end)} y no habrá nuevos cobros de este plan.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={cancelSub} disabled={submitting === "cancel"} style={dangerBtn}>
                        {submitting === "cancel" ? <Loader2 size={13} className="animate-spin" /> : "Sí, cancelar"}
                      </button>
                      <button type="button" onClick={() => setConfirmCancel(false)} style={ghostBtn}>No</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmCancel(true)} style={{ ...ghostBtn, marginTop: 16, color: "var(--danger)" }}>
                    Cancelar suscripción
                  </button>
                )
              )}
            </div>
          )}

          <BillingDisclosure
            activeUsers={activeUsers}
            currentPrice={currentPrice}
            monthlyCost={monthlyCost}
            periodEnd={sub?.current_period_end ?? null}
            accepted={acceptedBilling}
            onAcceptedChange={setAcceptedBilling}
          />

          <div>
            <p style={{ ...sectionLabel, marginBottom: 12 }}>
              {isPaid ? "Cambiar plan" : isTrial ? "Elige tu plan para después de la prueba" : "Elige un plan"}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {SELF_SERVE_PLANS.map(p => {
                const isCurrent = sub?.plan_key === p.key && isPaid;
                const disabled = isCurrent || submitting !== null || !acceptedBilling;
                const preview = p.pricePerUser * activeUsers;
                return (
                  <div
                    key={p.key}
                    style={{
                      ...card,
                      border: `1.5px solid ${isCurrent ? "var(--brand)" : "var(--border)"}`,
                      background: isCurrent ? "var(--brand-tint)" : "var(--surface-1)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div>
                      <p style={{ ...sectionLabel, color: "var(--fg-2)" }}>{p.name}</p>
                      <p style={{ fontSize: 12, color: "var(--fg-4)", margin: "2px 0 0" }}>{p.tagline}</p>
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                        <p style={{ fontSize: 22, fontWeight: 700, color: "var(--fg-1)", margin: 0 }}>{fmtCLP(p.pricePerUser)}</p>
                        <p style={{ fontSize: 12, color: "var(--fg-4)", margin: 0 }}>/ usuario activo / mes</p>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "4px 0 0", overflowWrap: "anywhere" }}>
                        Hoy serían {fmtCLP(preview)} al mes con {activeUsers} {activeUsers === 1 ? "usuario" : "usuarios"}.
                      </p>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                      {p.highlights.map(h => (
                        <li key={h} style={{ display: "flex", alignItems: "start", gap: 6, fontSize: 12, color: "var(--fg-1)" }}>
                          <Check size={12} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 2 }} />
                          <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{h}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => isPaid ? changePlan(p.key) : startCheckout(p.key)}
                      style={{
                        ...primaryBtn,
                        marginTop: "auto",
                        background: isCurrent ? "var(--surface-hover)" : "var(--brand)",
                        color: isCurrent ? "var(--fg-2)" : "var(--surface-1)",
                        cursor: disabled ? "default" : "pointer",
                        opacity: !isCurrent && !acceptedBilling ? 0.55 : 1,
                      }}
                    >
                      {submitting === p.key
                        ? <Loader2 size={13} className="animate-spin" />
                        : isCurrent ? <><Check size={13} /> Plan actual</>
                        : isPaid ? "Cambiar a este plan"
                        : `Elegir ${p.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, color: "var(--fg-4)", margin: "12px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
              <CreditCard size={12} /> Pagos y tarjetas procesados por Flow.cl. Pangui no almacena los datos completos de tarjeta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Notice({ kind, onClose, children }: { kind: "ok" | "err"; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: "var(--r-md)",
      background: kind === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
      border: `1px solid ${kind === "ok" ? "var(--success)" : "var(--danger)"}`,
      color: kind === "ok" ? "var(--st-done-fg)" : "var(--danger)",
      fontSize: 13,
      fontWeight: 500,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      {kind === "ok" ? <Check size={14} /> : <AlertCircle size={14} />}
      {children}
      {onClose && <button type="button" onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "inherit", cursor: "pointer", display: "flex" }}><X size={14} /></button>}
    </div>
  );
}

function BillingDisclosure({
  activeUsers, currentPrice, monthlyCost, periodEnd, accepted, onAcceptedChange,
}: {
  activeUsers: number;
  currentPrice: number;
  monthlyCost: number;
  periodEnd: string | null;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  const estimatedCost = monthlyCost || currentPrice * activeUsers;
  return (
    <div style={{ ...card, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ShieldCheck size={16} style={{ color: "var(--brand)" }} />
        <p style={sectionLabel}>Resumen legal y de cobro</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <MiniStat label="Modelo" value="Mensual por usuario activo" />
        <MiniStat label="Usuarios activos hoy" value={`${activeUsers}`} />
        <MiniStat label="Total estimado hoy" value={estimatedCost > 0 ? fmtCLP(estimatedCost) : "-"} />
        <MiniStat label="Renovación" value={periodEnd ? fmtDate(periodEnd) : "Mensual"} />
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-2)", margin: 0 }}>
        Al activar o cambiar un plan autorizas cargos recurrentes mensuales en CLP según el plan elegido y la cantidad de usuarios activos del workspace. Puedes desactivar usuarios antes del siguiente ciclo para ajustar el cobro, y puedes cancelar la suscripción desde esta pantalla manteniendo acceso hasta el fin del periodo pagado.
      </p>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-1)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => onAcceptedChange(e.target.checked)}
          style={{ marginTop: 3, flexShrink: 0 }}
        />
        <span>
          Acepto los <Link href="/terminos" target="_blank" style={linkStyle}>Términos y Condiciones</Link>, la <Link href="/privacidad" target="_blank" style={linkStyle}>Política de Privacidad</Link> y autorizo el cobro mensual recurrente por usuarios activos mediante Flow.cl.
        </span>
      </label>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px 12px", background: "var(--surface-0)" }}>
      <p style={{ fontSize: 11, color: "var(--fg-4)", margin: "0 0 3px", textTransform: "uppercase", fontWeight: 700 }}>{label}</p>
      <p style={{ fontSize: 13, color: "var(--fg-1)", margin: 0, fontWeight: 700 }}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
      <span style={{ fontSize: 12, color: "var(--fg-4)" }}>{label}</span>
      <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 500, color: "var(--fg-1)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

function CardRow({
  brand, last4, email, onChange, onRemove, changing, removing,
}: {
  brand: string | null;
  last4: string | null;
  email: string | null;
  onChange: () => void;
  onRemove: () => void;
  changing: boolean;
  removing: boolean;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const busy = changing || removing;
  const displayBrand = normalizeCardBrand(brand);

  return (
    <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
      <span style={{ fontSize: 12, color: "var(--fg-4)" }}>Medio de pago</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, alignItems: "stretch" }}>
        <PaymentCardPreview
          brand={displayBrand}
          last4={last4}
          email={email}
          empty={false}
        />

        <div style={{
          minWidth: 0,
          minHeight: 210,
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: 14,
          background: "var(--surface-0)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <ShieldCheck size={16} style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)", margin: 0, overflowWrap: "anywhere" }}>Procesada por Flow.cl</p>
              <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "3px 0 0", lineHeight: 1.45, overflowWrap: "anywhere" }}>
                Pangui solo guarda la marca y los últimos 4 dígitos para identificar el medio de pago.
              </p>
            </div>
          </div>

          {confirmRemove ? (
            <div style={{ display: "grid", gap: 8 }}>
              <p style={{ fontSize: 12, color: "var(--fg-2)", margin: 0 }}>¿Quitar esta tarjeta? Necesitarás registrar otra antes del próximo cobro.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={onRemove} disabled={busy} style={smallDanger}>
                  {removing ? <Loader2 size={11} className="animate-spin" /> : "Sí, quitar"}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy} style={smallGhost}>No</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={onChange} disabled={busy} style={smallGhost} aria-label="Cambiar tarjeta">
                {changing ? <Loader2 size={11} className="animate-spin" /> : <><Pencil size={11} /> Cambiar tarjeta</>}
              </button>
              <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy} style={{ ...smallGhost, color: "var(--danger)" }} aria-label="Quitar tarjeta">
                <Trash2 size={11} /> Quitar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyCardRow({
  canAddCard, payMode, onAddCard, adding,
}: {
  canAddCard: boolean;
  payMode: string | null;
  onAddCard: () => void;
  adding: boolean;
}) {
  const isManual = payMode === "manual";
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 4 }}>
      <span style={{ fontSize: 12, color: "var(--fg-4)" }}>Medio de pago</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, alignItems: "stretch" }}>
        <PaymentCardPreview brand={isManual ? "Pago manual" : "Tarjeta"} last4={null} email={null} empty />

        <div style={{
          minWidth: 0,
          minHeight: 210,
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: 14,
          background: "var(--surface-0)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <ShieldCheck size={16} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-1)", margin: 0, overflowWrap: "anywhere" }}>
                {isManual ? "Pago manual en Flow.cl" : "Datos de tarjeta no disponibles"}
              </p>
              <p style={{ fontSize: 12, color: "var(--fg-3)", margin: "3px 0 0", lineHeight: 1.45, overflowWrap: "anywhere" }}>
                {isManual
                  ? "Este cliente no tiene una tarjeta automática para quitar. Puedes cambiar el medio de pago registrando una tarjeta en Flow.cl."
                  : "Si tu plan está activo, la tarjeta puede estar registrada en Flow.cl aunque Pangui aún no tenga marca y últimos 4 sincronizados. Pangui nunca solicita ni guarda número completo o CVC."}
              </p>
            </div>
          </div>
          {canAddCard && (
            <button type="button" onClick={onAddCard} disabled={adding} style={{ ...smallGhost, width: "fit-content" }} aria-label="Agregar tarjeta">
              {adding ? <Loader2 size={11} className="animate-spin" /> : <><Pencil size={11} /> Agregar tarjeta</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentCardPreview({
  brand, last4, email, empty,
}: {
  brand: string;
  last4: string | null;
  email: string | null;
  empty: boolean;
}) {
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const topLeft = useMotionValue(0.25);
  const topRight = useMotionValue(0.25);
  const bottomLeft = useMotionValue(0.25);
  const bottomRight = useMotionValue(0.25);
  const smoothTopLeft = useSpring(topLeft, { stiffness: 190, damping: 21, mass: 0.28 });
  const smoothTopRight = useSpring(topRight, { stiffness: 190, damping: 21, mass: 0.28 });
  const smoothBottomLeft = useSpring(bottomLeft, { stiffness: 190, damping: 21, mass: 0.28 });
  const smoothBottomRight = useSpring(bottomRight, { stiffness: 190, damping: 21, mass: 0.28 });
  // "Press down" tilt: the corner under the cursor sinks, the rest of the card
  // lifts up. Inverted from the physical tilt you'd get with a fixed center —
  // it reads as "I'm pressing the card down here with my finger" instead of
  // "the card is rotating away from my finger".
  //
  // Standard tilt: cursor at bottom-right → rotateX negative (top tips back)
  //                                       → rotateY positive (right side comes forward)
  //                                       → bottom-right corner LIFTS toward camera.
  // Inverted press-down: flip both signs → bottom-right corner sinks.
  const tlRotateX = useTransform(smoothTopLeft, [0, 1], [0, 12]);
  const tlRotateY = useTransform(smoothTopLeft, [0, 1], [0, -12]);
  const trRotateX = useTransform(smoothTopRight, [0, 1], [0, 12]);
  const trRotateY = useTransform(smoothTopRight, [0, 1], [0, 12]);
  const blRotateX = useTransform(smoothBottomLeft, [0, 1], [0, -12]);
  const blRotateY = useTransform(smoothBottomLeft, [0, 1], [0, -12]);
  const brRotateX = useTransform(smoothBottomRight, [0, 1], [0, -12]);
  const brRotateY = useTransform(smoothBottomRight, [0, 1], [0, 12]);
  const rotateX = useTransform(
    [tlRotateX, trRotateX, blRotateX, brRotateX],
    ([tl, tr, bl, br]) => Number(tl) + Number(tr) + Number(bl) + Number(br)
  );
  const rotateY = useTransform(
    [tlRotateY, trRotateY, blRotateY, brRotateY],
    ([tl, tr, bl, br]) => Number(tl) + Number(tr) + Number(bl) + Number(br)
  );
  const tlOpacity = useTransform(smoothTopLeft, [0.12, 1], [0, 0.55]);
  const trOpacity = useTransform(smoothTopRight, [0.12, 1], [0, 0.55]);
  const blOpacity = useTransform(smoothBottomLeft, [0.12, 1], [0, 0.55]);
  const brOpacity = useTransform(smoothBottomRight, [0.12, 1], [0, 0.55]);
  const tlScale = useTransform(smoothTopLeft, [0, 1], [0.78, 1.08]);
  const trScale = useTransform(smoothTopRight, [0, 1], [0.78, 1.08]);
  const blScale = useTransform(smoothBottomLeft, [0, 1], [0.78, 1.08]);
  const brScale = useTransform(smoothBottomRight, [0, 1], [0.78, 1.08]);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    pointerX.set(x);
    pointerY.set(y);
    topLeft.set((1 - x) * (1 - y));
    topRight.set(x * (1 - y));
    bottomLeft.set((1 - x) * y);
    bottomRight.set(x * y);
  }

  function resetPointer() {
    pointerX.set(0.5);
    pointerY.set(0.5);
    topLeft.set(0.25);
    topRight.set(0.25);
    bottomLeft.set(0.25);
    bottomRight.set(0.25);
  }

  return (
    <motion.div
      tabIndex={0}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      onBlur={resetPointer}
      style={{
        minHeight: 210,
        perspective: 1200,
        outline: "none",
      }}
      whileHover={{ y: -4, scale: 1.014 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      aria-label={empty ? "Tarjeta sin registrar" : `Tarjeta ${brand} terminada en ${last4 ?? "desconocido"}`}
    >
      <motion.div style={{ position: "relative", minHeight: 210 }}>
        <motion.div style={{
          ...paymentCardFace,
          // Theme-aware: in light mode the card is white, in dark mode it flips
          // to deep black. Text uses --fg-1 which already inverts with the theme.
          background: "var(--surface-1)",
          color: "var(--fg-1)",
          border: "1px solid var(--border)",
          rotateX,
          rotateY,
          // transformOrigin stays at center so each corner sinks symmetrically
          // around the middle of the card — the press-down feel comes from the
          // inverted rotation signs above, not from a moving pivot.
          transformOrigin: "50% 50%",
          transformStyle: "preserve-3d",
          willChange: "transform",
          boxShadow: "0 14px 34px rgba(15,23,42,0.16)",
        }}>
          <motion.div style={{ ...cornerLight, top: -54, left: -54, opacity: tlOpacity, scale: tlScale }} />
          <motion.div style={{ ...cornerLight, top: -54, right: -54, opacity: trOpacity, scale: trScale }} />
          <motion.div style={{ ...cornerLight, bottom: -54, left: -54, opacity: blOpacity, scale: blScale }} />
          <motion.div style={{ ...cornerLight, bottom: -54, right: -54, opacity: brOpacity, scale: brScale }} />
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", margin: 0 }}>
                {empty ? "Tarjeta" : "Tarjeta guardada"}
              </p>
              <p style={{ fontSize: 16, fontWeight: 800, margin: "4px 0 0", color: "var(--fg-1)" }}>
                {empty ? "Sin registrar" : brand}
              </p>
            </div>
            {empty ? (
              <CreditCard size={28} style={{ color: "var(--fg-3)" }} />
            ) : (
              <CardBrandLogo brand={brand} height={resolveCardBrand(brand) === "visa" ? 38 : 44} />
            )}
          </div>

          <p style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 20,
            letterSpacing: "0.08em",
            fontWeight: 700,
            margin: "38px 0 28px",
            color: "var(--fg-1)",
            opacity: empty ? 0.55 : 1,
          }}>
            **** **** **** {last4 ?? "----"}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "end" }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-3)", margin: "0 0 4px" }}>
                {empty ? "Procesador" : "Cuenta"}
              </p>
              <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {empty ? "Flow.cl" : email ?? "Facturación Pangui"}
              </p>
            </div>
            <div style={flowBadge}>FLOW</div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function normalizeCardBrand(brand: string | null): string {
  const clean = brand?.trim();
  if (!clean) return "Tarjeta";
  if (/master/i.test(clean)) return "Mastercard";
  if (/visa/i.test(clean)) return "Visa";
  if (/amex|american/i.test(clean)) return "American Express";
  if (/diners/i.test(clean)) return "Diners Club";
  return clean;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100dvh", gap: 8, color: "var(--fg-4)", fontSize: 13 }}>
      {children}
    </div>
  );
}

function CheckoutRedirectOverlay({ planKey }: { planKey: RedirectAction }) {
  const plan = planKey === "card_change" ? null : PLANS.find(p => p.key === planKey);
  const title = planKey === "card_change" ? "Te llevamos a Flow.cl" : "Te llevamos a pagos seguros";
  const body = planKey === "card_change"
    ? "En unos segundos verás la pantalla de Flow.cl para actualizar tu tarjeta de forma segura."
    : `Estamos preparando tu suscripción a ${plan?.name ?? "tu plan"}. En unos segundos verás la pantalla de Flow.cl para ingresar tu tarjeta.`;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(15,23,42,0.92)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
      animation: "checkoutOverlayFadeIn 0.25s ease-out",
    }}>
      <div style={{
        maxWidth: 460,
        width: "min(460px, calc(100vw - 48px))",
        boxSizing: "border-box",
        background: "var(--surface-1)",
        borderRadius: "var(--r-md)",
        padding: "32px 28px",
        textAlign: "center",
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--brand-tint)",
          margin: "0 auto 18px",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <ShieldCheck size={26} style={{ color: "var(--brand)" }} />
          <Loader2 size={56} className="animate-spin" style={{ position: "absolute", color: "var(--brand)", opacity: 0.35 }} />
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--fg-1)", margin: "0 0 8px" }}>{title}</h2>
        <p style={{ fontSize: 13.5, color: "var(--fg-2)", margin: 0, lineHeight: 1.55 }}>{body}</p>
        <div style={{
          marginTop: 22,
          padding: "12px 14px",
          background: "var(--surface-0)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          boxSizing: "border-box",
          width: "100%",
          fontSize: 12,
          lineHeight: 1.45,
          color: "var(--fg-3)",
          display: "grid",
          gridTemplateColumns: "14px minmax(0, 1fr)",
          alignItems: "start",
          columnGap: 8,
          textAlign: "left",
          overflow: "hidden",
        }}>
          <ShieldCheck size={14} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} />
          <span style={{ minWidth: 0, overflowWrap: "break-word", wordBreak: "normal" }}>
            Pangui no guarda los datos completos de tu tarjeta. El registro y la actualización se hacen en Flow.cl.
          </span>
        </div>
      </div>
      <style>{`
        @keyframes checkoutOverlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function statusLabel(s: string) {
  return ({ trialing: "En prueba", active: "Activa", past_due: "Pago atrasado", unpaid: "Sin pagar", canceled: "Cancelada", basic_free: "Basic (gratis)" } as Record<string, string>)[s] ?? s;
}

function statusPill(s: string): React.CSSProperties {
  const palette: Record<string, { bg: string; fg: string }> = {
    trialing: { bg: "var(--brand-tint)", fg: "var(--brand-fg)" },
    active: { bg: "var(--success-bg)", fg: "var(--st-done-fg)" },
    past_due: { bg: "var(--danger-bg)", fg: "var(--danger)" },
    unpaid: { bg: "var(--danger-bg)", fg: "var(--danger)" },
    canceled: { bg: "var(--surface-hover)", fg: "var(--fg-2)" },
    basic_free: { bg: "var(--st-wait-bg)", fg: "var(--st-wait-fg)" },
  };
  const c = palette[s] ?? palette.active;
  return { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: c.bg, color: c.fg, border: "1px solid var(--border-strong)", whiteSpace: "nowrap" };
}

const card: React.CSSProperties = {
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  padding: 20,
  boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "var(--fg-2)",
  margin: 0,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const ghostBtn: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  background: "var(--surface-1)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--fg-1)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const dangerBtn: React.CSSProperties = {
  height: 36,
  padding: "0 14px",
  border: "none",
  borderRadius: "var(--r-md)",
  background: "var(--danger)",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--surface-1)",
  cursor: "pointer",
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 110,
};

const iconBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  background: "var(--surface-1)",
  color: "var(--fg-2)",
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  height: 38,
  border: "none",
  borderRadius: "var(--r-md)",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
};

const smallGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 26,
  padding: "0 8px",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--fg-2)",
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const smallDanger: React.CSSProperties = {
  ...smallGhost,
  background: "var(--danger)",
  color: "var(--surface-1)",
  border: "none",
};

const paymentCardFace: React.CSSProperties = {
  position: "relative",
  minHeight: 210,
  borderRadius: "var(--r-md)",
  padding: 18,
  overflow: "hidden",
};

const cornerLight: React.CSSProperties = {
  position: "absolute",
  width: 150,
  height: 150,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(39,61,136,0.22), rgba(15,118,110,0.10) 42%, transparent 70%)",
  pointerEvents: "none",
  mixBlendMode: "multiply",
};

const flowBadge: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  color: "var(--fg-2)",
  background: "var(--surface-0)",
};

const linkStyle: React.CSSProperties = {
  color: "var(--brand)",
  fontWeight: 700,
  textDecoration: "none",
};
