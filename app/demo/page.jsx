import "../landing.css";
import { Check } from "lucide-react";
import { LandingFooter, LandingNav } from "../Landing";
import PublicPageTheme from "@/components/PublicPageTheme";
import DemoForm from "./DemoForm";

export const metadata = {
  title: "Agendar demo",
  description:
    "Agende una demo guiada de Pangui, el software de órdenes de trabajo y mantenimiento (CMMS) para contratistas en Chile. Le mostramos la plataforma con casos reales de mantención.",
  alternates: { canonical: "/demo" },
  openGraph: {
    title: "Agendar demo | Pangui",
    description:
      "Una demo guiada de Pangui con casos reales de mantención, adaptada a cómo trabaja su empresa.",
    url: "/demo",
  },
};

const BENEFICIOS = [
  "Vea la plataforma con un caso real de mantención, no una presentación genérica.",
  "Resolvemos cómo se adaptaría a su operación: sus OTs, sus activos, sus procedimientos.",
  "Le mostramos qué toma migrar desde papel o planillas Excel.",
  "Sin compromiso: si prefiere probar por su cuenta, la prueba de 30 días queda disponible igual.",
];

export default function DemoPage() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <PublicPageTheme />
      <LandingNav />

      <main className="pt-16 md:pt-[68px]">
        <section className="bg-white">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 lg:gap-16 xl:px-12">
            {/* Pitch */}
            <div className="lg:col-span-6">
              <h1 className="font-display text-[40px] font-bold leading-[1.02] tracking-[-0.035em] text-balance md:text-[64px]">
                Agendar demo
              </h1>
              <p className="mt-6 max-w-[560px] text-[17px] leading-[1.6] text-[var(--ink-2)] md:text-[20px]">
                Una sesión guiada con nosotros para ver cómo Pangui ordena las
                órdenes de trabajo de su empresa de mantención.
              </p>

              <ul className="mt-10 flex flex-col border-t border-[var(--hairline)] md:mt-12">
                {BENEFICIOS.map((beneficio) => (
                  <li
                    key={beneficio}
                    className="flex items-start gap-4 border-b border-[var(--hairline)] py-5"
                  >
                    <Check size={18} strokeWidth={2.6} className="mt-[3px] shrink-0 text-[var(--accent)]" />
                    <span className="text-[15px] leading-[1.6] text-[var(--ink-2)] md:text-[16px]">
                      {beneficio}
                    </span>
                  </li>
                ))}
              </ul>

            </div>

            {/* Form */}
            <div className="lg:col-span-6">
              <DemoForm />
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
