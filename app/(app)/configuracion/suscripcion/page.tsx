"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Loader2, Check, CreditCard, AlertCircle, ArrowLeft, X, Sparkles, ShieldCheck, Pencil, Trash2 } from "lucide-react";
import { SELF_SERVE_PLANS, PLANS, type PlanKey } from "@/lib/flow-plans";
import { textoDesglose } from "@/lib/tributario";
import { resumirCambio, type ResumenCambio } from "@/lib/cambio-plan";
import { resolveCardBrand } from "@/lib/card-brand";
import { CardBrandLogo } from "@/components/CardBrandLogo";
import { InvoicesPanel } from "./InvoicesPanel";
import { DocumentosPanel } from "./DocumentosPanel";
import { SubscriptionOverview } from "./SubscriptionOverview";

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
    // Bajada de plan agendada para el fin del período vigente.
    scheduled_plan_key?: PlanKey | null;
    scheduled_plan_at?: string | null;
  } | null;
  customer: { has_card: boolean; card_last4: string | null; card_brand: string | null; email: string; pay_mode?: string | null } | null;
  active_users: number;
  monthly_cost: number;
  effective_plan: PlanKey;
}

const fmtCLP = (n: number) => n.toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
// timeZone UTC a propósito: los períodos de facturación se guardan a medianoche
// UTC y representan un día calendario, no un instante. Formatearlos en hora de
// Chile (UTC−4) los corre al día anterior — "2026-08-27 00:00+00" se mostraba
// como 26 de agosto.
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }) : "-";
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
  // Plan que el usuario eligió y todavía no confirma. Un cambio de plan mueve
  // dinero —una subida cobra la diferencia al instante— así que no puede
  // dispararse con un solo clic.
  const [planPorConfirmar, setPlanPorConfirmar] = useState<PlanKey | null>(null);
  const [cancelandoAgendado, setCancelandoAgendado] = useState(false);
  // Reemplaza al antiguo checkbox de aceptación: en vez de pedir un clic extra,
  // exigimos los datos que realmente hacen falta para cobrar y emitir la factura.
  const [profileReady, setProfileReady] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/suscripcion/status?full=1", { cache: "no-store" });
    if (!res.ok) {
      setError("No se pudo cargar la suscripción.");
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Mientras la suscripción espera el pago del link, la página quedaba pegada
  // en "Esperando el pago" hasta un refresh manual. Sondea el estado cada 30 s
  // (sin spinner) y se actualiza sola cuando el webhook confirma el pago.
  useEffect(() => {
    if (data?.subscription?.status !== "past_due") return;
    const id = setInterval(async () => {
      const res = await fetch("/api/suscripcion/status?full=1", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    }, 30_000);
    return () => clearInterval(id);
  }, [data?.subscription?.status]);

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

  function ensureBillingReady() {
    if (profileReady) return true;
    setError("Completa el email de cobros y los datos de facturación antes de elegir un plan.");
    return false;
  }

  async function startCheckout(planKey: PlanKey) {
    if (!ensureBillingReady()) return;
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
      if (!res.ok) throw new Error(json.error ?? "No se pudo crear la suscripción.");

      // Dos caminos según FLOW_CARGO_AUTOMATICO (ver /api/suscripcion/register):
      //   - con cargo automático: Flow devuelve la URL donde el usuario
      //     inscribe su tarjeta, y hay que redirigir.
      //   - con link de pago: la suscripción queda creada y Flow envía el link
      //     por email, así que no hay a dónde redirigir.
      if (json.url) {
        setTimeout(() => window.location.assign(json.url), 600);
        return;
      }

      setRedirecting(null);
      setSubmitting(null);
      setFlash({
        kind: "ok",
        msg: `Suscripción creada. Flow.cl envió el link de pago a ${json.email ?? "tu email de cobros"}. El plan se activa al confirmarse el pago.`,
        // Nota: este mensaje solo aparece con FLOW_CARGO_AUTOMATICO apagado.
        // Con cargo automático el flujo redirige a inscribir la tarjeta y
        // nunca llega acá.
      });
      await reload();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(null);
      setRedirecting(null);
    }
  }

  async function changePlan(planKey: PlanKey) {
    if (!ensureBillingReady()) return;
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

  /** Deshace una bajada de plan agendada, antes de que llegue su fecha. */
  async function cancelarCambioAgendado() {
    setCancelandoAgendado(true);
    setError(null);
    try {
      const res = await fetch("/api/suscripcion/cancel-scheduled-plan", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cancelar el cambio.");
      setFlash({ kind: "ok", msg: "Cambio de plan cancelado. Conservas tu plan actual." });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelandoAgendado(false);
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
    // Sin height:100dvh ni overflow propios: eso creaba un segundo viewport
    // dentro del scroll del layout. La página fluye y scrollea una sola vez.
    <div style={{ minHeight: "100%", background: "var(--surface-canvas)" }}>
      {redirecting && <CheckoutRedirectOverlay planKey={redirecting} />}

      {planPorConfirmar && sub && (
        <ConfirmarCambioPlan
          resumen={resumirCambio({
            planActual:      sub.plan_key,
            planNuevo:       planPorConfirmar,
            usuariosActivos: activeUsers,
            periodoFin:      sub.current_period_end,
            precioPorUsuario: sub.is_early_customer ? sub.price_per_user_clp : null,
          })}
          trabajando={submitting === planPorConfirmar}
          onCancelar={() => setPlanPorConfirmar(null)}
          onConfirmar={() => {
            const plan = planPorConfirmar;
            setPlanPorConfirmar(null);
            void changePlan(plan);
          }}
        />
      )}

      <div style={{ padding: "28px 24px" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
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

          {/* Suscripción pendiente de pago. Con cargo automático hay dos causas
              muy distintas y el aviso no puede tratarlas igual: o falta
              inscribir la tarjeta, o la tarjeta inscrita rechazó el cobro. Sin
              esto el usuario solo ve "Pago atrasado" en rojo, que no le dice
              qué hacer. */}
          {sub?.status === "past_due" && (
            <div style={{ ...card, border: "1px solid var(--warning)", background: "var(--st-wait-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <AlertCircle size={16} style={{ color: "var(--warning)" }} />
                <p style={{ ...sectionLabel, color: "var(--warning)" }}>
                  {customer?.has_card ? "No pudimos cobrar tu tarjeta" : "Falta inscribir tu tarjeta"}
                </p>
              </div>
              {customer?.has_card ? (
                <>
                  <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0, lineHeight: 1.5 }}>
                    El cobro de <strong>{currentPlan?.name ?? sub.plan_key}</strong> a tu tarjeta terminada en {customer.card_last4 ?? "····"} no se pudo procesar. Flow.cl reintentará automáticamente en los próximos días.
                  </p>
                  <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    Si el problema persiste, actualiza tu tarjeta más abajo. Mientras tanto conservas el acceso.
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0, lineHeight: 1.5 }}>
                    Tu suscripción a <strong>{currentPlan?.name ?? sub.plan_key}</strong> está creada, pero aún no hay una tarjeta inscrita para cobrarla. El plan se activa apenas se realice el primer cobro.
                  </p>
                  <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    Elige tu plan otra vez para inscribir la tarjeta en Flow.cl. Mientras tanto conservas tu plan anterior.
                  </p>
                </>
              )}
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

          {/* Paso 1: los datos de cobro son del workspace, no de la suscripción.
              Se muestran siempre — sin ellos no se puede contratar, y quien
              canceló (o aún no contrata) no tiene fila en subscriptions pero sí
              necesita completarlos para volver a suscribirse. */}
          <div>
            {!isPaid && <p style={{ ...sectionLabel, marginBottom: 12 }}>1 · Tus datos de cobro</p>}
            <SubscriptionOverview
              planName={currentPlan?.name ?? sub?.plan_key ?? ""}
              status={sub?.status ?? "canceled"}
              statusLabel={statusLabel(sub?.status ?? "canceled")}
              renewalDate={sub?.current_period_end ?? null}
              unitPrice={currentPrice}
              totalPrice={monthlyCost}
              activeUsers={activeUsers}
              cardBrand={customer?.card_brand ?? null}
              cardLast4={customer?.card_last4 ?? null}
              billingEmail={customer?.email ?? null}
              showPlanSummary={isPaid}
              canceledAt={sub?.canceled_at ?? null}
              changingCard={submitting === "card_change"}
              removingCard={submitting === "card_remove"}
              onChangeCard={changeCard}
              onRemoveCard={removeCard}
              onProfileReadyChange={setProfileReady}
            />
          </div>

          <div>
            <p style={{ ...sectionLabel, marginBottom: 12 }}>
              {sub?.canceled_at ? "Reactivar con un plan" : isPaid ? "Cambiar plan" : isTrial ? "2 · Elige tu plan para después de la prueba" : "2 · Elige un plan"}
            </p>
            {!profileReady && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 12, padding: "11px 13px", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--surface-2)" }}>
                <AlertCircle size={15} style={{ color: "var(--fg-3)", flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-2)" }}>
                  Completa el <strong>email de cobros</strong> y los <strong>datos de facturación</strong> para poder elegir un plan. Los necesitamos para emitir la factura electrónica de cada cobro.
                </p>
              </div>
            )}
            {/* Cambio agendado. Mientras no llegue la fecha nada se aplicó en
                Flow, así que se puede deshacer sin costo — es la red de
                seguridad para quien bajó de plan por error. */}
            {sub?.scheduled_plan_key && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 12, padding: "11px 13px", border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)", background: "var(--surface-2)" }}>
                <AlertCircle size={15} style={{ color: "var(--fg-3)", flexShrink: 0, marginTop: 1 }} />
                <div style={{ display: "grid", gap: 9, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-2)" }}>
                    Cambio agendado a <strong>{PLANS.find(p => p.key === sub.scheduled_plan_key)?.name ?? sub.scheduled_plan_key}</strong> el {fmtDate(sub.scheduled_plan_at ?? sub.current_period_end)}. Hasta entonces conservas {currentPlan?.name ?? sub.plan_key} y no habrá cobros adicionales.
                  </p>
                  <button
                    type="button"
                    onClick={() => void cancelarCambioAgendado()}
                    disabled={cancelandoAgendado}
                    style={{
                      width: "fit-content", minHeight: 30, padding: "0 11px",
                      display: "inline-flex", alignItems: "center", gap: 6,
                      border: "1px solid var(--border-strong)", borderRadius: "var(--r-md)",
                      background: "var(--surface-1)", color: "var(--fg-1)",
                      fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                      cursor: cancelandoAgendado ? "default" : "pointer",
                    }}
                  >
                    {cancelandoAgendado
                      ? <><Loader2 size={12} className="animate-spin" /> Cancelando…</>
                      : <><X size={12} /> Cancelar este cambio</>}
                  </button>
                </div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {SELF_SERVE_PLANS.map(p => {
                // Cancelada: ningún plan cuenta como "actual", así el usuario
                // puede reactivar el mismo que tenía sin quedar bloqueado.
                const isCurrent = sub?.plan_key === p.key && isPaid && !sub?.canceled_at;
                const disabled = isCurrent || submitting !== null || !profileReady;
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
                      // Cambiar entre planes pagados pide confirmación: una
                      // subida cobra la diferencia al instante. Contratar
                      // desde prueba o Basic gratis no la pide — ahí el paso
                      // siguiente es el formulario de tarjeta de Flow, que ya
                      // es una confirmación en sí.
                      onClick={() => (isPaid || customer?.has_card)
                        ? setPlanPorConfirmar(p.key)
                        : startCheckout(p.key)}
                      style={{
                        ...primaryBtn,
                        marginTop: "auto",
                        background: isCurrent ? "var(--surface-hover)" : "var(--brand)",
                        color: isCurrent ? "var(--fg-2)" : "var(--surface-1)",
                        cursor: disabled ? "default" : "pointer",
                        opacity: !isCurrent && !profileReady ? 0.55 : 1,
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
              <CreditCard size={12} /> Al elegir un plan te llevamos a Flow.cl para inscribir tu tarjeta. El primer cobro se hace al inscribirla y los siguientes se cargan automáticamente cada mes.
            </p>
          </div>

          <BillingDisclosure
            activeUsers={activeUsers}
            currentPrice={currentPrice}
            monthlyCost={monthlyCost}
            periodEnd={sub?.current_period_end ?? null}
            canceled={Boolean(sub?.canceled_at)}
          />

          {/* El historial solo aparece cuando ya hubo cobros: a un usuario en
              prueba una tabla vacía no le dice nada. */}
          {isPaid && (
            <div>
              <p style={{ ...sectionLabel, marginBottom: 12 }}>Cobros</p>
              <InvoicesPanel />
            </div>
          )}

          {/* Cobros y documentos van separados a propósito: el cobro es el
              movimiento de dinero en Flow y el documento es la factura ante el
              SII. Un período puede estar pagado y su factura aún pendiente de
              emisión, así que mezclarlos en una sola tabla haría creer que
              falta un cobro cuando lo que falta es emitir. */}
          {isPaid && (
            <div>
              <p style={{ ...sectionLabel, marginBottom: 12 }}>Documentos tributarios</p>
              <DocumentosPanel />
            </div>
          )}

          {/* Acción destructiva: siempre al final, nunca entre información. */}
          {isPaid && !sub?.canceled_at && (
            <div style={{ paddingTop: 4, borderTop: "1px solid var(--border)" }}>
              {confirmCancel ? (
                <div style={{ ...card, borderColor: "var(--danger)", marginTop: 16 }}>
                  <p style={{ fontSize: 13, color: "var(--fg-1)", margin: "0 0 10px" }}>
                    ¿Cancelar la suscripción? Mantendrás acceso hasta el {fmtDate(sub?.current_period_end ?? null)} y no habrá nuevos cobros.
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={cancelSub} disabled={submitting === "cancel"} style={dangerBtn}>{submitting === "cancel" ? <Loader2 size={13} className="animate-spin" /> : "Sí, cancelar"}</button>
                    <button type="button" onClick={() => setConfirmCancel(false)} style={ghostBtn}>No</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} style={{ ...ghostBtn, width: "fit-content", marginTop: 16, color: "var(--fg-3)" }}>Cancelar suscripción</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BillingTab({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      style={{
        height: 32,
        padding: "0 12px",
        border: selected ? "1px solid var(--border)" : "1px solid transparent",
        borderRadius: "calc(var(--r-md) - 2px)",
        background: selected ? "var(--surface-1)" : "transparent",
        color: selected ? "var(--fg-1)" : "var(--fg-3)",
        boxShadow: selected ? "var(--shadow-sm)" : "none",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
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
  activeUsers, currentPrice, monthlyCost, periodEnd, canceled,
}: {
  activeUsers: number;
  currentPrice: number;
  monthlyCost: number;
  periodEnd: string | null;
  canceled: boolean;
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
        <MiniStat label="Total estimado hoy (IVA incl.)" value={estimatedCost > 0 ? fmtCLP(estimatedCost) : "-"} />
        <MiniStat label={canceled ? "Acceso hasta" : "Renovación"} value={periodEnd ? fmtDate(periodEnd) : "Mensual"} />
      </div>
      {estimatedCost > 0 && (
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-3)", margin: 0 }}>
          Desglose del total estimado: {textoDesglose(estimatedCost)}.
        </p>
      )}
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-2)", margin: 0 }}>
        Al activar o cambiar un plan aceptas el cobro mensual en CLP según el plan elegido y la cantidad de usuarios activos del workspace. <strong>El cobro se carga automáticamente a la tarjeta que inscribas en Flow.cl</strong>, cada mes y sin acción de tu parte; el acceso se mantiene mientras el pago esté al día. Puedes desactivar usuarios antes del siguiente ciclo para ajustar el cobro, cambiar la tarjeta desde esta pantalla, y cancelar la suscripción manteniendo acceso hasta el fin del periodo pagado.
      </p>
      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--fg-2)", margin: 0 }}>
        Los pagos se procesan a través de Flow.cl. Por cada cobro emitimos una <strong>factura electrónica afecta a IVA</strong> ante el SII, que enviamos al email de cobros del workspace. <strong>Todos los precios publicados incluyen IVA (19%)</strong>: el monto que ves es el total a pagar. Si tu empresa es contribuyente de IVA, la factura da derecho a crédito fiscal por el impuesto desglosado en ella.
      </p>
      {/* Sin checkbox: el consentimiento queda por acción. El aviso está a la
          vista y contratar es el acto de aceptación, que es como opera el resto
          del checkout. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-3)", margin: 0 }}>
        Al elegir un plan aceptas los <Link href="/terminos" target="_blank" style={linkStyle}>Términos y Condiciones</Link> y la <Link href="/privacidad" target="_blank" style={linkStyle}>Política de Privacidad</Link>, y el cobro mensual automático por usuarios activos a la tarjeta inscrita en Flow.cl. Pangui no almacena los datos de tu tarjeta: los procesa y guarda Flow.cl.
      </p>
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

/**
 * Confirmación previa a un cambio de plan.
 *
 * Un cambio mueve dinero y no siempre se puede deshacer: subir cobra la
 * diferencia al instante. El diálogo dice qué va a pasar, cuánto pasa a costar
 * y —cuando corresponde— que es irreversible. Ver lib/cambio-plan.ts.
 */
function ConfirmarCambioPlan({ resumen, trabajando, onCancelar, onConfirmar }: {
  resumen:     ResumenCambio;
  trabajando:  boolean;
  onCancelar:  () => void;
  onConfirmar: () => void;
}) {
  // Escape cierra sin aplicar: es la salida esperada de un diálogo del que uno
  // se arrepiente, que es justo el caso que este modal existe para cubrir.
  useEffect(() => {
    function alEscape(e: KeyboardEvent) { if (e.key === "Escape") onCancelar(); }
    document.addEventListener("keydown", alEscape);
    return () => document.removeEventListener("keydown", alEscape);
  }, [onCancelar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={resumen.titulo}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancelar(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000, display: "grid", placeItems: "center",
        padding: 16, background: "rgba(0,0,0,.45)", backdropFilter: "blur(4px)",
      }}
    >
      <div style={{
        width: "min(460px, calc(100vw - 32px))", maxHeight: "calc(100dvh - 32px)", overflowY: "auto",
        border: "1px solid var(--border)", borderRadius: "var(--r-xl)",
        background: "var(--surface-1)", boxShadow: "var(--shadow-lg)",
      }}>
        <div style={{ padding: "18px 18px 0" }}>
          <h2 style={{ margin: 0, fontSize: 17, color: "var(--fg-1)" }}>{resumen.titulo}</h2>
        </div>

        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--fg-1)" }}>
            {resumen.detalle}
          </p>

          {resumen.advertencia && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 13px",
              border: "1px solid var(--warning)", borderRadius: "var(--r-md)",
              background: "var(--st-wait-bg)",
            }}>
              <AlertCircle size={15} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-1)" }}>
                {resumen.advertencia}
              </p>
            </div>
          )}

          {resumen.reversible && resumen.tipo === "bajada" && (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg-3)" }}>
              Puedes cancelar este cambio en cualquier momento antes de esa fecha.
            </p>
          )}
        </div>

        <div style={{
          padding: "0 18px 18px", display: "flex", justifyContent: "flex-end", gap: 8,
        }}>
          <button type="button" onClick={onCancelar} disabled={trabajando} style={ghostBtn}>
            No, volver
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={trabajando}
            style={{ ...primaryBtn, minWidth: 150, opacity: trabajando ? 0.7 : 1 }}
          >
            {trabajando ? <Loader2 size={13} className="animate-spin" /> : resumen.textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutRedirectOverlay({ planKey }: { planKey: RedirectAction }) {
  const plan = planKey === "card_change" ? null : PLANS.find(p => p.key === planKey);
  // Con cargo automático, elegir plan redirige a Flow para inscribir la
  // tarjeta, así que el overlay cubre una redirección real y no una espera.
  const title = "Te llevamos a Flow.cl";
  const body = planKey === "card_change"
    ? "En unos segundos verás la pantalla de Flow.cl para actualizar tu tarjeta de forma segura."
    : `En unos segundos verás la pantalla de Flow.cl para inscribir tu tarjeta y activar ${plan?.name ?? "tu plan"}. Pangui no guarda los datos de tu tarjeta.`;

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
  // past_due = "Pendiente de pago": cubre tanto una suscripción creada sin
  // tarjeta inscrita como un cobro automático que la tarjeta rechazó y Flow
  // aún está reintentando. "Pago atrasado" alarmaba en ambos casos.
  return ({ trialing: "En prueba", active: "Activa", past_due: "Pendiente de pago", unpaid: "Sin pagar", canceled: "Cancelada", basic_free: "Basic (gratis)" } as Record<string, string>)[s] ?? s;
}

function statusPill(s: string): React.CSSProperties {
  const palette: Record<string, { bg: string; fg: string }> = {
    trialing: { bg: "var(--brand-tint)", fg: "var(--brand-fg)" },
    active: { bg: "var(--success-bg)", fg: "var(--st-done-fg)" },
    // Ámbar, no rojo: Flow reintenta el cobro automático varios días antes de
    // dar la suscripción por impaga, así que este estado todavía es
    // recuperable y no una falla definitiva.
    past_due: { bg: "var(--st-wait-bg)", fg: "var(--warning)" },
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
