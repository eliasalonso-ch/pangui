import "../../landing.css";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LandingFooter, LandingNav } from "../../Landing";
import PublicPageTheme from "@/components/PublicPageTheme";
import { getCaso } from "../casos";

const caso = getCaso("electrilam");

export const metadata = {
  title: "Caso Electrilam: de papel y Excel a 603 OTs trazables · Pangui",
  description:
    "Ingeniería y Construcción Electrilam SpA ejecuta el mantenimiento eléctrico de la Universidad de Concepción. Con Pangui gestionó 603 órdenes de trabajo y 2.824 fotos de evidencia en cuatro meses.",
  alternates: { canonical: "/casos-de-exito/electrilam" },
  openGraph: {
    title: "Caso Electrilam: de papel y Excel a 603 OTs trazables | Pangui",
    description:
      "Cómo un contratista de mantenimiento eléctrico reemplazó el papel y las planillas Excel por órdenes de trabajo trazables en un campus universitario completo.",
    url: "/casos-de-exito/electrilam",
    type: "article",
  },
};

const CAMBIOS = [
  {
    titulo: "El trabajo dejó de perderse",
    cuerpo:
      "Cada solicitud entra como OT con responsable y ubicación. Nada depende de un papel que se traspapela ni de una fila en una planilla que nadie actualizó.",
  },
  {
    titulo: "Las emergencias quedan documentadas",
    cuerpo:
      "Un corte eléctrico se registra el mismo día, con su evidencia y su cierre, en vez de reconstruirse semanas después de memoria.",
  },
  {
    titulo: "Presupuestar sobre datos, no memoria",
    cuerpo:
      "El historial por ubicación muestra qué se hizo y cuántas veces, lo que permite cotizar y planificar con información verificable.",
  },
  {
    titulo: "Respaldo inmediato ante el cliente",
    cuerpo:
      "2.824 fotos asociadas a sus OTs permiten demostrar el trabajo ejecutado sin depender de conversaciones de WhatsApp.",
  },
];

export default function CasoElectrilamPage() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <PublicPageTheme />
      <LandingNav />

      <main className="pt-16 md:pt-[68px]">
        <article>
          <header className="border-b border-[var(--hairline)] bg-[#F6F8FB]">
            <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
              <Link
                href="/casos-de-exito"
                className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
              >
                <ArrowLeft size={16} />
                Casos de éxito
              </Link>

              <div className="mt-8 grid gap-10 lg:grid-cols-12 lg:items-end">
                <div className="lg:col-span-7">
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                    {caso.industria} · {caso.periodo}
                  </p>
                  <h1 className="mt-5 max-w-[880px] font-display text-[38px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[60px]">
                    De papel y Excel a 603 órdenes de trabajo trazables.
                  </h1>
                </div>
                <div className="lg:col-span-5">
                  <dl className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                        Empresa
                      </dt>
                      <dd className="mt-2 text-[15px] font-semibold leading-[1.4]">
                        {caso.razonSocial}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                        Cliente atendido
                      </dt>
                      <dd className="mt-2 text-[15px] font-semibold leading-[1.4]">
                        {caso.cliente}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </header>

          <section className="bg-white">
            <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
              <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-2 lg:grid-cols-4">
                {caso.metricas.map((metrica) => (
                  <div key={metrica.label} className="bg-white p-6 md:p-9">
                    <p className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] text-[var(--accent)] md:text-[54px]">
                      {metrica.valor}
                    </p>
                    <p className="mt-4 text-[15px] leading-[1.5] text-[var(--ink-2)]">
                      {metrica.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="border-t border-[var(--hairline)] bg-white">
            <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
              <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
                <div className="lg:col-span-4">
                  <h2 className="font-display text-[30px] font-bold leading-[1.08] tracking-[-0.03em] text-balance md:text-[42px]">
                    El punto de partida
                  </h2>
                </div>
                <div className="lg:col-span-8">
                  <p className="text-[17px] leading-[1.7] text-[var(--ink-2)] md:text-[19px]">
                    Ingeniería y Construcción Electrilam SpA ejecuta el
                    mantenimiento eléctrico de la Universidad de Concepción:
                    tableros, alumbrado interior y exterior, canalizaciones,
                    circuitos y emergencias distribuidas por todo el campus.
                  </p>
                  <p className="mt-6 text-[16px] leading-[1.7] text-[var(--ink-2)] md:text-[17px]">
                    Antes de Pangui, cada trabajo se registraba en papel y
                    planillas Excel. Con decenas de solicitudes entrando por
                    semana desde distintas facultades, el registro no alcanzaba a
                    seguirle el ritmo a la operación: era difícil saber con
                    certeza qué se había completado, qué seguía pendiente y qué
                    respaldo existía de lo ya ejecutado.
                  </p>
                  <p className="mt-6 text-[16px] leading-[1.7] text-[var(--ink-2)] md:text-[17px]">
                    Esa falta de control tenía un costo concreto. Sin un registro
                    confiable de lo realizado, presupuestar y cerrar proyectos se
                    apoyaba en la memoria del equipo — y esa diferencia entre lo
                    ejecutado y lo documentado se traducía en pérdidas.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-[var(--hairline)] bg-[#F6F8FB]">
            <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
              <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
                <div className="lg:col-span-4">
                  <h2 className="font-display text-[30px] font-bold leading-[1.08] tracking-[-0.03em] text-balance md:text-[42px]">
                    Cómo trabajan hoy
                  </h2>
                </div>
                <div className="lg:col-span-8">
                  <p className="text-[17px] leading-[1.7] text-[var(--ink-2)] md:text-[19px]">
                    Hoy su equipo de 14 personas trabaja sobre Pangui todos los
                    días. Las solicitudes entran como órdenes de trabajo con
                    ubicación exacta dentro del campus —160 ubicaciones
                    registradas, desde laboratorios y casinos hasta sectores de
                    alumbrado exterior— y con un responsable asignado.
                  </p>
                  <p className="mt-6 text-[16px] leading-[1.7] text-[var(--ink-2)] md:text-[17px]">
                    En terreno, los técnicos ejecutan desde la app móvil: revisan
                    qué les toca, adjuntan fotos del antes y el después, y cierran
                    la OT con su evidencia. Las emergencias —un corte de energía,
                    un tablero con filtración de agua— se levantan y documentan el
                    mismo día, no semanas después.
                  </p>
                  <p className="mt-6 text-[16px] leading-[1.7] text-[var(--ink-2)] md:text-[17px]">
                    En cuatro meses acumularon 603 órdenes de trabajo y 2.824
                    fotos de evidencia. De las OTs creadas entre abril y julio,
                    el 96% quedó cerrada en la plataforma.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-[var(--hairline)] bg-white">
            <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
              <h2 className="max-w-[820px] font-display text-[30px] font-bold leading-[1.08] tracking-[-0.03em] text-balance md:text-[46px]">
                Qué cambió en la operación
              </h2>
              <div className="mt-10 grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-2">
                {CAMBIOS.map((cambio) => (
                  <article key={cambio.titulo} className="bg-white p-6 md:p-9">
                    <h3 className="font-display text-[21px] font-semibold leading-[1.2] tracking-[-0.02em] md:text-[23px]">
                      {cambio.titulo}
                    </h3>
                    <p className="mt-4 text-[15px] leading-[1.65] text-[var(--ink-2)]">
                      {cambio.cuerpo}
                    </p>
                  </article>
                ))}
              </div>
              <p className="mt-6 text-[13px] leading-[1.55] text-[var(--ink-3)]">
                Cifras tomadas de la operación de Electrilam en Pangui entre el
                16 de abril y el 8 de agosto de 2026.
              </p>
            </div>
          </section>
        </article>

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
