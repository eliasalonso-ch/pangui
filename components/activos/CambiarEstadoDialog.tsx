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
import {
  cambiarEstadoActivo, cambiarEstadoActivos, fetchJerarquiaActivo,
  fetchMotivosInactividad, createMotivoInactividad, borrarMotivoInactividad,
  type ActivoJerarquia, type MotivoInactividad, type TipoInactividad,
} from "@/lib/activo-estado-api";
import SearchSelect from "@/components/activos/SearchSelect";
import { Desplegable } from "@/components/Desplegable";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Checkbox } from "@/components/filtros/primitivas";
import { createClient } from "@/lib/supabase";
import { tipoDeEstado } from "@/lib/activo-estado-ui";
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

/** Cómo cuenta cada parada, en la misma opción: ya no hay "Tipo de parada". */
const DETALLE_ESTADO: Partial<Record<AssetStatus, string>> = {
  mantencion: " — planificada (preventiva, inspección)",
  fuera_servicio: " — avería o falla",
};

const labelStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 5, display: "block",
};
// Mismo alto (40) y radio que Desplegable, DateTimePicker y SearchSelect.
const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
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
  // El estado define el tipo de parada (CHECKs en la base): fuera de servicio
  // es una avería y mantención es planificada. No se pregunta.
  const tipoEfectivo: TipoInactividad | "" = tipoDeEstado(estado) ?? "";
  const [desde, setDesde] = useState<"ahora" | "1h" | "ayer" | "custom">("ahora");
  const [custom, setCustom] = useState<Date | undefined>(undefined);
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * Padre e hijos directos, para poder registrar la parada de todo lo que se
   * detuvo junto.
   *
   * No se propaga solo. La norma ISO 14224 separa los componentes en serie —si
   * fallan, el equipo padre se detiene— de los redundantes, que fallan sin parar
   * nada. Marcar al padre automáticamente inventaría horas de parada en cada
   * equipo con redundancia, y de esas horas salen la disponibilidad y el MTBF.
   * Así que el diálogo PROPONE y el usuario confirma, igual que MaintainX.
   */
  const [jerarquia, setJerarquia] = useState<ActivoJerarquia[]>([]);
  const [tambien, setTambien] = useState<Set<string>>(new Set());

  /**
   * Catálogo de motivos y el workspace, para poder crear uno nuevo desde el
   * mismo desplegable. El catálogo que viene por defecto es un punto de
   * partida: cada planta tiene su propio vocabulario de fallas, y lo que no se
   * puede nombrar termina cayendo en "Otro", que es donde el Pareto deja de
   * servir.
   */
  const [motivos, setMotivos] = useState<MotivoInactividad[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [wsId, setWsId] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        const [lista, perfil] = await Promise.all([
          fetchMotivosInactividad(),
          user
            ? sb.from("usuarios").select("workspace_id").eq("id", user.id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        if (cancelado) return;
        setMotivos(lista);
        setWsId((perfil.data?.workspace_id as string | undefined) ?? null);
      } catch {
        if (!cancelado) setMotivos([]);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetchJerarquiaActivo(activoId)
      .then(rel => {
        if (cancelado) return;
        setJerarquia(rel);
        // `critico` es la marca de que el componente está en serie: se propone
        // marcado. El redundante queda desmarcado, a un clic si hace falta.
        setTambien(new Set(
          rel.filter(r => r.criticidad === "critico" && r.estado !== estado).map(r => r.id),
        ));
      })
      .catch(() => { if (!cancelado) setJerarquia([]); });
    return () => { cancelado = true; };
    // Solo al abrir. `estado` queda fuera a propósito: recalcular las marcas con
    // cada cambio del selector pisaría lo que el usuario ya destildó a mano.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activoId]);

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
    return custom ?? null;
  }

  async function guardar() {
    setErr(null);
    if (desde === "custom" && !custom) {
      setErr("Elige la fecha y hora de inicio.");
      return;
    }
    // Una parada no puede haber empezado en el futuro: la RPC contaría horas
    // negativas de inactividad. (El selector no tiene tope como el
    // datetime-local, así que se valida acá.)
    if (desde === "custom" && custom && custom.getTime() > Date.now()) {
      setErr("La fecha de inicio no puede ser futura.");
      return;
    }
    // La RPC también lo exige, pero llegar hasta allá significa mostrarle al
    // usuario una excepción de Postgres en vez de una frase.
    if (tipoEfectivo === "sin_planear" && !motivoId) {
      setErr("Elige el motivo de la falla.");
      return;
    }
    setBusy(true);
    try {
      const comun = {
        estado,
        tipoInactividad: estado === "operativo" ? null : (tipoEfectivo as TipoInactividad),
        desde: resolverDesde(),
        notas: notas.trim() || null,
        motivoId: tipoEfectivo === "sin_planear" ? motivoId : null,
      };
      // Con acompañantes va la versión en lote: una sola transacción, así no
      // queda el equipo parado y sus componentes operativos (o al revés) si
      // algo falla a mitad de camino.
      if (tambien.size > 0) {
        await cambiarEstadoActivos([activoId, ...tambien], comun);
      } else {
        await cambiarEstadoActivo({ activoId, ...comun });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo actualizar el estado.");
      setBusy(false);
    }
  }

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
        // Sin `overflow: hidden`: las listas de Desplegable y SearchSelect son
        // absolutas y la tarjeta las recortaba.
        boxShadow: "var(--shadow-lg)",
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
            <Desplegable
              ariaLabel="Estado" anchoCompleto disabled={busy}
              value={estado}
              // El estado ya dice cómo cuenta la parada: se explica en la opción.
              opciones={opciones.map(e => ({ value: e, label: ESTADO_LABEL[e] + (DETALLE_ESTADO[e] ?? "") }))}
              onChange={setEstado}
            />
          </div>

          {/* Motivo: solo para la avería.
              La mantención programada ya se explica sola; una avería sin causa
              registrada es el dato que después no se puede reconstruir, y sin
              él el Pareto de motivos queda con una barra "sin clasificar" que
              se come al resto. */}
          {tipoEfectivo === "sin_planear" && (
            <div>
              <label style={labelStyle}>Motivo de la falla</label>
              <SearchSelect
                placeholder="Buscar o crear motivo…"
                emptyLabel="Sin motivo"
                value={motivoId}
                options={motivos.map(m => ({ id: m.id, label: m.nombre }))}
                onChange={setMotivoId}
                disabled={busy}
                createLabel="Crear motivo"
                onCreate={wsId ? (async nombre => {
                  const nuevo = await createMotivoInactividad(wsId, nombre);
                  // Puede ser uno borrado que se reactivó: sin duplicarlo.
                  setMotivos(prev => [...prev.filter(m => m.id !== nuevo.id), nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
                  return nuevo.id;
                }) : undefined}
                onDelete={async id => {
                  await borrarMotivoInactividad(id);
                  setMotivos(prev => prev.filter(m => m.id !== id));
                }}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>
              {estado === "operativo" ? "Operativo desde" : "Fuera de línea desde"}
            </label>
            <Desplegable
              ariaLabel={estado === "operativo" ? "Operativo desde" : "Fuera de línea desde"}
              anchoCompleto disabled={busy}
              value={desde}
              opciones={[
                { value: "ahora", label: "Ahora" },
                { value: "1h", label: "Hace una hora" },
                { value: "ayer", label: "Ayer" },
                { value: "custom", label: "Elige fecha y hora" },
              ]}
              onChange={setDesde}
            />
          </div>

          {desde === "custom" && (
            <div>
              <label style={labelStyle}>Fecha y hora de inicio</label>
              <DateTimePicker value={custom} onChange={setCustom} disabled={busy} />
            </div>
          )}

          <div>
            <label style={labelStyle}>Notas (opcional)</label>
            <input type="text" value={notas} disabled={busy} style={inputStyle}
              placeholder="Ej. Falla en el motor principal"
              onChange={e => setNotas(e.target.value)} />
          </div>

          {/* Resto de la jerarquía. Solo aparece si el activo tiene padre o
              hijos, y solo lista a los que NO están ya en el estado destino:
              ofrecer "parar" algo que ya está parado no es una opción real. */}
          {jerarquia.filter(r => r.estado !== estado).length > 0 && (
            <div>
              <label style={labelStyle}>Actualizar también</label>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {jerarquia.filter(r => r.estado !== estado).map(rel => (
                  <label
                    key={rel.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      padding: "9px 12px", cursor: busy ? "default" : "pointer",
                      borderBottom: "1px solid var(--border)",
                      background: "var(--surface-1)",
                    }}
                  >
                    {/* Casilla de la app (la de los filtros); el input nativo
                        queda invisible pero sigue dando teclado y lector. */}
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={tambien.has(rel.id)}
                      onChange={e => setTambien(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(rel.id); else next.delete(rel.id);
                        return next;
                      })}
                      style={{ position: "absolute", opacity: 0, width: 1, height: 1, margin: 0 }}
                    />
                    <span style={{ marginTop: 2, display: "flex" }}><Checkbox checked={tambien.has(rel.id)} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, color: "var(--fg-1)" }}>
                        {rel.nombre}
                      </span>
                      <span style={{ display: "block", fontSize: 14, color: "var(--fg-4)" }}>
                        {rel.relacion === "padre" ? "Equipo padre" : "Componente"}
                        {rel.criticidad === "critico" && " · crítico"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--fg-4)", lineHeight: 1.5 }}>
                Los componentes críticos vienen marcados porque su parada detiene al
                equipo. Desmárcalos si este siguió funcionando.
              </p>
            </div>
          )}

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
