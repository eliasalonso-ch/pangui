"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, Loader2, Sparkles, ListChecks, Workflow, CircleHelp, ExternalLink, Mail } from "lucide-react";
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

function Seccion({ icono, titulo, children }: { icono: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <section style={{ padding: 24, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)" }}>
      <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 10, fontSize: 20, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--fg-1)" }}>
        {icono} {titulo}
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
      <div style={{ background: "var(--brand-tint)", padding: "20px 24px 40px" }}>
        <nav aria-label="Ruta" style={{ maxWidth: 1080, margin: "0 auto", display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--fg-3)" }}>
          <Link href="/integraciones" prefetch={false} style={{ color: "var(--fg-3)", textDecoration: "none" }}>Integraciones</Link>
          <ChevronRight size={14} />
          <span style={{ color: "var(--fg-1)" }}>MeConecta</span>
        </nav>
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "var(--fg-3)" }}>
            <LogoUdec alto={48} /> <span style={{ fontSize: 20 }}>+</span> <LogoPangui size={40} />
          </div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--fg-1)" }}>MeConecta y Pangui</h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 15, lineHeight: 1.55, color: "var(--fg-2)" }}>
            Las solicitudes de mantención que la UdeC te asigna en MeConecta, a la vista de tu equipo en Pangui.
          </p>
        </div>
      </div>

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
            <div style={{ display: "grid" }}>
              {PREGUNTAS.map((p, i) => (
                <details key={p.q} style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)", padding: "12px 0" }}>
                  <summary style={{ cursor: "pointer", color: "var(--fg-1)", fontWeight: 500 }}>{p.q}</summary>
                  <p style={{ margin: "8px 0 0" }}>{p.a}</p>
                </details>
              ))}
            </div>
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
