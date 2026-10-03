"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles, ListChecks, Workflow, CircleHelp, ExternalLink, Mail, Plus, Minus } from "lucide-react";
import { LogoUdec, LogoPangui } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";
import ConexionMeconectaPanel from "@/components/integraciones/ConexionMeconectaPanel";

const PREGUNTAS: { q: string; a: string }[] = [
  { q: "¿Qué datos lee Pangui de MeConecta?",
    a: "Solo cuatro campos de cada solicitud asignada a tu empresa: fecha, folio, estado y el identificador interno del portal. No lee nombres, correos, teléfonos ni descripciones del solicitante." },
  { q: "¿Dónde se guarda mi clave? ¿Quién la ve?",
    a: "Se guarda cifrada en la base de datos y no se vuelve a mostrar, ni a ti ni a nadie. Nadie del equipo de Pangui la conoce: solo el proceso automático la usa para iniciar sesión." },
  { q: "¿Pangui escribe o cambia algo en MeConecta?",
    a: "No. La integración es de solo lectura." },
  { q: "¿Qué pasa si cambio mi clave en MeConecta?",
    a: "La conexión queda como \"Clave rechazada\", Pangui deja de intentar y te avisa. Vuelve aquí y usa \"Cambiar clave\"." },
  { q: "¿Cómo la desconecto?",
    a: "Con \"Desconectar\" en esta página. La clave se borra en el acto y Pangui deja de revisar el portal." },
  { q: "¿Dónde se almacenan los datos?",
    a: "En la infraestructura de Pangui (Supabase), en servidores ubicados en Estados Unidos." },
];

// Pangui: un solo color, el azul de su logo (public/logo.svg).
// UdeC: azul y amarillo institucionales (Normas gráficas UdeC, PANTONE 541 C / 130 C).
const PANGUI_AZUL_LOGO = "#273d88";
const UDEC_AZUL = "#223c6a";
const UDEC_AMARILLO = "#e69b0a";

/** Logo de terceros: siempre sobre blanco, en ambos temas. */
function TileLogo({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return (
    <div style={{
      position: "absolute", top: "50%", transform: "translateY(-50%)", width: 80, height: 80,
      display: "grid", placeItems: "center", background: "#FFFFFF", borderRadius: 18,
      border: "1px solid rgba(0, 0, 0, 0.06)",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08), 0 6px 16px rgba(0, 0, 0, 0.10)",
      ...style,
    }}>
      {children}
    </div>
  );
}

const TITULO = (
  <>
    <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2, color: "var(--fg-1)" }}>MeConecta y Pangui</h1>
    <p style={{ margin: 0, fontSize: 20, lineHeight: 1.3, color: "var(--fg-3)" }}>Portal de mantención</p>
  </>
);

/**
 * Banda superior: un bloque por marca con sus colores (Pangui uno, la UdeC dos)
 * y su logo en una tarjeta blanca al centro del bloque.
 * Pangui a la izquierda, la UdeC espejada a la derecha. --a es medio bloque.
 * En móvil no cabe el título entre los bloques: va debajo de la banda.
 */
function Encabezado() {
  return (
    <>
      <div
        className="relative [--a:56px] md:[--a:90px]"
        style={{
          height: 148,
          background: `linear-gradient(90deg,
            ${PANGUI_AZUL_LOGO} 0 calc(var(--a) * 2),
            var(--surface-1) calc(var(--a) * 2) calc(100% - var(--a) * 2),
            ${UDEC_AMARILLO} calc(100% - var(--a) * 2) calc(100% - var(--a)),
            ${UDEC_AZUL} calc(100% - var(--a)))`,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <TileLogo style={{ left: "calc(var(--a) - 40px)" }}><LogoPangui size={66} /></TileLogo>
        <TileLogo style={{ right: "calc(var(--a) - 40px)" }}><LogoUdec alto={66} /></TileLogo>
        <div
          className="hidden md:flex"
          style={{ position: "absolute", top: 0, bottom: 0, left: "calc(var(--a) * 2 + 24px)", right: "calc(var(--a) * 2 + 24px)", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 4, textAlign: "center" }}
        >
          {TITULO}
        </div>
      </div>
      <div className="flex md:hidden" style={{ flexDirection: "column", alignItems: "center", gap: 4, textAlign: "center", padding: "20px 16px 0" }}>
        {TITULO}
      </div>
    </>
  );
}

/** Mismo acordeón que las preguntas frecuentes de la landing, con los tokens de la app. */
function PreguntasFrecuentes() {
  const [abierta, setAbierta] = useState(-1);
  return (
    <div>
      {PREGUNTAS.map((p, i) => {
        const open = abierta === i;
        const Icono = open ? Minus : Plus;
        return (
          <div key={p.q} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
            <button
              type="button"
              onClick={() => setAbierta(open ? -1 : i)}
              aria-expanded={open}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                padding: "12px 0", background: "none", border: 0, cursor: "pointer", textAlign: "left",
                font: "inherit", color: "var(--fg-1)",
              }}
            >
              <span>{p.q}</span>
              <Icono size={18} strokeWidth={2} aria-hidden style={{ flexShrink: 0, color: "var(--brand)" }} />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ margin: 0, overflow: "hidden", paddingBottom: 12, paddingRight: 32 }}
                >
                  {p.a}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function Seccion({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
      <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
        <span style={{ display: "inline-flex", color: "var(--brand)" }}>{icono}</span> {titulo}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg-2)" }}>{children}</div>
    </section>
  );
}

export default function MeconectaIntegracionPage() {
  const gate = useGateIntegraciones();

  if (gate === "cargando") {
    return <div style={{ minHeight: 320, display: "grid", placeItems: "center", color: "var(--fg-3)" }}><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (gate === "denegado") {
    return <p style={{ padding: 32, color: "var(--fg-3)", fontSize: 14 }}>Esta sección no está disponible para tu cuenta.</p>;
  }

  return (
    <div>
      <Encabezado />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 56px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          <Seccion icono={<Sparkles size={20} />} titulo="Resumen">
            <p style={{ margin: 0 }}>
              Pangui revisa el portal MeConecta de la Universidad de Concepción con la cuenta de tu empresa, te avisa
              cuando aparece una solicitud nueva y te ayuda a confirmar que cada una tenga su OT. Integración
              gestionada por Pangui.
            </p>
          </Seccion>

          <Seccion icono={<ListChecks size={20} />} titulo="Qué hace">
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, listStyle: "disc" }}>
              <li>Avisa a los administradores de tu empresa cada vez que MeConecta te asigna una solicitud nueva, con el enlace para abrirla.</li>
              <li>Con <span style={{ color: "var(--fg-1)", fontWeight: 500 }}>Revisar MeConecta</span> en Órdenes, muestra las solicitudes pendientes que aún no tienen OT y las OT abiertas cuya solicitud ya se cerró en el portal.</li>
              <li>Es de solo lectura: nunca escribe ni cambia nada en MeConecta.</li>
            </ul>
          </Seccion>

          <Seccion icono={<Workflow size={20} />} titulo="Cómo funciona">
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, listStyle: "decimal" }}>
              <li>Un administrador conecta la cuenta MeConecta de la empresa y autoriza la sincronización.</li>
              <li>Pangui revisa el portal cada 15 minutos, de lunes a sábado entre las 07:00 y las 18:00.</li>
              <li>Cada solicitud se cruza con tus OTs por el folio (SF…) escrito en el campo N° de Serie.</li>
            </ol>
          </Seccion>

          <Seccion icono={<CircleHelp size={20} />} titulo="Preguntas frecuentes">
            <PreguntasFrecuentes />
          </Seccion>
        </div>

        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 24 }}>
          <ConexionMeconectaPanel />
          <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 12, fontSize: 14 }}>
            <div>
              <p style={{ margin: 0, color: "var(--fg-3)" }}>Gestionado por</p>
              <p style={{ margin: 0, color: "var(--fg-1)" }}>Pangui</p>
            </div>
            <a href="mailto:contacto@getpangui.com?subject=Integraci%C3%B3n%20MeConecta" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
              <Mail size={15} /> Contactar soporte
            </a>
            <a href="https://meconecta.udec.cl" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
              <ExternalLink size={15} /> Abrir MeConecta
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
