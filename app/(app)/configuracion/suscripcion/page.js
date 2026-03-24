"use client";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Script from "next/script";
import { createClient } from "@/lib/supabase";
import {
  CheckCircle2, Zap, Building2, Rocket,
  AlertTriangle, Lock, CreditCard, Phone, Wallet,
} from "lucide-react";
import styles from "./page.module.css";

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANES = [
  {
    id: "basic",
    nombre: "Basic",
    precio: null,
    icon: Rocket,
    descripcion: "Para conocer Pangui sin compromiso.",
    features: [
      "1 usuario administrador",
      "Hasta 10 órdenes de trabajo / mes",
      "Hasta 30 activos",
      "Soporte por correo",
    ],
  },
  {
    id: "pro",
    nombre: "Pro",
    precio: 29990,
    icon: Zap,
    descripcion: "Para equipos en operación real.",
    features: [
      "Usuarios ilimitados",
      "OT ilimitadas",
      "Activos ilimitados",
      "Preventivos automáticos",
      "Módulo de normativa (DS 594, Ley 16.744)",
      "Exportación PDF y Excel",
      "Notificaciones push",
      "Soporte prioritario",
    ],
    popular: true,
  },
  {
    id: "enterprise",
    nombre: "Enterprise",
    precio: null,
    icon: Building2,
    descripcion: "Para grandes operaciones con necesidades específicas.",
    features: [
      "Todo lo de Pro",
      "Múltiples sucursales",
      "Onboarding dedicado",
      "SLA garantizado 99,9%",
      "Soporte 24/7",
      "Integraciones a medida",
    ],
  },
];

const PRO_FEATURES = [
  "Usuarios ilimitados",
  "OT ilimitadas",
  "Activos ilimitados",
  "Preventivos automáticos",
  "Normativa DS 594 y Ley 16.744",
  "Exportación PDF y Excel",
  "Notificaciones push",
  "Soporte prioritario",
];

const MP_PRO_URL = `https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${process.env.NEXT_PUBLIC_MP_PLAN_BASIC_ID}`;

// ── PlanCard ──────────────────────────────────────────────────────────────────
function PlanCard({ plan, planActual, onSelect }) {
  const Icon = plan.icon;
  const esActual = planActual === plan.id;

  return (
    <div style={{
      background: "var(--background)",
      border: plan.popular ? "2px solid var(--accent-1)" : "1px solid var(--divider-1)",
      borderRadius: 12,
      padding: "28px 24px",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      boxShadow: plan.popular ? "0 4px 24px rgba(39,61,136,0.10)" : "0 1px 4px rgba(0,0,0,0.05)",
    }}>
      {plan.popular && (
        <div style={{
          position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)",
          background: "var(--accent-1)", color: "#fff",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", padding: "3px 14px", borderRadius: 20,
          whiteSpace: "nowrap",
        }}>
          Más popular
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, marginTop: plan.popular ? 8 : 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: "var(--accent-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent-1)", flexShrink: 0,
        }}>
          <Icon size={16} />
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {plan.nombre}
        </span>
      </div>

      <div style={{ marginBottom: 8 }}>
        {plan.precio ? (
          <>
            <span style={{ fontSize: 32, fontWeight: 900, color: "var(--black)", letterSpacing: "-0.03em" }}>
              ${plan.precio.toLocaleString("es-CL")}
            </span>
            <span style={{ fontSize: 13, color: "var(--accent-5)", marginLeft: 4 }}>CLP / mes</span>
          </>
        ) : plan.id === "enterprise" ? (
          <span style={{ fontSize: 22, fontWeight: 800, color: "var(--black)" }}>A definir</span>
        ) : (
          <span style={{ fontSize: 32, fontWeight: 900, color: "var(--black)" }}>Gratis</span>
        )}
      </div>

      <p style={{ fontSize: 13, color: "var(--accent-5)", marginBottom: 20, lineHeight: 1.6 }}>
        {plan.descripcion}
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "var(--black)" }}>
            <CheckCircle2 size={14} style={{ color: "#10b981", flexShrink: 0, marginTop: 2 }} />
            {f}
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto" }}>
        {esActual ? (
          <div style={{
            padding: "11px 0", textAlign: "center", fontSize: 13, fontWeight: 700,
            color: "#10b981", border: "1.5px solid #10b981", borderRadius: 8,
          }}>
            ✓ Plan actual
          </div>
        ) : plan.id === "basic" ? (
          <div style={{
            padding: "11px 0", textAlign: "center", fontSize: 13,
            color: "var(--accent-5)", border: "1px solid var(--divider-1)", borderRadius: 8,
          }}>
            Plan de inicio
          </div>
        ) : plan.id === "enterprise" ? (
          <a
            href="mailto:ventas@pangui.cl?subject=Consulta%20Enterprise"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "12px 0", background: "transparent",
              color: "var(--accent-1)", border: "1.5px solid var(--accent-1)",
              fontSize: 14, fontWeight: 700, borderRadius: 8,
              textDecoration: "none", boxSizing: "border-box",
            }}
          >
            <Phone size={14} /> Hablar con ventas
          </a>
        ) : (
          <button
            onClick={() => onSelect(plan)}
            style={{
              width: "100%", padding: "13px 0",
              background: "var(--accent-1)", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Suscribirme al Pro
          </button>
        )}
      </div>
    </div>
  );
}

// ── Checkout (full-page split layout) ─────────────────────────────────────────
function CheckoutPanel({ perfil, mpReady, onSuccess, onCancel }) {
  const [method, setMethod] = useState("card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const cardFormRef = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (method !== "card" || !mpReady) return;
    if (mounted.current) return;
    mounted.current = true;

    const t = setTimeout(() => {
      const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY, { locale: "es-CL" });
      cardFormRef.current = mp.cardForm({
        amount: "29990",
        iframe: true,
        form: {
          id: "pangui-card-form",
          cardNumber:           { id: "cf-cardNumber",     placeholder: "0000 0000 0000 0000" },
          expirationDate:       { id: "cf-expirationDate", placeholder: "MM/AA" },
          securityCode:         { id: "cf-securityCode",   placeholder: "CVV" },
          cardholderName:       { id: "cf-cardholderName" },
          issuer:               { id: "cf-issuer" },
          installments:         { id: "cf-installments" },
          identificationType:   { id: "cf-identificationType" },
          identificationNumber: { id: "cf-identificationNumber" },
          cardholderEmail:      { id: "cf-cardholderEmail" },
        },
        customization: {
          visual: {
            style: {
              theme: "default",
              customVariables: {
                textPrimaryColor:        "#1A1A1A",
                textSecondaryColor:      "#9CA3AF",
                inputBackgroundColor:    "#FFFFFF",
                inputFocusedBorderColor: "#1F316E",
                borderRadiusMedium:      "8px",
                fontSizeBase:            "14px",
                fontSizeMedium:          "14px",
              },
            },
          },
        },
        callbacks: {
          onFormMounted: (err) => { if (err) console.error("[MP] mount:", err); },
          onSubmit: async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);
            try {
              const { token, email } = cardFormRef.current.getCardFormData();
              if (!token) { setError("No se pudo tokenizar la tarjeta. Verifica los datos."); setSubmitting(false); return; }
              const res = await fetch("/api/suscripcion/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: "pro", payer_email: email || perfil.email, card_token_id: token, user_id: perfil.id }),
              });
              const data = await res.json();
              if (data.ok) { onSuccess(); }
              else { setError(data.error ?? "Error al procesar."); setSubmitting(false); }
            } catch {
              setError("Error de red. Intenta de nuevo.");
              setSubmitting(false);
            }
          },
        },
      });
    }, 150);

    return () => {
      clearTimeout(t);
      try { cardFormRef.current?.unmount?.(); } catch {}
      mounted.current = false;
    };
  }, [method, mpReady]);

  useEffect(() => {
    if (method !== "card") {
      try { cardFormRef.current?.unmount?.(); } catch {}
      mounted.current = false;
    }
  }, [method]);


  return (
    <div className={styles.checkoutWrap}>
      {/* ── Left: plan summary ── */}
      <div className={styles.checkoutSummary}>
        <p className={styles.summaryLabel}>Plan Pro</p>
        <div className={styles.summaryPrice}>
          $29.990 <span>CLP / mes</span>
        </div>
        <p className={styles.summaryDesc}>Cancela cuando quieras. Sin permanencia.</p>

        <ul className={styles.summaryFeatures}>
          {PRO_FEATURES.map((f) => (
            <li key={f} className={styles.summaryFeature}>
              <span className={styles.summaryFeatureIcon}>
                <CheckCircle2 size={11} />
              </span>
              {f}
            </li>
          ))}
        </ul>

        <div className={styles.summarySecure}>
          <Lock size={11} /> Sin permanencia. Cancela cuando quieras.
        </div>
      </div>

      {/* ── Right: payment form ── */}
      <div className={styles.checkoutForm}>
        {/* Method tabs */}
        <div className={styles.methodTabs}>
          <div className={styles.methodTabsInner}>
            <button
              className={`${styles.methodTab} ${method === "card" ? styles.methodTabActive : styles.methodTabInactive}`}
              onClick={() => setMethod("card")}
            >
              <CreditCard size={15} /> Tarjeta de crédito
            </button>
            <button
              className={`${styles.methodTab} ${method === "mp" ? styles.methodTabActive : styles.methodTabInactive}`}
              onClick={() => setMethod("mp")}
            >
              <Wallet size={15} /> Cuenta MercadoPago
            </button>
          </div>
        </div>

        {/* Card form */}
        {method === "card" && (
          <form id="pangui-card-form" className={styles.formBody}>
            <div>
              <label className={styles.formLabel}>Número de tarjeta</label>
              <div id="cf-cardNumber" />
            </div>
            <div className={styles.formRow2}>
              <div>
                <label className={styles.formLabel}>Vencimiento</label>
                <div id="cf-expirationDate" />
              </div>
              <div>
                <label className={styles.formLabel}>CVV</label>
                <div id="cf-securityCode" />
              </div>
            </div>
            <div>
              <label className={styles.formLabel}>Titular</label>
              <input id="cf-cardholderName" type="text" placeholder="Como aparece en la tarjeta" className={styles.formInput} />
            </div>
            <div className={styles.formRowDoc}>
              <div>
                <label className={styles.formLabel}>Tipo doc.</label>
                <select id="cf-identificationType" className={styles.formSelect} />
              </div>
              <div>
                <label className={styles.formLabel}>N° documento</label>
                <input id="cf-identificationNumber" type="text" placeholder="12.345.678-9" className={styles.formInput} />
              </div>
            </div>
            <div>
              <label className={styles.formLabel}>Email</label>
              <input id="cf-cardholderEmail" type="email" defaultValue={perfil?.email ?? ""} placeholder="correo@ejemplo.cl" className={styles.formInput} />
            </div>

            <select id="cf-issuer" style={{ display: "none" }} />
            <select id="cf-installments" style={{ display: "none" }} />

            {error && (
              <div className={styles.formError}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
              </div>
            )}

            <div className={styles.formActions}>
              <button type="button" onClick={onCancel} className={styles.btnCancel}>
                Cancelar
              </button>
              <button
                type="submit"
                id="pangui-card-form__submit"
                disabled={submitting}
                className={styles.btnSubmit}
                style={{
                  background: submitting ? "var(--accent-5)" : "var(--accent-1)",
                  opacity: submitting ? 0.7 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                <Lock size={14} /> {submitting ? "Procesando…" : "Confirmar suscripción"}
              </button>
            </div>
          </form>
        )}

        {/* MercadoPago */}
        {method === "mp" && (
          <div className={styles.mpBody}>
            <div className={styles.mpInfo}>
              <p className={styles.mpInfoTitle}>Paga con tu saldo de MercadoPago</p>
              <p className={styles.mpInfoDesc}>
                Serás redirigido a MercadoPago para completar el pago con tu cuenta, saldo disponible, o cualquier medio guardado.
              </p>
            </div>
            <div className={styles.mpActions}>
              <a
                href={MP_PRO_URL}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  padding: "14px 20px", background: "#009ee3",
                  color: "#fff", borderRadius: 8, fontSize: 15, fontWeight: 700,
                  textDecoration: "none", fontFamily: "inherit",
                }}
              >
                <Wallet size={16} /> Continuar con MercadoPago
              </a>
              <button onClick={onCancel} className={styles.btnCancel} style={{ width: "100%" }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className={styles.formFooter}>
          <Lock size={11} />
          Pago seguro · Procesado por MercadoPago
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SuscripcionPage() {
  return (
    <Suspense>
      <SuscripcionContent />
    </Suspense>
  );
}

function SuscripcionContent() {
  const searchParams = useSearchParams();
  const preapprovalId = searchParams.get("preapproval_id");

  const [perfil, setPerfil]     = useState(null);
  const [mpReady, setMpReady]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("usuarios")
        .select("id, plan, plan_status, trial_end")
        .eq("id", user.id)
        .maybeSingle();
      setPerfil({ ...data, email: user.email });

      if (preapprovalId) {
        const res = await fetch("/api/suscripcion/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preapproval_id: preapprovalId }),
        });
        const vData = await res.json();
        if (vData.active) setPerfil((p) => ({ ...p, plan: vData.plan, plan_status: "active" }));
        setSuccess(true);
      }
    }
    load();
  }, [preapprovalId]);

  const planActual    = perfil?.plan ?? "basic";
  const trialEnd      = perfil?.trial_end ? new Date(perfil.trial_end) : null;
  const diasRestantes = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000)) : 0;
  const enTrial       = perfil?.plan_status === "trial" && diasRestantes > 0;

  function handleSuccess() {
    setShowForm(false);
    setSuccess(true);
    setPerfil((p) => ({ ...p, plan: "pro", plan_status: "active" }));
  }

  return (
    <>
      <Script src="https://sdk.mercadopago.com/js/v2" onReady={() => setMpReady(true)} />

      <div className={styles.page}>

        {/* Banners — always full width */}
        {success && (
          <div className={styles.bannerSuccess}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>¡Suscripción al plan Pro activada con éxito!</span>
          </div>
        )}
        {enTrial && !success && (
          <div className={styles.bannerWarning}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span><strong>Período de prueba:</strong> te quedan <strong>{diasRestantes} días</strong>. Suscríbete al plan Pro para continuar sin interrupciones.</span>
          </div>
        )}
        {perfil?.plan_status === "active" && !success && (
          <div className={styles.bannerSuccess}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>Estás suscrito al plan <strong>{planActual}</strong>. Los cobros se procesan automáticamente cada mes por MercadoPago.</span>
          </div>
        )}
        {perfil?.plan_status === "payment_failed" && (
          <div className={styles.bannerError}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <span><strong>Pago fallido.</strong> MercadoPago reintentará automáticamente. Si el problema persiste, suscríbete de nuevo.</span>
          </div>
        )}

        {/* Header — only shown on plans view */}
        {!showForm && (
          <div className={styles.header}>
            <span className={styles.badge}>Suscripción</span>
            <h1 className={styles.title}>Elige tu plan</h1>
            <p className={styles.subtitle}>
              Empieza gratis. Suscríbete al Pro cuando tu equipo lo necesite.
            </p>
          </div>
        )}

        {/* Plan grid */}
        {!showForm && (
          <div className={styles.planGrid}>
            {PLANES.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                planActual={planActual}
                onSelect={() => setShowForm(true)}
              />
            ))}
          </div>
        )}

        {/* Checkout */}
        {showForm && (
          <CheckoutPanel
            perfil={perfil}
            mpReady={mpReady}
            onSuccess={handleSuccess}
            onCancel={() => setShowForm(false)}
          />
        )}

        {/* Legal */}
        <p className={styles.legal}>
          Los precios incluyen IVA (19%). Tienes derecho a retracto dentro de 10 días hábiles (Ley 19.496).
          <br />El cobro se procesa mensualmente a través de MercadoPago. Puedes cancelar en cualquier momento.
        </p>
      </div>
    </>
  );
}
