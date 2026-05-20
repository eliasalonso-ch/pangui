"use client";

/**
 * Pangui — Marketing landing page
 * Editorial industrial direction inspired by slb.com.
 * Single self-contained file (drop into app/Landing.jsx).
 * Companion file: ./landing.css (small, for things Tailwind can't express).
 *
 * Sections (in order): Nav · Hero · Trust band · 4 Capability sections
 * (alternating sides) · Compliance · Pricing · FAQ · Footer.
 */

import "./landing.css";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Plus,
  Minus,
  Menu,
  X,
  Wifi,
  FileCheck2,
  ShieldCheck,
  ScrollText,
  ArrowUpRight,
} from "lucide-react";

// ── Motion presets ─────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.2, 0.7, 0.3, 1] },
  },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

// =============================================================
// NAV
// =============================================================
function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { label: "Plataforma", href: "#plataforma" },
    { label: "Cumplimiento", href: "#cumplimiento" },
    { label: "Precios", href: "#precios" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--accent)] border-b border-white/10">
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 h-[72px] md:h-[80px] flex items-center justify-between">
        <a href="#" className="flex items-center" aria-label="Pangui — inicio">
          <img
            src="/logo6.svg"
            alt="Pangui"
            className="h-7 md:h-8 w-auto"
          />
        </a>

        <nav className="hidden lg:flex items-center gap-10">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-[13px] font-medium text-white/75 hover:text-white transition-colors tracking-[0.01em]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-6">
          <Link
            href="/login"
            className="text-[13px] font-medium text-white/75 hover:text-white transition-colors"
          >
            Iniciar sesión
          </Link>
          <a
            href="/registro"
            className="group inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--accent)] bg-white hover:bg-white/90 px-5 h-10 transition-colors"
          >
            Probar gratis
            <ArrowRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </a>
        </div>

        <button
          className="lg:hidden p-2 text-white bg-transparent"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden bg-[var(--accent-hover)] border-t border-white/10 overflow-hidden"
          >
            <div className="px-5 py-6 flex flex-col gap-1">
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-white font-medium py-3 border-b border-white/10 text-[15px]"
                >
                  {l.label}
                </a>
              ))}
              <Link
                href="/login"
                className="text-white/80 font-medium py-3 text-[15px]"
                onClick={() => setMenuOpen(false)}
              >
                Iniciar sesión
              </Link>
              <a
                href="/registro"
                onClick={() => setMenuOpen(false)}
                className="mt-3 bg-white text-[var(--accent)] font-semibold text-center py-3 text-[14px]"
              >
                Probar gratis
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// =============================================================
// HERO
// =============================================================
function Hero() {
  return (
    <section
      id="hero"
      className="relative bg-white text-[var(--ink)] overflow-hidden"
    >
      {/* Typography block */}
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 pt-[140px] md:pt-[180px] pb-16 md:pb-24">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="flex items-center gap-3 mb-12 md:mb-16"
        >
          <span className="block h-[2px] w-12 bg-[var(--accent)]" />
          <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--accent)] font-medium">
            01 · Plataforma operacional
          </span>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="max-w-[1180px]"
        >
          <motion.h1
            variants={fadeUp}
            className="font-display text-[44px] sm:text-[60px] md:text-[80px] lg:text-[104px] leading-[0.96] tracking-[-0.025em] font-bold text-[var(--ink)] text-balance"
          >
            La mantención industrial,{" "}
            <span className="text-[var(--accent)]">en orden.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-8 md:mt-10 max-w-[680px] text-[16px] md:text-[18px] leading-[1.55] text-[var(--ink-2)]"
          >
            Pangui une una plataforma web para planificar y revisar la
            operación con una app móvil nativa para ejecutar trabajos en
            terreno: órdenes, fotos, firmas, procedimientos, inventario y
            reportes en un solo flujo.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 md:mt-12 flex flex-wrap items-center gap-x-8 gap-y-4"
          >
            <a
              href="/registro"
              className="group inline-flex items-center gap-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-[14px] tracking-wide px-7 h-12 transition-colors"
            >
              Probar gratis
              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-1"
              />
            </a>
            <a
              href="#plataforma"
              className="group inline-flex items-center gap-2 text-[14px] font-medium text-[var(--ink)] hover:text-[var(--accent)] transition-colors"
            >
              Ver plataforma
              <ArrowUpRight
                size={14}
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* Wide photo band — magazine-spread treatment */}
      <div className="relative w-full">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.9, ease: [0.2, 0.7, 0.3, 1] }}
          className="relative aspect-[21/10] md:aspect-[21/8] bg-[var(--ink)] overflow-hidden"
        >
          <img
            src="https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=2400&q=80"
            alt="Técnico de mantención industrial revisando un tablero"
            className="w-full h-full object-cover object-center"
            loading="eager"
          />
        </motion.div>

        {/* Caption strip below photo */}
        <div className="mx-auto max-w-[1440px] px-5 md:px-12 mt-4 md:mt-5 mb-12 md:mb-16 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="block h-px w-6 bg-[var(--accent)]" />
            <span className="font-mono text-[10px] md:text-[11px] tracking-[0.18em] uppercase text-[var(--ink-3)]">
              Operación de terreno · Cliente Pangui
            </span>
          </div>
          <p className="hidden md:block font-mono text-[10px] md:text-[11px] tracking-[0.18em] uppercase text-[var(--ink-3)]">
            Edición 2026
          </p>
        </div>
      </div>
    </section>
  );
}

// =============================================================
// TRUST BAND
// =============================================================
function TrustBand() {
  const contexts = [
    "Edificios",
    "Facilities",
    "Plantas",
    "Servicios técnicos",
    "Bodegas",
    "Contratistas",
  ];

  return (
    <section
      aria-labelledby="trust-label"
      className="bg-white text-[var(--ink)] border-t border-[var(--hairline)]"
    >
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 py-10 md:py-14">
        <div className="flex flex-col md:flex-row md:items-center gap-6 md:gap-12">
          <p
            id="trust-label"
            className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-3)] shrink-0"
          >
            Diseñada para mantención en Chile
          </p>
          <div className="flex-1 grid grid-cols-3 md:grid-cols-6 gap-x-4 md:gap-x-8 gap-y-6 items-center">
            {contexts.map((label) => (
              <span
                key={label}
                className="font-display font-semibold text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors text-[18px] md:text-[20px] tracking-[-0.01em] text-center md:text-left"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}


// =============================================================
// CAPABILITY SECTION (reusable, alternates sides)
// =============================================================
function CapabilitySection({
  index,
  flip,
  eyebrow,
  title,
  body,
  outcomes,
  image,
  imageAlt,
  imageCaption,
}) {
  return (
    <section
      id={index === "01" ? "plataforma" : undefined}
      className="relative bg-white text-[#0A0B0D] border-t border-black/10"
    >
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 py-20 md:py-32">
        <div
          className={[
            "grid lg:grid-cols-12 gap-10 lg:gap-16 items-center",
            flip ? "lg:[&>*:first-child]:order-2" : "",
          ].join(" ")}
        >
          {/* Copy column */}
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="lg:col-span-5"
          >
            <motion.div variants={fadeUp} className="flex items-center gap-3 mb-8">
              <span className="block h-[2px] w-10 bg-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--accent)] font-medium">
                {index} · {eyebrow}
              </span>
            </motion.div>

            <motion.h2
              variants={fadeUp}
              className="font-display text-[36px] md:text-[44px] lg:text-[52px] leading-[1.02] tracking-[-0.022em] font-bold text-balance"
            >
              {title}
            </motion.h2>

            <motion.div
              variants={fadeUp}
              className="mt-8 space-y-5 text-[16px] leading-[1.65] text-[#0A0B0D]/70 max-w-[520px]"
            >
              {body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </motion.div>

            <motion.ul variants={fadeUp} className="mt-10 space-y-0">
              {outcomes.map((o, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-5 py-4 border-t border-black/10 last:border-b last:border-black/10"
                >
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--accent)] shrink-0 w-8">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[15px] font-medium text-[#0A0B0D]">
                    {o}
                  </span>
                </li>
              ))}
            </motion.ul>
          </motion.div>

          {/* Image column */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.8, ease: [0.2, 0.7, 0.3, 1] }}
            className="lg:col-span-7 relative"
          >
            <div className="relative aspect-[5/4] lg:aspect-[5/4] bg-[#0A0B0D] overflow-hidden">
              <img
                src={image}
                alt={imageAlt}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="block h-px w-6 bg-black/20" />
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#0A0B0D]/45">
                {imageCaption}
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// Content for the 4 capability sections (preserves the substance
// of the previous landing: work orders, signatures+photos, inventory,
// analytics — collapsed into editorial form).
const CAPABILITIES = [
  {
    index: "01",
    flip: false,
    eyebrow: "Planificación web",
    title: "Crea, asigna y revisa órdenes desde el centro de mando.",
    body: [
      "El administrador crea la OT desde la web con ubicación, sociedad, lugar, prioridad, fechas, responsables, enlaces y requisitos de materiales, hojas o evidencia.",
      "El historial queda ordenado por OT: cambios de estado, comentarios, fotos, procedimientos y actividad del equipo para revisar sin depender de papeles o conversaciones sueltas.",
    ],
    outcomes: [
      "Asignación a técnicos y jefes de cuadrilla",
      "Estados, prioridad, tiempos y trazabilidad",
      "PDF y Excel para cierre administrativo",
    ],
    image:
      "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=2000&q=80",
    imageAlt: "Operador revisando una orden de trabajo en una tableta",
    imageCaption: "Plataforma · Órdenes de trabajo",
  },
  {
    index: "02",
    flip: true,
    eyebrow: "App móvil nativa",
    title: "Terreno funciona desde el celular, incluso sin señal.",
    body: [
      "La app móvil para Android e iOS permite recibir OTs, registrar avances, tomar fotos, completar procedimientos, firmar y guardar cambios localmente cuando el equipo trabaja sin cobertura.",
      "Al recuperar conexión, la cola de sincronización sube la evidencia y actualiza la operación compartida con la web.",
    ],
    outcomes: [
      "SQLite local y cola de acciones pendientes",
      "Fotos, firmas y procedimientos desde terreno",
      "App móvil real para Android e iOS",
    ],
    image:
      "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=2000&q=80",
    imageAlt: "Técnico documentando una intervención con su celular",
    imageCaption: "Plataforma · Informes de terreno",
  },
  {
    index: "03",
    flip: false,
    eyebrow: "Inventario y evidencia",
    title: "Materiales, hojas y fotos conectados a cada OT.",
    body: [
      "Los técnicos registran partes y cantidades utilizadas, completan hojas tipo planilla y suben grupos de fotos de referencia o evidencia. El inventario mantiene stock, mínimo, bodega, costo y consumo.",
      "La analítica de materiales muestra alertas de stock, uso por OT, clasificación ABC y recomendaciones de reposición o layout.",
    ],
    outcomes: [
      "Partes, hojas de inventario y costos",
      "Alertas de stock mínimo",
      "Consumo por OT, activo y periodo",
    ],
    image:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2000&q=80",
    imageAlt: "Estantería de repuestos industriales etiquetados",
    imageCaption: "Plataforma · Inventario",
  },
  {
    index: "04",
    flip: true,
    eyebrow: "Reportes",
    title: "KPIs, exportaciones y evidencia lista para cobrar.",
    body: [
      "El dashboard muestra flujo de trabajo, backlog, tiempos, carga por técnico, fallas repetidas, materiales consumidos y órdenes por ubicación, sociedad o activo.",
      "Cuando necesitas cerrar el trabajo, exportas PDF, Excel o reportes programados por correo. Pangui prepara la evidencia y los datos para revisión, auditoría o cobro administrativo.",
    ],
    outcomes: [
      "KPIs en tiempo real (no esperan a fin de mes)",
      "Reportes PDF, Excel y envíos programados",
      "Datos listos para cobro administrativo",
    ],
    image:
      "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=2000&q=80",
    imageAlt: "Pantalla con un dashboard analítico industrial",
    imageCaption: "Plataforma · Analítica",
  },
];

// =============================================================
// COMPLIANCE / CHILE-SPECIFIC
// =============================================================
function Compliance() {
  const items = [
    {
      icon: FileCheck2,
      title: "Cierre administrativo",
      body: "Cada OT puede quedar documentada con evidencia, materiales, costos, PDF y Excel. Pangui deja la información lista para revisión, auditoría o cobro administrativo.",
    },
    {
      icon: ShieldCheck,
      title: "Ley 21.719 · Portal ARCO",
      body: "Portal ARCO público, política de privacidad y términos disponibles para que los titulares ejerzan sus derechos y el equipo tenga reglas claras de tratamiento de datos.",
    },
    {
      icon: Wifi,
      title: "App móvil offline",
      body: "Pensada para terreno: salas de máquinas, subterráneos y plantas sin señal. La app móvil guarda cambios localmente y sincroniza cuando vuelve la conexión.",
    },
    {
      icon: ScrollText,
      title: "Trazabilidad por OT",
      body: "Toda acción queda registrada — quién creó, quién aprobó, qué materiales se descontaron, en qué momento. Historial inmutable para auditorías internas o de cliente.",
    },
  ];

  return (
    <section
      id="cumplimiento"
      className="relative bg-white text-[var(--ink)] border-t border-[var(--hairline)]"
    >
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 py-20 md:py-32">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="max-w-[820px]"
        >
          <div className="flex items-center gap-3 mb-10">
            <span className="block h-[2px] w-10 bg-[var(--accent)]" />
            <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--accent)] font-medium">
              05 · Hecha para Chile
            </span>
          </div>
          <h2 className="font-display text-[36px] md:text-[48px] lg:text-[60px] leading-[1.02] tracking-[-0.025em] font-bold text-balance">
            Construida para operar en Chile, no traducida del inglés.
          </h2>
          <p className="mt-8 text-[16px] md:text-[17px] leading-[1.65] text-[var(--ink-2)] max-w-[640px]">
            Pangui contempla las condiciones reales del trabajo en terreno:
            edificios sin cobertura, técnicos con guantes, evidencia
            fotográfica, firmas, materiales, planillas heredadas y derechos
            de datos personales bajo la normativa chilena.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          className="mt-16 md:mt-24 grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--hairline)] border border-[var(--hairline)]"
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <motion.div
                key={it.title}
                variants={fadeUp}
                className="bg-white p-7 md:p-9 flex flex-col"
              >
                <Icon
                  size={22}
                  strokeWidth={1.4}
                  className="text-[var(--accent)] mb-8"
                />
                <h3 className="font-display text-[20px] md:text-[22px] font-semibold tracking-[-0.015em] leading-[1.2] mb-4 text-[var(--ink)]">
                  {it.title}
                </h3>
                <p className="text-[14px] leading-[1.6] text-[var(--ink-2)]">
                  {it.body}
                </p>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}


// =============================================================
// PRICING
// =============================================================
function Pricing() {
  const tiers = [
    {
      name: "Gratis",
      meta: "Cuenta base",
      price: "0",
      unit: "Cuenta administradora",
      features: [
        "Crear y gestionar tu workspace",
        "Acceso administrativo inicial",
        "Órdenes, reportes y configuración",
        "Sin tarjeta para comenzar",
      ],
      cta: "Comenzar gratis",
      href: "/registro",
      recommended: false,
    },
    {
      name: "Equipo",
      meta: "Usuarios invitados",
      price: "Por usuario",
      unit: "Cobro mensual según uso",
      features: [
        "Técnicos y jefes en app móvil",
        "Trabajo sin conexión en terreno",
        "Fotos, firmas y procedimientos",
        "Inventario, hojas y materiales",
        "Reportes PDF, Excel y programados",
      ],
      cta: "Crear cuenta",
      href: "/registro",
      recommended: true,
    },
    {
      name: "Empresa",
      meta: "Multi-sociedad",
      price: "A convenir",
      unit: "",
      features: [
        "Todo lo del plan Equipo",
        "Múltiples sociedades, lugares y activos",
        "SLA personalizado",
        "Onboarding dedicado",
        "Integración a medida",
      ],
      cta: "Hablar con ventas",
      href: "mailto:contacto@getpangui.com?subject=Plan%20Enterprise",
      recommended: false,
    },
  ];

  return (
    <section
      id="precios"
      className="relative bg-white text-[#0A0B0D] border-t border-black/10"
    >
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 py-20 md:py-32">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="grid lg:grid-cols-12 gap-10 items-end mb-16 md:mb-20"
        >
          <div className="lg:col-span-7">
            <div className="flex items-center gap-3 mb-8">
              <span className="block h-[2px] w-10 bg-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--accent)] font-medium">
                06 · Precios
              </span>
            </div>
            <h2 className="font-display text-[36px] md:text-[48px] lg:text-[56px] leading-[1.04] tracking-[-0.025em] font-bold text-balance">
              Empiezas con una cuenta administradora y sumas usuarios cuando
              tu operación los necesita.
            </h2>
          </div>
          <p className="lg:col-span-5 text-[15px] leading-[1.65] text-[#0A0B0D]/65 max-w-[440px]">
            La cuenta administradora puede comenzar gratis. El cobro comercial
            se define por usuarios invitados activos y necesidades del equipo,
            siempre antes de activar una suscripción pagada.
          </p>
        </motion.div>

        {/* Pricing table — slim 3-column, thin dividers, no shadows */}
        <div className="grid md:grid-cols-3 border-t border-black/15">
          {tiers.map((t) => (
            <motion.div
              key={t.name}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              className={[
                "flex flex-col py-10 md:py-12 px-1 md:px-8 border-b border-black/15",
                "md:border-r md:last:border-r-0 md:border-l-0",
                "md:first:pl-0 md:last:pr-0",
                t.recommended ? "is-recommended" : "",
              ].join(" ")}
            >
              <div className="flex items-baseline justify-between mb-6">
                <h3
                  className={[
                    "font-display text-[20px] md:text-[22px] font-semibold tracking-[-0.015em]",
                    t.recommended ? "pangui-underline" : "",
                  ].join(" ")}
                >
                  {t.name}
                </h3>
                <span
                  className={[
                    "font-mono text-[10px] tracking-[0.18em] uppercase",
                    t.recommended ? "text-[var(--accent)] font-medium" : "text-[#0A0B0D]/50",
                  ].join(" ")}
                >
                  {t.meta}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                {t.price !== "A convenir" && t.price !== "Por usuario" ? (
                  <>
                    <span
                      className={[
                        "font-display text-[44px] md:text-[52px] font-bold tracking-[-0.03em] leading-none",
                        t.recommended ? "text-[var(--accent)]" : "",
                      ].join(" ")}
                    >
                      ${t.price}
                    </span>
                  </>
                ) : (
                  <span className="font-display text-[28px] md:text-[32px] font-semibold tracking-[-0.02em] leading-none">
                    {t.price}
                  </span>
                )}
              </div>
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-[#0A0B0D]/55 mb-10">
                {t.unit || "Plan personalizado"}
              </p>

              <ul className="space-y-3 mb-10 flex-1">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-[14px] leading-[1.55] text-[#0A0B0D]/80"
                  >
                    <span
                      aria-hidden
                      className={[
                        "mt-[7px] block h-px w-3 shrink-0",
                        t.recommended ? "bg-[var(--accent)]" : "bg-[#0A0B0D]/40",
                      ].join(" ")}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href={t.href}
                className={[
                  "group inline-flex items-center justify-between gap-3 h-12 px-5 text-[13px] font-semibold tracking-wide transition-colors",
                  t.recommended
                    ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                    : "border border-[var(--ink)]/20 text-[var(--ink)] hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)]",
                ].join(" ")}
              >
                {t.cta}
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </a>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-[12px] text-[#0A0B0D]/50">
          Los precios finales se muestran antes de contratar. El cobro de la
          suscripción se gestiona separado de las órdenes de trabajo.
        </p>
      </div>
    </section>
  );
}

// =============================================================
// FAQ
// =============================================================
function FAQ() {
  const faqs = [
    {
      q: "¿Funciona sin conexión a internet?",
      a: "Sí, en la app móvil nativa. Los técnicos pueden registrar avances, fotos, materiales, procedimientos y firmas sin señal. Cuando recuperan conexión, los cambios se sincronizan.",
    },
    {
      q: "¿Pangui reemplaza el sistema contable?",
      a: "No por ahora. Pangui prepara la evidencia operacional, materiales, costos y reportes para el cierre administrativo; la emisión de documentos tributarios se gestiona fuera de la plataforma.",
    },
    {
      q: "¿Cómo funciona el cobro por usuario?",
      a: "La cuenta administradora puede comenzar gratis. Los usuarios invitados y condiciones comerciales se confirman antes de activar una suscripción pagada.",
    },
    {
      q: "¿Cumplen la Ley 21.719 de protección de datos?",
      a: "Pangui cuenta con política de privacidad, términos y un portal ARCO público para solicitudes de acceso, rectificación, cancelación, oposición y portabilidad. Tus datos se procesan con Supabase, Cloudflare R2 y otros proveedores declarados en la política.",
    },
    {
      q: "¿Puedo importar mis OTs históricas desde Excel?",
      a: "La plataforma trabaja con reportes PDF, Excel y hojas de inventario. Si necesitas migrar históricos, lo revisamos como parte del onboarding para definir el alcance real de la carga.",
    },
  ];

  const [open, setOpen] = useState(0);

  return (
    <section
      id="faq"
      className="relative bg-white text-[var(--ink)] border-t border-[var(--hairline)]"
    >
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 py-20 md:py-32">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.3 }}
          className="grid lg:grid-cols-12 gap-10 mb-12 md:mb-16"
        >
          <div className="lg:col-span-5 lg:sticky lg:top-28 lg:self-start">
            <div className="flex items-center gap-3 mb-8">
              <span className="block h-[2px] w-10 bg-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--accent)] font-medium">
                07 · Preguntas frecuentes
              </span>
            </div>
            <h2 className="font-display text-[36px] md:text-[44px] lg:text-[52px] leading-[1.04] tracking-[-0.025em] font-bold text-balance">
              Lo que más nos preguntan los jefes de mantención.
            </h2>
            <p className="mt-6 text-[14px] md:text-[15px] leading-[1.65] text-[var(--ink-2)] max-w-[420px]">
              Si tu pregunta no está aquí, escríbenos directo a{" "}
              <a
                href="mailto:contacto@getpangui.com"
                className="text-[var(--accent)] underline decoration-[var(--accent)] underline-offset-4 hover:decoration-2"
              >
                contacto@getpangui.com
              </a>
              . Respondemos el mismo día hábil.
            </p>
          </div>

          <div className="lg:col-span-7 lg:pt-2">
            <div className="border-t border-[var(--hairline-strong)]">
              {faqs.map((f, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className="border-b border-[var(--hairline-strong)]"
                >
                  <button
                    className="w-full flex items-start justify-between gap-6 py-6 md:py-7 text-left group"
                    onClick={() => setOpen(open === i ? -1 : i)}
                    aria-expanded={open === i}
                  >
                    <div className="flex items-start gap-4 md:gap-6 flex-1">
                      <span className="font-mono text-[12px] tracking-[0.14em] text-[var(--accent)] mt-0.5 shrink-0 w-8">
                        {String(i + 1).padStart(2, "0")}.
                      </span>
                      <span className="text-[15px] md:text-[17px] font-medium text-[var(--ink)] leading-[1.4]">
                        {f.q}
                      </span>
                    </div>
                    <span className="shrink-0 text-[var(--ink-3)] group-hover:text-[var(--ink)] transition-colors mt-1">
                      {open === i ? <Minus size={18} /> : <Plus size={18} />}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {open === i && (
                      <motion.div
                        key={`a-${i}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          duration: 0.32,
                          ease: [0.2, 0.7, 0.3, 1],
                        }}
                        className="overflow-hidden"
                      >
                        <p className="pb-7 pl-12 md:pl-14 pr-10 text-[14px] md:text-[15px] leading-[1.65] text-[var(--ink-2)] max-w-[640px]">
                          {f.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// =============================================================
// FOOTER
// =============================================================
function LandingFooter() {
  const cols = [
    {
      title: "Producto",
      links: [
        { label: "Plataforma", href: "#plataforma" },
        { label: "Cumplimiento", href: "#cumplimiento" },
        { label: "Precios", href: "#precios" },
        { label: "FAQ", href: "#faq" },
        { label: "Iniciar sesión", href: "/login" },
      ],
    },
    {
      title: "Empresa",
      links: [
        { label: "Contacto", href: "mailto:contacto@getpangui.com" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Política de privacidad", href: "/privacidad" },
        { label: "Términos de servicio", href: "/terminos" },
        { label: "Portal ARCO · Ley 21.719", href: "/arco", emphasis: true },
      ],
    },
  ];

  return (
    <footer className="bg-white text-[var(--ink)] border-t border-[var(--hairline)]">
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 pt-20 md:pt-24 pb-12">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 pb-16">
          <div className="lg:col-span-4">
            <img
              src="/logo2.svg"
              alt="Pangui"
              className="h-8 w-auto mb-6"
            />
            <p className="text-[14px] leading-[1.65] text-[var(--ink-2)] max-w-[320px]">
              Plataforma operacional para Pymes chilenas de mantención
              industrial. Desde Santiago de Chile.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <span className="block h-px w-6 bg-[var(--accent)]" />
              <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-3)]">
                Pangui SpA · 2026
              </span>
            </div>
          </div>

          <div className="lg:col-span-8 grid sm:grid-cols-3 gap-8 sm:gap-10">
            {cols.map((c) => (
              <div key={c.title}>
                <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-3)] mb-5">
                  {c.title}
                </p>
                <ul className="space-y-3">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        target={
                          l.href.startsWith("http") ? "_blank" : undefined
                        }
                        rel={
                          l.href.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        className={[
                          "text-[14px] hover:text-[var(--ink)] transition-colors",
                          l.emphasis
                            ? "text-[var(--ink)] font-medium underline underline-offset-4 decoration-[var(--accent)]/60 hover:decoration-[var(--accent)]"
                            : "text-[var(--ink-2)]",
                        ].join(" ")}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-8 border-t border-[var(--hairline)] flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <p className="text-[12px] text-[var(--ink-3)]">
            © 2026 Pangui SpA · Hecho en Chile.
          </p>
          <p className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--ink-3)]">
            v2.0 · Edición Pyme
          </p>
        </div>
      </div>
    </footer>
  );
}

// =============================================================
// MAIN PAGE
// =============================================================
export default function Landing() {
  return (
    <div className="landing-root antialiased bg-white">
      <LandingNav />
      <Hero />
      <TrustBand />
      {CAPABILITIES.map((c) => (
        <CapabilitySection key={c.index} {...c} />
      ))}
      <Compliance />
      <Pricing />
      <FAQ />
      <LandingFooter />
    </div>
  );
}
