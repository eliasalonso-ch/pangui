"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { BellRing, Check, Mail, Pencil, Plus, Repeat, Smartphone, Trash2 } from "lucide-react";
import { ymdDeFecha } from "@/components/ui/date-time-picker";
import PendienteDialog from "@/components/ordenes/PendienteDialog";
import ConfirmDeleteModal, { type ConfirmDelete } from "@/components/ConfirmDeleteModal";
import { EstadoPendienteTag, PrioridadPendienteTag } from "@/components/pendientes/estado-prioridad";
import { etiquetaRecurrencia } from "@/app/(app)/ordenes/RecurrenceControls";
import {
  fetchPendientes, marcarPendienteHecho, posponerPendiente, borrarPendientes,
  etiquetaPendiente, etiquetaAviso, fmtCreado, type Pendiente,
} from "@/lib/pendientes-api";

/**
 * Pestaña "Pendientes" de la OT: lo que falta hacer, con fecha. Ese día llega
 * un push (a la hora elegida o a las 08:30) y, mientras no se marque hecho,
 * sale en el correo de la mañana. Personal: cada uno ve solo los suyos.
 * Se listan en orden de creación.
 */

const btn: React.CSSProperties = {
  height: 32, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
  background: "var(--surface-1)", color: "var(--fg-2)", font: "inherit", fontSize: 13,
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
};
const etiquetaChica: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--fg-4)" };

export default function PendientesOT({ ordenId }: { ordenId: string }) {
  const qc = useQueryClient();
  const { data: lista = [] } = useQuery({ queryKey: ["pendientes", ordenId], queryFn: () => fetchPendientes(ordenId) });
  // undefined = cerrado; null = nuevo; Pendiente = editando ese.
  const [dialogo, setDialogo] = useState<Pendiente | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<ConfirmDelete | null>(null);
  const hoy = ymdDeFecha(new Date());

  // ["pendientes"] también refresca "Mis pendientes"; la Actividad recibe la
  // línea que deja el trigger al crear o marcar hecho.
  const refrescar = () => Promise.all([
    qc.invalidateQueries({ queryKey: ["pendientes"] }),
    qc.invalidateQueries({ queryKey: ["actividad", ordenId] }),
  ]);

  async function correr(fn: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      await refrescar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el pendiente.");
    } finally {
      // Pausa breve: al marcar hecho uno recurrente, el siguiente aparece en
      // el mismo lugar y un doble clic lo marcaba también.
      setTimeout(() => setOcupado(false), 700);
    }
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ width: 40, height: 40, borderRadius: 9, background: "var(--brand-tint)", color: "var(--brand-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <BellRing size={17} />
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-1)" }}>Pendientes</p>
          <p style={{ margin: "3px 0 0", fontSize: 14, color: "var(--fg-4)" }}>
            Lo que falta hacer en esta OT. Ese día te llega un aviso, y un correo cada mañana hasta que lo marques hecho.
          </p>
        </div>
        <button type="button" onClick={() => setDialogo(null)}
          style={{ ...btn, height: 38, padding: "0 14px", border: "none", background: "var(--brand)", color: "var(--fg-on-brand)", fontSize: 14 }}>
          <Plus size={15} /> Nuevo pendiente
        </button>
      </div>

      {error && <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--st-wait-fg)" }}>{error}</p>}

      {lista.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--fg-4)" }}>
          Sin pendientes. Agrega uno para que esta OT vuelva a aparecer el día que haya que hacer algo.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {lista.map(p => {
            const et = etiquetaPendiente(p.fecha, hoy, p.hora);
            return (
              <li key={p.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: et.atrasado ? "var(--st-wait-fg)" : "var(--brand-fg)", minWidth: 120 }}>{et.texto}</span>
                <span style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 14, color: "var(--fg-1)", overflowWrap: "anywhere" }}>{p.nota}</span>
                  <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 14px", fontSize: 13 }}>
                    <EstadoPendienteTag estado={p.estado} />
                    <PrioridadPendienteTag prioridad={p.prioridad} />
                  </span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
                    <span style={etiquetaChica}>Creado por {p.usuario?.nombre ?? "—"} · {fmtCreado(p.created_at)}</span>
                    {etiquetaRecurrencia(p.recurrencia, p.recurrencia_config) && (
                      <span style={etiquetaChica}><Repeat size={12} /> {etiquetaRecurrencia(p.recurrencia, p.recurrencia_config)}</span>
                    )}
                    {p.aviso_minutos > 0 && (
                      <span style={etiquetaChica}><BellRing size={12} /> Aviso {etiquetaAviso(p.aviso_minutos)}</span>
                    )}
                    <span style={etiquetaChica}>
                      {p.push && <><Smartphone size={12} /> Push</>}
                      {p.push && p.correo && " · "}
                      {p.correo && <><Mail size={12} /> Correo</>}
                    </span>
                  </span>
                </span>
                <span style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={btn} disabled={ocupado} onClick={() => correr(() => marcarPendienteHecho(p.id))}
                    title={p.recurrencia !== "ninguna" ? "Se crea el siguiente automáticamente" : undefined}>
                    <Check size={14} /> Hecho
                  </button>
                  <button type="button" style={btn} disabled={ocupado} title="Pospone una semana desde hoy"
                    onClick={() => correr(() => posponerPendiente(p.id, ymdDeFecha(addDays(new Date(), 7))))}>
                    +1 semana
                  </button>
                  <button type="button" style={btn} disabled={ocupado} aria-label={`Editar pendiente: ${p.nota}`} onClick={() => setDialogo(p)}>
                    <Pencil size={14} />
                  </button>
                  <button type="button" style={btn} disabled={ocupado} aria-label={`Borrar pendiente: ${p.nota}`}
                    onClick={() => setConfirmar({
                      title: "¿Eliminar este pendiente?",
                      description: "No se puede deshacer. Si solo ya no aplica, edítalo y márcalo como Cancelado.",
                      confirmLabel: "Eliminar",
                      onConfirm: async () => { await borrarPendientes([p.id]); await refrescar(); },
                    })}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {dialogo !== undefined && (
        <PendienteDialog key={dialogo?.id ?? "nuevo"} ordenId={ordenId} pendiente={dialogo}
          onClose={() => setDialogo(undefined)} onSaved={refrescar} />
      )}
      <ConfirmDeleteModal pending={confirmar} onClose={() => setConfirmar(null)} />
    </div>
  );
}
