"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Sparkles, ListChecks, Workflow, CircleHelp, ExternalLink, Mail, Plus, Minus, ShieldCheck, ClipboardCheck, Globe } from "lucide-react";
import { LogoUdec, LogoPangui } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";
import ConexionMeconectaPanel from "@/components/integraciones/ConexionMeconectaPanel";

const PREGUNTAS: { q: string; a: string }[] = [
  { q: "¿Qué datos lee Pangui de MeConecta?",
    a: "Solo cuatro campos de cada solicitud que aparece en la bandeja «Solicitudes asignadas» de tu empresa: fecha, folio (SF…), estado y el identificador interno del portal. Pangui no abre el detalle de las solicitudes ni lee datos del solicitante (nombre, correo, teléfono) ni descripciones." },
  { q: "¿Pangui escribe o modifica algo en MeConecta?",
    a: "No. La integración es de solo lectura: Pangui no crea, cierra ni comenta solicitudes, ni cambia ningún dato en el portal." },
  { q: "¿Dónde se guarda la clave y quién puede verla?",
    a: "Se guarda cifrada en Supabase Vault, la bóveda de secretos de la base de datos de Pangui. Solo la usa el proceso de sincronización del servidor, para iniciar sesión. No se muestra en la aplicación, ni siquiera a quien la ingresó, y nadie del equipo de Pangui la conoce. Tu empresa la ingresa, la cambia y la revoca cuando quiere." },
  { q: "¿Por qué la integración necesita la clave?",
    a: "Pangui usa el mismo acceso web que una persona de tu empresa, limitado a la lista de solicitudes asignadas. Si la UdeC habilita una API o un token de acceso para empresas contratistas, la integración puede migrar a ese mecanismo y dejar de usar la clave." },
  { q: "¿Cómo identifica la UdeC el tráfico de Pangui?",
    a: "Cada consulta viaja por HTTPS e incluye el identificador «PanguiBot/1.0 (+https://getpangui.com)», para que el equipo de TI de la UdeC pueda reconocer y auditar la actividad de la integración en sus registros." },
  { q: "¿Con qué frecuencia se conecta Pangui?",
    a: "Cada 15 minutos, de lunes a sábado entre las 07:00 y las 18:00 (hora de Chile): unas 44 consultas al día. Fuera de ese horario no hay actividad. «Revisar MeConecta» en Órdenes hace una consulta adicional solo cuando alguien la pide." },
  { q: "¿Qué pasa si cambio la clave en MeConecta?",
    a: "MeConecta rechaza el siguiente inicio de sesión. Pangui marca la conexión como «Clave rechazada», deja de intentar en ese momento (sin reintentos, para no bloquear la cuenta) y avisa a los administradores. Ingresa la nueva clave con «Cambiar clave»." },
  { q: "¿Qué pasa si MeConecta no está disponible?",
    a: "Pangui vuelve a intentar en el siguiente ciclo, sin generar avisos falsos. El panel de conexión muestra el último error mientras tanto." },
  { q: "¿Cómo se desconecta?",
    a: "Un owner o administrador usa «Desconectar» en esta página: la clave se borra de inmediato y Pangui deja de consultar el portal. Las solicitudes ya registradas se mantienen como historial en Pangui." },
  { q: "¿Dónde se almacenan los datos?",
    a: "En la infraestructura de Pangui sobre Supabase (AWS, región us-east-1, Estados Unidos). Las conexiones viajan cifradas (HTTPS) y la clave se guarda cifrada en reposo." },
];

const FUNCIONALIDADES: { titulo: string; texto: string }[] = [
  { titulo: "Aviso de solicitud nueva",
    texto: "Cuando la UdeC asigna una solicitud nueva a tu empresa, los owners y administradores reciben una notificación en Pangui, en la web y en el celular, con el folio, el estado, la fecha y el enlace directo a la solicitud en MeConecta." },
  { titulo: "Revisar MeConecta",
    texto: "Desde Órdenes, compara en el momento lo que está pendiente en el portal con tus OTs y muestra dos listas: solicitudes pendientes que aún no tienen OT, y OTs abiertas cuya solicitud ya se cerró en MeConecta. Se puede acotar por período." },
  { titulo: "Cruce por folio",
    texto: "Cada solicitud se asocia a su orden de trabajo por el folio (SF…) escrito en el campo N° de Serie / Folio de la OT." },
  { titulo: "Solo lectura",
    texto: "Pangui nunca escribe, cierra ni modifica solicitudes en MeConecta." },
  { titulo: "Control de tu empresa",
    texto: "La conexión la autoriza y la revoca un owner o administrador, y queda registro de quién la autorizó y cuándo." },
];

const PASOS: { titulo: string; texto: string }[] = [
  { titulo: "Autorizar",
    texto: "Un owner o administrador ingresa el usuario y la clave de la cuenta MeConecta de la empresa y marca la autorización. Pangui registra quién autorizó y cuándo." },
  { titulo: "Verificar",
    texto: "Pangui inicia sesión una vez para confirmar que la cuenta funciona y muestra el resultado en el panel de conexión." },
  { titulo: "Sincronizar",
    texto: "Cada 15 minutos, de lunes a sábado entre las 07:00 y las 18:00, Pangui inicia sesión y lee solo la lista de solicitudes asignadas a tu empresa." },
  { titulo: "Avisar y cruzar",
    texto: "Las solicitudes nuevas generan avisos para tu equipo, y «Revisar MeConecta» las cruza con tus OTs por folio." },
  { titulo: "Mantener el control",
    texto: "Cambia la clave o desconecta cuando quieras. Si MeConecta rechaza la clave, Pangui se detiene y te avisa." },
];

// Ficha técnica para los equipos de TI (de la empresa y de la UdeC).
const FICHA_TI: { dato: string; valor: string }[] = [
  { dato: "Tipo de acceso", valor: "Solo lectura, con la cuenta de la empresa contratista." },
  { dato: "Datos leídos", valor: "Fecha, folio, estado e ID interno de las solicitudes asignadas. Sin datos personales." },
  { dato: "Frecuencia", valor: "Cada 15 minutos, lunes a sábado de 07:00 a 18:00 (hora de Chile). Unas 44 consultas al día." },
  { dato: "Identificación", valor: "User-Agent «PanguiBot/1.0 (+https://getpangui.com)», por HTTPS." },
  { dato: "Credencial", valor: "Cifrada en Supabase Vault. Solo la usa el proceso de sincronización para iniciar sesión; no se muestra en la aplicación." },
  { dato: "Clave rechazada", valor: "La integración se detiene de inmediato, sin reintentos, y avisa a los administradores." },
  { dato: "Ubicación de datos", valor: "Supabase (AWS us-east-1, Estados Unidos)." },
  { dato: "Revocación", valor: "«Desconectar» borra la clave al instante. Cambiar la clave en MeConecta también corta el acceso." },
];

const REQUISITOS = [
  "Cuenta de empresa contratista activa en MeConecta, con acceso a «Solicitudes asignadas».",
  "Rol owner o administrador en Pangui para conectar, cambiar la clave o desconectar.",
  "Para el cruce con OTs: el folio (SF…) de cada solicitud escrito en el campo N° de Serie / Folio de la OT.",
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
              MeConecta es la plataforma de la Universidad de Concepción donde se registran las solicitudes de
              mantención de sus campus y se asignan a las empresas contratistas. Esta integración conecta esa bandeja
              con Pangui: cada solicitud nueva que la UdeC asigna a tu empresa llega como aviso a tu equipo, y en
              cualquier momento puedes comprobar que cada una tenga su orden de trabajo.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              La conexión usa la cuenta MeConecta de tu empresa, la autoriza un administrador y es de solo lectura.
              Integración configurada y gestionada por Pangui.
            </p>
          </Seccion>

          <Seccion icono={<ListChecks size={20} />} titulo="Funcionalidades clave">
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10, listStyle: "disc" }}>
              {FUNCIONALIDADES.map((f) => (
                <li key={f.titulo}>
                  <span style={{ color: "var(--fg-1)", fontWeight: 500 }}>{f.titulo}.</span> {f.texto}
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion icono={<Workflow size={20} />} titulo="Cómo funciona">
            <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 14 }}>
              {PASOS.map((paso, i) => (
                <li key={paso.titulo} style={{ display: "flex", gap: 12 }}>
                  <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 999, display: "grid", placeItems: "center", background: "var(--brand-tint)", color: "var(--brand)", fontSize: 13, fontWeight: 500 }}>
                    {i + 1}
                  </span>
                  <div>
                    <p style={{ margin: 0, color: "var(--fg-1)", fontWeight: 500 }}>{paso.titulo}</p>
                    <p style={{ margin: "2px 0 0" }}>{paso.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Seccion>

          <Seccion icono={<ShieldCheck size={20} />} titulo="Seguridad y acceso">
            <p style={{ margin: "0 0 12px" }}>Ficha para los equipos de TI de tu empresa y de la UdeC.</p>
            <dl style={{ margin: 0, border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
              {FICHA_TI.map((fila, i) => (
                <div key={fila.dato} className="grid sm:grid-cols-[160px_minmax(0,1fr)]" style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                  <dt style={{ padding: "10px 14px", background: "var(--surface-2)", color: "var(--fg-1)" }}>{fila.dato}</dt>
                  <dd style={{ margin: 0, padding: "10px 14px" }}>{fila.valor}</dd>
                </div>
              ))}
            </dl>
          </Seccion>

          <Seccion icono={<ClipboardCheck size={20} />} titulo="Requisitos">
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, listStyle: "disc" }}>
              {REQUISITOS.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Seccion>

          <Seccion icono={<CircleHelp size={20} />} titulo="Preguntas frecuentes">
            <PreguntasFrecuentes />
          </Seccion>

          <section style={{ padding: 24, borderRadius: "var(--r-lg)", background: "var(--brand-tint)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <LogoUdec alto={44} />
              <span style={{ fontSize: 15, color: "var(--fg-2)" }}>Universidad de Concepción</span>
            </div>
            <h2 style={{ margin: "16px 0 10px", fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", color: "var(--fg-1)" }}>
              Acerca de la UdeC y MeConecta
            </h2>
            <div style={{ display: "grid", gap: 10, fontSize: 14, lineHeight: 1.6, color: "var(--fg-2)" }}>
              <p style={{ margin: 0 }}>
                Fundada en 1919, la Universidad de Concepción fue la primera universidad creada en regiones de Chile.
                Tiene campus en Concepción, Chillán y Los Ángeles, y está acreditada por la Comisión Nacional de
                Acreditación por 7 años en todas las áreas, el máximo posible (2023–2030).
              </p>
              <p style={{ margin: 0 }}>
                MeConecta es su plataforma de gestión. Entre otros procesos, ahí se registran las solicitudes de
                mantención de la universidad y se asignan a las empresas contratistas que las ejecutan.
              </p>
            </div>
          </section>
        </div>

        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 24 }}>
          <ConexionMeconectaPanel />
          <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 14, fontSize: 14 }}>
            <div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.3, color: "var(--fg-1)" }}>
                Ninguna solicitud de la UdeC sin su OT
              </p>
              <p style={{ margin: "8px 0 0", lineHeight: 1.55, color: "var(--fg-2)" }}>
                Recibe cada solicitud que la UdeC asigna a tu empresa y confirma que todas tengan su orden de trabajo,
                sin revisar el portal a mano.
              </p>
            </div>
            <div>
              <p style={{ margin: 0, color: "var(--fg-1)", fontWeight: 500 }}>Gestionado por</p>
              <p style={{ margin: 0, color: "var(--fg-2)" }}>Pangui</p>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <p style={{ margin: 0, color: "var(--fg-1)", fontWeight: 500 }}>Enlaces</p>
              <a href="mailto:contacto@getpangui.com?subject=Integraci%C3%B3n%20MeConecta" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
                <Mail size={15} /> Contactar soporte
              </a>
              <a href="https://meconecta.udec.cl" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
                <ExternalLink size={15} /> Abrir MeConecta
              </a>
              <a href="https://www.udec.cl" target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--brand)", textDecoration: "none" }}>
                <Globe size={15} /> Sitio de la UdeC
              </a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
