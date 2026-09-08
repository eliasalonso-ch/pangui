"use client";

/**
 * Diálogo de cambio de estado de un activo.
 *
 * Vivía dentro de /activos/[id]/estado, que era su único punto de entrada. Al
 * aparecer el estado del activo también en la OT (OTDetail), el desplegable de
 * ahí no tenía dónde preguntar el tipo de parada y la fecha de inicio, así que
 * derivaba a esa página: el técnico perdía la OT que estaba mirando para
 * registrar una avería que acababa de ver. Extraído acá, las dos pantallas
 * usan el mismo formulario y el mismo camino de escritura.
 *
 * Todo pasa por `cambiar_estado_activo` (la RPC), nunca por un update a
 * `activos.estado`: esa función cierra el período abierto en
 * `activo_estado_periodos` y abre el nuevo en una sola transacción. Escribir la
 * columna a secas dejaría el historial con huecos y las horas de parada mal
 * contadas.
 */

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { cambiarEstadoActivo, type TipoInactividad } from "@/lib/activo-estado-api";
import type { AssetStatus } from "@/types/ordenes";

const MS_POR_HORA = 3_600_000;

const ESTADO_LABEL: Record<AssetStatus, string> = {
  operativo: "Operativo",
  fuera_servicio: "Fuera de servicio",
  mantencion: "En mantención",
  baja: "De baja",
};

/**
 * Estados a los que se puede pasar. `baja` queda fuera a propósito: retirar un
 * activo ya es la acción "Eliminar" (`activos.activo = false`), y tener además
 * un estado con el mismo significado dejaba dos caminos que se contradicen.
 * Sigue siendo válido en la base para no invalidar filas históricas.
 */
const ESTADO_OPCIONES: AssetStatus[] = ["operativo", "mantencion", "fuera_servicio"];

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 5, display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 38, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};

export interface CambiarEstadoDialogProps {
  activoId: string;
  /** Estado vigente. No se ofrece como destino: cambiar a lo mismo no es acción. */
  estadoActual: AssetStatus | null;
  /**
   * Estado propuesto al abrir. Desde el desplegable de la OT es el que el
   * usuario acaba de elegir; sin él se propone el opuesto al actual, que es lo
   * más probable para quien entra al historial a registrar un cambio.
   */
  estadoInicial?: AssetStatus;
  onClose: () => void;
  /** Corre después de que la RPC escribió. Refrescar acá, no antes. */
  onSaved: () => void | Promise<void>;
}

export default function CambiarEstadoDialog({
  activoId, estadoActual, estadoInicial, onClose, onSaved,
}: CambiarEstadoDialogProps) {
  const opciones = ESTADO_OPCIONES.filter(e => e !== estadoActual);

  const [estado, setEstado] = useState<AssetStatus>(
    // Si el estado propuesto es el actual no sirve como destino, así que se cae
    // a la primera opción disponible en vez de abrir en un valor inválido.
    estadoInicial && estadoInicial !== estadoActual
      ? estadoInicial
      : (opciones[0] ?? "fuera_servicio"),
  );
  const [tipo, setTipo] = useState<TipoInactividad | "">("");
  const [desde, setDesde] = useState<"ahora" | "1h" | "ayer" | "custom">("ahora");
  const [custom, setCustom] = useState("");
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Escape cierra, como cualquier modal. No mientras guarda: la RPC ya salió y
  // cerrar dejaría al usuario sin saber si se escribió.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  /** Convierte la elección del diálogo en la fecha real de inicio. */
  function resolverDesde(): Date | null {
    if (desde === "ahora") return null;
    if (desde === "1h") return new Date(Date.now() - MS_POR_HORA);
    if (desde === "ayer") return new Date(Date.now() - 24 * MS_POR_HORA);
    return custom ? new Date(custom) : null;
  }

  async function guardar() {
    setErr(null);
    if (estado !== "operativo" && !tipo) {
      setErr("Elige el tipo de parada.");
      return;
    }
    if (desde === "custom" && !custom) {
      setErr("Elige la fecha y hora de inicio.");
      return;
    }
    setBusy(true);
    try {
      await cambiarEstadoActivo({
        activoId,
        estado,
        tipoInactividad: estado === "operativo" ? null : (tipo as TipoInactividad),
        desde: resolverDesde(),
        notas: notas.trim() || null,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo actualizar el estado.");
      setBusy(false);
    }
  }

  // Tope del `datetime-local`: una parada no puede haber empezado en el futuro
  // —la RPC contaría horas negativas de inactividad—. El offset se resta porque
  // el input trabaja en hora local y toISOString devuelve UTC.
  const ahora = Date.now();
  const maxLocal = new Date(ahora - new Date(ahora).getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      // Clic en el velo cierra; el clic dentro de la tarjeta no debe burbujear
      // hasta acá o cerraría al usar cualquier campo.
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 460, background: "var(--surface-1)",
        border: "1px solid var(--border)", borderRadius: 12,
        boxShadow: "var(--shadow-lg)", overflow: "hidden",
      }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>Actualizar estado del activo</h2>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>Estado</label>
            <select value={estado} disabled={busy} style={inputStyle}
              onChange={e => {
                const v = e.target.value as AssetStatus;
                setEstado(v);
                // Operativo no lleva tipo: dejarlo cargado mandaría un valor
                // que la función rechaza.
                if (v === "operativo") setTipo("");
              }}>
              {opciones.map(e => (
                <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
              ))}
            </select>
          </div>

          {/* Solo tiene sentido clasificar una parada. */}
          {estado !== "operativo" && (
            <div>
              <label style={labelStyle}>Tipo de parada</label>
              <select value={tipo} disabled={busy} style={inputStyle}
                onChange={e => setTipo(e.target.value as TipoInactividad | "")}>
                <option value="">Elige el tipo de parada</option>
                <option value="planeado">Planeado — mantención o inspección prevista</option>
                <option value="sin_planear">Sin planear — avería o falla inesperada</option>
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>
              {estado === "operativo" ? "Operativo desde" : "Fuera de línea desde"}
            </label>
            <select value={desde} disabled={busy} style={inputStyle}
              onChange={e => setDesde(e.target.value as typeof desde)}>
              <option value="ahora">Ahora</option>
              <option value="1h">Hace una hora</option>
              <option value="ayer">Ayer</option>
              <option value="custom">Elige fecha y hora</option>
            </select>
          </div>

          {desde === "custom" && (
            <div>
              <label style={labelStyle}>Fecha y hora de inicio</label>
              <input type="datetime-local" value={custom} disabled={busy} style={inputStyle}
                max={maxLocal}
                onChange={e => setCustom(e.target.value)} />
            </div>
          )}

          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <input type="text" value={notas} disabled={busy} style={inputStyle}
              placeholder="Ej. Falla en el motor principal"
              onChange={e => setNotas(e.target.value)} />
          </div>

          {err && (
            <p style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0, fontSize: 14, color: "var(--danger)", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {err}
            </p>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", cursor: busy ? "default" : "pointer" }}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={busy}
            style={{
              height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", borderRadius: 8,
              border: `1px solid ${busy ? "var(--border)" : "var(--brand)"}`,
              background: busy ? "var(--surface-2)" : "var(--brand)",
              color: busy ? "var(--fg-4)" : "var(--fg-on-brand)",
              cursor: busy ? "default" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
            {busy && <Loader2 size={13} className="animate-spin" />}
            {busy ? "Guardando…" : "Actualizar estado"}
          </button>
        </div>
      </div>
    </div>
  );
}
