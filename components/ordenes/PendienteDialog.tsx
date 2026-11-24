"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import Modal from "@/components/Modal";
import { DatePicker, TimePicker, fechaDeYmd, ymdDeFecha } from "@/components/ui/date-time-picker";
import { RecurrenceControls, etiquetaRecurrencia } from "@/app/(app)/ordenes/RecurrenceControls";
import { Desplegable } from "@/components/Desplegable";
import {
  RAPIDAS, HORA_DEFECTO, rapidaActiva, resumenPendiente, validarPendiente,
  crearPendiente, actualizarPendiente, ESTADOS_PENDIENTE, PRIORIDADES_PENDIENTE,
  PLANTILLAS_AVISO, UNIDADES_AVISO, AVISO_MAX_GOOGLE, descomponerAviso, DESTINOS_GOOGLE, destinoPorDefecto,
  type DatosPendiente, type DestinoGooglePendiente, type EstadoPendiente, type Pendiente, type PrioridadPendiente,
} from "@/lib/pendientes-api";
import { leerConexionGoogle, tienePermisoCalendar, tienePermisoTasks } from "@/lib/google-calendar-conexion";

/**
 * Diálogo para crear o editar un pendiente. Sigue el bloque "Set Reminder" de
 * shadcn.io (nombre, atajos de día y hora, día, hora, repetir, canales, una
 * frase que lee la elección y una línea con el motivo si no se puede
 * guardar), armado con las piezas de la app: Modal, DatePicker/TimePicker y
 * el RecurrenceControls del formulario de OT. Los atajos usan el estilo de los
 * botones de Prioridad de ese formulario.
 */

const rotulo: React.CSSProperties = { fontSize: 14, fontWeight: 400, color: "var(--fg-3)", letterSpacing: "0.01em", marginBottom: 8 };
// Todo a 40 px: el alto por defecto de DatePicker, TimePicker y Desplegable.
const ALTO = 40;
const atajo = (activo: boolean): React.CSSProperties => ({
  height: ALTO, padding: "0 10px", whiteSpace: "nowrap",
  border: activo ? "none" : "1px solid var(--border)",
  borderRadius: 6, fontSize: 14, fontWeight: 400, fontFamily: "inherit",
  background: activo ? "var(--surface-hover)" : "var(--surface-1)",
  color: activo ? "var(--brand)" : "var(--fg-2)",
  cursor: "pointer", transition: "all 0.1s",
});

export default function PendienteDialog({ ordenId, pendiente, onClose, onSaved }: {
  /** null = tarea sin OT. */
  ordenId: string | null;
  /** null = crear uno nuevo. */
  pendiente: Pendiente | null;
  onClose: () => void;
  onSaved: () => unknown;
}) {
  const [d, setD] = useState<DatosPendiente>(() => pendiente
    ? {
        nota: pendiente.nota, fecha: pendiente.fecha, hora: pendiente.hora,
        recurrencia: pendiente.recurrencia, recurrencia_config: pendiente.recurrencia_config,
        push: pendiente.push, correo: pendiente.correo, estado: pendiente.estado, prioridad: pendiente.prioridad,
        aviso_minutos: pendiente.aviso_minutos, gcal_destino: pendiente.gcal_destino,
      }
    : { nota: "", fecha: "", hora: null, recurrencia: "ninguna", recurrencia_config: null, push: true, correo: true, estado: "por_hacer", prioridad: "media", aviso_minutos: 0, gcal_destino: destinoPorDefecto(null) });
  // Mientras nadie toque "Enviar a Google", el destino sigue a la hora (con hora → Calendar, sin hora → Tasks).
  const [destinoTocado, setDestinoTocado] = useState(!!pendiente);
  // La conexión con Google es personal: sin conexión no hay a dónde enviar y el campo no se muestra.
  const { data: conexion } = useQuery({ queryKey: ["calendario-google"], queryFn: leerConexionGoogle, staleTime: 60_000 });
  const destinoListo: Record<DestinoGooglePendiente, boolean> = {
    calendar: tienePermisoCalendar(conexion ?? null) && !!conexion?.calendar_id,
    tasks: tienePermisoTasks(conexion ?? null) && !!conexion?.tasklist_id,
    ninguno: true,
  };
  // Aviso personalizado: se abre solo si el aviso guardado no es una plantilla.
  const [personalizado, setPersonalizado] = useState(() => !PLANTILLAS_AVISO.some(([m]) => m === (pendiente?.aviso_minutos ?? 0)));
  const [avisoCant, setAvisoCant] = useState(() => descomponerAviso(pendiente?.aviso_minutos ?? 0).cantidad);
  const [avisoUnidad, setAvisoUnidad] = useState(() => descomponerAviso(pendiente?.aviso_minutos ?? 0).unidad);
  const [error, setError] = useState<{ campo: string; mensaje: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const notaRef = useRef<HTMLInputElement>(null);
  const pushRef = useRef<HTMLInputElement>(null);
  const ahora = new Date();

  // Cualquier cambio borra el motivo del rechazo anterior.
  const cambiar = (p: Partial<DatosPendiente>) => {
    setD(prev => {
      const n = { ...prev, ...p };
      if ("hora" in p && !destinoTocado) n.gcal_destino = destinoPorDefecto(n.hora);
      return n;
    });
    setError(null);
  };
  const activa = d.fecha ? rapidaActiva(d.fecha, d.hora, ahora) : null;
  // Mover fecha, hora o aviso vuelve a avisar (limpia avisado_at).
  const movioFecha = !pendiente || pendiente.fecha !== d.fecha || pendiente.hora !== d.hora || pendiente.aviso_minutos !== d.aviso_minutos;
  const minutosDe = (cant: number, unidad: string) => Math.max(0, Math.round(cant)) * (UNIDADES_AVISO.find(u => u[0] === unidad)?.[1] ?? 1);

  async function guardar() {
    const e = validarPendiente(d, new Date(), movioFecha);
    if (e) {
      setError(e);
      if (e.campo === "nota") notaRef.current?.focus();
      if (e.campo === "canal") pushRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const datos = { ...d, recurrencia_config: d.recurrencia === "ninguna" ? null : d.recurrencia_config };
      if (pendiente) await actualizarPendiente(pendiente.id, datos, movioFecha);
      else await crearPendiente(ordenId, datos);
      await onSaved();
      onClose();
    } catch (err) {
      setError({ campo: "", mensaje: err instanceof Error ? err.message : "No se pudo guardar el pendiente." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      busy={busy}
      title={pendiente ? (ordenId ? "Editar pendiente" : "Editar tarea") : (ordenId ? "Nuevo pendiente" : "Nueva tarea sin OT")}
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} disabled={busy}
            style={{ height: 40, padding: "0 16px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-2)", font: "inherit", cursor: "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={busy}
            style={{ height: 40, padding: "0 18px", border: "none", borderRadius: "var(--r-md)", background: "var(--brand)", color: "var(--fg-on-brand)", font: "inherit", cursor: "pointer", opacity: busy ? 0.5 : 1 }}>
            {busy ? "Guardando…" : pendiente ? "Guardar cambios" : ordenId ? "Crear pendiente" : "Crear tarea"}
          </button>
        </>
      }
    >
      {/* Un solo bloque: el cuerpo del Modal es una columna flex con scroll y,
          con varios hijos, los encogía hasta montarse unos sobre otros. */}
      <div style={{ display: "grid", gap: 18, flexShrink: 0 }}>
      <div>
        <div style={rotulo}>Qué hay que hacer</div>
        <input ref={notaRef} autoFocus value={d.nota} onChange={e => cambiar({ nota: e.target.value })}
          onKeyDown={e => { if (e.key === "Enter") guardar(); }}
          placeholder="Ej.: confirmar materiales y coordinar fecha con Samuel"
          aria-label="Qué hay que hacer" aria-invalid={error?.campo === "nota"}
          style={{ width: "100%", boxSizing: "border-box", height: ALTO, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, color: "var(--fg-1)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)" }} />
      </div>

      <div>
        <div style={rotulo}>Cuándo</div>
        <div role="group" aria-label="Atajos de fecha" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 8 }}>
          {RAPIDAS.map(r => (
            <button key={r.id} type="button" aria-pressed={activa === r.id} style={atajo(activa === r.id)}
              onClick={() => cambiar(r.calc(new Date()))}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div>
          <div style={rotulo}>Día</div>
          <DatePicker alto={ALTO} min={new Date(new Date().setHours(0, 0, 0, 0))} value={fechaDeYmd(d.fecha)}
            onChange={f => cambiar({ fecha: ymdDeFecha(f) })} />
        </div>
        <div>
          {/* "Quitar hora" va en la línea del rótulo para no mover los campos. */}
          <div style={{ ...rotulo, display: "flex", justifyContent: "space-between" }}>
            Hora
            {d.hora && (
              <button type="button" onClick={() => cambiar({ hora: null })}
                style={{ padding: 0, border: "none", background: "none", color: "var(--brand)", font: "inherit", fontSize: 13, cursor: "pointer" }}>
                Quitar hora
              </button>
            )}
          </div>
          <TimePicker value={d.hora ?? ""} onChange={h => cambiar({ hora: h || null })}
            placeholder={`Sin hora (${HORA_DEFECTO})`} />
        </div>
      </div>

      <div>
        <div style={rotulo}>Avisarme</div>
        <div role="group" aria-label="Plantillas de aviso" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))", gap: 8 }}>
          {PLANTILLAS_AVISO.map(([min, label]) => {
            const on = !personalizado && d.aviso_minutos === min;
            return (
              <button key={min} type="button" aria-pressed={on} style={atajo(on)}
                onClick={() => { setPersonalizado(false); cambiar({ aviso_minutos: min }); }}>
                {label}
              </button>
            );
          })}
          <button type="button" aria-pressed={personalizado} style={atajo(personalizado)}
            onClick={() => {
              const { cantidad, unidad } = descomponerAviso(d.aviso_minutos || 2880);
              setAvisoCant(cantidad); setAvisoUnidad(unidad); setPersonalizado(true);
              cambiar({ aviso_minutos: minutosDe(cantidad, unidad) });
            }}>
            Personalizado
          </button>
        </div>
        {personalizado && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <input type="number" min={1} step={1} value={avisoCant} aria-label="Cantidad del aviso" aria-invalid={error?.campo === "aviso"}
              onChange={e => { const n = Number(e.target.value); setAvisoCant(n); cambiar({ aviso_minutos: minutosDe(n, avisoUnidad) }); }}
              style={{ width: 90, boxSizing: "border-box", height: ALTO, padding: "0 12px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, color: "var(--fg-1)", outline: "none", fontFamily: "inherit", background: "var(--surface-1)" }} />
            <div style={{ width: 160 }}>
              <Desplegable ariaLabel="Unidad del aviso" anchoCompleto alto={ALTO} value={avisoUnidad}
                onChange={u => { setAvisoUnidad(u); cambiar({ aviso_minutos: minutosDe(avisoCant, u) }); }}
                opciones={UNIDADES_AVISO.map(([id, , , plural]) => ({ value: id, label: plural }))} />
            </div>
            <span style={{ fontSize: 14, color: "var(--fg-3)" }}>antes</span>
          </div>
        )}
        {d.gcal_destino === "calendar" && d.aviso_minutos > AVISO_MAX_GOOGLE && (
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--fg-4)" }}>
            Google Calendar avisa como máximo 4 semanas antes. El aviso de Pangui (push y correo) llega igual en la fecha elegida.
          </p>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div>
          <div style={rotulo}>Estado</div>
          <Desplegable<EstadoPendiente> ariaLabel="Estado" anchoCompleto alto={ALTO} value={d.estado}
            onChange={v => cambiar({ estado: v })}
            opciones={ESTADOS_PENDIENTE.map(([value, label]) => ({ value, label }))} />
        </div>
        <div>
          <div style={rotulo}>Prioridad</div>
          <Desplegable<PrioridadPendiente> ariaLabel="Prioridad" anchoCompleto alto={ALTO} value={d.prioridad}
            onChange={v => cambiar({ prioridad: v })}
            opciones={PRIORIDADES_PENDIENTE.map(([value, label]) => ({ value, label }))} />
        </div>
      </div>

      <div>
        <div style={rotulo}>Recurrencia</div>
        <RecurrenceControls
          value={{ recurrencia: d.recurrencia, recurrencia_config: d.recurrencia_config, fecha_inicio: d.fecha }}
          onChange={next => cambiar(next)}
          compact
        />
      </div>

      <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
        <legend style={{ ...rotulo, padding: 0 }}>Avisarme por</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--fg-1)" }}>
            <input ref={pushRef} type="checkbox" checked={d.push} onChange={e => cambiar({ push: e.target.checked })} />
            Notificación (push)
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", color: "var(--fg-1)" }}>
            <input type="checkbox" checked={d.correo} onChange={e => cambiar({ correo: e.target.checked })} />
            Correo de las 8:30
          </label>
        </div>
      </fieldset>

      {conexion && (
        <div>
          <div style={rotulo}>Enviar a Google</div>
          <Desplegable<DestinoGooglePendiente> ariaLabel="Enviar a Google" anchoCompleto alto={ALTO} value={d.gcal_destino}
            onChange={v => { setDestinoTocado(true); cambiar({ gcal_destino: v }); }}
            opciones={DESTINOS_GOOGLE.map(([value, label]) => ({ value, label }))} />
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--fg-4)" }}>
            {!destinoListo[d.gcal_destino] ? (
              <>
                Todavía no conectas {d.gcal_destino === "calendar" ? "Google Calendar" : "Google Tasks"}: se enviará cuando lo conectes en{" "}
                <Link href={`/integraciones/${d.gcal_destino === "calendar" ? "google-calendar" : "google-tasks"}`} prefetch={false} style={{ color: "var(--brand)" }}>Integraciones</Link>.
              </>
            ) : d.gcal_destino === "calendar" ? "Como evento en tu calendario, a su hora."
              : d.gcal_destino === "tasks" ? "Como tarea por hacer en tu lista; Google Tasks guarda el día, no la hora."
              : "Queda solo en Pangui."}
          </p>
        </div>
      )}

      <div>
        <p aria-live="polite" style={{ margin: 0, minHeight: 20, color: "var(--fg-2)" }}>
          {resumenPendiente(d, etiquetaRecurrencia(d.recurrencia, d.recurrencia_config), ahora)}
        </p>
        {/* Espacio reservado: el motivo aparece sin mover el diálogo. */}
        <p role="alert" style={{ margin: "4px 0 0", minHeight: 20, fontSize: 13, color: "var(--st-wait-fg)" }}>
          {error?.mensaje ?? ""}
        </p>
      </div>
      </div>
    </Modal>
  );
}
