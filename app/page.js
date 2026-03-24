"use client";

import "./landing.css";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Bell,
  Camera,
  FileText,
  Package,
  BarChart2,
  CheckCircle,
  X,
  ChevronDown,
  ChevronUp,
  Smartphone,
  ArrowRight,
  Menu,
  Star,
  Shield,
  Wifi,
  MapPin,
  Clock,
  Users,
  Zap,
  Receipt,
  AlertTriangle,
  MessageSquare,
  LogIn,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

// ── Animation variants ─────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut" },
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

// ── Tema compartido con el dashboard ───────────────────────────
const THEME_KEY = "pangui_theme";
const THEME_CYCLE = ["system", "light", "dark"];
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL = { system: "Sistema", light: "Claro", dark: "Oscuro" };

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === "system") {
    html.removeAttribute("data-theme");
    localStorage.removeItem(THEME_KEY);
  } else {
    html.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
}

// ── Navbar ─────────────────────────────────────────────────────

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState("system");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark" || saved === "light") setTheme(saved);
    } catch {}
  }, []);

  function toggleTheme() {
    const idx = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
    applyTheme(next);
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-shadow duration-300 bg-brand ${
        scrolled ? "shadow-lg" : ""
      }`}
    >
      <div className="mx-auto px-4 sm:px-10 flex items-center justify-between h-[70px] md:h-[80px]">
        {/* Logo */}
        <a href="#" className="flex items-center">
          <img
            src="/pangui-logo.svg"
            alt="Pangui"
            className="w-[80px] md:w-[100px] h-auto"
          />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: "Funciones", href: "#features" },
            { label: "Precios", href: "#pricing" },
            { label: "FAQ", href: "#faq" },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="text-sm font-medium text-white/80 hover:text-white transition-colors tracking-wide"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          {(() => {
            const Icon = THEME_ICON[theme];
            return (
              <button
                onClick={toggleTheme}
                aria-label={`Tema: ${THEME_LABEL[theme]}`}
                title={`Tema: ${THEME_LABEL[theme]}`}
                className="flex items-center justify-center w-9 h-9 text-white/80 hover:text-white transition-colors bg-white/10 hover:bg-white/20 border border-white/15"
              >
                <Icon size={15} />
              </button>
            );
          })()}

          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            <LogIn size={15} />
            Iniciar sesión
          </Link>
          <a
            href="/registro"
            className="text-sm font-semibold px-5 py-2 bg-white text-brand hover:bg-brand-light transition-colors"
          >
            Prueba gratis
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-white"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menú"
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-brand-dark border-t border-white/10 overflow-hidden"
          >
            <div className="px-4 py-4 flex flex-col gap-1">
              {[
                { label: "Funciones", href: "#features" },
                { label: "Precios", href: "#pricing" },
                { label: "FAQ", href: "#faq" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-white/80 font-medium py-2.5 border-b border-white/10 text-sm"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="pt-3 flex flex-col gap-2">
                {(() => {
                  const Icon = THEME_ICON[theme];
                  return (
                    <button
                      onClick={toggleTheme}
                      className="flex items-center gap-2 text-white/70 font-medium py-1.5 text-sm text-left"
                    >
                      <Icon size={15} />
                      Tema: {THEME_LABEL[theme]}
                    </button>
                  );
                })()}
                <Link
                  href="/login"
                  className="inline-flex items-center gap-1.5 text-white/70 font-medium py-1 text-sm"
                >
                  <LogIn size={14} />
                  Iniciar sesión
                </Link>
                <a
                  href="/registro"
                  className="bg-white text-brand font-semibold text-center py-2.5"
                  onClick={() => setMenuOpen(false)}
                >
                  Prueba gratis 30 días
                </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ── Hero ───────────────────────────────────────────────────────

function Hero() {
  return (
    <section
      className="relative min-h-screen flex items-center pt-[70px] md:pt-[80px] overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, #0a0f1e 0%, #0d1530 50%, #0a1628 100%)",
      }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(39,61,136,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(39,61,136,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Glow blobs */}
      <div
        className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #273D88, transparent)" }}
      />
      <div
        className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-8"
        style={{ background: "radial-gradient(circle, #10b981, transparent)" }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 lg:py-32 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="text-left"
          >
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 px-3 py-1 border-l-4 border-brand-light bg-brand/20 text-brand-light text-xs font-semibold uppercase tracking-widest mb-8">
                <MapPin size={11} />
                Hecha en Chile para dueños de mantención como tú
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight mb-6 tracking-tight"
            >
              ¿Cansado de perder plata por mantenciones desorganizadas?
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="text-lg text-slate-300 mb-8 max-w-lg"
            >
              Recupera 20-40% de margen perdido en materiales "olvidados",
              tiempo de coordinación y facturas que tardan semanas. Asigna OT
              con push, controla stock automático, exporta informes el
              mismo día y duerme tranquilo.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="flex flex-col sm:flex-row gap-3 justify-start"
            >
              <a
                href="/registro"
                className="btn-glow inline-flex items-center justify-center gap-2 px-7 py-4 bg-white hover:bg-brand-light text-brand font-bold transition-all text-base"
              >
                Prueba gratis 30 días
                <ArrowRight size={18} />
              </a>
              <a
                href="https://wa.me/56900000000?text=Hola,%20quiero%20ver%20una%20demo%20de%20Pangui"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 border border-white/30 text-white hover:bg-white/10 font-semibold transition-all text-base"
              >
                <MessageSquare size={18} />
                Hablar con un experto
              </a>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap gap-4 justify-start text-sm text-slate-400"
            >
              {[
                "Sin tarjeta de crédito",
                "Recupera inversión en semanas",
                "Cancela cuando quieras",
              ].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <CheckCircle size={14} className="text-accent" />
                  {t}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Device mockup */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease: "easeOut" }}
            className="flex justify-center lg:justify-end"
          >
            <img
              src="/iphone-mockup.png"
              alt="Pangui en móvil"
              className="h-auto object-contain drop-shadow-2xl"
              style={{ maxHeight: "700px", width: "auto", maxWidth: "480px" }}
            />
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-14 lg:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-0 pt-8 border-t border-slate-700"
        >
          {[
            { value: "−30-50%", label: "Pérdidas en materiales" },
            { value: "+20-40%", label: "Margen recuperado" },
            { value: "Mismo día", label: "Facturación real" },
            { value: "Offline", label: "Funciona sin señal" },
          ].map((s) => (
            <div
              key={s.label}
              className="text-center sm:border-r sm:border-slate-700 sm:last:border-r-0 sm:pr-8 sm:pl-8 sm:first:pl-0"
            >
              <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight">
                {s.value}
              </p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">
                {s.label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Problem / Solution ─────────────────────────────────────────

function ProblemSolution() {
  const before = [
    "Materiales que 'desaparecen' → pierdes 1-3 millones al año",
    "Facturas que salen 30-60 días después → flujo de caja eternamente apretado",
    "Grupos de WhatsApp infinitos → terminas apagando incendios tú mismo",
    "Excel que se sobreescribe → no sabes cuánto estás ganando realmente",
    "Técnicos sin control → retrasos y reclamos de clientes",
    "Jefe que no te informa → tú eres el bombero 24/7",
  ];
  const after = [
    "Stock se descuenta automático → sabes dónde está cada peso",
    "DTE emitido desde la OT → facturas el mismo día y cobras más rápido",
    "Push y dashboard en tiempo real → control total sin llamadas",
    "Reportes claros de costos y rentabilidad → ves el negocio real",
    "Fotos, firma y checklist → trabajos profesionales y trazables",
    "Tu equipo adopta fácil → menos estrés para ti y para ellos",
  ];

  return (
    <section className="py-24 sm:py-32" style={{ background: "#f8fafc" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="block text-xs font-bold text-brand uppercase tracking-widest border-l-4 border-brand pl-3 mb-6">
            El problema que te está costando plata
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight tracking-tight mb-4">
            ¿Cuánto estás perdiendo al mes sin darte cuenta?
          </h2>
          <p className="text-slate-500 max-w-xl">
            La mayoría de empresas de mantención en Chile pierde margen por
            desorganización. Con Pangui recuperas control y dinero real.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-0 border border-slate-200">
          {/* Before */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="p-8 sm:p-10 border-b md:border-b-0 md:border-r border-slate-200"
          >
            <div className="flex items-center gap-3 mb-8">
              <AlertTriangle size={20} className="text-red-500" />
              <h3 className="font-black text-slate-800 text-xl tracking-tight">
                Sin Pangui
              </h3>
            </div>
            <ul className="space-y-4">
              {before.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-slate-600 text-sm border-b border-slate-100 pb-4 last:border-b-0 last:pb-0"
                >
                  <X size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* After */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="p-8 sm:p-10 bg-brand"
          >
            <div className="flex items-center gap-3 mb-8">
              <CheckCircle size={20} className="text-brand-light" />
              <h3 className="font-black text-white text-xl tracking-tight">
                Con Pangui
              </h3>
            </div>
            <ul className="space-y-4">
              {after.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-blue-100 text-sm border-b border-white/10 pb-4 last:border-b-0 last:pb-0"
                >
                  <CheckCircle
                    size={15}
                    className="text-brand-light mt-0.5 flex-shrink-0"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── Features ───────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Receipt,
    title: "Reportes PDF y Excel en 1 clic",
    desc: "Exporta órdenes, historial de activos y stock directo desde la app. Comparte con gerencia o auditorías al instante.",
    color: "bg-orange-100 text-orange-600",
  },
  {
    icon: Package,
    title: "Inventario inteligente que no miente",
    desc: "Stock se descuenta automático al cerrar OT. Alertas push cuando queda poco. Nunca más materiales 'perdidos' que te cuestan millones.",
    color: "bg-yellow-100 text-yellow-600",
  },
  {
    icon: BarChart2,
    title: "Reportes reales de rentabilidad",
    desc: "Exporta costos por técnico, margen por trabajo y clientes top. Sabes exactamente dónde estás ganando y dónde pierdes.",
    color: "bg-sky-100 text-sky-600",
  },
  {
    icon: Bell,
    title: "Push y asignación en tiempo real",
    desc: "Tu jefe asigna OT con un clic y el técnico recibe push instantáneo. Menos llamadas, menos retrasos, más trabajos al mes.",
    color: "bg-brand/10 text-brand",
  },
  {
    icon: Camera,
    title: "Ejecución profesional desde el celular",
    desc: "Fotos antes/después, firma digital y checklist. Trabajos trazables y clientes más satisfechos que pagan más rápido.",
    color: "bg-purple-100 text-purple-600",
  },
  {
    icon: CheckCircle,
    title: "Aprobación rápida con motivo",
    desc: "Revisa y aprueba/rechaza en segundos. El técnico corrige sin dramas. Todo queda registrado para auditoría.",
    color: "bg-accent/10 text-accent",
  },
];

function FeatureRow({ icon: Icon, title, desc, color, index }) {
  return (
    <motion.div
      variants={fadeUp}
      className="flex gap-5 sm:gap-8 py-8 sm:py-10 border-b border-slate-200 last:border-b-0 items-start"
    >
      <div
        className={`w-11 h-11 sm:w-13 sm:h-13 ${color} flex items-center justify-center flex-shrink-0`}
      >
        <Icon size={20} />
      </div>
      <div>
        <h3 className="font-bold text-slate-900 text-lg sm:text-xl mb-2">
          {title}
        </h3>
        <p className="text-slate-500 leading-relaxed">{desc}</p>
        <a
          href="/registro"
          className="inline-flex items-center gap-1.5 text-brand text-sm font-semibold mt-4 hover:gap-2.5 transition-all"
        >
          Ver cómo implementarlo <ArrowRight size={14} />
        </a>
      </div>
    </motion.div>
  );
}

function Features() {
  return (
    <section id="features" className="py-24 sm:py-32 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-10 lg:gap-24">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="lg:sticky lg:top-24 lg:self-start pb-2"
          >
            <span className="block text-xs font-bold text-brand uppercase tracking-widest border-l-4 border-brand pl-3 mb-6">
              Lo que recupera tu margen
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight mb-4 tracking-tight">
              Control total. Más plata en el bolsillo.
            </h2>
            <p className="text-slate-500 leading-relaxed">
              Diseñado para que tú (el dueño) veas los números reales, tu jefe
              coordine sin caos y tus técnicos trabajen profesionalmente.
            </p>
            <a
              href="/registro"
              className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
            >
              Implementa en tu empresa <ArrowRight size={16} />
            </a>
          </motion.div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
          >
            {FEATURES.map((f, i) => (
              <FeatureRow key={f.title} {...f} index={i} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── How it works ───────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    icon: Zap,
    title: "Creas o tu jefe crea la OT en segundos",
    desc: "Desde el dashboard: cliente, ubicación, descripción, técnico asignado. Listo en menos de un minuto.",
  },
  {
    num: "02",
    icon: Bell,
    title: "El técnico recibe push y sale a terreno",
    desc: "Notificación instantánea en su celular. Acepta y va. Sin llamadas ni WhatsApp.",
  },
  {
    num: "03",
    icon: Camera,
    title: "Registro completo: fotos, firma y materiales",
    desc: "En terreno registra todo desde la app offline. Firma digital del cliente y stock se descuenta solo.",
  },
  {
    num: "04",
    icon: Receipt,
    title: "Apruebas y cierras en 1 clic",
    desc: "Revisa, apruebas o rechazas. Cierra la OT, exporta el informe y compártelo. Todo en segundos.",
  },
];

function HowItWorks() {
  return (
    <section className="py-24 sm:py-32" style={{ background: "#f8fafc" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="block text-xs font-bold text-brand uppercase tracking-widest border-l-4 border-brand pl-3 mb-6">
            Del caos a la plata en 4 pasos
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight tracking-tight">
            Implementa y empieza a ver resultados en semanas
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200"
        >
          {STEPS.map((step) => (
            <motion.div
              key={step.num}
              variants={fadeUp}
              className="relative p-7 sm:p-8 overflow-hidden group bg-[#f8fafc]"
            >
              <span className="absolute -bottom-4 -right-2 text-[7rem] font-black text-slate-100 select-none leading-none group-hover:text-brand/10 transition-colors">
                {step.num.slice(-1)}
              </span>
              <div className="relative z-10">
                <div className="w-12 h-12 bg-brand flex items-center justify-center mb-6">
                  <step.icon size={22} className="text-white" />
                </div>
                <h3 className="font-bold text-slate-900 mb-3 text-base leading-snug">
                  {step.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote:
      "Antes perdía fácil 1.5–2 millones al año en materiales que 'se olvidaban'. Hoy controlo stock en tiempo real y facturo el mismo día. Impagable.",
    name: "Carlos Sepúlveda",
    role: "Dueño",
    company: "Mantenciones Industriales CS",
    stars: 5,
    initials: "CS",
    color: "bg-brand",
  },
  {
    quote:
      "Mi flujo de caja estaba eterno por facturas atrasadas. Ahora emito DTE desde la OT y cobro mucho más rápido. El equipo lo adoptó en días.",
    name: "María Rodríguez",
    role: "Gerenta General",
    company: "Servicios Técnicos RM",
    stars: 5,
    initials: "MR",
    color: "bg-purple-500",
  },
  {
    quote:
      "Dejé de ser el bombero 24/7. Mi jefe coordina todo, yo veo reportes reales de rentabilidad y duermo tranquilo. Recuperé margen en el primer mes.",
    name: "Rodrigo Muñoz",
    role: "Dueño",
    company: "Mantención Edificios y Condominios",
    stars: 5,
    initials: "RM",
    color: "bg-accent",
  },
];

function Testimonials() {
  return (
    <section className="py-24 sm:py-32 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="block text-xs font-bold text-brand uppercase tracking-widest border-l-4 border-brand pl-3 mb-6">
            Lo dicen los dueños que ya lo viven
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight tracking-tight">
            Resultados reales en sus empresas
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200"
        >
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              variants={fadeUp}
              className={`bg-white p-7 sm:p-8 relative overflow-hidden ${i === TESTIMONIALS.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""}`}
            >
              <span className="absolute -top-4 -left-2 text-[8rem] font-black text-slate-100 select-none leading-none">
                &ldquo;
              </span>
              <div className="relative z-10">
                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className="text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-slate-700 text-sm leading-relaxed mb-8">
                  {t.quote}
                </p>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div
                    className={`w-10 h-10 ${t.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                      {t.role} · {t.company}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Trust Signals ──────────────────────────────────────────────

function TrustSignals() {
  const signals = [
    {
      icon: MapPin,
      label: "Hecha en Chile",
      sub: "Pensada y diseñada para dueños de mantención como tú",
    },
    {
      icon: Shield,
      label: "Cumple Ley 21.719",
      sub: "Portal ARCO integrado para tranquilidad tuya y de tus clientes",
    },
    {
      icon: Wifi,
      label: "Offline first",
      sub: "Tus técnicos trabajan sin señal y todo sincroniza después",
    },
    {
      icon: Smartphone,
      label: "PWA instalable",
      sub: "Como app nativa en cualquier celular, sin App Store",
    },
  ];

  return (
    <section className="py-0 bg-brand border-y border-brand-dark">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-brand-dark"
        >
          {signals.map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              className="flex items-center gap-3 sm:gap-4 p-5 sm:p-8 bg-brand"
            >
              <s.icon size={22} className="text-brand-light flex-shrink-0" />
              <div>
                <p className="font-bold text-white text-sm">{s.label}</p>
                <p className="text-blue-200 text-xs mt-0.5 leading-snug">
                  {s.sub}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Pricing ────────────────────────────────────────────────────

const PLANS = [
  {
    name: "Gratis",
    price: "0",
    period: "30 días de prueba real",
    desc: "Prueba todo sin riesgo. Ideal para ver si recuperas plata desde el día 1.",
    featured: false,
    items: [
      "1 técnico incluido",
      "Hasta 50 OT al mes",
      "App móvil completa + offline",
      "Fotos, firma y materiales",
      "Notificaciones push",
      "Soporte básico",
    ],
    cta: "Comenzar prueba gratis",
    href: "/registro",
  },
  {
    name: "Pro",
    price: "29.990",
    period: "CLP / mes",
    desc: "Recupera la inversión en semanas con más facturas rápidas y menos pérdidas.",
    featured: true,
    items: [
      "Técnicos ilimitados",
      "OT ilimitadas",
      "Inventario + alertas stock",
      "Exportación PDF y Excel",
      "Reportes de rentabilidad y costos",
      "Historial y auditoría",
      "Soporte prioritario",
    ],
    cta: "Empezar ahora",
    href: "/registro",
  },
  {
    name: "Enterprise",
    price: "A convenir",
    period: "",
    desc: "Para empresas con varias cuadrillas o múltiples faenas.",
    featured: false,
    items: [
      "Todo lo de Pro",
      "Múltiples plantas / sedes",
      "Usuarios admin ilimitados",
      "SLA y soporte dedicado",
      "Onboarding personalizado",
      "Integraciones a medida",
    ],
    cta: "Hablar con ventas",
    href: "https://wa.me/56900000000?text=Quiero%20Enterprise%20de%20Pangui",
  },
];

function PricingCard({
  name,
  price,
  period,
  desc,
  featured,
  items,
  cta,
  href,
}) {
  return (
    <motion.div
      variants={fadeUp}
      className={`p-6 sm:p-8 flex flex-col ${
        featured
          ? "bg-brand text-white border-t-4 border-accent"
          : "bg-white border-t-4 border-transparent"
      }`}
    >
      {featured && (
        <div className="inline-block mb-3 bg-accent text-white text-xs font-bold px-3 py-1 self-start">
          Más popular
        </div>
      )}
      <div className="mb-6">
        <h3
          className={`font-bold text-lg mb-1 ${featured ? "text-white" : "text-slate-900"}`}
        >
          {name}
        </h3>
        <p
          className={`text-sm mb-4 ${featured ? "text-blue-100" : "text-slate-500"}`}
        >
          {desc}
        </p>
        <div className="flex items-end gap-1">
          {price !== "A convenir" ? (
            <>
              <span
                className={`text-3xl sm:text-4xl font-bold ${featured ? "text-white" : "text-slate-900"}`}
              >
                ${price}
              </span>
              <span
                className={`text-sm pb-1 ${featured ? "text-blue-100" : "text-slate-400"}`}
              >
                {period}
              </span>
            </>
          ) : (
            <span
              className={`text-2xl font-bold ${featured ? "text-white" : "text-slate-900"}`}
            >
              {price}
            </span>
          )}
        </div>
      </div>

      <ul className="space-y-2.5 mb-8 flex-1">
        {items.map((item) => (
          <li
            key={item}
            className={`flex items-center gap-2.5 text-sm ${featured ? "text-blue-50" : "text-slate-600"}`}
          >
            <CheckCircle
              size={15}
              className={featured ? "text-blue-200" : "text-accent"}
            />
            {item}
          </li>
        ))}
      </ul>

      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className={`w-full text-center py-3 font-semibold text-sm transition-all ${
          featured
            ? "bg-white text-brand hover:bg-brand-light"
            : "bg-brand text-white hover:bg-brand-dark"
        }`}
      >
        {cta}
      </a>
    </motion.div>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24 sm:py-32 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="block text-xs font-bold text-brand uppercase tracking-widest border-l-4 border-brand pl-3 mb-6">
            Precios que se pagan solos
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight tracking-tight mb-4">
            Simple. Transparente. Rentable.
          </h2>
          <p className="text-slate-500 max-w-lg">
            Empieza gratis. Cuando veas cuánto recuperas en margen y flujo, el
            precio se paga solo.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid sm:grid-cols-3 gap-px bg-slate-200 items-start"
        >
          {PLANS.map((plan) => (
            <PricingCard key={plan.name} {...plan} />
          ))}
        </motion.div>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center text-slate-400 text-sm mt-8"
        >
          Todos los precios incluyen IVA. Facturación mensual. Cancela cuando
          quieras. Recupera la inversión con 2-3 facturas más rápidas al mes.
        </motion.p>
      </div>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "¿Funciona sin conexión a internet?",
    a: "Sí. Es offline-first. Tus técnicos registran fotos, materiales y firma sin señal. Todo sincroniza cuando vuelven a tener conexión.",
  },
  {
    q: "¿Puedo exportar informes y compartirlos con mi equipo?",
    a: "Sí. Exporta cualquier OT, historial de activos o reporte de stock en PDF o Excel con un clic. Listo para enviar a gerencia o auditorías.",
  },
  {
    q: "¿Cuántos técnicos puedo tener en Pro?",
    a: "Ilimitados. Precio fijo mensual sin importar cuántos técnicos o usuarios tengas. Ideal para empresas en crecimiento.",
  },
  {
    q: "¿Mis datos y los de mis clientes están seguros?",
    a: "Sí. Supabase en AWS con cifrado, TLS y cumplimiento Ley 21.719. Portal ARCO integrado para solicitudes de datos.",
  },
  {
    q: "¿Puedo usar Pangui en cualquier celular?",
    a: "Sí. PWA instalable desde Safari/Chrome. Funciona como app nativa en iOS y Android, con push y offline.",
  },
];

function FAQ() {
  const [open, setOpen] = useState(null);

  return (
    <section
      id="faq"
      className="py-24 sm:py-32"
      style={{ background: "#f8fafc" }}
    >
      <div className="max-w-3xl mx-auto px-4 sm:px-8">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="block text-xs font-bold text-brand uppercase tracking-widest border-l-4 border-brand pl-3 mb-6">
            Preguntas frecuentes
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 leading-tight tracking-tight">
            Lo que más preguntan los dueños
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="space-y-3"
        >
          {FAQS.map((faq, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className="border-b border-slate-200"
            >
              <button
                className="w-full flex items-center justify-between gap-4 py-5 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-semibold text-slate-900 text-sm sm:text-base">
                  {faq.q}
                </span>
                {open === i ? (
                  <ChevronUp size={18} className="text-brand flex-shrink-0" />
                ) : (
                  <ChevronDown
                    size={18}
                    className="text-slate-400 flex-shrink-0"
                  />
                )}
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <p className="pb-5 text-slate-500 text-sm leading-relaxed">
                      {faq.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

// ── Final CTA ──────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section
      id="cta"
      className="py-20 sm:py-28 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0a0f1e 0%, #0d1530 100%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(39,61,136,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(39,61,136,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.span
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-3 py-1 border-l-4 border-brand-light bg-white/10 text-brand-light text-xs font-bold uppercase tracking-widest mb-8"
          >
            30 días gratis – sin tarjeta – sin riesgo
          </motion.span>

          <motion.h2
            variants={fadeUp}
            className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4 leading-tight tracking-tight"
          >
            Deja de apagar incendios. Empieza a ganar más con cada mantención.
          </motion.h2>

          <motion.p variants={fadeUp} className="text-slate-300 mb-10 text-lg">
            Prueba Pangui 30 días sin límites. Ve cuánto recuperas en margen,
            flujo y tiempo. Implementa en tu equipo y recupera control real.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/registro"
              className="px-8 py-4 bg-white text-brand font-bold transition-colors whitespace-nowrap text-sm inline-flex items-center justify-center gap-2 hover:bg-brand-light"
            >
              Crear cuenta gratis
            </Link>
            <Link
              href="/login"
              className="px-8 py-4 border border-white/30 text-white font-semibold transition-colors whitespace-nowrap text-sm inline-flex items-center justify-center gap-2 hover:bg-white/10"
            >
              Ya tengo cuenta
            </Link>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-6">
            <span className="text-slate-400 text-sm">
              ¿Prefieres hablar antes?{" "}
            </span>
            <a
              href="https://wa.me/56900000000?text=Hola,%20quiero%20recuperar%20margen%20con%20Pangui"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent font-semibold text-sm hover:text-accent-dark"
            >
              Escríbenos por WhatsApp →
            </a>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="bg-slate-950 text-slate-400 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-12 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <img
                src="/pangui-logo-white.svg"
                alt="Pangui"
                className="h-7 w-auto"
              />
            </div>
            <p className="text-sm leading-relaxed">
              Gestión de órdenes de trabajo para dueños de mantención en Chile.
              Recupera margen, flujo y control.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Producto</p>
            <ul className="space-y-2 text-sm list-none">
              {[
                { label: "Funciones", href: "#features" },
                { label: "Precios", href: "#pricing" },
                { label: "FAQ", href: "#faq" },
                { label: "Iniciar sesión", href: "/login" },
              ].map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="hover:text-white transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Legal</p>
            <ul className="space-y-2 text-sm list-none">
              {[
                { label: "Política de privacidad", href: "/privacidad" },
                { label: "Términos de servicio", href: "/terminos" },
                { label: "Portal ARCO (Ley 21.719)", href: "/arco" },
              ].map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="hover:text-white transition-colors"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Contacto</p>
            <ul className="space-y-2 text-sm list-none">
              <li>
                <a
                  href="https://wa.me/56900000000"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  WhatsApp
                </a>
              </li>
              <li>
                <a
                  href="mailto:hola@pangui.cl"
                  className="hover:text-white transition-colors"
                >
                  hola@pangui.cl
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs">
            © 2026 Pangui. Hecho en Chile con ♥ para dueños de mantención que
            quieren recuperar plata y control.
          </p>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
              <MapPin size={10} />
              Coronel / Santiago
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
              <Shield size={10} />
              Ley 21.719
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Page ───────────────────────────────────────────────────────

export default function LandingPage() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) window.location.replace("/login");
  }, []);

  return (
    <div className="landing-root">
      <LandingNav />
      <Hero />
      <ProblemSolution />
      <Features />
      <HowItWorks />
      <Testimonials />
      <TrustSignals />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <LandingFooter />
    </div>
  );
}
