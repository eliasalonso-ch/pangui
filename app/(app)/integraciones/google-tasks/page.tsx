"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, ListChecks, Workflow, CircleHelp, ExternalLink, Mail, ShieldCheck, ClipboardCheck, KeyRound } from "lucide-react";
import { LogoGoogleTasks } from "@/components/integraciones/Logos";
import { useGateIntegraciones } from "@/components/integraciones/useGateIntegraciones";
import ConexionGooglePanel from "@/components/integraciones/ConexionGooglePanel";
import {
  EncabezadoIntegracion, Seccion, ListaTitulada, FichaTecnica, PreguntasFrecuentes, TarjetaLateral,
} from "@/components/integraciones/PaginaIntegracion";

const FUNCIONALIDADES: { titulo: string; texto: string }[] = [
  { titulo: "Tareas para marcar, no eventos",
    texto: "Los pendientes que envías a Google Tasks aparecen en tu lista: en la app Tasks, en el panel lateral de Gmail y en Google Calendar como tareas para marcar, no como eventos que bloquean tu agenda." },
  { titulo: "Tú eliges a dónde va cada uno",
    texto: "En cada pendiente, «Enviar a Google» dice si va a Google Calendar, a Google Tasks o a ninguno. Por defecto, los que tienen hora van a Calendar (son citas) y los sin hora a Tasks (son cosas por hacer en el día). Sirve igual para los pendientes de una OT y para las tareas administrativas sin OT." },
  { titulo: "Siempre al día",
    texto: "Si cambias la nota, el día, el estado o la prioridad en Pangui, la tarea se actualiza en el minuto siguiente. Al marcarla hecha queda completada en Google; al cancelarla o borrarla, desaparece." },
  { titulo: "Tareas que se repiten",
    texto: "Cada vez que marcas hecha una tarea recurrente, la ocurrencia siguiente aparece como tarea nueva." },
  { titulo: "Tu cuenta, tu conexión",
    texto: "Es la misma conexión de Google que usa Google Calendar: si ya la tienes, solo se suma el permiso de Tasks. Pangui solo escribe las tareas que creó y no lee el resto de tus listas." },
];

const PASOS: { titulo: string; texto: string }[] = [
  { titulo: "Conectar",
    texto: "Tocas «Conectar con Google» (o «Agregar Google Tasks», si ya conectaste Calendar) y aceptas el permiso de Google Tasks." },
  { titulo: "Elegir la lista",
    texto: "Pangui muestra tus listas de Google Tasks. Eliges una: «Mis tareas» o una que hayas creado para el trabajo." },
  { titulo: "Sincronizar",
    texto: "Cada minuto, Pangui escribe en esa lista tus pendientes enviados a Google Tasks que son nuevos o cambiaron." },
  { titulo: "Avisar",
    texto: "El aviso lo sigue mandando Pangui, por notificación y correo, según el «Avisarme» de cada tarea." },
];

// Ficha técnica para el equipo de TI de la empresa.
const FICHA_TI: { dato: string; valor: string }[] = [
  { dato: "Tipo de acceso", valor: "OAuth 2.0 de Google. Cada persona autoriza su propia cuenta y solo se escriben sus tareas." },
  { dato: "Permisos", valor: "Crear, modificar y borrar tareas (tasks), y el correo de la cuenta (openid, email) para mostrar con qué cuenta estás conectado. Pangui solo modifica las tareas que creó." },
  { dato: "Datos enviados", valor: "Nota, día, hora, estado y prioridad de la tarea; enlace a Pangui." },
  { dato: "Datos leídos", valor: "Los nombres de tus listas de tareas y el correo de la cuenta. Pangui no lee tus tareas." },
  { dato: "Credencial", valor: "El token de acceso se guarda cifrado en Supabase Vault, el mismo de Google Calendar si lo conectaste. Solo lo usa el proceso de sincronización del servidor." },
  { dato: "Frecuencia", valor: "Cada minuto, y solo cuando hay tareas nuevas o modificadas." },
  { dato: "Ubicación de datos", valor: "Supabase (AWS us-east-1, Estados Unidos)." },
  { dato: "Revocación", valor: "«Desconectar» revoca el acceso en Google y borra el token al instante (también deja de escribir en Google Calendar). También se puede revocar desde la cuenta de Google (Seguridad → Apps de terceros)." },
];

const REQUISITOS = [
  "Una cuenta de Google, de Gmail o de Google Workspace.",
  "Rol owner o administrador en Pangui. Cada persona conecta su propia cuenta.",
  "Si tu empresa usa Google Workspace: que su administrador permita apps de terceros y tenga Google Tasks activo.",
];

const PREGUNTAS: { q: string; a: string }[] = [
  { q: "¿Qué pendientes llegan a Google Tasks?",
    a: "Los que tienen «Enviar a Google: Google Tasks», de una OT o sin OT. Por defecto son los que no tienen hora; puedes cambiarlo en cada pendiente." },
  { q: "¿Por qué la tarea no tiene hora en Google?",
    a: "Google Tasks guarda solo el día cuando otra app crea la tarea. Pangui pone la hora en las notas de la tarea y te avisa a esa hora por notificación y correo." },
  { q: "¿Qué pasa si marco la tarea completada en Google?",
    a: "La integración va en un solo sentido: Pangui no lee los cambios hechos en Google. Márcala hecha en Pangui; la próxima vez que la cambies ahí, la tarea de Google se vuelve a escribir." },
  { q: "¿Necesito conectar Google Calendar también?",
    a: "No. Son independientes: puedes usar solo Google Tasks, solo Google Calendar o los dos con la misma cuenta." },
  { q: "¿Qué pasa si Google corta la conexión?",
    a: "Pangui detiene la sincronización, marca tu conexión como «Reconectar» y te avisa. Al reconectar, tu lista se pone al día sola." },
];

// Colores de la nube del lado de Google Tasks: los azules de su ícono.
const GTASKS_AZUL = "#2684FC";
const GTASKS_OSCURO = "#0066DA";

export default function GoogleTasksIntegracionPage() {
  const gate = useGateIntegraciones("google-tasks");
  // Vuelta de /api/google/callback (?tareas=conectado|cancelado|…): se muestra
  // en el panel y se limpia la URL para que recargar no la repita.
  const [vuelta] = useState(() =>
    typeof window === "undefined" ? undefined : new URLSearchParams(window.location.search).get("tareas") ?? undefined);
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
      <EncabezadoIntegracion titulo="Google Tasks y Pangui" logo={<LogoGoogleTasks alto={62} />} colores={[GTASKS_AZUL, GTASKS_OSCURO]} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 24px 56px", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 20 }}>
          <Seccion icono={<Sparkles size={20} />} titulo="Resumen">
            <p style={{ margin: 0 }}>
              Lleva tus tareas administrativas a Google Tasks. Lo que tienes que hacer y no es de ninguna orden de trabajo
              (renovar un seguro, pedir una cotización, pagar una patente) se crea en Mis pendientes con «Nueva tarea» y
              aparece en tu lista de Google, sin ensuciar el ciclo de las OTs. Los pendientes de una OT sin hora también pueden ir ahí.
            </p>
            <p style={{ margin: "10px 0 0" }}>
              La conexión es personal y es la misma que usa Google Calendar. Integración configurada y gestionada por Pangui.
            </p>
          </Seccion>

          <Seccion icono={<ListChecks size={20} />} titulo="Funcionalidades clave">
            <ListaTitulada items={FUNCIONALIDADES} />
          </Seccion>

          <Seccion icono={<Workflow size={20} />} titulo="Cómo funciona">
            <ListaTitulada items={PASOS} />
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
          <ConexionGooglePanel destino="tasks" vuelta={vuelta} />
          <TarjetaLateral
            titulo="Tus pendientes, en Google Tasks"
            texto="Lo que tienes que hacer, de una OT o administrativo, aparece en tu lista de Google y se completa solo al cerrarlo en Pangui."
            enlaces={[
              { href: "/pendientes", icono: <ListChecks size={15} />, label: "Ir a Mis pendientes" },
              { href: "mailto:contacto@getpangui.com?subject=Integraci%C3%B3n%20Google%20Tasks", icono: <Mail size={15} />, label: "Contactar soporte" },
              { href: "https://tasks.google.com", icono: <ExternalLink size={15} />, label: "Abrir Google Tasks", externo: true },
              { href: "https://myaccount.google.com/connections", icono: <KeyRound size={15} />, label: "Apps conectadas a tu cuenta", externo: true },
            ]}
          />
        </aside>
      </div>
    </div>
  );
}
