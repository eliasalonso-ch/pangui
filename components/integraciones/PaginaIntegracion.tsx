"use client";

/**
 * Piezas de la página de detalle de una integración (/integraciones/<slug>):
 * la banda con los dos logos, las secciones, las listas con título, la ficha
 * técnica y las preguntas frecuentes. Salieron de /integraciones/meconecta para
 * que todas las integraciones tengan el mismo diseño.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Minus } from "lucide-react";
import { LogoPangui } from "@/components/integraciones/Logos";
import BandaBlob from "@/components/integraciones/BandaBlob";

/** Azul del logo de Pangui (public/logo.svg): los puntos del lado izquierdo. */
export const PANGUI_AZUL_LOGO = "#273d88";

/** Lugar de cada logo en la banda (sin fondo propio). */
function TileLogo({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return (
    <div style={{
      position: "absolute", top: "50%", transform: "translateY(-50%)", width: 80, height: 80,
      display: "grid", placeItems: "center",
      ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * Banda superior: el logo de Pangui a la izquierda y el de la integración a la
 * derecha, a --a del borde. Sin fondo propio corre una nube de puntos
 * (BandaBlob): azul de Pangui de su lado, los dos colores de la integración del
 * otro. Al centro, un "+" (como "Samsara + MaintainX"); el título queda solo
 * para lectores de pantalla.
 */
export function EncabezadoIntegracion({ titulo, logo, colores }: {
  titulo: string;
  logo: ReactNode;
  colores: [string, string];
}) {
  return (
    <div className="relative [--a:56px] md:[--a:90px]" style={{ height: 148, borderBottom: "1px solid var(--border)" }}>
      <BandaBlob izquierda={PANGUI_AZUL_LOGO} derecha={colores} />
      <TileLogo style={{ left: "calc(var(--a) - 40px)" }}><LogoPangui size={66} /></TileLogo>
      <TileLogo style={{ right: "calc(var(--a) - 40px)" }}>{logo}</TileLogo>
      <h1 className="sr-only">{titulo}</h1>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "calc(var(--a) * 2 + 24px)", right: "calc(var(--a) * 2 + 24px)", display: "grid", placeItems: "center" }}>
        <Plus aria-hidden size={20} style={{ color: "#FFFFFF", filter: "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25))" }} />
      </div>
    </div>
  );
}

export function Seccion({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
      <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
        <span style={{ display: "inline-flex", color: "var(--brand)" }}>{icono}</span> {titulo}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--fg-2)" }}>{children}</div>
    </section>
  );
}

/** Lista con viñetas: "Título. Texto". */
export function ListaTitulada({ items }: { items: { titulo: string; texto: string }[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10, listStyle: "disc" }}>
      {items.map((f) => (
        <li key={f.titulo}>
          <span style={{ color: "var(--fg-1)", fontWeight: 500 }}>{f.titulo}.</span> {f.texto}
        </li>
      ))}
    </ul>
  );
}

/** Ficha dato/valor para los equipos de TI. */
export function FichaTecnica({ filas }: { filas: { dato: string; valor: string }[] }) {
  return (
    <dl style={{ margin: 0, border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
      {filas.map((fila, i) => (
        <div key={fila.dato} className="grid sm:grid-cols-[160px_minmax(0,1fr)]" style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
          <dt style={{ padding: "10px 14px", background: "var(--surface-2)", color: "var(--fg-1)" }}>{fila.dato}</dt>
          <dd style={{ margin: 0, padding: "10px 14px" }}>{fila.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Mismo acordeón que las preguntas frecuentes de la landing, con los tokens de la app. */
export function PreguntasFrecuentes({ preguntas }: { preguntas: { q: string; a: string }[] }) {
  const [abierta, setAbierta] = useState(-1);
  return (
    <div>
      {preguntas.map((p, i) => {
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

/** Tarjeta de la columna derecha bajo el panel de conexión: frase, "Gestionado por" y enlaces. */
export function TarjetaLateral({ titulo, texto, enlaces }: {
  titulo: string;
  texto: string;
  enlaces: { href: string; icono: ReactNode; label: string; externo?: boolean }[];
}) {
  return (
    <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 14, fontSize: 14 }}>
      <div>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.3, color: "var(--fg-1)" }}>{titulo}</p>
        <p style={{ margin: "8px 0 0", lineHeight: 1.55, color: "var(--fg-2)" }}>{texto}</p>
      </div>
      <div>
        <p style={{ margin: 0, color: "var(--fg-1)", fontWeight: 500 }}>Gestionado por:</p>
        <p style={{ margin: 0, color: "var(--fg-2)" }}>Pangui</p>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0, color: "var(--fg-1)", fontWeight: 500 }}>Enlaces:</p>
        {enlaces.map((e) => (
          <a key={e.href} href={e.href} {...(e.externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
            {e.icono} {e.label}
          </a>
        ))}
      </div>
    </div>
  );
}
