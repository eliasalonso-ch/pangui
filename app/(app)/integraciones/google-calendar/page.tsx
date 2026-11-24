"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ListChecks, Workflow, CircleHelp, ExternalLink, Mail, ShieldCheck, ClipboardCheck, Link2, KeyRound } from "lucide-react";
import { LogoGoogleCalendar } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";
import ConexionGooglePanel from "@/components/integraciones/ConexionGooglePanel";
import LinkCalendarioIcs from "@/components/integraciones/LinkCalendarioIcs";
import {
  EncabezadoIntegracion, Seccion, ListaTitulada, FichaTecnica, PreguntasFrecuentes, TarjetaLateral,
} from "@/components/integraciones/PaginaIntegracion";

const FUNCIONALIDADES: { titulo: string; texto: string }[] = [
  { titulo: "Cada pendiente, un evento",
    texto: "Tus pendientes abiertos con «Enviar a Google: Google Calendar» (por defecto, los que tienen hora) aparecen en tu calendario. El título dice qué hay que hacer; la descripción trae la OT, el estado, la prioridad y el enlace «Abrir en Pangui»." },
  { titulo: "Siempre al día",
    texto: "Si cambias la fecha, la hora, la nota, el estado o el aviso de un pendiente, el evento se actualiza en el minuto siguiente. Al marcarlo hecho, cancelarlo o borrarlo, desaparece del calendario." },
  { titulo: "El aviso de cada pendiente",
    texto: "Google te avisa en tu celular y tu computador según el «Avisarme» del pendiente: a la hora, días, semanas o meses antes. Google acepta hasta 4 semanas; para avisos más largos te avisa Pangui por notificación y correo." },
  { titulo: "Pendientes que se repiten",
    texto: "Cada vez que se marca hecho un pendiente recurrente, la ocurrencia siguiente aparece como evento nuevo." },
  { titulo: "En el calendario que elijas",
    texto: "El tuyo, o uno compartido del equipo donde puedas editar eventos. Si varias personas eligen el mismo calendario compartido, ahí se ven los pendientes de todas." },
  { titulo: "Tu cuenta, tu conexión",
    texto: "Cada persona conecta su propia cuenta de Google y la desconecta cuando quiere. Pangui solo escribe los eventos de tus pendientes y no lee el resto de tu calendario." },
];

const PASOS: { titulo: string; texto: string }[] = [
  { titulo: "Conectar",
    texto: "Tocas «Conectar con Google», inicias sesión con tu cuenta y aceptas los dos permisos que pide Pangui. Cada persona del equipo conecta la suya." },
  { titulo: "Elegir el calendario",
    texto: "Pangui muestra los calendarios donde tu cuenta puede editar eventos. Eliges uno: el tuyo o uno compartido." },
  { titulo: "Sincronizar",
    texto: "Cada minuto, Pangui escribe en ese calendario tus pendientes nuevos o que cambiaron." },
  { titulo: "Avisar",
    texto: "Google te avisa según el «Avisarme» de cada pendiente." },
  { titulo: "Mantener el control",
    texto: "Cambia de calendario o desconecta cuando quieras. Si Google deja de aceptar la conexión, Pangui se detiene y te avisa." },
];

// Ficha técnica para el equipo de TI de la empresa.
const FICHA_TI: { dato: string; valor: string }[] = [
  { dato: "Tipo de acceso", valor: "OAuth 2.0 de Google. Cada persona autoriza su propia cuenta y solo se escriben sus pendientes." },
  { dato: "Permisos", valor: "Ver la lista de calendarios (calendarlist.readonly) y crear, modificar y borrar eventos (calendar.events). Pangui solo modifica los eventos que creó." },
  { dato: "Datos enviados", valor: "Nota, fecha, hora, aviso, estado y prioridad del pendiente; nombre de quien lo creó; número y título de la OT; enlace a Pangui." },
  { dato: "Datos leídos", valor: "La lista de calendarios de la cuenta y su correo, para mostrar con qué cuenta estás conectado. Pangui no lee los eventos de tus calendarios." },
  { dato: "Credencial", valor: "El token de acceso se guarda cifrado en Supabase Vault. Solo lo usa el proceso de sincronización del servidor; no se muestra en la aplicación." },
  { dato: "Frecuencia", valor: "Cada minuto, y solo cuando hay pendientes nuevos o modificados." },
  { dato: "Ubicación de datos", valor: "Supabase (AWS us-east-1, Estados Unidos)." },
  { dato: "Revocación", valor: "«Desconectar» revoca el acceso en Google y borra el token al instante. También se puede revocar desde la cuenta de Google (Seguridad → Apps de terceros)." },
];

const REQUISITOS = [
  "Una cuenta de Google, de Gmail o de Google Workspace, con permiso para «Hacer cambios en eventos» en el calendario elegido.",
  "Rol owner o administrador en Pangui. Cada persona conecta su propia cuenta.",
  "Si tu empresa usa Google Workspace: que su administrador permita apps de terceros (es lo habitual).",
];

const PREGUNTAS: { q: string; a: string }[] = [
  { q: "¿Necesito Google Workspace?",
    a: "No. Funciona igual con una cuenta de Gmail y con una de Google Workspace." },
  { q: "¿Cada uno tiene que conectar su cuenta?",
    a: "Sí. Los pendientes son de cada persona: cada uno conecta su cuenta, ve sus propios pendientes y recibe sus propios avisos. Tu conexión no le da al resto del equipo acceso a tu cuenta de Google." },
  { q: "¿Quién ve los eventos?",
    a: "Quien tenga acceso al calendario que elegiste. En tu calendario personal, solo tú; en uno compartido, todos los que lo comparten." },
  { q: "¿Qué pasa si muevo o borro un evento en Google?",
    a: "La integración va en un solo sentido: Pangui no lee los cambios hechos en Google. La próxima vez que cambies ese pendiente en Pangui, el evento se vuelve a escribir (y si lo borraste, se crea de nuevo). Para mover un pendiente, muévelo en Pangui." },
  { q: "¿Por qué un pendiente sin hora aparece a las 08:30?",
    a: "Es la hora a la que Pangui avisa los pendientes sin hora. Así el aviso de Google calza con el de Pangui. En un evento de día completo, Google contaría el aviso desde la medianoche." },
  { q: "¿Qué pasa con los pendientes hechos, cancelados o de OTs borradas?",
    a: "Su evento se borra del calendario. El historial sigue en Pangui, en la Actividad de cada OT." },
  { q: "¿Qué pasa si Google corta la conexión?",
    a: "Pangui detiene la sincronización, marca tu conexión como «Reconectar» y te avisa. Al reconectar, tu calendario se pone al día solo." },
  { q: "¿Cómo se desconecta?",
    a: "Con «Desconectar» en esta página: Pangui revoca el acceso en Google y borra el token. Los eventos ya creados se quedan en el calendario." },
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
              Lleva tus pendientes de las órdenes de trabajo a tu Google Calendar. Cada pendiente abierto aparece como
              evento, con su fecha, su hora y su aviso, y se actualiza solo cuando cambia en Pangui: lo que te falta hacer
              en cada OT queda en el mismo lugar donde ya organizas tu semana.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              La conexión es personal: cada persona conecta su propia cuenta de Google, de Gmail o de Google Workspace, y
              recibe los avisos de sus pendientes. Integración configurada y gestionada por Pangui.
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
          <ConexionGooglePanel destino="calendar" vuelta={vuelta} />
          <TarjetaLateral
            titulo="Tus pendientes, en tu Google Calendar"
            texto="Lo que te falta hacer en cada orden de trabajo aparece en tu calendario, con su aviso, y se actualiza solo."
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
