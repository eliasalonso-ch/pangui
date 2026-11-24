"use client";

import { Loader2, Sparkles, ListChecks, Workflow, CircleHelp, ExternalLink, Mail, ShieldCheck, ClipboardCheck, Globe } from "lucide-react";
import { LogoUdec } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";
import ConexionMeconectaPanel from "@/components/integraciones/ConexionMeconectaPanel";
import {
  EncabezadoIntegracion, Seccion, ListaTitulada, FichaTecnica, PreguntasFrecuentes, TarjetaLateral,
} from "@/components/integraciones/PaginaIntegracion";

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

// UdeC: azul y amarillo institucionales (Normas gráficas UdeC, PANTONE 541 C / 130 C).
const UDEC_AZUL = "#223c6a";
const UDEC_AMARILLO = "#e69b0a";

export default function MeconectaIntegracionPage() {
  const gate = useGateIntegraciones("meconecta");

  if (gate === "cargando") {
    return <div style={{ minHeight: 320, display: "grid", placeItems: "center", color: "var(--fg-3)" }}><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (gate === "denegado") {
    return <p style={{ padding: 32, color: "var(--fg-3)", fontSize: 14 }}>Esta sección no está disponible para tu cuenta.</p>;
  }

  return (
    <div>
      <EncabezadoIntegracion titulo="MeConecta y Pangui" logo={<LogoUdec alto={66} />} colores={[UDEC_AZUL, UDEC_AMARILLO]} />

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
            <ListaTitulada items={FUNCIONALIDADES} />
          </Seccion>

          <Seccion icono={<Workflow size={20} />} titulo="Cómo funciona">
            <ListaTitulada items={PASOS} />
          </Seccion>

          <Seccion icono={<ShieldCheck size={20} />} titulo="Seguridad y acceso">
            <p style={{ margin: "0 0 12px" }}>Ficha para los equipos de TI de tu empresa y de la UdeC.</p>
            <FichaTecnica filas={FICHA_TI} />
          </Seccion>

          <Seccion icono={<ClipboardCheck size={20} />} titulo="Requisitos">
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, listStyle: "disc" }}>
              {REQUISITOS.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Seccion>

          <Seccion icono={<CircleHelp size={20} />} titulo="Preguntas frecuentes">
            <PreguntasFrecuentes preguntas={PREGUNTAS} />
          </Seccion>

          <section style={{ padding: 24, borderRadius: "var(--r-lg)", background: "var(--brand-tint)" }}>
            <LogoUdec completo alto={72} />
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
          <TarjetaLateral
            titulo="Ninguna solicitud de la UdeC sin su OT"
            texto="Recibe cada solicitud que la UdeC asigna a tu empresa y confirma que todas tengan su orden de trabajo, sin revisar el portal a mano."
            enlaces={[
              { href: "mailto:contacto@getpangui.com?subject=Integraci%C3%B3n%20MeConecta", icono: <Mail size={15} />, label: "Contactar soporte" },
              { href: "https://meconecta.udec.cl", icono: <ExternalLink size={15} />, label: "Abrir MeConecta", externo: true },
              { href: "https://www.udec.cl", icono: <Globe size={15} />, label: "Sitio de la UdeC", externo: true },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}
