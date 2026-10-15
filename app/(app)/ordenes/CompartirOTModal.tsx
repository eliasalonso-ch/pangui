"use client";

import { useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { MultiSelect } from "@/components/ordenes/CategoriaMultiSelect";
import {
  fetchVinculosActivos, enviarOT, retirarEnvio,
  type OTEnvio, type VinculoContratista,
} from "@/lib/envios-api";

const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
  background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
};
const enlace: React.CSSProperties = {
  padding: 0, border: "none", background: "none", color: "var(--brand)",
  fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
};
const caja: React.CSSProperties = {
  padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--surface-hover))",
};
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });

/**
 * "Compartir externamente": envía la OT a uno o varios proveedores conectados
 * o la retira de alguno. Equivale al Share de MaintainX, pero en vez de un link
 * público la OT aparece en el Pangui de cada proveedor.
 */
export default function CompartirOTModal({ open, orden, wsId, envios, onClose, onCambio }: {
  open: boolean;
  orden: { id: string; titulo: string | null };
  wsId: string | null;
  envios: OTEnvio[];
  onClose: () => void;
  /** Tras enviar o retirar: el padre recarga los envíos y la OT. */
  onCambio: (accion: "enviada" | "retirada") => void;
}) {
  const [vinculos, setVinculos] = useState<VinculoContratista[] | null>(null);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [conMensaje, setConMensaje] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setElegidos([]);
    setMensaje("");
    setConMensaje(false);
    if (!wsId) return;
    fetchVinculosActivos(wsId).then(setVinculos).catch(() => setVinculos([]));
  }, [open, wsId]);

  const yaEnviada = new Set(envios.map(e => e.vinculo_id));
  const disponibles = (vinculos ?? []).filter(v => !yaEnviada.has(v.id));

  const correr = async (fn: () => Promise<unknown>, accion: "enviada" | "retirada", cerrar: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onCambio(accion);
      if (cerrar) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  const enviar = () => correr(async () => {
    for (const id of elegidos) await enviarOT(orden.id, id, conMensaje ? mensaje : "");
  }, "enviada", true);

  const copiarEnlace = async () => {
    // El mismo enlace sirve a todos: cada uno abre la OT en su propio Pangui.
    await navigator.clipboard.writeText(`${window.location.origin}/ordenes?id=${orden.id}`);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  const n = elegidos.length;

  return (
    <Modal
      open={open}
      title={`Compartir “${orden.titulo || "Sin título"}”`}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <a href="/proveedores" style={{ ...enlace, textDecoration: "none" }}>Administrar proveedores</a>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} disabled={busy} style={{ ...enlace, padding: "0 6px" }}>Cancelar</button>
          <button
            type="button" disabled={busy || n === 0} onClick={enviar}
            style={{
              height: 38, padding: "0 16px", border: "none", borderRadius: "var(--r-md)", fontSize: 14, fontWeight: 500,
              fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
              background: n ? "var(--brand)" : "var(--border-strong)", color: "var(--fg-on-brand)",
              cursor: n && !busy ? "pointer" : "default",
            }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {n <= 1 ? "Enviar OT" : `Enviar a ${n} proveedores`}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, color: "var(--fg-2)", lineHeight: 1.55 }}>
        Envía esta OT a uno o varios proveedores conectados. Cada uno la ejecuta en su propio Pangui
        y te la devuelve en revisión para que la apruebes.
      </p>

      <div style={{ ...caja, display: "flex", gap: 8, color: "var(--fg-2)", lineHeight: 1.5 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Cada proveedor verá esta OT, su activo, ubicación y procedimientos. Nada más de tu espacio de trabajo.</span>
      </div>

      {envios.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 500 }}>Enviada a</span>
            <button type="button" style={enlace} onClick={copiarEnlace}>{copiado ? "Enlace copiado" : "Copiar enlace"}</button>
          </div>
          <div style={{ ...caja, padding: 0 }}>
            {envios.map((e, i) => (
              <div key={e.vinculo_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--st-done-dot)", flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {e.nombre_destino}
                  <span style={{ color: "var(--fg-3)" }}> · {fecha(e.enviado_at)}</span>
                </span>
                <button
                  type="button" disabled={busy}
                  style={{ ...enlace, color: "var(--danger)" }}
                  onClick={() => {
                    if (confirm(`¿Retirar la OT de ${e.nombre_destino}? Dejará de verla y se quitarán sus técnicos.`)) {
                      correr(() => retirarEnvio(orden.id, e.vinculo_id), "retirada", false);
                    }
                  }}
                >
                  Retirar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontWeight: 500 }}>{envios.length ? "Enviar también a" : "Enviar a"}</span>
        {vinculos === null ? (
          <Loader2 size={16} className="animate-spin" />
        ) : vinculos.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-2)" }}>
            Aún no tienes proveedores conectados. Abre un proveedor en{" "}
            <a href="/proveedores" style={{ color: "var(--brand)" }}>Proveedores</a> y usa “Conectar con Pangui”.
          </p>
        ) : disponibles.length === 0 ? (
          <p style={{ margin: 0, color: "var(--fg-3)" }}>Ya está enviada a todos tus proveedores conectados.</p>
        ) : (
          <MultiSelect
            options={disponibles.map(v => ({ id: v.id, label: v.proveedor?.nombre ?? v.email_invitado }))}
            value={elegidos}
            onChange={setElegidos}
            vacio="Sin proveedores"
          />
        )}
      </div>

      {conMensaje ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 500 }}>Mensaje para {n === 1 ? "el proveedor" : "los proveedores"}</span>
          <textarea style={{ ...input, minHeight: 80, resize: "vertical" }} value={mensaje} autoFocus
            onChange={e => setMensaje(e.target.value)} placeholder="Ej.: coordinar acceso con el ITO de la Central Térmica." />
        </label>
      ) : (
        disponibles.length > 0 && (
          <button type="button" style={{ ...enlace, alignSelf: "flex-start" }} onClick={() => setConMensaje(true)}>
            Incluir un mensaje
          </button>
        )
      )}

      {error && <p style={{ margin: 0, color: "var(--danger)" }}>{error}</p>}
    </Modal>
  );
}
