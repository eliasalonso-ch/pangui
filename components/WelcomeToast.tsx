"use client";

/**
 * Floating celebration toast shown on /inicio for two scenarios:
 *
 *   ?welcome=trial    — right after the public /registro signup completes.
 *                       "¡Bienvenido a Pangui! 14 días de Pro gratis…"
 *   ?welcome=<plan>   — after a successful Flow checkout (basic/esencial/pro).
 *                       "¡Bienvenido a Esencial! Tu suscripción está activa…"
 *
 * Reads the param on mount, shows the toast, strips the query so a refresh
 * doesn't retrigger it (via history.replaceState to avoid the router-loop bug).
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { PLANS, type PlanKey } from "@/lib/flow-plans";
import { analytics } from "@/lib/analytics";

const AUTO_DISMISS_MS = 6500;

type Variant =
  | { kind: "trial" }
  | { kind: "plan"; planKey: PlanKey };

export function WelcomeToast() {
  const search = useSearchParams();
  const raw = search.get("welcome");
  const variant: Variant | null =
    raw === "trial"
      ? { kind: "trial" }
      : (() => {
          const plan = PLANS.find(p => p.key === raw);
          return plan ? { kind: "plan", planKey: plan.key } : null;
        })();
  if (!variant) return null;
  return <WelcomeToastInner variant={variant} />;
}

function WelcomeToastInner({ variant }: { variant: Variant }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Fire the conversion event once, before we strip the query param.
    if (variant.kind === "trial") {
      analytics.trialStarted();
    } else {
      analytics.subscriptionActivated({ plan_key: variant.planKey });
    }

    if (typeof window !== "undefined" && window.location.search.includes("welcome=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("welcome");
      window.history.replaceState({}, "", url.toString());
    }
    const t = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const title = variant.kind === "trial"
    ? "¡Bienvenido a Pangui!"
    : `¡Bienvenido a ${PLANS.find(p => p.key === variant.planKey)!.name}!`;
  const body = variant.kind === "trial"
    ? "Tienes 14 días de Pro gratis para explorar todas las funciones. Invita a tu equipo cuando quieras."
    : "Tu suscripción está activa. Empieza a disfrutar de todas las funciones desbloqueadas.";

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 1000,
        maxWidth: 380,
        background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-active) 100%)",
        color: "#fff",
        borderRadius: 12,
        padding: "14px 16px 14px 14px",
        boxShadow: "0 12px 36px rgba(15,23,42,0.22), 0 2px 6px rgba(15,23,42,0.10)",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        animation: "welcomeToastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: "rgba(255,255,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <Sparkles size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>
          {title}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.85)", lineHeight: 1.45 }}>
          {body}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar"
        style={{
          background: "none", border: "none",
          color: "rgba(255,255,255,0.7)", cursor: "pointer",
          padding: 4, display: "flex", flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
      <style>{`
        @keyframes welcomeToastSlideIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
