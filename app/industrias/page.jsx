import { REGISTRO_URL } from "@/lib/app-urls";
import "../landing.css";
import Link from "next/link";
import {
  ArrowRight,
  BrickWall,
  Building2,
  Car,
  Check,
  Factory,
  FlaskConical,
  Fuel,
  Hotel,
  House,
  Landmark,
  LayoutGrid,
  Package,
  Pickaxe,
  Store,
  Tractor,
  Truck,
  UtensilsCrossed,
} from "lucide-react";
import { LandingFooter, LandingNav } from "../Landing";
import PublicPageTheme from "@/components/PublicPageTheme";

export const metadata = {
  title: "Industrias",
  description:
    "Software de mantención (CMMS) para manufactura, alimentos, químicos, minería, flotas, retail, gobierno, facility management, propiedades, hospitalidad y más. Cómo Pangui atiende cada industria en Chile.",
  alternates: { canonical: "/industrias" },
  openGraph: {
    title: "Industrias que atendemos | Pangui",
    description:
      "Cómo Pangui atiende la mantención de manufactura, alimentos, químicos, minería, flotas, retail, gobierno, propiedades, hospitalidad y más.",
    url: "/industrias",
  },
};

// Each industry: what its maintenance looks like (contexto) and how Pangui
// serves it (como). Only claim features the product actually has today.
const INDUSTRIAS = [
  {
    icon: Factory,
    nombre: "Fabricación general",
    contexto: "Líneas y equipos que no pueden detenerse sin aviso, con turnos que se traspasan el trabajo.",
    como: [
      "Preventivos recurrentes por máquina: el siguiente se genera solo al cerrar el anterior",
      "Historial por activo: qué falló, cuántas veces y con qué repuestos",
      "Checklists con mediciones y su rango aceptable en cada inspección",
    ],
  },
  {
    icon: BrickWall,
    nombre: "Materiales de construcción",
    contexto: "Chancadores, hornos, correas y plantas de áridos o cemento con desgaste alto y polvo constante.",
    como: [
      "Rutinas de lubricación e inspección de desgaste programadas por equipo",
      "Fotos del antes y después en cada correctivo",
      "Materiales y repuestos usados registrados en la OT",
    ],
  },
  {
    icon: UtensilsCrossed,
    nombre: "Alimentos y bebidas",
    contexto: "Plantas donde la mantención también responde a inocuidad y auditorías de calidad.",
    como: [
      "Procedimientos paso a paso con la hora de cada paso, listos para el auditor",
      "Limpiezas y sanitizaciones de equipos como preventivos recurrentes",
      "Informe PDF por OT con evidencia y firma de recepción",
    ],
  },
  {
    icon: FlaskConical,
    nombre: "Químicos",
    contexto: "Equipos críticos y trabajos con riesgo, donde el procedimiento seguro no es opcional.",
    como: [
      "Pasos de seguridad verificados dentro del procedimiento antes de intervenir",
      "Criticidad por activo para priorizar lo que no puede fallar",
      "Registro de quién hizo qué y cuándo en el historial de cada OT",
    ],
  },
  {
    icon: Package,
    nombre: "Plásticos",
    contexto: "Inyectoras, extrusoras, moldes y sistemas de enfriamiento que marcan el ritmo de la producción.",
    como: [
      "Planes preventivos por equipo y por molde",
      "Fallas reportadas desde la planta con foto y prioridad",
      "Tiempo de cada intervención registrado, para ver dónde se va la mano de obra",
    ],
  },
  {
    icon: Car,
    nombre: "Automóviles",
    contexto: "Plantas, talleres y concesionarios con elevadores, compresores y cabinas de pintura que deben estar al día.",
    como: [
      "Inventario de equipos con número de serie, estado y criticidad",
      "Revisiones periódicas con checklist y firma del responsable",
      "Historial completo para respaldar certificaciones y garantías",
    ],
  },
  {
    icon: Store,
    nombre: "Venta minorista",
    contexto: "Muchas tiendas o locales, cada uno con su clima, iluminación, frío y cortinas.",
    como: [
      "Cada local como ubicación, con sus equipos y su historial",
      "Solicitudes de todos los locales centralizadas en un solo lugar",
      "Informes PDF y Excel para rendir a la gerencia o al cliente",
    ],
  },
  {
    icon: Landmark,
    nombre: "Gobierno",
    contexto: "Edificios públicos y servicios con contratos licitados que exigen rendición de cada trabajo.",
    como: [
      "Respaldo de cada trabajo con fotos, firma y fecha para la rendición",
      "Exportación a PDF y Excel para el inspector del contrato",
      "Solicitudes por edificio con prioridad y responsable asignado",
    ],
  },
  {
    icon: Building2,
    nombre: "Gestión de instalaciones",
    contexto: "Edificios y oficinas con clima, electricidad, sanitaria y espacios comunes bajo un mismo contrato.",
    como: [
      "Varias especialidades en un mismo sistema, sin planillas paralelas",
      "Rondas y mantenciones periódicas programadas",
      "Firma del solicitante al cerrar, como conformidad del cliente",
    ],
  },
  {
    icon: Tractor,
    nombre: "Agricultura y granjas",
    contexto: "Maquinaria, riego, bodegas y cámaras de frío repartidos en predios extensos.",
    como: [
      "Mantenciones de temporada programadas con anticipación",
      "Ubicación de cada trabajo dentro del predio",
      "Fotos y materiales registrados desde el celular, en terreno",
    ],
  },
  {
    icon: Fuel,
    nombre: "Petróleo y gas upstream",
    contexto: "Instalaciones remotas y equipos críticos con exigencias estrictas de seguridad y trazabilidad.",
    como: [
      "Procedimientos con pasos de seguridad y mediciones con rango aceptable",
      "Criticidad por activo para priorizar intervenciones",
      "Trazabilidad completa: quién, cuándo, con qué materiales y con qué resultado",
    ],
  },
  {
    icon: Pickaxe,
    nombre: "Minería",
    contexto: "Faenas con equipos pesados, contratistas y turnos que deben demostrar cada trabajo al mandante.",
    como: [
      "Respaldo por OT con fotos, firmas y tiempos para el estado de pago",
      "Historial por equipo para anticipar fallas repetidas",
      "Órdenes de compra de materiales generadas desde el plan de mantención",
    ],
  },
  {
    icon: House,
    nombre: "Gestión de propiedades",
    contexto: "Condominios, edificios residenciales y carteras de arriendo con requerimientos de residentes y administración.",
    como: [
      "Cada requerimiento entra como OT con su ubicación y responsable",
      "Mantención programada de espacios comunes, bombas, portones y ascensores",
      "Respaldo con fotos y firma para el comité o el propietario",
    ],
  },
  {
    icon: Truck,
    nombre: "Gestión de flotas",
    contexto: "Camiones, maquinaria y vehículos livianos que deben estar disponibles y con su mantención al día.",
    como: [
      "Cada vehículo como activo, con su historial de mantenciones y reparaciones",
      "Mantenciones preventivas programadas por fecha",
      "Repuestos y horas de taller registrados en cada OT",
    ],
  },
  {
    icon: Hotel,
    nombre: "Hospitalidad",
    contexto: "Hoteles, restaurantes y centros de eventos donde una falla la nota el huésped antes que nadie.",
    como: [
      "Solicitudes por habitación o sector, con prioridad y responsable",
      "Rondas preventivas de clima, agua caliente y cocina",
      "Tiempo visible entre la solicitud y el trabajo cerrado",
    ],
  },
  {
    icon: LayoutGrid,
    nombre: "Otras industrias",
    contexto: "Si su equipo recibe solicitudes, trabaja en terreno y tiene que demostrar lo que hizo, Pangui le sirve.",
    como: [
      "Trabajos reactivos, preventivos, de emergencia, levantamientos y presupuestos",
      "Procedimientos propios para su especialidad",
      "Prueba gratis de 30 días con todo su equipo",
    ],
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
      "Desde la app móvil ve qué le toca, sigue el procedimiento, adjunta fotos y firma.",
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
            <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] md:grid-cols-2 xl:grid-cols-4">
              {INDUSTRIAS.map((industria) => (
                <IndustriaCard key={industria.nombre} industria={industria} />
              ))}
            </div>
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
                href={REGISTRO_URL}
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
    <article className="flex flex-col bg-white p-6 md:p-8">
      <Icon size={36} strokeWidth={1.2} className="text-[var(--accent)]" />
      <h2 className="mt-6 font-display text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[24px]">
        {industria.nombre}
      </h2>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--ink-2)]">{industria.contexto}</p>

      <div className="mt-6 border-t border-[var(--hairline)] pt-5">
        <p className="font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--accent)] md:text-[10px]">
          Cómo lo atendemos
        </p>
        <ul className="mt-4 flex flex-col gap-3">
          {industria.como.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-[14px] leading-[1.5] text-[var(--ink)]">
              <Check size={16} strokeWidth={2.2} className="mt-[3px] shrink-0 text-[var(--accent)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
