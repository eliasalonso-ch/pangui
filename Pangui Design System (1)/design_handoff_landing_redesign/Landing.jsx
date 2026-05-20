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
import { useState, useEffect } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
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
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { label: "Plataforma", href: "#plataforma" },
    { label: "Cumplimiento", href: "#cumplimiento" },
    { label: "Precios", href: "#precios" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <header
      className={[
        "fixed top-0 left-0 right-0 z-50 transition-colors duration-300",
        scrolled
          ? "bg-white/90 backdrop-blur-md border-b border-[var(--hairline)]"
          : "bg-transparent",
      ].join(" ")}
    >
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 h-[72px] md:h-[80px] flex items-center justify-between">
        <a href="#" className="flex items-center" aria-label="Pangui — inicio">
          <img
            src="/pangui-logo.svg"
            alt="Pangui"
            className="h-5 md:h-6 w-auto"
          />
        </a>

        <nav className="hidden lg:flex items-center gap-10">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors tracking-[0.01em]"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-6">
          <Link
            href="/login"
            className="text-[13px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)] transition-colors"
          >
            Iniciar sesión
          </Link>
          <a
            href="/registro"
            className="group inline-flex items-center gap-2 text-[13px] font-semibold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] px-5 h-10 transition-colors"
          >
            Probar gratis
            <ArrowRight
              size={14}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </a>
        </div>

        <button
          className="lg:hidden p-2 text-[var(--ink)]"
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
            className="lg:hidden bg-white border-t border-[var(--hairline)] overflow-hidden"
          >
            <div className="px-5 py-6 flex flex-col gap-1">
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-[var(--ink)] font-medium py-3 border-b border-[var(--hairline)] text-[15px]"
                >
                  {l.label}
                </a>
              ))}
              <Link
                href="/login"
                className="text-[var(--ink-2)] font-medium py-3 text-[15px]"
                onClick={() => setMenuOpen(false)}
              >
                Iniciar sesión
              </Link>
              <a
                href="/registro"
                onClick={() => setMenuOpen(false)}
                className="mt-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-semibold text-center py-3 text-[14px]"
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
          <span className="block h-px w-8 bg-[var(--accent)]" />
          <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--ink-3)]">
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
            Pangui es la plataforma para Pymes chilenas de mantención: órdenes
            de trabajo, inventario, informes de terreno y facturación
            electrónica, en una sola aplicación que funciona offline.
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
              href="#demo"
              className="group inline-flex items-center gap-2 text-[14px] font-medium text-[var(--ink)] hover:text-[var(--accent)] transition-colors"
            >
              Ver demo
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
  // Replace these with real client logo SVGs once licensed.
  const logos = [
    { name: "Clínica Las Condes", short: "CLC" },
    { name: "Universidad Santo Tomás", short: "UST" },
    { name: "Servicios Técnicos RM", short: "STRM" },
    { name: "Mantenciones del Norte", short: "MDN" },
    { name: "Edificios Vitacura", short: "EV" },
    { name: "Grupo Operaciones GO", short: "GO" },
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
            Confían en Pangui
          </p>
          <div className="flex-1 grid grid-cols-3 md:grid-cols-6 gap-x-4 md:gap-x-8 gap-y-6 items-center">
            {logos.map((l) => (
              <span
                key={l.name}
                title={l.name}
                className="font-display font-semibold text-[var(--ink-3)] hover:text-[var(--ink)] transition-colors text-[18px] md:text-[20px] tracking-[-0.01em] text-center md:text-left"
              >
                {l.short}
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
              <span className="block h-px w-6 bg-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[#0A0B0D]/55">
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
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#0A0B0D]/45 shrink-0 w-8">
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
    eyebrow: "Órdenes de trabajo",
    title: "De la asignación al cierre, sin papel ni WhatsApp.",
    body: [
      "El jefe crea la OT desde el dashboard con cliente, ubicación, fecha y técnico. El técnico la recibe en su celular en segundos, acepta y sale a terreno. Todo lo registra desde el móvil — sin formularios impresos, sin grupos paralelos.",
      "Cuando vuelve, el jefe revisa el trabajo y aprueba o rechaza con un motivo. El histórico queda trazable, listo para auditoría o reclamo de cliente.",
    ],
    outcomes: [
      "Push en tiempo real al técnico asignado",
      "Aprobación o rechazo con motivo en segundos",
      "Historial completo por OT, exportable a PDF",
    ],
    image:
      "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?auto=format&fit=crop&w=2000&q=80",
    imageAlt: "Operador revisando una orden de trabajo en una tableta",
    imageCaption: "Plataforma · Órdenes de trabajo",
  },
  {
    index: "02",
    flip: true,
    eyebrow: "Informes de terreno",
    title: "Fotos antes y después. Firma digital. Una sola fuente.",
    body: [
      "Cada OT lleva un registro fotográfico antes/después almacenado en la nube, una firma digital del cliente capturada en pantalla y un detalle de materiales descontados del inventario en el mismo acto.",
      "El cliente recibe un PDF firmado al instante. La empresa conserva la evidencia íntegra — sin fotos perdidas en el celular del técnico, sin papeles que se traspapelan.",
    ],
    outcomes: [
      "Captura offline, sincronización al recuperar señal",
      "Firma digital con validación de cliente",
      "PDF de cierre listo para enviar o facturar",
    ],
    image:
      "https://images.unsplash.com/photo-1565008447742-97f6f38c985c?auto=format&fit=crop&w=2000&q=80",
    imageAlt: "Técnico documentando una intervención con su celular",
    imageCaption: "Plataforma · Informes de terreno",
  },
  {
    index: "03",
    flip: false,
    eyebrow: "Inventario",
    title: "Materiales que se descuentan solos. Stock que sí cuadra.",
    body: [
      "Cada vez que un técnico registra materiales en una OT, el stock se descuenta automáticamente. Pangui alerta cuando un ítem cae bajo el mínimo, sugiere reposición y muestra el costo real de cada trabajo.",
      "Los meses de 'inventarios perdidos' se acaban: el sistema mantiene la trazabilidad obligatoria al cerrar la OT, sin permitir saltarse el paso.",
    ],
    outcomes: [
      "Descuento automático al cerrar la OT",
      "Alertas de stock mínimo por bodega",
      "Costo real por OT visible al jefe",
    ],
    image:
      "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=2000&q=80",
    imageAlt: "Estantería de repuestos industriales etiquetados",
    imageCaption: "Plataforma · Inventario",
  },
  {
    index: "04",
    flip: true,
    eyebrow: "Analítica",
    title: "KPIs por técnico, costos por OT, reportes para el cliente.",
    body: [
      "El dashboard del jefe muestra órdenes activas, vencidas, completadas y en curso. Por técnico, por cliente, por sociedad. Filtros y vista en tiempo real — sin esperar al cierre de mes.",
      "Cuando el cliente pide un informe, se exporta en PDF o Excel con un clic. Limpio, con logo, con las fotos y firmas embebidas.",
    ],
    outcomes: [
      "KPIs en tiempo real (no esperan a fin de mes)",
      "Exportación PDF/Excel con un clic",
      "Reportes por técnico, cliente y sociedad",
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
      title: "Facturación electrónica SII",
      body: "Integración directa con SimpleFactura: emite boletas y facturas afectas/exentas desde la misma OT, con los datos ya cargados. El DTE sale el mismo día del trabajo.",
    },
    {
      icon: ShieldCheck,
      title: "Ley 21.719 · Portal ARCO",
      body: "Cumplimos la nueva normativa de protección de datos personales. Portal ARCO integrado, ROPA documentado, encargado de datos identificable y auditable.",
    },
    {
      icon: Wifi,
      title: "PWA offline-first",
      body: "Pensada para terreno: salas de máquinas, subterráneos, plantas industriales sin señal. Cada técnico opera sin conexión y los datos se sincronizan al volver.",
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
            <span className="block h-px w-6 bg-[var(--accent)]" />
            <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--ink-3)]">
              05 · Hecha para Chile
            </span>
          </div>
          <h2 className="font-display text-[36px] md:text-[48px] lg:text-[60px] leading-[1.02] tracking-[-0.025em] font-bold text-balance">
            Construida para operar en Chile, no traducida del inglés.
          </h2>
          <p className="mt-8 text-[16px] md:text-[17px] leading-[1.65] text-[var(--ink-2)] max-w-[640px]">
            Pangui contempla la regulación local —SII, Ley 21.719, IVA por
            tramo, RUT— y las condiciones reales del trabajo en terreno:
            edificios sin cobertura, técnicos con guantes, planillas
            heredadas que importar.
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
      meta: "Para evaluación",
      price: "0",
      unit: "CLP / usuario / mes",
      features: [
        "Hasta 3 usuarios",
        "Hasta 20 OT al mes",
        "App móvil completa",
        "Fotos y firma digital",
        "Soporte por email",
      ],
      cta: "Comenzar gratis",
      href: "/registro",
      recommended: false,
    },
    {
      name: "Pro",
      meta: "Recomendado",
      price: "8.000",
      unit: "CLP / usuario / mes",
      features: [
        "Pago por usuario activo",
        "OT ilimitadas",
        "Inventario y alertas de stock",
        "Facturación SimpleFactura",
        "Reportes PDF y Excel",
        "Historial y auditoría",
        "Soporte prioritario",
      ],
      cta: "Empezar prueba",
      href: "/registro",
      recommended: true,
    },
    {
      name: "Enterprise",
      meta: "Multi-sociedad",
      price: "A convenir",
      unit: "",
      features: [
        "Todo lo de Pro",
        "Múltiples sociedades y plantas",
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
              <span className="block h-px w-6 bg-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[#0A0B0D]/55">
                06 · Precios
              </span>
            </div>
            <h2 className="font-display text-[36px] md:text-[48px] lg:text-[56px] leading-[1.04] tracking-[-0.025em] font-bold text-balance">
              Pagas solo por quien usa Pangui.
            </h2>
          </div>
          <p className="lg:col-span-5 text-[15px] leading-[1.65] text-[#0A0B0D]/65 max-w-[440px]">
            Suscripción mensual por usuario activo. Sin licencias muertas, sin
            contratos a 12 meses, sin sorpresas en la factura. Empiezas gratis
            y escalas a tu ritmo.
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
                <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[#0A0B0D]/50">
                  {t.meta}
                </span>
              </div>

              <div className="flex items-baseline gap-2 mb-2">
                {t.price !== "A convenir" ? (
                  <>
                    <span className="font-display text-[44px] md:text-[52px] font-bold tracking-[-0.03em] leading-none">
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
                      className="mt-[7px] block h-px w-3 bg-[#0A0B0D]/40 shrink-0"
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
          Precios en CLP, no incluyen IVA. Facturación mensual. Cancela cuando
          quieras.
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
      a: "Sí. Pangui es una PWA offline-first. Los técnicos registran fotos, materiales y firma sin señal. Cuando recuperan conexión, todo se sincroniza en segundo plano.",
    },
    {
      q: "¿La integración con SII es real?",
      a: "Sí. Integramos con SimpleFactura para emitir DTE (boletas y facturas) directamente desde la OT. Los datos del cliente, montos y detalle ya vienen precargados.",
    },
    {
      q: "¿Cómo funciona el cobro por usuario?",
      a: "Pagas 8.000 CLP al mes por cada usuario activo. Si un usuario deja de iniciar sesión durante un ciclo, no se cobra. Puedes agregar o quitar usuarios cuando quieras desde la configuración.",
    },
    {
      q: "¿Cumplen la Ley 21.719 de protección de datos?",
      a: "Sí. Contamos con portal ARCO integrado, ROPA documentado, encargado de datos identificable y procesos de auditoría. Tus datos residen en Supabase (PostgreSQL en AWS), cifrados en reposo y en tránsito.",
    },
    {
      q: "¿Puedo importar mis OTs históricas desde Excel?",
      a: "Sí. Durante el onboarding (gratuito en Pro), el equipo de Pangui mapea tus columnas y carga el histórico. Para Enterprise incluimos migración asistida completa.",
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
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3 mb-8">
              <span className="block h-px w-6 bg-[var(--accent)]" />
              <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--ink-3)]">
                07 · Preguntas frecuentes
              </span>
            </div>
            <h2 className="font-display text-[36px] md:text-[44px] lg:text-[52px] leading-[1.04] tracking-[-0.025em] font-bold text-balance">
              Lo que más nos preguntan los jefes de mantención.
            </h2>
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
        { label: "Sobre Pangui", href: "/sobre" },
        { label: "Contacto", href: "mailto:contacto@getpangui.com" },
        { label: "WhatsApp", href: "https://wa.me/56900000000" },
        { label: "Estado del servicio", href: "/estado" },
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
              src="/pangui-logo.svg"
              alt="Pangui"
              className="h-6 w-auto mb-6"
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
