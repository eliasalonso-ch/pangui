import { REGISTRO_URL } from "@/lib/app-urls";
import "../landing.css";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingFooter, LandingNav } from "../Landing";
import PublicPageTheme from "@/components/PublicPageTheme";
import { PricingCard, ComparisonTable } from "@/components/landing/PlanesPrecios";
import { UI_VISIBLE_PLANS, TRIAL_DAYS } from "@/lib/flow-plans";

const PRECIOS_DESCRIPTION =
  "Planes por equipo, con usuarios incluidos, para contratistas de mantención. Pruebe Pro gratis por 30 días.";

export const metadata = {
  title: "Precios",
  description: PRECIOS_DESCRIPTION,
  alternates: { canonical: "/precios" },
  openGraph: {
    title: "Precios · Pangui",
    description: PRECIOS_DESCRIPTION,
    url: "/precios",
    type: "website",
  },
};

export default function PreciosPage() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <PublicPageTheme />
      <LandingNav />

      <main className="pt-16 md:pt-[68px]">
        <section className="border-b border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 lg:items-end xl:px-12">
            <div className="lg:col-span-7">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Precios
              </p>
              <h1 className="mt-5 max-w-[880px] font-display text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[64px]">
                Precio por equipo, no por persona.
              </h1>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[560px] text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[18px]">
                Cada plan incluye usuarios y un precio fijo por el equipo.
                Todos parten con {TRIAL_DAYS} días de Pro gratis, sin tarjeta.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
              {UI_VISIBLE_PLANS.map((plan, i) => (
                <PricingCard
                  key={plan.key}
                  plan={plan}
                  previous={UI_VISIBLE_PLANS[i - 1]}
                  featured={plan.key === "pro"}
                />
              ))}
            </div>
            <p className="mt-6 text-[13px] leading-[1.55] text-[var(--ink-3)]">
              Precios mensuales en pesos chilenos, sin IVA (19%), que se agrega al momento del cobro. Sin compromiso anual; puede cancelar cuando quiera.
            </p>
          </div>
        </section>

        <ComparisonTable plans={UI_VISIBLE_PLANS} />

        <section className="border-t border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 xl:px-12">
            <div className="lg:col-span-5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Qué pasa después de la prueba
              </p>
              <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] md:text-[48px]">
                La prueba abre Pro. Basic vuelve a límites claros.
              </h2>
            </div>
            <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] lg:col-span-7">
              {[
                ["Durante la prueba", `Todas las funciones de Pro quedan disponibles por ${TRIAL_DAYS} días.`],
                ["Si no eliges plan", "El workspace pasa a Basic y se bloquean preventivos, exportaciones, analítica avanzada, exportes programados e IA."],
                ["Al subir de plan", "Paga la base del plan. Si su equipo supera los usuarios incluidos, cada usuario adicional se suma al cobro mensual."],
              ].map(([title, body]) => (
                <article key={title} className="bg-white p-6 md:p-8">
                  <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em]">{title}</h3>
                  <p className="mt-3 text-[15px] leading-[1.65] text-[var(--ink-2)]">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--accent)] text-white">
          <div className="mx-auto max-w-[1080px] px-4 py-14 text-center md:py-20">
            <h2 className="font-display text-[32px] font-bold tracking-[-0.03em] md:text-[46px]">
              Pruebe Pangui con todo Pro desbloqueado
            </h2>
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-[1.65] text-white/82 md:text-[17px]">
              Sin tarjeta, sin instalación y con el camino claro para decidir qué plan necesita su equipo.
            </p>
            <Link
              href={REGISTRO_URL}
              className="mt-8 inline-flex h-12 items-center justify-center gap-3 bg-white px-7 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 md:h-14 md:px-9"
            >
              Crear mi cuenta
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
