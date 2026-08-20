"use client";

import "./landing.css";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import PublicPageTheme from "@/components/PublicPageTheme";
import { StoreBadges } from "@/components/StoreBadges";
import FeatureDetailPanel, { useFeatureDetail } from "@/components/landing/FeatureDetailPanel";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ClipboardCheck,
  Clock3,
  Database,
  FileText,
  Menu,
  Minus,
  PauseCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.2, 0.7, 0.3, 1] },
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

export function LandingNav({ mobileOnly = false }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { label: "Industrias", href: "/industrias" },
    { label: "Casos de éxito", href: "/casos-de-exito" },
    { label: "Precios", href: "/precios" },
  ];

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b border-black/10 bg-white${mobileOnly ? " lg:hidden" : ""}`}
      style={{ "--accent": "#273D88", "--accent-hover": "#1F316E", "--ink": "#0A0B0D" }}
    >
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-10 px-4 md:h-[68px] md:px-10 xl:px-12">
        <Link href="/" aria-label="Pangui - inicio" className="flex items-center">
          <img src="/logo2.svg" alt="Pangui" width={120} height={32} className="h-7 w-auto md:h-8" />
        </Link>

        <nav className="mr-auto hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link href="/login" className="text-[14px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]">
            Entrar
          </Link>
          <Link
            href="/demo"
            className="inline-flex h-10 items-center border border-[var(--accent)] px-5 text-[14px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
          >
            Agendar demo
          </Link>
          <Link
            href="/registro"
            className="inline-flex h-10 items-center bg-[var(--accent)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Prueba gratis
          </Link>
        </div>

        <button
          type="button"
          className="ml-auto text-[#0A0B0D] lg:hidden"
          onClick={() => setMenuOpen((value) => !value)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-y border-[#D1D5DB] bg-white lg:hidden"
          >
            <div className="flex max-h-[calc(100dvh-64px)] flex-col overflow-y-auto px-4 py-4">
              {links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="border-b border-black/10 py-4 text-[16px] font-semibold text-[var(--ink)]"
                >
                  {link.label}
                </a>
              ))}
              <Link href="/login" onClick={() => setMenuOpen(false)} className="py-4 text-[16px] font-semibold">
                Entrar
              </Link>
              <Link
                href="/demo"
                onClick={() => setMenuOpen(false)}
                className="mt-2 flex h-11 w-full items-center justify-center rounded-none border-2 border-[#273D88] bg-white px-5 text-[15px] font-semibold text-[#273D88] transition-colors hover:bg-[#273D88] hover:text-white"
              >
                Agendar demo
              </Link>
              <Link
                href="/registro"
                onClick={() => setMenuOpen(false)}
                className="mt-2 bg-[#273D88] px-5 py-3 text-center text-[15px] font-semibold text-white transition-colors hover:bg-[#1F316E]"
              >
                Prueba gratis 30 días
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero() {
  return (
    <section className="landing-hero-grid relative overflow-hidden pt-16 text-white md:pt-[68px]">
      <div className="mx-auto grid max-w-[1440px] gap-9 px-4 py-14 sm:px-5 md:gap-12 md:px-10 md:py-24 lg:min-h-[calc(100svh-68px)] lg:grid-cols-12 lg:items-center lg:py-16 xl:px-12">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="lg:col-span-6"
        >
          <motion.p variants={fadeUp} className="max-w-[280px] font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/75 sm:max-w-none sm:text-[11px]">
            Software de mantenimiento (CMMS) · Hecho en Chile
          </motion.p>
          {/* h1 and the lead <p> below are deliberately NOT motion components.
              They are the LCP element, and framer-motion's initial="hidden"
              held them at opacity:0 until hydration — which sits behind ~3s of
              JS execution, giving a 9.9s element render delay. Plain elements
              paint with the HTML. Everything else in the hero still animates. */}
          <h1 className="mt-6 max-w-[720px] font-display text-[36px] font-bold leading-[1.04] tracking-[-0.035em] text-balance sm:text-[50px] md:mt-8 md:text-[62px] lg:text-[72px]">
            Órdenes de trabajo bajo control para empresas de mantención.
          </h1>
          <p className="mt-6 max-w-[620px] text-[16px] leading-[1.6] text-white/82 md:mt-8 md:text-[19px]">
            Pangui es el software de órdenes de trabajo para contratistas y
            subcontratistas que hacen mantención para otras empresas: planifique
            OTs, ejecute en terreno con la app móvil y respalde cada trabajo con
            evidencia, materiales y reportes. Menos trabajo detenido, más
            control sobre terreno.
          </p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:mt-10 md:gap-4">
            <Link
              href="/registro"
              className="inline-flex h-12 w-full items-center justify-center gap-3 bg-white px-6 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 sm:w-auto md:h-14 md:px-7"
            >
              Prueba gratis 30 días
              <ArrowRight size={17} />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-12 w-full items-center justify-center border border-white/70 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white hover:text-[var(--accent)] sm:w-auto md:h-14 md:px-7"
            >
              Agendar demo
            </Link>
          </motion.div>
          <motion.p variants={fadeUp} className="mt-4 text-[13px] text-white/65">
            Acceso completo durante la prueba · Configuración en minutos
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.2, 0.7, 0.3, 1] }}
          className="lg:col-span-6"
        >
          <div>
            <Image
              src="/hero-ot-motor.jpg"
              alt="Sala de bombas y motores atendida por una empresa de mantención"
              width={1600}
              height={1200}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="aspect-[5/4] w-full rounded-[18px] object-cover shadow-2xl shadow-black/25 sm:aspect-[4/3] md:rounded-[22px]"
              priority
            />
            {/* Estado card from the real OT detail UI (EstadoSection), sitting
                flush under the image at the same width. Static, non-interactive. */}
            <div className="mt-4 rounded-[20px] border border-black/10 bg-white p-4 text-[var(--ink)] shadow-2xl shadow-black/25 md:mt-5">
              <p className="text-[14px] font-bold leading-[1.3]">
                Mantención motor trifásico M-12
              </p>
              <div className="mt-3 flex gap-2">
                {[
                  { label: "Asignada", icon: UserPlus, selected: false },
                  { label: "En espera", icon: PauseCircle, selected: false },
                  { label: "En curso", icon: RefreshCw, selected: false },
                  { label: "Completada", icon: Check, selected: true },
                ].map(({ label, icon: Icon, selected }) => (
                  <div
                    key={label}
                    className={`relative flex flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[12px] px-1 py-3 ${
                      selected
                        ? "bg-[#34C759] text-white"
                        : "border-[1.5px] border-black/[0.12] bg-white text-[var(--ink-3)]"
                    }`}
                  >
                    {selected && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{
                          background:
                            "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 55%, rgba(0,0,0,0.12) 100%)",
                        }}
                      />
                    )}
                    <Icon size={22} strokeWidth={selected ? 2.4 : 1.8} className="relative" />
                    <span className={`relative text-[11px] leading-none ${selected ? "font-bold" : "font-medium"}`}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

const FEATURE_TABS = [
  {
    key: "ot",
    label: "Ordenes de trabajo",
    icon: Wrench,
    title: "Planifique, ejecute y cierre trabajos sin perder contexto.",
    body: "Cada OT concentra responsables, prioridad, fechas, comentarios, fotos, firmas, materiales, procedimientos y actividad. El equipo deja de perseguir informacion entre WhatsApp, Excel y papeles.",
    outcome: "Reduce el tiempo de coordinacion y mantiene visible que esta pendiente, que esta pausado y que necesita decision administrativa.",
    mockTitle: "Ordenes de Trabajo",
    mockItems: ["Inspeccion generador EULA", "Cambio tablero sala comun", "Reprogramar visita HVAC"],
  },
  {
    key: "preventivo",
    label: "Mantenimiento preventivo",
    icon: Clock3,
    title: "Convierta rutinas repetitivas en trabajo programado.",
    body: "Las revisiones semanales o mensuales pueden organizarse como ordenes recurrentes y sub-OTs por activo, sala o equipo. El procedimiento no se reinventa cada semana: se ejecuta con la misma estructura.",
    outcome: "Evita olvidos, estandariza revisiones y ayuda a demostrar cumplimiento del plan preventivo.",
    mockTitle: "Calendario preventivo",
    mockItems: ["Revision generador EULA", "Revision generador DISE", "Prueba banco baterias"],
  },
  {
    key: "reportes",
    label: "Reportes",
    icon: BarChart3,
    title: "Prepare respaldos operacionales sin reconstruir la historia.",
    body: "PDF, Excel y reportes programados consolidan evidencia, tiempos, estados, materiales y actividad por OT. La informacion queda lista para revision interna, cliente o cierre administrativo.",
    outcome: "Menos horas armando informes y mas trazabilidad para justificar trabajos realizados.",
    mockTitle: "Resumen operacional",
    mockItems: ["Backlog activo", "OTs vencidas", "Materiales consumidos"],
  },
  {
    key: "activos",
    label: "Gestion de activos",
    icon: Database,
    title: "Cada equipo tiene historial, criticidad y contexto tecnico.",
    body: "Registre activos con ubicacion, fabricante, modelo, serie, criticidad, adjuntos, foto y relacion con OTs. Un generador deja de ser solo un nombre en una orden: pasa a tener historia operacional.",
    outcome: "Mejora decisiones de reparacion, reemplazo y priorizacion de equipos criticos.",
    mockTitle: "Activo vinculado",
    mockItems: ["Generador EULA", "Criticidad alta", "Historial de intervenciones"],
  },
  {
    key: "procedimientos",
    label: "Procedimientos",
    icon: ClipboardCheck,
    title: "Un procedimiento es lo que usted necesite que sea.",
    body: "Usted arma el paso a paso con 20 tipos de campo: texto, numeros, mediciones, opciones, listas, fotos, secciones y firma. No se adapta usted al software; el procedimiento se adapta a como trabaja su equipo.",
    outcome: "El ejemplo mas usado: una firma de conformidad obligatoria para cerrar la OT, que deja el respaldo del cliente dentro del trabajo.",
    mockTitle: "Procedimiento",
    mockItems: ["Voltaje medido", "Foto del tablero", "Firma de conformidad"],
  },
  {
    key: "inventario",
    label: "Inventario",
    icon: Boxes,
    title: "Conecte repuestos y consumos con el trabajo real.",
    body: "Los materiales usados en una OT alimentan stock, costos, minimos y analitica de consumo. El inventario deja de ser una planilla separada de la operacion.",
    outcome: "Reduce visitas fallidas por faltantes y mejora la planificacion de compras.",
    mockTitle: "Materiales",
    mockItems: ["Filtro de aceite", "Stock minimo", "Consumo por activo"],
  },
  {
    key: "cumplimiento",
    label: "Cumplimiento",
    icon: ShieldCheck,
    title: "Privacidad y trazabilidad como parte normal del servicio.",
    body: "Politica de privacidad, terminos, registros de actividad y control por roles forman la base para operar con datos personales y evidencia de trabajo.",
    outcome: "El cumplimiento deja de ser improvisado y queda incorporado al flujo operacional.",
    mockTitle: "Base legal",
    mockItems: ["Terminos y privacidad", "Actividad por usuario", "Control por roles"],
  },
];

function FeatureShowcase({ onOpenDetail }) {
  return (
    <section id="funcionalidades" className="border-y border-[var(--hairline)] bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.25 }}
          className="grid gap-6 border-t border-[var(--hairline-strong)] pt-8 lg:grid-cols-12 lg:items-end"
        >
          <div className="lg:col-span-7">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
              Funcionalidades
            </p>
            <h2 className="mt-5 max-w-[860px] font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[56px]">
              Capacidades para resolver problemas reales de mantención.
            </h2>
          </div>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.12 }}
          className="mt-12 grid gap-x-12 gap-y-14 sm:grid-cols-2 md:mt-16 lg:grid-cols-3 xl:grid-cols-4"
        >
          {FEATURE_TABS.map((item) => {
            const Icon = item.icon;
            return (
              <motion.article key={item.key} variants={fadeUp} className="group flex h-full flex-col">
                <div className="mb-8 flex h-16 w-16 items-center justify-center text-[var(--accent)] md:mb-10 md:h-20 md:w-20">
                  <Icon size={58} strokeWidth={1.15} className="h-full w-full" />
                </div>
                <h3 className="font-display text-[18px] font-semibold leading-[1.25] tracking-[-0.01em] text-[var(--ink)]">
                  {item.label}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.65] text-[var(--ink)]">
                  {item.body}
                </p>
                <p className="mt-4 text-[14px] font-semibold leading-[1.55] text-[var(--ink-2)]">
                  {item.outcome}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenDetail(item.key)}
                  className="mt-auto flex w-full items-center justify-between gap-4 pt-8 text-left text-[15px] font-medium leading-[1.35] text-[var(--accent)] transition-colors group-hover:text-[var(--accent-hover)]"
                >
                  <span>Explorar {item.label.toLowerCase()}</span>
                  <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
                </button>
              </motion.article>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

function Audience() {
  const roles = [
    {
      title: "Contratistas y jefes de operaciones",
      body: "Empresas que reciben órdenes de trabajo de sus clientes y responden por el resultado. Vea backlog, trabajos detenidos y carga por técnico sin llamar a nadie, y respalde cada cobro con evidencia.",
    },
    {
      title: "Planificadores y administradores",
      body: "Cree y asigne OTs, programe mantenimiento preventivo recurrente, controle materiales y prepare reportes PDF o Excel para el cliente sin reconstruir la historia a mano.",
    },
    {
      title: "Técnicos en terreno",
      body: "Todo el trabajo del día en el celular: procedimientos paso a paso, fotos, firmas y comentarios. Funciona incluso sin señal y sincroniza cuando vuelve la conexión.",
    },
  ];

  return (
    <section id="para-quien" className="border-y border-[var(--hairline)] bg-[#F6F8FB] text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
        >
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
            Para quién es Pangui
          </p>
          <h2 className="mt-5 max-w-[900px] font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[56px]">
            Hecho para empresas que hacen mantención para otras empresas.
          </h2>
          <p className="mt-6 max-w-[720px] text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[18px]">
            Pangui no es un CMMS genérico de planta industrial: está pensado
            para el contratista de servicios de mantención — eléctrica,
            climatización, sanitaria, infraestructura — que planifica trabajo,
            lo ejecuta en las instalaciones del cliente y debe demostrar qué se
            hizo.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-10 grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] md:mt-14 lg:grid-cols-3"
        >
          {roles.map((role) => (
            <motion.article key={role.title} variants={fadeUp} className="bg-white p-6 md:p-9">
              <h3 className="font-display text-[22px] font-semibold leading-[1.14] tracking-[-0.02em] md:text-[24px]">
                {role.title}
              </h3>
              <p className="mt-5 text-[15px] leading-[1.65] text-[var(--ink-2)]">{role.body}</p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// Figures come from the Electrilam workspace (abril–agosto 2026). Update them
// together — the copy references the same period.
const CASO_METRICAS = [
  { valor: "603", label: "órdenes de trabajo gestionadas en 4 meses" },
  { valor: "2.824", label: "fotos de evidencia asociadas a sus OTs" },
  { valor: "160", label: "ubicaciones del campus bajo control" },
  { valor: "96%", label: "de las OTs de abril a julio cerradas en la plataforma" },
];

function CaseStudy() {
  return (
    <section id="caso-electrilam" className="border-y border-[var(--hairline)] bg-[#F6F8FB] text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            className="lg:col-span-5"
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
              Caso de éxito
            </p>
            <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[52px]">
              De papel y Excel a 603 órdenes de trabajo trazables.
            </h2>
            <p className="mt-6 text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[18px]">
              <strong className="font-semibold text-[var(--ink)]">
                Ingeniería y Construcción Electrilam SpA
              </strong>{" "}
              ejecuta el mantenimiento eléctrico de la Universidad de Concepción.
              Antes de Pangui, cada trabajo se registraba en papel y planillas
              Excel: era difícil saber qué se había completado realmente, y esa
              falta de control se traducía en pérdidas al presupuestar y cerrar
              proyectos.
            </p>
            <p className="mt-5 text-[16px] leading-[1.65] text-[var(--ink-2)] md:text-[17px]">
              Hoy su equipo de 14 personas trabaja sobre Pangui todos los días.
              Cada intervención queda registrada con evidencia fotográfica,
              ubicación exacta dentro del campus y procedimiento aplicado — lista
              para respaldar el trabajo frente al cliente.
            </p>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="lg:col-span-7"
          >
            <div className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-2">
              {CASO_METRICAS.map((metrica) => (
                <motion.div key={metrica.label} variants={fadeUp} className="bg-white p-6 md:p-9">
                  <p className="font-display text-[44px] font-bold leading-none tracking-[-0.04em] text-[var(--accent)] md:text-[56px]">
                    {metrica.valor}
                  </p>
                  <p className="mt-4 text-[15px] leading-[1.5] text-[var(--ink-2)]">{metrica.label}</p>
                </motion.div>
              ))}
            </div>
            <motion.div variants={fadeUp} className="mt-8 border-t border-[var(--hairline-strong)] pt-8 md:mt-10">
              <p className="text-[14px] leading-[1.5] text-[var(--ink-2)]">
                Ingeniería y Construcción Electrilam SpA · Mantenimiento
                eléctrico, Universidad de Concepción
              </p>
              <Link
                href="/casos-de-exito/electrilam"
                className="mt-5 inline-flex items-center gap-3 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
              >
                Ver el caso completo
                <ArrowRight size={17} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function Implementation() {
  const pillars = [
    {
      title: "Configuración en minutos, no meses",
      body: "Cree su espacio de trabajo, invite al equipo y cargue sus primeras OTs el mismo día. Sin proyectos de implementación eternos ni consultores obligatorios.",
    },
    {
      title: "Acompañamiento durante la puesta en marcha",
      body: "Le ayudamos a ordenar activos, rutinas preventivas y flujos de trabajo para que la plataforma refleje cómo opera su empresa realmente.",
    },
    {
      title: "Soporte en español, desde Chile",
      body: "Hablamos el idioma de la operación local: OTs, mantención, terreno. Sin tickets en inglés ni husos horarios imposibles.",
    },
    {
      title: "Precio simple y transparente",
      body: "Un plan único por usuario al mes, con 30 días de prueba gratis para todo el equipo. Sin contratos anuales forzados ni módulos escondidos.",
    },
  ];

  return (
    <section id="implementacion" className="border-t border-[var(--hairline)] bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <div className="grid gap-8 md:gap-12 lg:grid-cols-12">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="lg:col-span-5"
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
              Implementación y soporte
            </p>
            <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[56px]">
              Empezar no debería ser otro proyecto más.
            </h2>
            <Link
              href="/precios"
              className="mt-8 inline-flex items-center gap-3 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
            >
              Ver precios
              <ArrowRight size={17} />
            </Link>
          </motion.div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="grid gap-7 sm:grid-cols-2 md:gap-8 lg:col-span-7"
          >
            {pillars.map((pillar) => (
              <motion.article key={pillar.title} variants={fadeUp} className="border-t border-[var(--hairline-strong)] pt-7">
                <h3 className="font-display text-[20px] font-semibold leading-[1.2] tracking-[-0.02em] md:text-[22px]">
                  {pillar.title}
                </h3>
                <p className="mt-4 text-[15px] leading-[1.65] text-[var(--ink-2)]">{pillar.body}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="landing-hero-grid text-white">
      <div className="mx-auto max-w-[1440px] px-4 py-16 text-center sm:px-5 md:px-10 md:py-24 xl:px-12">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          className="mx-auto flex max-w-[760px] flex-col items-center"
        >
          <motion.h2
            variants={fadeUp}
            className="font-display text-[32px] font-bold leading-[1.06] tracking-[-0.03em] text-balance md:text-[52px]"
          >
            Ponga sus órdenes de trabajo bajo control esta semana.
          </motion.h2>
          <motion.p variants={fadeUp} className="mt-6 max-w-[560px] text-[16px] leading-[1.6] text-white/82 md:text-[18px]">
            Pruebe Pangui gratis por 30 días con todo su equipo, o agende una
            demo y le mostramos la plataforma con casos reales de mantención.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row md:gap-4">
            <Link
              href="/registro"
              className="inline-flex h-12 items-center justify-center gap-3 bg-white px-6 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 md:h-14 md:px-7"
            >
              Prueba gratis 30 días
              <ArrowRight size={17} />
            </Link>
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center border border-white/70 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white hover:text-[var(--accent)] md:h-14 md:px-7"
            >
              Agendar demo
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const problems = [
    {
      title: "Trabajos pausados dejan de depender de la memoria",
      body: "Cuando una OT queda sin acceso, sin materiales o reprogramada, el administrador la ve como una alerta operativa. La excepción queda visible hasta que alguien tome una decisión.",
    },
    {
      title: "La evidencia queda dentro de la orden, no en conversaciones",
      body: "Fotos, comentarios, firmas, hojas y procedimientos quedan asociados al trabajo que corresponde, con historial para revisión interna, cliente o cierre administrativo.",
    },
    {
      title: "El consumo de materiales se conecta con el trabajo real",
      body: "Los repuestos usados en terreno alimentan inventario, costos y alertas de stock. El equipo deja de descubrir faltantes cuando ya está frente al activo.",
    },
    {
      title: "La gestión deja de esperar al cierre de mes",
      body: "Backlog, tiempos, fallas repetidas, activos críticos y carga por técnico se observan en el flujo diario, no en reportes reconstruidos a mano.",
    },
  ];

  return (
    <section id="soluciones" className="bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            className="lg:col-span-5"
          >
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
              Problemas que resuelve
            </p>
            <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[56px]">
              Mantención falla cuando la información se fragmenta.
            </h2>
          </motion.div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="grid gap-px border border-[var(--hairline)] bg-[var(--hairline)] sm:grid-cols-2 lg:col-span-7"
          >
            {problems.map((item, index) => {
              return (
                <motion.article key={item.title} variants={fadeUp} className="bg-white p-6 md:p-9">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="h-px flex-1 bg-[var(--hairline-strong)]" />
                  </div>
                  <h3 className="mt-8 font-display text-[22px] font-semibold leading-[1.14] tracking-[-0.02em] md:mt-10 md:text-[24px]">
                    {item.title}
                  </h3>
                  <p className="mt-5 text-[15px] leading-[1.65] text-[var(--ink-2)]">
                    {item.body}
                  </p>
                </motion.article>
              );
            })}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function OperatingModel() {
  const lanes = [
    {
      title: "Planificar",
      body: "Administradores crean OTs, programan trabajo recurrente, asignan responsables y vinculan activos.",
    },
    {
      title: "Ejecutar",
      body: "Técnicos trabajan desde la app móvil nativa con fotos, comentarios, procedimientos, firmas y modo sin conexión.",
    },
    {
      title: "Controlar",
      body: "La operación consolida tiempos, stock, activos, evidencia y reportes para decisiones de mantención.",
    },
  ];

  return (
    <section id="operacion" className="border-y border-black/10 bg-[#F6F8FB] text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <div className="grid gap-8 md:gap-12 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
              Modelo operativo
            </p>
            <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[58px]">
              Una plataforma para cerrar la distancia entre oficina y terreno.
            </h2>
          </div>
          <p className="max-w-[480px] text-[16px] leading-[1.65] text-[var(--ink-2)] lg:col-span-5">
            Pangui no intenta reemplazar el criterio del equipo. Ordena el
            flujo para que las decisiones ocurran con contexto: qué equipo falló,
            qué se hizo, qué falta, quién quedó responsable y qué evidencia existe.
          </p>
        </div>

        <div className="mt-10 grid gap-px border border-black/10 bg-black/10 md:mt-14 lg:grid-cols-3">
          {lanes.map((lane, index) => {
            return (
              <article key={lane.title} className="bg-white p-6 md:p-10">
                <div className="flex items-center justify-between">
                  <span className="font-display text-[48px] font-semibold leading-none tracking-[-0.04em] text-[var(--accent)]/20 md:text-[58px]">
                    0{index + 1}
                  </span>
                  <span className="h-px w-16 bg-[var(--accent)]/30" />
                </div>
                <h3 className="mt-9 font-display text-[26px] font-semibold tracking-[-0.025em] md:mt-12 md:text-[30px]">
                  {lane.title}
                </h3>
                <p className="mt-4 text-[15px] leading-[1.65] text-[var(--ink-2)]">
                  {lane.body}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Compliance() {
  const items = [
    {
      icon: ShieldCheck,
      title: "Datos personales con un canal formal",
      body: "Política de privacidad y términos publicados forman parte de la base legal del servicio, junto con un canal directo para ejercer derechos sobre datos personales. No se presentan como accesorio comercial: son infraestructura mínima para operar responsablemente.",
    },
    {
      icon: FileText,
      title: "Reportes para revisión y respaldo",
      body: "PDF, Excel y evidencia por OT ayudan a documentar trabajos, materiales, firmas y comentarios para auditoría, cliente o cierre interno.",
    },
    {
      icon: Database,
      title: "Trazabilidad por usuario y por orden",
      body: "Cada cambio relevante queda asociado a la OT y al equipo que lo ejecutó, reduciendo discusiones por información incompleta.",
    },
  ];

  return (
    <section id="cumplimiento" className="bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <div className="grid gap-8 md:gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
              Confianza y cumplimiento
            </p>
            <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] text-balance md:mt-7 md:text-[56px]">
              Lo obligatorio debe estar resuelto antes de crecer.
            </h2>
          </div>
          <div className="grid gap-7 md:gap-8 lg:col-span-7">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="border-t border-[var(--hairline-strong)] pt-8">
                  <div className="flex gap-4 md:gap-5">
                    <Icon size={24} strokeWidth={1.5} className="mt-1 shrink-0 text-[var(--accent)]" />
                    <div>
                      <h3 className="font-display text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[25px]">
                        {item.title}
                      </h3>
                      <p className="mt-4 max-w-[680px] text-[15px] leading-[1.65] text-[var(--ink-2)]">
                        {item.body}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  const faqs = [
    {
      q: "¿Qué es un CMMS y para qué sirve?",
      a: "Un CMMS (software de gestión de mantenimiento) centraliza órdenes de trabajo, activos, materiales y evidencia en un solo sistema. Pangui es un CMMS pensado para contratistas y empresas de servicios de mantención en Chile: reemplaza planillas, WhatsApp y papeles por un flujo trazable entre oficina y terreno.",
    },
    {
      q: "¿Pangui es solo para crear órdenes de trabajo?",
      a: "No. La OT es el centro del flujo, pero alrededor de ella se conectan activos, evidencia, materiales, procedimientos, firmas, estados de espera, reportes y analítica operativa.",
    },
    {
      q: "¿La app móvil sigue siendo necesaria si existe la web?",
      a: "Sí, para terreno. La web está pensada para administración y revisión; la app móvil nativa está pensada para técnicos, fotos, firmas, procedimientos y trabajo sin conexión.",
    },
    {
      q: "¿Qué tan flexibles son los procedimientos?",
      a: "Usted decide qué contiene cada procedimiento. Se arma con 20 tipos de paso —secciones, instrucciones, advertencias, texto, números, montos, lecturas de medidor, fechas, opciones, listas de verificación, inspecciones, fotos, archivos, escaneo QR y firma— con pasos obligatorios y lógica condicional. El caso más usado es agregar una firma de conformidad obligatoria para poder cerrar la OT.",
    },
    {
      q: "¿Cuánto cuesta Pangui?",
      a: "Pangui tiene un plan único por usuario al mes, con 30 días de prueba gratis para todo el equipo. Sin contratos anuales forzados. El detalle está en la página de precios.",
    },
    {
      q: "¿Incluye factura electrónica?",
      a: "No. Pangui prepara evidencia operacional, materiales, costos y reportes para respaldo administrativo. La emisión de documentos tributarios se gestiona fuera de la plataforma.",
    },
  ];

  return (
    <section id="faq" className="border-t border-[var(--hairline)] bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:py-28 xl:px-12">
        <h2 className="font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] md:text-[56px]">
          Preguntas frecuentes sobre Pangui
        </h2>
        <div className="mt-12 border-t border-[var(--hairline)] md:mt-16">
          {faqs.map((faq, index) => (
            <div key={faq.q} className="border-b border-[var(--hairline)]">
              <button
                type="button"
                onClick={() => setOpen(open === index ? -1 : index)}
                aria-expanded={open === index}
                className="flex w-full items-center justify-between gap-5 py-6 text-left md:gap-8 md:py-7"
              >
                <span className="text-[16px] font-normal leading-[1.4] md:text-[17px]">{faq.q}</span>
                {open === index ? (
                  <Minus size={22} strokeWidth={2} aria-hidden className="shrink-0 text-[var(--accent)]" />
                ) : (
                  <Plus size={22} strokeWidth={2} aria-hidden className="shrink-0 text-[var(--accent)]" />
                )}
              </button>
              <AnimatePresence initial={false}>
                {open === index && (
                  <motion.p
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="max-w-[1200px] overflow-hidden pb-7 pr-4 text-[15px] leading-[1.65] text-[var(--ink-2)] md:pb-8 md:pr-12 md:text-[16px]"
                  >
                    {faq.a}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--hairline)] bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-5 md:px-10 md:py-12 xl:px-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <Link href="/" aria-label="Pangui - inicio" className="inline-flex">
              <img src="/logo2.svg" alt="Pangui" width={120} height={32} className="h-8 w-auto" />
            </Link>
            <p className="mt-6 max-w-[340px] text-[14px] leading-[1.65] text-[var(--ink-2)]">
              Software de órdenes de trabajo y mantenimiento (CMMS) para
              contratistas y empresas de servicios de mantención en Chile.
            </p>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              Disponible en
            </p>
            <StoreBadges height={40} style={{ marginTop: 12, gap: 10 }} />
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Producto</p>
            <div className="mt-5 flex flex-col gap-3 text-[14px] text-[var(--ink-2)]">
              <Link href="/industrias">Industrias</Link>
              <Link href="/casos-de-exito">Casos de éxito</Link>
              <Link href="/precios">Precios</Link>
              <Link href="/registro">Prueba gratis</Link>
              <Link href="/login">Entrar</Link>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Legal</p>
            <div className="mt-5 flex flex-col gap-3 text-[14px] text-[var(--ink-2)]">
              <Link href="/privacidad">Política de privacidad</Link>
              <Link href="/terminos">Términos y condiciones</Link>
              <a href="mailto:contacto@getpangui.com">contacto@getpangui.com</a>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--hairline)] pt-8 text-[12px] text-[var(--ink-3)] md:flex-row md:items-center md:justify-between">
          <p>© 2026 Pangui. Hecho en Chile.</p>
          <p>Privacidad y trazabilidad como base del servicio.</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  const detail = useFeatureDetail();

  return (
    <div className="landing-root antialiased">
      <PublicPageTheme />
      <LandingNav />
      <Hero />
      <Audience />
      <ProblemSection />
      <OperatingModel />
      <FeatureShowcase onOpenDetail={detail.open} />
      <CaseStudy />
      <Implementation />
      <Compliance />
      <FAQ />
      <FinalCta />
      <LandingFooter />
      <FeatureDetailPanel featureKey={detail.featureKey} onClose={detail.close} />
    </div>
  );
}
