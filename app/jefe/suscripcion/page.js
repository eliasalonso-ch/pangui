"use client";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { createClient } from "@/lib/supabase";
import {
  CheckCircle2, Zap, Building2, Rocket,
  AlertTriangle, X, Lock, CreditCard,
} from "lucide-react";

// ── Plan definitions ────────────────────────────────────────────────────────
// MP hosted checkout URLs (from seed-planes, sandbox)
const MP_INIT_POINTS = {
  basic:   `https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${process.env.NEXT_PUBLIC_MP_PLAN_BASIC_ID}`,
  pro:     `https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${process.env.NEXT_PUBLIC_MP_PLAN_PRO_ID}`,
  empresa: `https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=${process.env.NEXT_PUBLIC_MP_PLAN_EMPRESA_ID}`,
};

const PLANES = [
  {
    id: "basic",
    nombre: "Basic",
    precio: 9990,
    icon: Rocket,
    descripcion: "Para equipos pequeños que están empezando",
    features: [
      "1 técnico",
      "Hasta 50 OT por mes",
      "Gestión de inventario",
      "Exportación PDF y Excel",
      "Soporte por correo",
    ],
  },
  {
    id: "pro",
    nombre: "Pro",
    precio: 19990,
    icon: Zap,
    descripcion: "Para pymes en crecimiento con equipo completo",
    features: [
      "Técnicos ilimitados",
      "OT ilimitadas",
      "Facturación electrónica (SimpleFactura)",
      "Firma digital del cliente",
      "Alertas de stock crítico",
      "Notificaciones push en tiempo real",
      "Soporte prioritario",
    ],
    popular: true,
  },
  {
    id: "empresa",
    nombre: "Empresa",
    precio: 39990,
    icon: Building2,
    descripcion: "Para empresas con múltiples plantas o equipos",
    features: [
      "Todo lo de Pro",
      "Múltiples plantas / sucursales",
      "Gestión multi-empresa",
      "Onboarding dedicado",
      "SLA garantizado 99%",
      "Soporte 24/7",
    ],
  },
];

// ── Inline styles helpers ───────────────────────────────────────────────────
// Used for MP iframe containers (cardNumber, expirationDate, securityCode)
const iframeField = {
  height: 40,
  border: "1px solid var(--divider-1)",
  borderRadius: 0,
  background: "var(--background)",
};

// Used for regular input fields (cardholderName, identificationNumber, email)
const inputField = {
  width: "100%",
  height: 40,
  border: "1px solid var(--divider-1)",
  borderRadius: 0,
  padding: "0 10px",
  fontSize: 14,
  fontFamily: "inherit",
  color: "var(--black)",
  background: "var(--background)",
  outline: "none",
  boxSizing: "border-box",
};

// ── PlanCard ────────────────────────────────────────────────────────────────
function PlanCard({ plan, planActual, onSelect }) {
  const Icon = plan.icon;
  const esActual = planActual === plan.id;

  return (
    <div style={{
      border: plan.popular ? "2px solid var(--accent-1)" : "1px solid var(--divider-1)",
      background: "var(--background)",
      padding: "28px 24px",
      display: "flex",
      flexDirection: "column",
      position: "relative",
    }}>
      {plan.popular && (
        <div style={{
          position: "absolute", top: -1, left: 24,
          background: "var(--accent-1)", color: "#fff",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
          textTransform: "uppercase", padding: "4px 10px",
        }}>
          Más popular
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, marginTop: plan.popular ? 12 : 0 }}>
        <div style={{
          width: 36, height: 36, background: "var(--accent-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--accent-1)", flexShrink: 0,
        }}>
          <Icon size={17} />
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-5)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
            {plan.nombre}
          </p>
          <p style={{ fontSize: 22, fontWeight: 900, color: "var(--black)", margin: 0, letterSpacing: "-0.02em" }}>
            ${plan.precio.toLocaleString("es-CL")}
            <span style={{ fontSize: 13, fontWeight: 400, color: "var(--accent-5)" }}> CLP/mes</span>
          </p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--accent-5)", marginBottom: 20, lineHeight: 1.5 }}>
        {plan.descripcion}
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "var(--black)" }}>
            <CheckCircle2 size={14} style={{ color: "#10b981", flexShrink: 0, marginTop: 2 }} />
            {f}
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto" }}>
        {esActual ? (
          <div style={{
            padding: 11, textAlign: "center", fontSize: 13, fontWeight: 700,
            color: "#10b981", border: "1.5px solid #10b981",
          }}>
            ✓ Plan actual
          </div>
        ) : (
          <a
            href={MP_INIT_POINTS[plan.id]}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", width: "100%", padding: 12,
              background: plan.popular ? "var(--accent-1)" : "transparent",
              color: plan.popular ? "#fff" : "var(--accent-1)",
              border: "1.5px solid var(--accent-1)",
              borderRadius: 0, fontSize: 14, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
              textAlign: "center", textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            Suscribirme
          </a>
        )}
      </div>
    </div>
  );
}

// ── Card form modal ─────────────────────────────────────────────────────────
function CardModal({ plan, perfil, mpReady, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const cardFormRef = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mpReady || !plan || mounted.current) return;
    mounted.current = true;

    // Small delay to ensure modal DOM is painted
    const t = setTimeout(() => {
      const mp = new window.MercadoPago(
        process.env.NEXT_PUBLIC_MP_PUBLIC_KEY,
        { locale: "es-CL" }
      );

      cardFormRef.current = mp.cardForm({
        amount: plan.precio.toString(),
        iframe: true,
        form: {
          id: "mp-form-checkout",
          // These 3 get iframes injected into divs:
          cardNumber:           { id: "mp-cardNumber",     placeholder: "Número de tarjeta" },
          expirationDate:       { id: "mp-expirationDate", placeholder: "MM/YY" },
          securityCode:         { id: "mp-securityCode",   placeholder: "CVV" },
          // These must be real <input> / <select> elements:
          cardholderName:       { id: "mp-cardholderName" },
          issuer:               { id: "mp-issuer" },
          installments:         { id: "mp-installments" },
          identificationType:   { id: "mp-identificationType" },
          identificationNumber: { id: "mp-identificationNumber" },
          cardholderEmail:      { id: "mp-cardholderEmail" },
        },
        callbacks: {
          onFormMounted: (err) => {
            if (err) console.error("[MP] mount error:", err);
          },
          onError: (errors) => {
            console.error("[MP] validation errors:", JSON.stringify(errors, null, 2));
          },
          onSubmit: async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);

            try {
              const formData = cardFormRef.current.getCardFormData();
              console.log("[MP] formData:", JSON.stringify(formData, null, 2));
              const { token, email } = formData;

              if (!token) {
                setError("No se pudo tokenizar la tarjeta. Verifica los datos.");
                setSubmitting(false);
                return;
              }

              const res = await fetch("/api/suscripcion/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  plan: plan.id,
                  payer_email: email || perfil.email,
                  card_token_id: token,
                  user_id: perfil.id,
                }),
              });

              const data = await res.json();

              if (data.ok) {
                onSuccess(plan);
              } else {
                setError(data.error ?? "Error al procesar la suscripción.");
                setSubmitting(false);
              }
            } catch {
              setError("Error de red. Intenta de nuevo.");
              setSubmitting(false);
            }
          },
          onFetching: (resource) => {
            // MP is fetching card info (installments, issuer, etc.)
          },
        },
      });
    }, 150);

    return () => {
      clearTimeout(t);
      try { cardFormRef.current?.unmount?.(); } catch {}
      mounted.current = false;
    };
  }, [mpReady, plan]);

  if (!plan) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16,
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--background)",
        width: "100%", maxWidth: 480,
        maxHeight: "90vh", overflowY: "auto",
        padding: "28px 24px",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <span style={{
              display: "inline-block", fontSize: 11, fontWeight: 700,
              color: "var(--accent-1)", textTransform: "uppercase",
              letterSpacing: "0.1em", borderLeft: "3px solid var(--accent-1)", paddingLeft: 8,
              marginBottom: 6,
            }}>
              Datos de pago
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: "var(--black)", margin: 0 }}>
              Plan {plan.nombre} · ${plan.precio.toLocaleString("es-CL")} CLP/mes
            </h2>
            <p style={{ fontSize: 12, color: "var(--accent-5)", marginTop: 4 }}>
              El primer mes es gratuito. Se cobra desde el 2° mes.
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--accent-5)", padding: 4, marginLeft: 12, flexShrink: 0,
          }}>
            <X size={18} />
          </button>
        </div>

        {/* MP Card Form */}
        <form id="mp-form-checkout" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Número de tarjeta</label>
            <div id="mp-cardNumber" style={iframeField} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Vencimiento</label>
              <div id="mp-expirationDate" style={iframeField} />
            </div>
            <div>
              <label style={labelStyle}>CVV</label>
              <div id="mp-securityCode" style={iframeField} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Nombre del titular</label>
            <input id="mp-cardholderName" type="text" placeholder="Como aparece en la tarjeta" style={inputField} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipo doc.</label>
              <select id="mp-identificationType" style={{ ...inputField, cursor: "pointer" }} />
            </div>
            <div>
              <label style={labelStyle}>Número doc.</label>
              <input id="mp-identificationNumber" type="text" placeholder="12345678" style={inputField} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Email del pagador</label>
            <input id="mp-cardholderEmail" type="email" placeholder="correo@ejemplo.cl" style={inputField} />
          </div>

          {/* Hidden fields required by MP */}
          <select id="mp-issuer" style={{ display: "none" }} />
          <select id="mp-installments" style={{ display: "none" }} />

          {error && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 12px", background: "#fef2f2",
              borderLeft: "3px solid #ef4444",
              fontSize: 13, color: "#991b1b",
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          <button
            type="submit"
            id="mp-form-checkout__submit"
            disabled={submitting}
            style={{
              padding: "13px 20px",
              background: submitting ? "var(--accent-5)" : "var(--accent-1)",
              color: "#fff", border: "none", borderRadius: 0,
              fontSize: 14, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer",
              fontFamily: "inherit", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8, marginTop: 4,
              opacity: submitting ? 0.7 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <Lock size={14} />
            {submitting ? "Procesando…" : "Confirmar suscripción"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 14 }}>
          <Lock size={11} style={{ color: "var(--accent-5)" }} />
          <span style={{ fontSize: 11, color: "var(--accent-5)" }}>
            Pago seguro procesado por MercadoPago · Cancela cuando quieras
          </span>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 700,
  color: "var(--accent-5)", textTransform: "uppercase",
  letterSpacing: "0.08em", marginBottom: 5,
};

// ── Main page ───────────────────────────────────────────────────────────────
export default function SuscripcionPage() {
  const [perfil, setPerfil] = useState(null);
  const [mpReady, setMpReady] = useState(false);
  const [planSeleccionado, setPlanSeleccionado] = useState(null);
  const [success, setSuccess] = useState(null); // plan object after success

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
    }
    load();
  }, []);

  const planActual = perfil?.plan ?? "gratis";
  const trialEnd = perfil?.trial_end ? new Date(perfil.trial_end) : null;
  const diasRestantes = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000)) : 0;
  const enTrial = perfil?.plan_status === "trial" && diasRestantes > 0;

  function handleSuccess(plan) {
    setSuccess(plan);
    setPlanSeleccionado(null);
    // Refresh perfil
    if (perfil) setPerfil((p) => ({ ...p, plan: plan.id, plan_status: "active" }));
  }

  return (
    <>
      {/* Load MercadoPago JS SDK */}
      <Script
        src="https://sdk.mercadopago.com/js/v2"
        onReady={() => setMpReady(true)}
      />

      <div style={{
        maxWidth: 960, margin: "0 auto",
        padding: "2rem max(16px, 2rem)",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
      }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700,
            color: "var(--accent-1)", textTransform: "uppercase",
            letterSpacing: "0.12em", borderLeft: "3px solid var(--accent-1)",
            paddingLeft: 8, marginBottom: 14,
          }}>
            Suscripción
          </span>
          <h1 style={{
            fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 900,
            color: "var(--black)", letterSpacing: "-0.025em", marginBottom: 8,
          }}>
            Elige tu plan
          </h1>
          <p style={{ fontSize: 15, color: "var(--accent-5)" }}>
            Todos los planes incluyen 1 mes gratis. Sin cobros hasta el 2° mes.
          </p>
        </div>

        {/* Success banner */}
        {success && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "14px 16px", background: "#f0fdf4",
            borderLeft: "3px solid #10b981", marginBottom: 32,
            fontSize: 14, color: "#166534",
          }}>
            <CheckCircle2 size={16} />
            <span>
              ¡Suscripción al plan <strong>{success.nombre}</strong> activada con éxito.
              Tu primer mes es gratuito, el cobro comienza el mes siguiente.
            </span>
          </div>
        )}

        {/* Trial warning */}
        {enTrial && !success && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", background: "var(--accent-2)",
            borderLeft: "3px solid var(--accent-1)", marginBottom: 32,
            fontSize: 14, color: "var(--accent-1)",
          }}>
            <AlertTriangle size={16} />
            <span>
              <strong>Período de prueba:</strong> te quedan <strong>{diasRestantes} días</strong>.
              Suscríbete para no perder el acceso.
            </span>
          </div>
        )}

        {/* Active plan */}
        {perfil?.plan_status === "active" && !success && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", background: "#f0fdf4",
            borderLeft: "3px solid #10b981", marginBottom: 32,
            fontSize: 14, color: "#166534",
          }}>
            <CheckCircle2 size={16} />
            <span>Estás suscrito al plan <strong>{planActual}</strong>. Los cobros se procesan automáticamente cada mes por MercadoPago.</span>
          </div>
        )}

        {/* Payment failed */}
        {perfil?.plan_status === "payment_failed" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", background: "#fff7ed",
            borderLeft: "3px solid #f97316", marginBottom: 32,
            fontSize: 14, color: "#9a3412",
          }}>
            <AlertTriangle size={16} />
            <span><strong>Pago fallido.</strong> MercadoPago reintentará automáticamente. Si el problema persiste, actualiza tu método de pago.</span>
          </div>
        )}

        {/* Plan grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 1, background: "var(--divider-1)",
          border: "1px solid var(--divider-1)",
        }}>
          {PLANES.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              planActual={planActual}
              onSelect={setPlanSeleccionado}
            />
          ))}
        </div>

        {/* Legal footer */}
        <p style={{
          marginTop: 28, fontSize: 12, color: "var(--accent-5)", lineHeight: 1.65,
          borderTop: "1px solid var(--divider-1)", paddingTop: 20,
        }}>
          Los precios incluyen IVA (19%). Tienes derecho a retracto dentro de 10 días hábiles (Ley 19.496).
          El cobro se procesa mensualmente a través de MercadoPago. Puedes cancelar en cualquier momento.
        </p>
      </div>

      {/* Card payment modal */}
      {planSeleccionado && perfil && (
        <CardModal
          plan={planSeleccionado}
          perfil={perfil}
          mpReady={mpReady}
          onClose={() => setPlanSeleccionado(null)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
