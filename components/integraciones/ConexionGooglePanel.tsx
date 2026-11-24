"use client";

/**
 * Panel de conexión con Google (columna derecha de /integraciones/google-calendar
 * y /integraciones/google-tasks). Mismo formato que ConexionMeconectaPanel.
 *
 * Las dos páginas comparten la conexión: una cuenta de Google por persona, con
 * los permisos que se hayan concedido. Conectar lleva a /api/google/auth con el
 * destino (OAuth, include_granted_scopes: suma permisos sin perder los otros);
 * al volver, la persona elige su calendario o su lista y desde ahí la edge
 * function gcal-sync escribe sus pendientes donde diga cada uno (gcal_destino).
 */

import { useEffect, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { EstadoBadge } from "@/components/integraciones/Logos";
import { Desplegable } from "@/components/Desplegable";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";
import {
  leerConexionGoogle, estadoGoogle, estadoGoogleTasks, tienePermisoCalendar, tienePermisoTasks,
  listarCalendariosGoogle, elegirCalendarioGoogle, listarListasTareasGoogle, elegirListaTareasGoogle,
  desconectarGoogle, MENSAJE_VUELTA, MENSAJE_VUELTA_TAREAS, type ConexionGoogle,
} from "@/lib/google-calendar-conexion";

// Mismos botones que ConexionMeconectaPanel.
const btn = (primario: boolean): CSSProperties => ({
  height: 38, width: "100%", borderRadius: "var(--r-md)", fontSize: 14, fontWeight: 500, cursor: "pointer",
  border: primario ? "none" : "1px solid var(--border-strong)",
  background: primario ? "var(--brand)" : "var(--surface-1)",
  color: primario ? "var(--fg-on-brand)" : "var(--fg-1)",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, textDecoration: "none",
  fontFamily: "inherit",
});

interface Opcion { id: string; label: string; nombre: string; principal?: boolean }

/** Lo que cambia entre Google Calendar y Google Tasks. */
const DESTINOS = {
  calendar: {
    nombre: "Google Calendar",
    auth: "/api/google/auth?destino=calendar",
    tienePermiso: tienePermisoCalendar,
    estado: estadoGoogle,
    elegido: (c: ConexionGoogle) => ({ id: c.calendar_id, nombre: c.calendar_nombre }),
    listar: async (): Promise<Opcion[] | null> => {
      const r = await listarCalendariosGoogle();
      return "revocado" in r ? null
        : r.calendarios.map(c => ({ id: c.id, nombre: c.nombre, principal: c.principal, label: c.principal ? `${c.nombre} (principal)` : c.nombre }));
    },
    elegir: (o: Opcion) => elegirCalendarioGoogle({ id: o.id, nombre: o.nombre, principal: !!o.principal }),
    mensajes: MENSAJE_VUELTA,
    t: {
      campo: "Calendario",
      intro: "Conecta tu cuenta de Google y elige el calendario donde quieres ver tus pendientes con hora. Cada persona conecta la suya.",
      pregunta: "¿En qué calendario?",
      trayendo: "Trayendo tus calendarios…",
      vacio: "Esta cuenta no tiene calendarios donde pueda escribir. Pide permiso para «Hacer cambios en eventos».",
      usar: "Usar este calendario",
      cambiar: "Cambiar calendario",
      listo: "Listo: tus pendientes enviados a Google Calendar se escriben en ese calendario en el próximo minuto.",
      alCambiar: (n: string) => `Los eventos ya creados en «${n}» se quedan ahí; tus pendientes se crean de nuevo en el calendario nuevo.`,
      revocado: "Google dejó de aceptar la conexión: tus pendientes no están llegando al calendario.",
      sumarPermiso: "Agregar Google Calendar a esta cuenta",
    },
  },
  tasks: {
    nombre: "Google Tasks",
    auth: "/api/google/auth?destino=tasks",
    tienePermiso: tienePermisoTasks,
    estado: estadoGoogleTasks,
    elegido: (c: ConexionGoogle) => ({ id: c.tasklist_id, nombre: c.tasklist_nombre }),
    listar: async (): Promise<Opcion[] | null> => {
      const r = await listarListasTareasGoogle();
      return "revocado" in r ? null : r.listas.map(l => ({ id: l.id, nombre: l.nombre, label: l.nombre }));
    },
    elegir: (o: Opcion) => elegirListaTareasGoogle({ id: o.id, nombre: o.nombre }),
    mensajes: MENSAJE_VUELTA_TAREAS,
    t: {
      campo: "Lista",
      intro: "Conecta tu cuenta de Google y elige la lista de Google Tasks donde quieres ver tus pendientes por hacer. Cada persona conecta la suya.",
      pregunta: "¿En qué lista?",
      trayendo: "Trayendo tus listas…",
      vacio: "Esta cuenta no tiene listas de tareas. Crea una en Google Tasks y vuelve.",
      usar: "Usar esta lista",
      cambiar: "Cambiar lista",
      listo: "Listo: tus pendientes enviados a Google Tasks se escriben en esa lista en el próximo minuto.",
      alCambiar: (n: string) => `Las tareas ya creadas en «${n}» se quedan ahí; tus tareas se crean de nuevo en la lista nueva.`,
      revocado: "Google dejó de aceptar la conexión: tus tareas no están llegando a Google Tasks.",
      sumarPermiso: "Agregar Google Tasks a esta cuenta",
    },
  },
};

export default function ConexionGooglePanel({ destino, vuelta }: {
  destino: keyof typeof DESTINOS;
  /** Resultado de la vuelta de Google (?calendario=… o ?tareas=…). */
  vuelta?: string;
}) {
  const D = DESTINOS[destino];
  const qc = useQueryClient();
  const { data: conexion, isPending } = useQuery({ queryKey: ["calendario-google"], queryFn: leerConexionGoogle });
  const [eligiendo, setEligiendo] = useState(false);
  const [opciones, setOpciones] = useState<Opcion[] | null>(null);
  const [elegido, setElegido] = useState("");
  const [confirmarBaja, setConfirmarBaja] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(vuelta ? D.mensajes[vuelta] ?? null : null);

  const revocado = conexion?.estado === "revocado";
  const conPermiso = D.tienePermiso(conexion ?? null);
  const actual = conexion ? D.elegido(conexion) : { id: null, nombre: null };
  const mostrarSelector = !!conexion && conPermiso && !revocado && (!actual.id || eligiendo);

  // Al abrir el selector, trae los calendarios (o las listas) de la cuenta.
  useEffect(() => {
    if (!mostrarSelector || opciones) return;
    D.listar().then(async lista => {
      if (!lista) { await qc.invalidateQueries({ queryKey: ["calendario-google"] }); return; }
      setOpciones(lista);
      const ya = lista.find(o => o.id === actual.id);
      setElegido((ya ?? lista.find(o => !o.principal) ?? lista[0])?.id ?? "");
    }).catch(e => setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo leer tu cuenta de Google" }));
  }, [mostrarSelector, opciones, actual.id, qc, D]);

  async function correr(fn: () => Promise<void>, ok?: string) {
    setBusy(true);
    setAviso(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["calendario-google"] });
      if (ok) setAviso({ ok: true, texto: ok });
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  }

  const usarElegido = () => correr(async () => {
    const o = opciones?.find(x => x.id === elegido);
    if (!o) throw new Error(`Elige ${D.t.campo.toLowerCase()}`);
    await D.elegir(o);
    setEligiendo(false);
  }, D.t.listo);

  const { estado, label } = D.estado(conexion ?? null);

  return (
    <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>Conexión</p>
        {!isPending && <EstadoBadge estado={estado} label={label} />}
      </div>

      {isPending ? (
        <div style={{ display: "grid", placeItems: "center", minHeight: 80, color: "var(--fg-3)" }}><Loader2 size={18} className="animate-spin" /></div>
      ) : conexion ? (
        <dl style={{ margin: 0, display: "grid", gap: 10, fontSize: 14 }}>
          <div><dt style={{ color: "var(--fg-3)" }}>Conectado como</dt><dd style={{ margin: 0, color: "var(--fg-1)", wordBreak: "break-all" }}>{conexion.google_email}</dd></div>
          {actual.id && !eligiendo && (
            <div><dt style={{ color: "var(--fg-3)" }}>{D.t.campo}</dt><dd style={{ margin: 0, color: "var(--fg-1)", wordBreak: "break-all" }}>{actual.nombre}</dd></div>
          )}
          {!conPermiso && !revocado && (
            <div><dd style={{ margin: 0, color: "var(--fg-2)", lineHeight: 1.5 }}>Tu cuenta está conectada, pero todavía no le diste permiso a Pangui para {D.nombre}.</dd></div>
          )}
          {revocado && (
            <div><dt style={{ color: "var(--fg-3)" }}>Estado</dt><dd style={{ margin: 0, color: "var(--danger)" }}>{D.t.revocado}</dd></div>
          )}
          {!revocado && conPermiso && conexion.ultimo_error && (
            <div><dt style={{ color: "var(--fg-3)" }}>Último error</dt><dd style={{ margin: 0, color: "var(--danger)" }}>{conexion.ultimo_error}</dd></div>
          )}
        </dl>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)" }}>{D.t.intro}</p>
      )}

      {mostrarSelector && (
        <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
          <span style={{ color: "var(--fg-3)" }}>{D.t.pregunta}</span>
          {!opciones ? (
            <span style={{ color: "var(--fg-4)" }}>{D.t.trayendo}</span>
          ) : opciones.length === 0 ? (
            <span style={{ color: "var(--fg-2)", lineHeight: 1.5 }}>{D.t.vacio}</span>
          ) : (
            <>
              <Desplegable ariaLabel={D.t.campo} anchoCompleto alto={38} value={elegido} onChange={setElegido}
                opciones={opciones.map(o => ({ value: o.id, label: o.label }))} />
              <button type="button" style={btn(true)} disabled={busy || !elegido} onClick={usarElegido}>
                {busy && <Loader2 size={15} className="animate-spin" />} {D.t.usar}
              </button>
              {actual.id && (
                <>
                  <button type="button" style={btn(false)} onClick={() => setEligiendo(false)}>Cancelar</button>
                  <span style={{ fontSize: 13, color: "var(--fg-4)", lineHeight: 1.5 }}>{D.t.alCambiar(actual.nombre ?? "")}</span>
                </>
              )}
            </>
          )}
        </div>
      )}

      {aviso && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: aviso.ok ? "var(--success)" : "var(--danger)" }}>{aviso.texto}</p>
      )}

      {!isPending && !mostrarSelector && (
        <div style={{ display: "grid", gap: 8 }}>
          {!conexion || revocado ? (
            <a href={D.auth} style={btn(true)}>{revocado ? "Reconectar" : "Conectar con Google"}</a>
          ) : !conPermiso ? (
            <a href={D.auth} style={btn(true)}>{D.t.sumarPermiso}</a>
          ) : (
            <>
              <button type="button" style={btn(false)} onClick={() => setEligiendo(true)}>{D.t.cambiar}</button>
              <a href={D.auth} style={btn(false)}>Usar otra cuenta de Google</a>
            </>
          )}
          {conexion && (
            <button type="button" onClick={() => setConfirmarBaja(true)} style={{ ...btn(false), border: "none", background: "transparent", color: "var(--danger)" }}>
              Desconectar
            </button>
          )}
        </div>
      )}

      <ConfirmDeleteModal
        pending={confirmarBaja ? {
          title: "¿Desconectar tu cuenta de Google?",
          description: "Pangui deja de escribir en Google Calendar y en Google Tasks, y Google revoca el acceso. Los eventos y tareas ya creados se quedan en Google.",
          confirmLabel: "Desconectar",
          onConfirm: async () => {
            await desconectarGoogle();
            setOpciones(null);
            await qc.invalidateQueries({ queryKey: ["calendario-google"] });
          },
        } : null}
        onClose={() => setConfirmarBaja(false)}
      />
    </div>
  );
}
