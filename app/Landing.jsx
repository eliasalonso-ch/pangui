"use client";

import "./landing.css";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Database,
  FileText,
  Menu,
  ShieldCheck,
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

function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [
    { label: "Soluciones", href: "#soluciones" },
    { label: "Operación", href: "#operacion" },
    { label: "Cumplimiento", href: "#cumplimiento" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-black/10 bg-white">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:h-[68px] md:px-10 xl:px-12">
        <a href="#" aria-label="Pangui - inicio" className="flex items-center">
          <img src="/logo2.svg" alt="Pangui" className="h-7 w-auto md:h-8" />
        </a>

        <nav className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="inline-flex items-center gap-1 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--accent)]"
            >
              {link.label}
              {link.label !== "FAQ" && <ChevronDown size={13} strokeWidth={2} />}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link href="/login" className="text-[14px] font-semibold text-[var(--ink)] hover:text-[var(--accent)]">
            Entrar
          </Link>
          <a
            href="mailto:contacto@getpangui.com?subject=Demo%20Pangui"
            className="inline-flex h-10 items-center border border-[var(--accent)] px-5 text-[14px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)] hover:text-white"
          >
            Agendar demo
          </a>
        </div>

        <button
          type="button"
          className="lg:hidden"
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
            className="overflow-hidden border-t border-black/10 bg-white lg:hidden"
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
              <a
                href="mailto:contacto@getpangui.com?subject=Demo%20Pangui"
                onClick={() => setMenuOpen(false)}
                className="mt-2 bg-[var(--accent)] px-5 py-3 text-center text-[15px] font-semibold text-white"
              >
                Agendar demo
              </a>
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
      <div className="mx-auto grid max-w-[1440px] gap-9 px-4 py-14 sm:px-5 md:gap-12 md:px-10 md:py-24 lg:grid-cols-12 lg:items-center lg:py-28 xl:px-12">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="lg:col-span-6"
        >
          <motion.p variants={fadeUp} className="max-w-[260px] font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-white/75 sm:max-w-none sm:text-[11px]">
            Plataforma operacional para mantención
          </motion.p>
          <motion.h1
            variants={fadeUp}
            className="mt-6 max-w-[720px] font-display text-[38px] font-bold leading-[1.02] tracking-[-0.035em] text-balance sm:text-[54px] md:mt-8 md:text-[70px] lg:text-[84px]"
          >
            Menos trabajo detenido. Más control sobre terreno.
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mt-6 max-w-[620px] text-[16px] leading-[1.6] text-white/82 md:mt-8 md:text-[19px]"
          >
            Pangui ayuda a equipos de mantención a coordinar órdenes, activos,
            materiales y evidencia sin perder trazabilidad cuando el trabajo
            pasa del escritorio al celular del técnico.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap md:mt-10 md:gap-4">
            <a
              href="mailto:contacto@getpangui.com?subject=Demo%20Pangui"
              className="inline-flex h-12 w-full items-center justify-center gap-3 bg-white px-6 text-[15px] font-semibold text-[var(--accent)] transition-colors hover:bg-white/90 sm:w-auto md:h-14 md:px-7"
            >
              Agendar demo
              <ArrowRight size={17} />
            </a>
            <Link
              href="/login"
              className="inline-flex h-12 w-full items-center justify-center border border-white/70 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white hover:text-[var(--accent)] sm:w-auto md:h-14 md:px-7"
            >
              Entrar
            </Link>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-9 grid max-w-[640px] grid-cols-1 gap-px bg-white/25 sm:grid-cols-3 md:mt-12">
            {[
              ["OTs", "Ejecución y evidencia"],
              ["Activos", "Historial por equipo"],
              ["Stock", "Materiales bajo control"],
            ].map(([k, v]) => (
              <div key={k} className="bg-[var(--accent)]/80 p-4">
                <p className="font-display text-[22px] font-semibold leading-none md:text-[24px]">{k}</p>
                <p className="mt-2 text-[12px] leading-[1.35] text-white/72">{v}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.2, 0.7, 0.3, 1] }}
          className="lg:col-span-6"
        >
          <div className="relative overflow-hidden rounded-[14px] bg-white/10 p-2 shadow-2xl shadow-black/20 md:rounded-[18px] md:p-3">
            <img
              src="https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=1800&q=85"
              alt="Equipo de mantención revisando una intervención en terreno"
              className="aspect-[5/4] w-full rounded-[10px] object-cover sm:aspect-[4/3] md:rounded-[12px]"
              loading="eager"
            />
            <div className="relative mt-2 rounded-[10px] border border-white/30 bg-white/92 p-4 text-[var(--ink)] shadow-xl backdrop-blur md:absolute md:bottom-8 md:left-8 md:right-8 md:mt-0 md:rounded-[12px] md:p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                Señal operativa
              </p>
              <p className="mt-2 font-display text-[19px] font-semibold leading-[1.15] tracking-[-0.02em] md:text-[24px]">
                7 órdenes en espera requieren decisión administrativa.
              </p>
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
    key: "inspecciones",
    label: "Listas e inspecciones",
    icon: ClipboardCheck,
    title: "Estandarice la forma en que se ejecuta el trabajo.",
    body: "Procedimientos, listas, respuestas, fotos y firmas guian al tecnico paso a paso. La operacion gana consistencia sin depender solo de la experiencia individual.",
    outcome: "Menos retrabajo, menos omisiones y mejor evidencia de que el procedimiento se cumplio.",
    mockTitle: "Procedimiento",
    mockItems: ["Verificar nivel de combustible", "Registrar voltaje", "Adjuntar evidencia"],
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
    body: "Politica de privacidad, terminos, Portal ARCO, registros de actividad y control por roles forman la base para operar con datos personales y evidencia de trabajo.",
    outcome: "El cumplimiento deja de ser improvisado y queda incorporado al flujo operacional.",
    mockTitle: "Base legal",
    mockItems: ["Portal ARCO", "Terminos y privacidad", "Actividad por usuario"],
  },
];

function FeatureShowcase() {
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
              Capacidades para resolver problemas reales de mantencion.
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
                <a
                  href={`#${item.key}`}
                  onClick={(event) => event.preventDefault()}
                  className="mt-auto flex w-full items-center justify-between gap-4 pt-8 text-[15px] font-medium leading-[1.35] text-[var(--accent)] transition-colors group-hover:text-[var(--accent-hover)]"
                >
                  <span>Explorar {item.label.toLowerCase()}</span>
                  <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" />
                </a>
              </motion.article>
            );
          })}
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
      body: "Política de privacidad, términos y Portal ARCO público forman parte de la base legal del servicio. No se presentan como accesorio comercial: son infraestructura mínima para operar responsablemente.",
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
      q: "¿Pangui es solo para crear órdenes de trabajo?",
      a: "No. La OT es el centro del flujo, pero alrededor de ella se conectan activos, evidencia, materiales, procedimientos, firmas, estados de espera, reportes y analítica operativa.",
    },
    {
      q: "¿La app móvil sigue siendo necesaria si existe la web?",
      a: "Sí, para terreno. La web está pensada para administración y revisión; la app móvil nativa está pensada para técnicos, fotos, firmas, procedimientos y trabajo sin conexión.",
    },
    {
      q: "¿Incluye factura electrónica?",
      a: "No. Pangui prepara evidencia operacional, materiales, costos y reportes para respaldo administrativo. La emisión de documentos tributarios se gestiona fuera de la plataforma.",
    },
    {
      q: "¿Qué pasa con los derechos ARCO?",
      a: "Pangui mantiene un Portal ARCO público junto con política de privacidad y términos. Es parte de operar con datos personales de forma responsable, no un módulo opcional.",
    },
  ];

  return (
    <section id="faq" className="border-t border-[var(--hairline)] bg-white text-[var(--ink)]">
      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-16 sm:px-5 md:px-10 md:py-24 lg:grid-cols-12 lg:gap-12 lg:py-28 xl:px-12">
        <div className="lg:col-span-5">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--accent)] md:text-[11px]">
            Preguntas frecuentes
          </p>
          <h2 className="mt-5 font-display text-[34px] font-bold leading-[1.04] tracking-[-0.03em] md:mt-7 md:text-[52px]">
            Claridad antes de implementar.
          </h2>
        </div>
        <div className="lg:col-span-7">
          <div className="border-t border-[var(--hairline-strong)]">
            {faqs.map((faq, index) => (
              <div key={faq.q} className="border-b border-[var(--hairline-strong)]">
                <button
                  type="button"
                  onClick={() => setOpen(open === index ? -1 : index)}
                  className="flex w-full items-start justify-between gap-5 py-6 text-left md:gap-8 md:py-7"
                >
                  <span className="text-[16px] font-semibold leading-[1.4] md:text-[17px]">{faq.q}</span>
                  <span className="text-[var(--accent)]">{open === index ? "−" : "+"}</span>
                </button>
                <AnimatePresence initial={false}>
                  {open === index && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden pb-6 pr-4 text-[15px] leading-[1.65] text-[var(--ink-2)] md:pb-7 md:pr-10"
                    >
                      {faq.a}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t border-[var(--hairline)] bg-white text-[var(--ink)]">
      <div className="mx-auto max-w-[1440px] px-4 py-10 sm:px-5 md:px-10 md:py-12 xl:px-12">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <img src="/logo2.svg" alt="Pangui" className="h-8 w-auto" />
            <p className="mt-6 max-w-[320px] text-[14px] leading-[1.65] text-[var(--ink-2)]">
              Plataforma operacional para equipos de mantención en Chile.
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Producto</p>
            <div className="mt-5 flex flex-col gap-3 text-[14px] text-[var(--ink-2)]">
              <a href="#soluciones">Soluciones</a>
              <a href="#operacion">Operación</a>
              <a href="#cumplimiento">Cumplimiento</a>
              <Link href="/login">Entrar</Link>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">Legal</p>
            <div className="mt-5 flex flex-col gap-3 text-[14px] text-[var(--ink-2)]">
              <Link href="/privacidad">Política de privacidad</Link>
              <Link href="/terminos">Términos y condiciones</Link>
              <Link href="/arco">Portal ARCO</Link>
              <a href="mailto:contacto@getpangui.com">contacto@getpangui.com</a>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--hairline)] pt-8 text-[12px] text-[var(--ink-3)] md:flex-row md:items-center md:justify-between">
          <p>© 2026 Pangui SpA. Hecho en Chile.</p>
          <p>Privacidad y trazabilidad como base del servicio.</p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="landing-root antialiased">
      <LandingNav />
      <Hero />
      <ProblemSection />
      <OperatingModel />
      <FeatureShowcase />
      <Compliance />
      <FAQ />
      <LandingFooter />
    </div>
  );
}
