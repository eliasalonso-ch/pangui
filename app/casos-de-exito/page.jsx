import "../landing.css";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { LandingFooter, LandingNav } from "../Landing";
import PublicPageTheme from "@/components/PublicPageTheme";
import { CASOS } from "./casos";

export const metadata = {
  title: "Casos de éxito · Pangui",
  description:
    "Empresas de mantención en Chile que reemplazaron el papel y las planillas Excel por órdenes de trabajo trazables con Pangui. Casos reales, cifras reales.",
  alternates: { canonical: "/casos-de-exito" },
  openGraph: {
    title: "Casos de éxito | Pangui",
    description:
      "Empresas de mantención en Chile que reemplazaron el papel y las planillas Excel por órdenes de trabajo trazables con Pangui.",
    url: "/casos-de-exito",
  },
};

export default function CasosDeExitoPage() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <PublicPageTheme />
      <LandingNav />

      <main className="pt-16 md:pt-[68px]">
        <section className="border-b border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 lg:items-end xl:px-12">
            <div className="lg:col-span-7">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Casos de éxito
              </p>
              <h1 className="mt-5 max-w-[880px] font-display text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[64px]">
                Operaciones reales de mantención, con cifras reales.
              </h1>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[560px] text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[18px]">
                Empresas chilenas que dejaron el papel y las planillas Excel para
                controlar su trabajo en terreno. Cada cifra que publicamos sale
                de la operación real del cliente en Pangui.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {CASOS.map((caso) => (
                <CasoCard key={caso.slug} caso={caso} />
              ))}
              <ProximamenteCard />
            </div>
          </div>
        </section>

        <section className="bg-[var(--accent)] text-white">
          <div className="mx-auto max-w-[1080px] px-4 py-14 text-center md:py-20">
            <h2 className="font-display text-[32px] font-bold tracking-[-0.03em] md:text-[46px]">
              ¿Su operación todavía vive en Excel?
            </h2>
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-[1.65] text-white/82 md:text-[17px]">
              Pruebe Pangui gratis por 30 días con todo su equipo y vea sus
              órdenes de trabajo con respaldo desde el primer día.
            </p>
            <Link
              href="/registro"
              className="mt-8 inline-flex h-12 items-center justify-center gap-3 bg-white px-7 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 md:h-14 md:px-9"
            >
              Prueba gratis 30 días
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

function CasoCard({ caso }) {
  return (
    <Link
      href={`/casos-de-exito/${caso.slug}`}
      className="group relative flex min-h-[420px] flex-col justify-between overflow-hidden rounded-[16px] bg-[var(--accent)] p-7 text-white md:p-8"
    >
      {/* Subtle depth so the card reads as a tile, not a flat block. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.28) 100%)",
        }}
      />
      <div className="relative">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/70">
          {caso.industria}
        </p>
        <p className="mt-7 font-display text-[52px] font-bold leading-[0.95] tracking-[-0.04em] md:text-[60px]">
          {caso.metrica}
        </p>
        <p className="mt-3 max-w-[240px] text-[15px] font-semibold leading-[1.35]">
          {caso.metricaLabel}
        </p>
        <p className="mt-5 max-w-[280px] text-[14px] leading-[1.55] text-white/75">
          {caso.resumen}
        </p>
      </div>
      <div className="relative mt-8 flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-[26px] font-bold tracking-[-0.02em]">
            {caso.empresa}
          </p>
          <p className="mt-1 text-[13px] text-white/70">{caso.cliente}</p>
        </div>
        <ArrowUpRight
          size={26}
          className="shrink-0 transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function ProximamenteCard() {
  return (
    <div className="flex min-h-[420px] flex-col justify-between rounded-[16px] border border-[var(--hairline-strong)] p-7 md:p-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Próximamente
        </p>
        <p className="mt-7 max-w-[260px] font-display text-[26px] font-semibold leading-[1.2] tracking-[-0.02em]">
          Estamos documentando nuevos casos.
        </p>
        <p className="mt-4 max-w-[280px] text-[14px] leading-[1.6] text-[var(--ink-2)]">
          Publicamos un caso solo cuando el cliente lleva meses operando en
          Pangui y las cifras se sostienen solas.
        </p>
      </div>
      <a
        href="mailto:contacto@getpangui.com?subject=Quiero%20contar%20mi%20caso"
        className="mt-8 inline-flex items-center gap-3 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
      >
        ¿Quiere contar el suyo?
        <ArrowRight size={17} />
      </a>
    </div>
  );
}
