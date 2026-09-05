import "./landing.css";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingFooter, LandingNav } from "./Landing";
import PublicPageTheme from "@/components/PublicPageTheme";

export const metadata = {
  title: "Página no encontrada · Pangui",
  description: "La página que buscas no existe o fue movida.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <PublicPageTheme />
      <LandingNav />

      <main className="pt-16 md:pt-[68px]">
        <section className="border-b border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-5 md:px-10 md:py-28 xl:px-12">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
              Error 404
            </p>
            <h1 className="mt-3 max-w-[18ch] text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-[var(--ink)] md:text-[52px]">
              Esta página no existe
            </h1>
            <p className="mt-4 max-w-[52ch] text-[16px] leading-[1.6] text-[var(--muted)] md:text-[18px]">
              Puede que el enlace esté roto o que la página haya cambiado de
              dirección. Desde aquí puedes volver al inicio o ir directo a tu
              cuenta.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* Mismos botones que la barra de marketing (ver LandingNav):
                  primario azul --accent, secundario con borde --accent, ambos
                  h-10 y sin redondeo. Antes eran negros (--ink) y con
                  rounded-[12px], que no se parecia a nada mas del sitio. */}
              <Link
                href="/"
                className="inline-flex h-10 items-center gap-2 bg-[var(--accent)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                Volver al inicio
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/precios"
                className="inline-flex h-10 items-center gap-2 border border-[var(--accent)] px-5 text-[14px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
              >
                Ver precios
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center gap-2 px-1 text-[14px] font-semibold text-[var(--muted)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:underline"
              >
                Iniciar sesión
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
