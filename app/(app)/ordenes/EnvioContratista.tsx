"use client";

import { useEffect, useState } from "react";
import { Send, Check, MessageSquareWarning, Loader2 } from "lucide-react";
import { fetchEnvios, observarOT, type OTEnvio } from "@/lib/envios-api";
import { esElevado } from "@/lib/roles";
import type { Estado } from "@/types/ordenes";
import CompartirOTModal from "./CompartirOTModal";

type Props = {
  orden: { id: string; titulo: string | null; estado: Estado; workspace_id?: string | null };
  wsId: string | null;
  myId: string;
  myRol: string | null;
  /** Cierre con el chequeo de requisitos de siempre (ver closeWithRequirements). */
  onAprobar: () => Promise<void>;
  /** Pausa el cronómetro si corre y pasa la OT a en_revision. */
  onEnviarRevision: () => Promise<void>;
  onOrdenUpdated: (patch: { estado?: Estado; asignados_ids?: string[] }) => void;
  /** El modal "Compartir externamente" se abre desde la fila del N° de OT (OTDetail). */
  compartiendo: boolean;
  onCompartir: (abierto: boolean) => void;
};

const card: React.CSSProperties = {
  marginTop: 16, padding: "12px 14px", border: "1px solid var(--border)",
  borderRadius: "var(--r-md)", background: "var(--surface-1)",
  display: "flex", flexDirection: "column", gap: 10, fontSize: 14, color: "var(--fg-1)",
};
const fila: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
const btnBase: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px",
  borderRadius: "var(--r-sm)", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  border: "1px solid var(--border)", background: "var(--surface-1)", color: "var(--fg-1)",
};
const btnPrimario: React.CSSProperties = {
  ...btnBase, border: "1px solid var(--brand)", background: "var(--brand)", color: "var(--fg-on-brand)",
};
const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
  background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};

/**
 * Lado dueño: "Compartir externamente" (abre CompartirOTModal) y, con la OT en
 * revisión, Aprobar u Observar. Lado contratista (OT recibida): de quién viene
 * y el paso a revisión.
 */
export default function EnvioContratista({ orden, wsId, myId, myRol, onAprobar, onEnviarRevision, onOrdenUpdated, compartiendo, onCompartir }: Props) {
  const recibida = Boolean(orden.workspace_id && wsId && orden.workspace_id !== wsId);
  const cerrada = orden.estado === "completado";
  const puedeGestionar = esElevado(myRol);

  const [envios, setEnvios] = useState<OTEnvio[]>([]);
  const [cargado, setCargado] = useState(false);
  const [observando, setObservando] = useState(false);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);

  const recargar = () => fetchEnvios(orden.id).then(setEnvios).catch(() => setEnvios([]));

  useEffect(() => {
    let vivo = true;
    setCargado(false);
    fetchEnvios(orden.id)
      .then(e => { if (vivo) { setEnvios(e); setCargado(true); } })
      .catch(() => { if (vivo) setCargado(true); });
    return () => { vivo = false; };
  }, [orden.id]);

  const correr = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      setObservando(false);
      setTexto("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  if (!cargado) return null;

  // ── Lado proveedor: solo ve su propio envío ───────────────────────────────
  if (recibida) {
    const envio = envios[0];
    return (
      <div style={card}>
        <div style={fila}>
          <span>Cliente: <strong style={{ fontWeight: 500 }}>{envio?.nombre_origen ?? "—"}</strong></span>
        </div>
        {envio?.nota && <p style={{ margin: 0, color: "var(--fg-2)" }}>{envio.nota}</p>}
        {orden.estado === "en_revision" ? (
          <p style={{ margin: 0, color: "var(--fg-3)" }}>
            Enviada a revisión. Esperando la aprobación de {envio?.nombre_origen ?? "el cliente"}.
          </p>
        ) : !cerrada && (
          <div style={fila}>
            <button type="button" style={btnPrimario} disabled={busy}
              onClick={() => correr(onEnviarRevision)}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Enviar a revisión
            </button>
            <span style={{ color: "var(--fg-3)" }}>El cliente revisa y aprueba el cierre.</span>
          </div>
        )}
      </div>
    );
  }

  // ── Lado dueño ────────────────────────────────────────────────────────────
  if (!puedeGestionar || (!envios.length && cerrada)) return null;

  const modal = (
    <CompartirOTModal
      open={compartiendo}
      orden={orden}
      wsId={wsId}
      envios={envios}
      onClose={() => onCompartir(false)}
      onCambio={accion => {
        recargar();
        if (accion === "retirada") onOrdenUpdated({ asignados_ids: [] });
      }}
    />
  );

  // A quién se envió vive dentro del modal "Compartir externamente". Acá solo
  // queda la aprobación, y solo mientras un proveedor la tiene en revisión.
  if (!envios.length || orden.estado !== "en_revision") return modal;

  return (
    <div style={card}>
      {(
        observando ? (
          <>
            <textarea style={{ ...input, minHeight: 60, resize: "vertical" }} autoFocus
              placeholder="¿Qué tiene que corregir el proveedor?"
              value={texto} onChange={e => setTexto(e.target.value)} />
            <div style={fila}>
              <button type="button" style={btnPrimario} disabled={busy || !texto.trim()}
                onClick={() => correr(async () => {
                  await observarOT(orden.id, myId, texto);
                  onOrdenUpdated({ estado: "en_espera" });
                })}>
                {busy ? <Loader2 size={15} className="animate-spin" /> : <MessageSquareWarning size={15} />}
                Devolver con observación
              </button>
              <button type="button" style={btnBase} onClick={() => setObservando(false)}>Cancelar</button>
            </div>
          </>
        ) : (
          <div style={fila}>
            <span style={{ fontWeight: 500 }}>Pendiente de tu aprobación</span>
            <button type="button" style={btnPrimario} disabled={busy} onClick={() => correr(onAprobar)}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Aprobar
            </button>
            <button type="button" style={btnBase} disabled={busy} onClick={() => { setTexto(""); setObservando(true); }}>
              <MessageSquareWarning size={15} /> Observar
            </button>
          </div>
        )
      )}
      {modal}
    </div>
  );
}
