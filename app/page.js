"use client";

import "./landing.css";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Bell, Camera, FileText, Package, BarChart2, CheckCircle,
  X, ChevronDown, ChevronUp, Smartphone, ArrowRight,
  Menu, Star, Shield, Wifi, MapPin, Clock, Users, Zap,
  Receipt, AlertTriangle, MessageSquare,
} from "lucide-react";

// ── Animation variants ─────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

// ── PWA Guard ──────────────────────────────────────────────────

function PWAGuard() {
  const router = useRouter();
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) router.replace("/login");
  }, [router]);
  return null;
}

// ── Navbar ─────────────────────────────────────────────────────

function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-white shadow-sm border-b border-slate-100" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16 sm:h-18">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span
            className={`font-bold text-lg transition-colors ${
              scrolled ? "text-slate-900" : "text-white"
            }`}
          >
            Pangui
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {[
            { label: "Funciones", href: "#features" },
            { label: "Precios", href: "#pricing" },
            { label: "FAQ", href: "#faq" },
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`text-sm font-medium transition-colors hover:text-brand ${
                scrolled ? "text-slate-600" : "text-slate-200"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
              scrolled
                ? "text-slate-600 hover:bg-slate-100"
                : "text-slate-200 hover:text-white hover:bg-white/10"
            }`}
          >
            Iniciar sesión
          </Link>
          <a
            href="#cta"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white transition-colors"
          >
            Prueba gratis
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className={`md:hidden p-2 transition-colors ${
            scrolled ? "text-slate-700" : "text-white"
          }`}
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
            className="md:hidden bg-white border-t border-slate-100 overflow-hidden"
          >
            <div className="px-4 py-4 flex flex-col gap-3">
              {[
                { label: "Funciones", href: "#features" },
                { label: "Precios", href: "#pricing" },
                { label: "FAQ", href: "#faq" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-slate-700 font-medium py-1"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <hr className="border-slate-100" />
              <Link href="/login" className="text-slate-600 font-medium py-1">
                Iniciar sesión
              </Link>
              <a
                href="#cta"
                className="bg-brand text-white font-semibold text-center py-2.5 rounded-lg"
                onClick={() => setMenuOpen(false)}
              >
                Prueba gratis 60 días
              </a>
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
      className="relative min-h-screen flex items-center pt-16 overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0f1e 0%, #0d1530 50%, #0a1628 100%)" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,102,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,102,255,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      {/* Glow blobs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #0066ff, transparent)" }} />
      <div className="absolute bottom-1/3 right-1/4 w-48 h-48 rounded-full opacity-8" style={{ background: "radial-gradient(circle, #10b981, transparent)" }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 lg:py-32 w-full">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="text-center lg:text-left"
          >
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-semibold mb-6">
                <MapPin size={12} />
                Hecha en Chile para pymes chilenas
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6"
            >
              Deja de coordinar mantenciones{" "}
              <span className="gradient-text">por WhatsApp.</span>
            </motion.h1>

            <motion.p variants={fadeUp} className="text-lg text-slate-300 mb-8 max-w-lg mx-auto lg:mx-0">
              Asigna órdenes de trabajo con push en tiempo real, captura fotos,
              firma digital y materiales en terreno, y factura con SimpleFactura
              en 1 clic.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
            >
              <a
                href="#cta"
                className="btn-glow inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-brand hover:bg-brand-dark text-white font-semibold rounded-xl transition-all text-base"
              >
                Prueba gratis 60 días
                <ArrowRight size={18} />
              </a>
              <a
                href="https://wa.me/56900000000?text=Hola,%20quiero%20ver%20una%20demo%20de%20Pangui"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-accent/50 text-accent hover:bg-accent/10 font-semibold rounded-xl transition-all text-base"
              >
                <MessageSquare size={18} />
                Ver demo por WhatsApp
              </a>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap gap-4 justify-center lg:justify-start text-sm text-slate-400"
            >
              {["Sin tarjeta de crédito", "Soporte en español", "Cancela cuando quieras"].map((t) => (
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
            <div className="relative">
              {/* Desktop card */}
              <div
                className="hidden sm:block absolute -left-8 top-6 w-64 rounded-2xl p-4 shadow-2xl"
                style={{ background: "linear-gradient(135deg, #1e293b, #0f172a)", border: "1px solid #334155" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-xs text-slate-400 font-medium">Dashboard Jefe</span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "OT Hoy", value: "12", color: "text-brand" },
                    { label: "Completadas", value: "9", color: "text-accent" },
                    { label: "En terreno", value: "3", color: "text-yellow-400" },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between items-center">
                      <span className="text-xs text-slate-400">{s.label}</span>
                      <span className={`text-sm font-bold ${s.color}`}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mobile device */}
              <div className="device-mockup w-60 sm:w-64 mx-auto">
                <div className="device-notch" />
                <div className="px-4 pb-6 pt-2 space-y-3" style={{ background: "#f8fafc" }}>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs font-bold text-slate-800">Mis órdenes</span>
                    <span className="text-xs bg-brand text-white px-2 py-0.5 rounded-full">3 nuevas</span>
                  </div>
                  {[
                    { id: "OT-081", desc: "Cambio luminaria — Piso 3", estado: "Urgente", color: "bg-red-500" },
                    { id: "OT-082", desc: "Revisión UPS servidor", estado: "Normal", color: "bg-brand" },
                    { id: "OT-083", desc: "Mantención tablero eléctrico", estado: "Completada", color: "bg-accent" },
                  ].map((ot) => (
                    <div key={ot.id} className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{ot.id}</p>
                          <p className="text-xs text-slate-500 mt-0.5 leading-tight">{ot.desc}</p>
                        </div>
                        <span className={`${ot.color} text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap font-medium`}>
                          {ot.estado}
                        </span>
                      </div>
                    </div>
                  ))}
                  {/* Notification bubble */}
                  <div className="bg-brand/10 border border-brand/20 rounded-xl p-3 flex items-center gap-2">
                    <Bell size={14} className="text-brand flex-shrink-0" />
                    <p className="text-xs text-brand font-medium">Nueva OT asignada por jefe</p>
                  </div>
                </div>
              </div>

              {/* Notification badge */}
              <div
                className="absolute -right-4 bottom-16 bg-accent text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg"
                style={{ whiteSpace: "nowrap" }}
              >
                ✓ Firmado en terreno
              </div>
            </div>
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-16 lg:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 border-t border-slate-800"
        >
          {[
            { value: "−70%", label: "Tiempo coordinando" },
            { value: "100%", label: "OT trazables" },
            { value: "1 clic", label: "Para facturar" },
            { value: "Offline", label: "Funciona sin señal" },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl sm:text-3xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-slate-400 mt-1">{s.label}</p>
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
    "Grupos de WhatsApp que nadie lee a tiempo",
    "Excel compartido que se sobreescribe solo",
    "Fotos en el celular del técnico, sin respaldo",
    "Materiales que 'se pierden' en cada trabajo",
    "Facturas que salen 30 días después del trabajo",
    "Jefe no sabe en tiempo real qué está pasando",
  ];
  const after = [
    "Push instantáneo al técnico asignado",
    "Dashboard en tiempo real para el jefe",
    "Fotos antes/después en la nube, por OT",
    "Stock se descuenta automáticamente",
    "DTE emitido desde la OT, mismo día",
    "Aprobación o rechazo con motivo en segundos",
  ];

  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-sm font-semibold text-brand uppercase tracking-wider">El problema</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3 mb-4">
            ¿Te suena familiar?
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            Así trabajan la mayoría de los equipos de mantención hoy. Con Pangui, así dejan de trabajar.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6 lg:gap-10">
          {/* Before */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="rounded-2xl border border-red-100 bg-red-50/50 p-6 sm:p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Sin Pangui</h3>
            </div>
            <ul className="space-y-3">
              {before.map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-600 text-sm">
                  <X size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
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
            className="rounded-2xl border border-accent/20 bg-accent/5 p-6 sm:p-8"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
                <CheckCircle size={20} className="text-accent" />
              </div>
              <h3 className="font-bold text-slate-800 text-lg">Con Pangui</h3>
            </div>
            <ul className="space-y-3">
              {after.map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-600 text-sm">
                  <CheckCircle size={16} className="text-accent mt-0.5 flex-shrink-0" />
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
    icon: Bell,
    title: "Push en tiempo real",
    desc: "El técnico recibe la OT en su celular en segundos. Sin llamadas, sin WhatsApp. Solo acepta y va.",
    color: "bg-brand/10 text-brand",
  },
  {
    icon: Camera,
    title: "Ejecución móvil completa",
    desc: "Fotos antes/después, firma digital del cliente y registro de materiales. Todo desde el celular, sin papel.",
    color: "bg-purple-100 text-purple-600",
  },
  {
    icon: CheckCircle,
    title: "Revisión y rechazo con motivo",
    desc: "El jefe aprueba o rechaza al instante. Si rechaza, el técnico ve el motivo y corrige sin llamadas.",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: Receipt,
    title: "Facturación con SimpleFactura",
    desc: "Emite DTE directamente desde la OT. Todos los datos ya están listos. Factura el mismo día del trabajo.",
    color: "bg-orange-100 text-orange-600",
  },
  {
    icon: Package,
    title: "Inventario inteligente",
    desc: "El stock se descuenta automático al cerrar la OT. Alertas push cuando queda poco. Nunca más materiales perdidos.",
    color: "bg-yellow-100 text-yellow-600",
  },
  {
    icon: BarChart2,
    title: "Reportes PDF y Excel",
    desc: "Exporta historial de OT, costos por técnico y materiales para tus clientes con un clic.",
    color: "bg-sky-100 text-sky-600",
  },
];

function FeatureCard({ icon: Icon, title, desc, color }) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center mb-4`}>
        <Icon size={22} />
      </div>
      <h3 className="font-bold text-slate-900 mb-2 text-base">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </motion.div>
  );
}

function Features() {
  return (
    <section id="features" className="py-20 sm:py-28" style={{ background: "#f8fafc" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-sm font-semibold text-brand uppercase tracking-wider">Funcionalidades</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Todo lo que necesitas, nada que no
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto">
            Diseñado para que jefes y técnicos trabajen en sintonía, desde la asignación hasta la factura.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </motion.div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <a href="#cta" className="inline-flex items-center gap-2 text-brand font-semibold hover:gap-3 transition-all">
            Ver todas las funciones <ArrowRight size={16} />
          </a>
        </motion.div>
      </div>
    </section>
  );
}

// ── How it works ───────────────────────────────────────────────

const STEPS = [
  {
    num: "01",
    icon: Zap,
    title: "Jefe crea la OT en segundos",
    desc: "Desde el dashboard, completa la orden con ubicación, descripción y técnico asignado. En menos de un minuto.",
  },
  {
    num: "02",
    icon: Bell,
    title: "Técnico recibe push al instante",
    desc: "El técnico ve la OT en su celular con todos los detalles. Acepta y sale a terreno.",
  },
  {
    num: "03",
    icon: Camera,
    title: "Ejecución con fotos, firma y materiales",
    desc: "En terreno, el técnico registra fotos antes/después, captura la firma del cliente y anota los materiales usados.",
  },
  {
    num: "04",
    icon: Receipt,
    title: "Jefe revisa, aprueba y factura",
    desc: "Con un clic el jefe aprueba la OT. Con otro clic, emite la factura en SimpleFactura. Mismo día.",
  },
];

function HowItWorks() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-sm font-semibold text-brand uppercase tracking-wider">Cómo funciona</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Del caos a la factura en 4 pasos
          </h2>
        </motion.div>

        <div className="relative">
          {/* Connector line (desktop) */}
          <div className="hidden lg:block absolute top-12 left-0 right-0 h-0.5 bg-gradient-to-r from-brand/20 via-brand/40 to-accent/20" />

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            {STEPS.map((step) => (
              <motion.div key={step.num} variants={fadeUp} className="relative text-center">
                <div className="relative inline-flex mb-5">
                  <div className="w-16 h-16 rounded-2xl bg-slate-950 flex items-center justify-center mx-auto">
                    <step.icon size={24} className="text-brand" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center">
                    {step.num.slice(-1)}
                  </span>
                </div>
                <h3 className="font-bold text-slate-900 mb-2 text-sm sm:text-base">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── Testimonials ───────────────────────────────────────────────

const TESTIMONIALS = [
  {
    quote: "Antes coordinaba por 4 grupos de WhatsApp y papel. Ahora todo está en Pangui y facturamos el mismo día del trabajo. Impagable.",
    name: "Carlos Sepúlveda",
    role: "Jefe de Mantención",
    company: "Clínica Las Condes",
    stars: 5,
    initials: "CS",
    color: "bg-brand",
  },
  {
    quote: "Mis técnicos tardaban 30 minutos llenando formularios en papel. Hoy son 5 minutos desde el celular y el cliente firma en pantalla. Mucho más profesional.",
    name: "María Rodríguez",
    role: "Encargada Facilities",
    company: "U. Santo Tomás Santiago",
    stars: 5,
    initials: "MR",
    color: "bg-purple-500",
  },
  {
    quote: "El módulo de inventario me ahorró 2 meses de stock perdido. Ya nadie 'olvida' anotar los materiales porque el sistema los registra obligatorio al cerrar la OT.",
    name: "Rodrigo Muñoz",
    role: "Gerente Operacional",
    company: "Servicios Técnicos RM",
    stars: 5,
    initials: "RM",
    color: "bg-accent",
  },
];

function Testimonials() {
  return (
    <section className="py-20 sm:py-28" style={{ background: "#f8fafc" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-sm font-semibold text-brand uppercase tracking-wider">Testimonios</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Lo dicen quienes ya lo usan
          </h2>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {TESTIMONIALS.map((t) => (
            <motion.div
              key={t.name}
              variants={fadeUp}
              whileHover={{ y: -4 }}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"
            >
              <div className="flex gap-1 mb-4">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} size={14} className="text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-slate-600 text-sm leading-relaxed mb-6 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
                  {t.initials}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                  <p className="text-slate-400 text-xs">{t.role} · {t.company}</p>
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
    { icon: MapPin, label: "Hecha en Chile", sub: "Para pymes chilenas de mantención" },
    { icon: Shield, label: "Cumple Ley 21.719", sub: "Portal ARCO integrado para solicitudes de datos" },
    { icon: Wifi, label: "Offline first", sub: "Funciona sin internet y sincroniza al volver" },
    { icon: Smartphone, label: "PWA instalable", sub: "Como app nativa en iOS y Android, sin App Store" },
  ];

  return (
    <section className="py-14 bg-white border-y border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {signals.map((s) => (
            <motion.div key={s.label} variants={fadeUp} className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                <s.icon size={22} className="text-brand" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">{s.label}</p>
                <p className="text-slate-400 text-xs mt-0.5 leading-snug">{s.sub}</p>
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
    period: "60 días de prueba",
    desc: "Para empezar sin compromiso",
    featured: false,
    items: [
      "1 técnico incluido",
      "Hasta 50 OT al mes",
      "App móvil completa",
      "Fotos y firma digital",
      "Notificaciones push",
      "Soporte por email",
    ],
    cta: "Comenzar gratis",
    href: "#cta",
  },
  {
    name: "Pro",
    price: "19.990",
    period: "CLP / mes",
    desc: "Para equipos en crecimiento",
    featured: true,
    items: [
      "Técnicos ilimitados",
      "OT ilimitadas",
      "Inventario + alertas stock",
      "Facturación SimpleFactura",
      "Reportes PDF y Excel",
      "Historial de auditoría",
      "Soporte prioritario",
    ],
    cta: "Empezar ahora",
    href: "#cta",
  },
  {
    name: "Enterprise",
    price: "A convenir",
    period: "",
    desc: "Para empresas con múltiples plantas",
    featured: false,
    items: [
      "Todo lo de Pro",
      "Múltiples plantas",
      "Usuarios admin ilimitados",
      "SLA personalizado",
      "Onboarding dedicado",
      "Integración a medida",
    ],
    cta: "Hablar con ventas",
    href: "https://wa.me/56900000000?text=Quiero%20Enterprise%20de%20Pangui",
  },
];

function PricingCard({ name, price, period, desc, featured, items, cta, href }) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      className={`rounded-2xl p-6 sm:p-8 flex flex-col ${
        featured
          ? "bg-brand text-white shadow-xl shadow-brand/25 ring-2 ring-brand/30 relative"
          : "bg-white border border-slate-100 shadow-sm"
      }`}
    >
      {featured && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-accent text-white text-xs font-bold px-4 py-1 rounded-full">
          Más popular
        </div>
      )}
      <div className="mb-6">
        <h3 className={`font-bold text-lg mb-1 ${featured ? "text-white" : "text-slate-900"}`}>{name}</h3>
        <p className={`text-sm mb-4 ${featured ? "text-blue-100" : "text-slate-500"}`}>{desc}</p>
        <div className="flex items-end gap-1">
          {price !== "A convenir" ? (
            <>
              <span className={`text-3xl sm:text-4xl font-bold ${featured ? "text-white" : "text-slate-900"}`}>
                ${price}
              </span>
              <span className={`text-sm pb-1 ${featured ? "text-blue-100" : "text-slate-400"}`}>{period}</span>
            </>
          ) : (
            <span className={`text-2xl font-bold ${featured ? "text-white" : "text-slate-900"}`}>{price}</span>
          )}
        </div>
      </div>

      <ul className="space-y-2.5 mb-8 flex-1">
        {items.map((item) => (
          <li key={item} className={`flex items-center gap-2.5 text-sm ${featured ? "text-blue-50" : "text-slate-600"}`}>
            <CheckCircle size={15} className={featured ? "text-blue-200" : "text-accent"} />
            {item}
          </li>
        ))}
      </ul>

      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className={`w-full text-center py-3 rounded-xl font-semibold text-sm transition-all ${
          featured
            ? "bg-white text-brand hover:bg-blue-50"
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
    <section id="pricing" className="py-20 sm:py-28" style={{ background: "#f8fafc" }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-sm font-semibold text-brand uppercase tracking-wider">Precios</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Simple y sin sorpresas
          </h2>
          <p className="text-slate-500 max-w-lg mx-auto">
            Empieza gratis. Paga solo cuando decidas quedarte.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid sm:grid-cols-3 gap-6 items-start"
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
          Todos los precios incluyen IVA. Facturación mensual. Cancela cuando quieras.
        </motion.p>
      </div>
    </section>
  );
}

// ── FAQ ────────────────────────────────────────────────────────

const FAQS = [
  {
    q: "¿Funciona sin conexión a internet?",
    a: "Sí. Pangui es una PWA offline-first. Los técnicos pueden registrar fotos, materiales y firma sin señal. Todo se sincroniza automáticamente cuando recuperan conexión.",
  },
  {
    q: "¿La integración con SimpleFactura es real y funcional?",
    a: "Sí, es una integración directa vía API. Emites el DTE (boleta o factura) desde la misma OT, con todos los datos ya precargados: cliente, descripción, montos. Sin copiar y pegar.",
  },
  {
    q: "¿Cuántos técnicos puedo tener en el plan Pro?",
    a: "Técnicos ilimitados. No hay cobro por usuario. El precio es fijo al mes independiente de cuántos técnicos tengas en tu equipo.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Sí. Usamos Supabase (infraestructura PostgreSQL en AWS), con cifrado en reposo y todo el tráfico sobre TLS. Además cumplimos la Ley 21.719 con el portal ARCO integrado.",
  },
  {
    q: "¿Puedo usar Pangui en iPhone?",
    a: "Sí. Pangui es una PWA instalable desde Safari en iOS. Funciona como app nativa, con notificaciones push y acceso sin App Store.",
  },
];

function FAQ() {
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" className="py-20 sm:py-28 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-sm font-semibold text-brand uppercase tracking-wider">FAQ</span>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-3 mb-4">
            Preguntas frecuentes
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
              className="border border-slate-100 rounded-xl overflow-hidden"
            >
              <button
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-semibold text-slate-900 text-sm sm:text-base">{faq.q}</span>
                {open === i ? (
                  <ChevronUp size={18} className="text-brand flex-shrink-0" />
                ) : (
                  <ChevronDown size={18} className="text-slate-400 flex-shrink-0" />
                )}
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-4 text-slate-500 text-sm leading-relaxed">{faq.a}</p>
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
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitted(true);
  }

  return (
    <section
      id="cta"
      className="py-20 sm:py-28 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0f1e 0%, #0d1530 100%)" }}
    >
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,102,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,102,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 text-center">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.span variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand/30 bg-brand/10 text-brand text-xs font-semibold mb-6">
            60 días gratis, sin tarjeta
          </motion.span>

          <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            Empieza hoy y ordena tu mantención
          </motion.h2>

          <motion.p variants={fadeUp} className="text-slate-300 mb-10 text-lg">
            Prueba todas las funciones durante 60 días. Sin límites, sin tarjeta de crédito.
          </motion.p>

          {!submitted ? (
            <motion.form
              variants={fadeUp}
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <input
                type="email"
                required
                placeholder="tu@empresa.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-4 py-3.5 rounded-xl text-slate-900 text-sm outline-none border-2 border-transparent focus:border-brand"
                style={{ background: "rgba(255,255,255,0.95)" }}
              />
              <button
                type="submit"
                className="px-6 py-3.5 bg-brand hover:bg-brand-dark text-white font-semibold rounded-xl transition-colors whitespace-nowrap text-sm"
              >
                Comenzar gratis
              </button>
            </motion.form>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-3 bg-accent/20 border border-accent/30 rounded-xl px-6 py-4 max-w-md mx-auto"
            >
              <CheckCircle size={20} className="text-accent" />
              <p className="text-white font-medium text-sm">
                ¡Listo! Te contactaremos pronto a <strong>{email}</strong>
              </p>
            </motion.div>
          )}

          <motion.div variants={fadeUp} className="mt-6">
            <span className="text-slate-400 text-sm">¿Prefieres hablar primero? </span>
            <a
              href="https://wa.me/56900000000?text=Hola,%20quiero%20probar%20Pangui"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent font-semibold text-sm hover:text-accent-dark"
            >
              Escríbenos por WhatsApp →
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* Sticky mobile CTA */}
      <div className="sticky-mobile-cta">
        <a
          href="#cta"
          className="flex items-center justify-center gap-2 w-full py-3 bg-brand rounded-xl text-white font-semibold text-sm"
        >
          Prueba gratis 60 días <ArrowRight size={16} />
        </a>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="bg-slate-950 text-slate-400 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-brand flex items-center justify-center">
                <span className="text-white font-bold text-xs">P</span>
              </div>
              <span className="text-white font-bold">Pangui</span>
            </div>
            <p className="text-sm leading-relaxed">
              Gestión de órdenes de trabajo para contratistas de mantención en Chile.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Producto</p>
            <ul className="space-y-2 text-sm">
              {[
                { label: "Funciones", href: "#features" },
                { label: "Precios", href: "#pricing" },
                { label: "FAQ", href: "#faq" },
                { label: "Iniciar sesión", href: "/login" },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="hover:text-white transition-colors">{l.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Legal</p>
            <ul className="space-y-2 text-sm">
              {[
                { label: "Política de privacidad", href: "#" },
                { label: "Términos de servicio", href: "#" },
                { label: "Portal ARCO (Ley 21.719)", href: "/arco" },
              ].map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="hover:text-white transition-colors">{l.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="text-white font-semibold text-sm mb-3">Contacto</p>
            <ul className="space-y-2 text-sm">
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
                <a href="mailto:hola@pangui.cl" className="hover:text-white transition-colors">
                  hola@pangui.cl
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs">© 2025 Pangui. Hecho en Chile con ♥ para pymes de mantención.</p>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300">
              <MapPin size={10} />
              Santiago, Chile
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
  return (
    <div className="landing-root">
      <PWAGuard />
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
