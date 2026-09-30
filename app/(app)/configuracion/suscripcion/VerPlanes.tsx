"use client";

import "@/app/landing.css";
import { useEffect, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, CreditCard } from "lucide-react";
import { UI_VISIBLE_PLANS, type PlanDef } from "@/lib/flow-plans";
import { PricingCard, ComparisonTable } from "@/components/landing/PlanesPrecios";

export interface AccionPlan {
  label: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  nota?: string;
}

/**
 * Los planes con el mismo diseño de /precios, a pantalla completa sobre
 * Suscripción. Es un overlay y no una ruta propia para reusar los handlers de
 * cobro de la página (checkout, confirmación de cambio, datos de facturación).
 * Siempre claro, como la página pública: .landing-root trae su propia paleta.
 */
export function VerPlanes({ accion, onClose, faltanDatos, enPrueba, porContrato = false, pausado }: {
  accion: (plan: PlanDef) => AccionPlan | undefined;
  onClose: () => void;
  faltanDatos: boolean;
  enPrueba: boolean;
  /** Cliente Empresa: no pasa por Flow, los cambios se coordinan por correo. */
  porContrato?: boolean;
  /** Hay otro diálogo encima (confirmar cambio): Escape es de ese. */
  pausado: boolean;
}) {
  useEffect(() => {
    function alEscape(e: KeyboardEvent) { if (e.key === "Escape" && !pausado) onClose(); }
    document.addEventListener("keydown", alEscape);
    return () => document.removeEventListener("keydown", alEscape);
  }, [onClose, pausado]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Planes"
      // Los rótulos de /precios van en mayúsculas; dentro de la app se leen en
      // formato oración, como el resto de la interfaz.
      className="landing-root antialiased [&_.uppercase]:normal-case [&_.uppercase]:tracking-normal"
      style={{ position: "fixed", inset: 0, zIndex: 900, overflowY: "auto", background: "#fff" }}
    >
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-[var(--hairline)] bg-white px-4 md:px-10">
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--ink-2)] transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft size={16} /> Volver a Suscripción
        </button>
      </header>

      <section className="bg-white">
        <div className="mx-auto max-w-[1440px] px-4 pb-14 pt-10 sm:px-5 md:px-10 md:pb-20 md:pt-14 xl:px-12">
          <h1 className="text-center font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] text-balance md:text-[48px]">
            Elige el plan para tu equipo.
          </h1>

          {faltanDatos && (
            <div className="mx-auto mt-8 flex max-w-[760px] items-start gap-3 border border-[var(--hairline-strong)] bg-[#F6F8FB] p-4">
              <AlertCircle size={17} className="mt-0.5 shrink-0 text-[var(--accent)]" />
              <p className="text-[14px] leading-[1.55] text-[var(--ink-2)]">
                Completa el <strong>email de cobros</strong> y los <strong>datos de facturación</strong> para poder elegir un plan.{" "}
                <button type="button" onClick={onClose} className="font-semibold text-[var(--accent)] underline underline-offset-2">
                  Completar datos
                </button>
              </p>
            </div>
          )}

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
            {UI_VISIBLE_PLANS.map((plan, i) => (
              <PricingCard
                key={plan.key}
                plan={plan}
                previous={UI_VISIBLE_PLANS[i - 1]}
                featured={plan.key === "pro"}
                accion={accion}
              />
            ))}
          </div>
          <p className="mt-6 flex items-start gap-2 text-[13px] leading-[1.55] text-[var(--ink-3)]">
            <CreditCard size={14} className="mt-0.5 shrink-0" />
            <span>
              Precios mensuales en pesos chilenos, sin IVA (19%).{" "}
              {porContrato
                ? "Tu plan Empresa es un contrato: para cambiarte a otro plan, escríbenos y coordinamos el cambio contigo."
                : "Al elegir un plan te llevamos a Flow.cl para inscribir tu tarjeta: el primer cobro se hace al inscribirla y los siguientes se cargan automáticamente cada mes."}
              {enPrueba ? " Al contratar termina la prueba gratis y el plan elegido se cobra de inmediato." : ""}
            </span>
          </p>
        </div>
      </section>

      <ComparisonTable plans={UI_VISIBLE_PLANS} accion={accion} stickyTop="lg:top-14" />
    </div>
  );
}
