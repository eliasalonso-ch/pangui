import "../landing.css";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Droplets,
  Factory,
  GraduationCap,
  Snowflake,
  Zap,
} from "lucide-react";
import { LandingFooter, LandingNav } from "../Landing";
import PublicPageTheme from "@/components/PublicPageTheme";

export const metadata = {
  title: "Industrias",
  description:
    "Software de órdenes de trabajo para contratistas de mantención eléctrica, climatización, sanitaria, industrial, campus e inmobiliaria en Chile. Un mismo flujo de OT para cada rubro.",
  alternates: { canonical: "/industrias" },
  openGraph: {
    title: "Industrias que atendemos | Pangui",
    description:
      "Software de órdenes de trabajo para contratistas de mantención en Chile: eléctrica, climatización, sanitaria, industrial, campus e inmobiliaria.",
    url: "/industrias",
  },
};

// Each vertical is described through the same OT lifecycle Electrilam runs
// today: solicitud → OT con ubicación → ejecución con evidencia → respaldo.
const INDUSTRIAS = [
  {
    slug: "electrica",
    icon: Zap,
    nombre: "Mantención eléctrica",
    resumen:
      "Tableros, alumbrado, canalizaciones, empalmes y cortes programados repartidos en decenas de edificios.",
    trabajos: [
      "Reparación y cambio de tableros",
      "Revisión de alumbrado por sector",
      "Emergencias por corte de energía",
      "Instalación de nuevos circuitos",
    ],
    valor:
      "Es el rubro donde Pangui se probó primero: 603 OTs en cuatro meses sobre un campus universitario completo.",
    probado: true,
  },
  {
    slug: "climatizacion",
    icon: Snowflake,
    nombre: "Climatización y HVAC",
    resumen:
      "Equipos distribuidos en muchas salas, con rutinas periódicas que deben demostrarse ante el mandante.",
    trabajos: [
      "Mantención preventiva por equipo",
      "Limpieza y cambio de filtros",
      "Fallas de temperatura reportadas",
      "Puestas en marcha estacionales",
    ],
    valor:
      "Las rutinas repetitivas se programan una vez y se ejecutan siempre con el mismo procedimiento y evidencia.",
  },
  {
    slug: "industrial",
    icon: Factory,
    nombre: "Mantención industrial",
    resumen:
      "Plantas y equipos críticos donde una detención no planificada cuesta producción.",
    trabajos: [
      "Inspecciones de equipo crítico",
      "Correctivos con repuestos",
      "Paradas de planta programadas",
      "Historial por activo",
    ],
    valor:
      "El historial por activo muestra qué falló, cuántas veces y con qué materiales se resolvió.",
  },
  {
    slug: "campus",
    icon: GraduationCap,
    nombre: "Campus y educación",
    resumen:
      "Recintos grandes con muchas ubicaciones, múltiples solicitantes y trabajo que no puede interrumpir clases.",
    trabajos: [
      "Solicitudes por edificio o sala",
      "Emergencias en horario académico",
      "Trabajos por etapas",
      "Reportes por facultad",
    ],
    valor:
      "160 ubicaciones bajo control es lo que hoy administra un solo contratista en Pangui.",
    probado: true,
  },
  {
    slug: "inmobiliaria",
    icon: Building2,
    nombre: "Facility e inmobiliaria",
    resumen:
      "Edificios, oficinas y espacios comunes donde la administración pide respaldo de cada intervención.",
    trabajos: [
      "Requerimientos de administración",
      "Mantención de espacios comunes",
      "Rondas periódicas",
      "Respaldo para el comité",
    ],
    valor:
      "Cada trabajo cerrado queda con fotos y firma, listo para presentar en la rendición mensual.",
  },
  {
    slug: "sanitaria",
    icon: Droplets,
    nombre: "Sanitaria y especialidades",
    resumen:
      "Gasfitería, redes húmedas, bombas y otras especialidades que conviven en un mismo contrato de servicio.",
    trabajos: [
      "Fugas y cortes de suministro",
      "Mantención de bombas",
      "Revisiones normativas",
      "Trabajos multiespecialidad",
    ],
    valor:
      "Un mismo equipo puede atender varias especialidades sin duplicar sistemas ni planillas.",
  },
];

const FLUJO = [
  {
    paso: "01",
    titulo: "Entra la solicitud",
    cuerpo:
      "El cliente o la administración pide un trabajo. Se crea la OT con su ubicación exacta, prioridad y responsable, en vez de un correo o un papel.",
  },
  {
    paso: "02",
    titulo: "El técnico ejecuta en terreno",
    cuerpo:
      "Desde la app móvil ve qué le toca, sigue el procedimiento, adjunta fotos y firma. Funciona sin señal y sincroniza al volver la conexión.",
  },
  {
    paso: "03",
    titulo: "El trabajo queda respaldado",
    cuerpo:
      "La OT cerrada guarda evidencia, materiales y tiempos. Ese respaldo sirve para cobrar, auditar y presupuestar el siguiente contrato.",
  },
];

export default function IndustriasPage() {
  return (
    <div className="landing-root min-h-screen antialiased">
      <PublicPageTheme />
      <LandingNav />

      <main className="pt-16 md:pt-[68px]">
        <section className="border-b border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto grid max-w-[1440px] gap-10 px-4 py-14 sm:px-5 md:px-10 md:py-20 lg:grid-cols-12 lg:items-end xl:px-12">
            <div className="lg:col-span-7">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                Industrias que atendemos
              </p>
              <h1 className="mt-5 max-w-[880px] font-display text-[40px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[64px]">
                Distintos rubros, la misma orden de trabajo.
              </h1>
            </div>
            <div className="lg:col-span-5">
              <p className="max-w-[560px] text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[18px]">
                Si su empresa recibe solicitudes, manda gente a terreno y tiene
                que demostrar lo que hizo, Pangui le sirve. Cambia la
                especialidad; el flujo de la OT es el mismo.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
            <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] md:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIAS.map((industria) => (
                <IndustriaCard key={industria.slug} industria={industria} />
              ))}
            </div>
            <p className="mt-5 text-[13px] leading-[1.55] text-[var(--ink-3)]">
              Las cifras citadas provienen de la operación real de un contratista
              de mantención eléctrica en Pangui.
            </p>
          </div>
        </section>

        <section className="border-t border-[var(--hairline)] bg-[#F6F8FB]">
          <div className="mx-auto max-w-[1440px] px-4 py-14 sm:px-5 md:px-10 md:py-20 xl:px-12">
            <div className="max-w-[820px]">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
                El flujo que comparten todos los rubros
              </p>
              <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.06] tracking-[-0.03em] text-balance md:text-[52px]">
                La especialidad cambia. El control no.
              </h2>
            </div>
            <div className="mt-10 grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] lg:grid-cols-3">
              {FLUJO.map((item) => (
                <article key={item.paso} className="bg-white p-6 md:p-10">
                  <span className="font-display text-[48px] font-semibold leading-none tracking-[-0.04em] text-[var(--accent)]/20 md:text-[58px]">
                    {item.paso}
                  </span>
                  <h3 className="mt-9 font-display text-[24px] font-semibold tracking-[-0.025em] md:mt-12 md:text-[28px]">
                    {item.titulo}
                  </h3>
                  <p className="mt-4 text-[15px] leading-[1.65] text-[var(--ink-2)]">{item.cuerpo}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[var(--accent)] text-white">
          <div className="mx-auto max-w-[1080px] px-4 py-14 text-center md:py-20">
            <h2 className="font-display text-[32px] font-bold tracking-[-0.03em] md:text-[46px]">
              ¿No ve su rubro en la lista?
            </h2>
            <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-[1.65] text-white/82 md:text-[17px]">
              Si trabaja con órdenes de trabajo y equipos en terreno, Pangui se
              adapta. Escríbanos y le mostramos cómo se vería su operación.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/registro"
                className="inline-flex h-12 items-center justify-center gap-3 bg-white px-7 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 md:h-14 md:px-9"
              >
                Prueba gratis 30 días
                <ArrowRight size={17} />
              </Link>
              <Link
                href="/demo"
                className="inline-flex h-12 items-center justify-center border border-white/70 px-7 text-[15px] font-semibold text-white transition-colors hover:bg-white hover:text-[var(--accent)] md:h-14 md:px-9"
              >
                Agendar demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}

function IndustriaCard({ industria }) {
  const Icon = industria.icon;
  return (
    <article className="flex flex-col bg-white p-6 md:p-9">
      <div className="flex items-start justify-between gap-4">
        <Icon size={40} strokeWidth={1.2} className="text-[var(--accent)]" />
        {industria.probado && (
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--accent)]">
            En operación
          </span>
        )}
      </div>
      <h2 className="mt-7 font-display text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[26px]">
        {industria.nombre}
      </h2>
      <p className="mt-4 text-[15px] leading-[1.6] text-[var(--ink-2)]">{industria.resumen}</p>

      <ul className="mt-6 flex flex-col gap-2 border-t border-[var(--hairline)] pt-6">
        {industria.trabajos.map((trabajo) => (
          <li key={trabajo} className="flex items-start gap-2.5 text-[14px] leading-[1.5] text-[var(--ink-2)]">
            <span aria-hidden className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--accent)]" />
            <span>{trabajo}</span>
          </li>
        ))}
      </ul>

      <p className="mt-auto pt-6 text-[14px] font-semibold leading-[1.55] text-[var(--ink)]">
        {industria.valor}
      </p>
    </article>
  );
}
