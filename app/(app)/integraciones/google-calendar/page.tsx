"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ListChecks, Workflow, CircleHelp, ExternalLink, Mail, ShieldCheck, ClipboardCheck, Link2, KeyRound } from "lucide-react";
import { LogoGoogleCalendar } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";
import ConexionGoogleCalendarPanel from "@/components/integraciones/ConexionGoogleCalendarPanel";
import LinkCalendarioIcs from "@/components/integraciones/LinkCalendarioIcs";
import {
  EncabezadoIntegracion, Seccion, ListaTitulada, FichaTecnica, PreguntasFrecuentes, TarjetaLateral,
} from "@/components/integraciones/PaginaIntegracion";

const FUNCIONALIDADES: { titulo: string; texto: string }[] = [
  { titulo: "Cada pendiente, un evento",
    texto: "Los pendientes abiertos de todas las OTs del equipo aparecen en el calendario. El título dice qué hay que hacer y quién lo pidió; la descripción trae la OT, el estado, la prioridad y el enlace «Abrir en Pangui»." },
  { titulo: "Siempre al día",
    texto: "Si cambias la fecha, la hora, la nota, el estado o el aviso de un pendiente, el evento se actualiza en el minuto siguiente. Al marcarlo hecho, cancelarlo o borrarlo, desaparece del calendario." },
  { titulo: "El aviso de cada pendiente",
    texto: "El evento lleva el aviso que elegiste en el pendiente («Avisarme»): a la hora, días, semanas o meses antes. Google acepta hasta 4 semanas; para avisos más largos te avisa Pangui por notificación y correo." },
  { titulo: "Pendientes que se repiten",
    texto: "Cada vez que se marca hecho un pendiente recurrente, la ocurrencia siguiente aparece como evento nuevo." },
  { titulo: "En el calendario de tu equipo",
    texto: "Elige cualquier calendario donde la cuenta conectada pueda editar eventos, como el calendario compartido de tu empresa." },
  { titulo: "Control de tu empresa",
    texto: "La conexión la autoriza y la revoca un owner o administrador. Pangui solo escribe los eventos de sus pendientes y no lee el resto de tu calendario." },
];

const PASOS: { titulo: string; texto: string }[] = [
  { titulo: "Conectar",
    texto: "Un owner o administrador toca «Conectar con Google», inicia sesión con su cuenta y acepta los dos permisos que pide Pangui." },
  { titulo: "Elegir el calendario",
    texto: "Pangui muestra los calendarios donde esa cuenta puede editar eventos. Eliges uno, por ejemplo el del equipo." },
  { titulo: "Sincronizar",
    texto: "Cada minuto, Pangui escribe en ese calendario los pendientes nuevos o que cambiaron." },
  { titulo: "Avisar",
    texto: "Google avisa según el «Avisarme» de cada pendiente. Ese aviso rige para la cuenta conectada; el resto del equipo recibe los suyos según su configuración de ese calendario." },
  { titulo: "Mantener el control",
    texto: "Cambia de calendario o desconecta cuando quieras. Si Google deja de aceptar la conexión, Pangui se detiene y avisa a los administradores." },
];

// Ficha técnica para el equipo de TI de la empresa.
const FICHA_TI: { dato: string; valor: string }[] = [
  { dato: "Tipo de acceso", valor: "OAuth 2.0 de Google, autorizado por un owner o administrador de la empresa." },
  { dato: "Permisos", valor: "Ver la lista de calendarios (calendarlist.readonly) y crear, modificar y borrar eventos (calendar.events). Pangui solo modifica los eventos que creó." },
  { dato: "Datos enviados", valor: "Nota, fecha, hora, aviso, estado y prioridad del pendiente; nombre de quien lo creó; número y título de la OT; enlace a Pangui." },
  { dato: "Datos leídos", valor: "La lista de calendarios de la cuenta y su correo, para mostrar con qué cuenta está conectado. Pangui no lee los eventos de tus calendarios." },
  { dato: "Credencial", valor: "El token de acceso se guarda cifrado en Supabase Vault. Solo lo usa el proceso de sincronización del servidor; no se muestra en la aplicación." },
  { dato: "Frecuencia", valor: "Cada minuto, y solo cuando hay pendientes nuevos o modificados." },
  { dato: "Ubicación de datos", valor: "Supabase (AWS us-east-1, Estados Unidos)." },
  { dato: "Revocación", valor: "«Desconectar» revoca el acceso en Google y borra el token al instante. También se puede revocar desde la cuenta de Google (Seguridad → Apps de terceros)." },
];

const REQUISITOS = [
  "Una cuenta de Google, de Gmail o de Google Workspace, con permiso para «Hacer cambios en eventos» en el calendario elegido.",
  "Rol owner o administrador en Pangui para conectar, cambiar de calendario o desconectar.",
  "Si tu empresa usa Google Workspace: que su administrador permita apps de terceros (es lo habitual).",
];

const PREGUNTAS: { q: string; a: string }[] = [
  { q: "¿Necesito Google Workspace?",
    a: "No. Funciona igual con una cuenta de Gmail y con una de Google Workspace." },
  { q: "¿Quién ve los eventos?",
    a: "Todas las personas que tengan acceso al calendario elegido en Google. Elige un calendario compartido solo con quien corresponda." },
  { q: "¿A todo el equipo le llegan los avisos?",
    a: "El aviso que fija Pangui rige para la cuenta conectada. Cada persona que ve el calendario recibe los avisos según su propia configuración: en Google Calendar, Configuración → el calendario → «Notificaciones de eventos». Además, Pangui avisa al creador de cada pendiente por notificación y correo." },
  { q: "¿Qué pasa si muevo o borro un evento en Google?",
    a: "La integración va en un solo sentido: Pangui no lee los cambios hechos en Google. La próxima vez que cambies ese pendiente en Pangui, el evento se vuelve a escribir (y si lo borraste, se crea de nuevo). Para mover un pendiente, muévelo en Pangui." },
  { q: "¿Por qué un pendiente sin hora aparece a las 08:30?",
    a: "Es la hora a la que Pangui avisa los pendientes sin hora. Así el aviso de Google calza con el de Pangui. En un evento de día completo, Google contaría el aviso desde la medianoche." },
  { q: "¿Qué pasa con los pendientes hechos, cancelados o de OTs borradas?",
    a: "Su evento se borra del calendario. El historial sigue en Pangui, en la Actividad de cada OT." },
  { q: "¿Qué pasa si Google corta la conexión?",
    a: "Pangui detiene la sincronización, marca la conexión como «Reconectar» y avisa a los administradores. Al reconectar, el calendario se pone al día solo." },
  { q: "¿Cómo se desconecta?",
    a: "Un owner o administrador usa «Desconectar» en esta página: Pangui revoca el acceso en Google y borra el token. Los eventos ya creados se quedan en el calendario." },
];

// Colores de la nube del lado de Google Calendar: los azules de su ícono.
const GCAL_AZUL = "#3d8eff";
const GCAL_CELESTE = "#7aa7ff";

export default function GoogleCalendarIntegracionPage() {
  const gate = useGateIntegraciones("google-calendar");
  // Vuelta de /api/google/callback (?calendario=conectado|cancelado|…): se
  // muestra en el panel y se limpia la URL para que recargar no la repita.
  // Leerla al montar no desincroniza la hidratación: el primer render es el
  // spinner del gate y no usa `vuelta`.
  const [vuelta] = useState(() =>
    typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("calendario") ?? undefined);
  useEffect(() => {
    if (vuelta) window.history.replaceState(null, "", window.location.pathname);
  }, [vuelta]);

  if (gate === "cargando") {
    return <div style={{ minHeight: 320, display: "grid", placeItems: "center", color: "var(--fg-3)" }}><Loader2 size={20} className="animate-spin" /></div>;
  }
  if (gate === "denegado") {
    return <p style={{ padding: 32, color: "var(--fg-3)", fontSize: 14 }}>Esta sección no está disponible para tu cuenta.</p>;
  }

  return (
    <div>
      <EncabezadoIntegracion titulo="Google Calendar y Pangui" logo={<LogoGoogleCalendar alto={66} />} colores={[GCAL_AZUL, GCAL_CELESTE]} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 56px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          <Seccion icono={<Sparkles size={20} />} titulo="Resumen">
            <p style={{ margin: 0 }}>
              Lleva los pendientes de tus órdenes de trabajo al calendario de Google que usa tu equipo. Cada pendiente
              abierto aparece como evento, con su fecha, su hora y su aviso, y se actualiza solo cuando cambia en Pangui:
              lo que falta hacer en cada OT queda a la vista de todos, en el mismo lugar donde ya organizan su semana.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              La conexión la autoriza un owner o administrador con su cuenta de Google, de Gmail o de Google Workspace.
              Integración configurada y gestionada por Pangui.
            </p>
          </Seccion>

          <Seccion icono={<ListChecks size={20} />} titulo="Funcionalidades clave">
            <ListaTitulada items={FUNCIONALIDADES} />
          </Seccion>

          <Seccion icono={<Workflow size={20} />} titulo="Cómo funciona">
            <ListaTitulada items={PASOS} />
          </Seccion>

          <Seccion icono={<Link2 size={20} />} titulo="Sin conectar una cuenta: link de calendario">
            <LinkCalendarioIcs />
          </Seccion>

          <Seccion icono={<ShieldCheck size={20} />} titulo="Seguridad y acceso">
            <p style={{ margin: "0 0 12px" }}>Ficha para el equipo de TI de tu empresa.</p>
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
        </div>

        <aside style={{ display: "grid", gap: 16, position: "sticky", top: 24 }}>
          <ConexionGoogleCalendarPanel vuelta={vuelta} />
          <TarjetaLateral
            titulo="Los pendientes de tus OTs, en el calendario del equipo"
            texto="Lo que falta hacer en cada orden de trabajo aparece en Google Calendar, con su aviso, y se actualiza solo."
            enlaces={[
              { href: "mailto:contacto@getpangui.com?subject=Integraci%C3%B3n%20Google%20Calendar", icono: <Mail size={15} />, label: "Contactar soporte" },
              { href: "https://calendar.google.com", icono: <ExternalLink size={15} />, label: "Abrir Google Calendar", externo: true },
              { href: "https://myaccount.google.com/connections", icono: <KeyRound size={15} />, label: "Apps conectadas a tu cuenta", externo: true },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}
