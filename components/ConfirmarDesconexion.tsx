"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { revocarVinculo, DIAS_PARA_RECONECTAR, type MiVinculo } from "@/lib/envios-api";

/**
 * Confirmación fuerte para cortar una conexión con otra empresa: hay que
 * escribir su nombre. Frena el clic distraído; si igual pasa, el mismo lado
 * puede reconectar durante DIAS_PARA_RECONECTAR días.
 */
export default function ConfirmarDesconexion({ vinculo, onClose, onDone }: {
  vinculo: MiVinculo | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setTexto(""); setError(null); }, [vinculo?.id]);

  if (!vinculo) return null;
  const nombre = vinculo.contraparte;
  const coincide = texto.trim().toLowerCase() === nombre.trim().toLowerCase();
  const n = vinculo.ots_abiertas;
  const soyDueno = vinculo.contraparte_es === "contratista";

  const desconectar = async () => {
    setBusy(true);
    setError(null);
    try {
      await revocarVinculo(vinculo.id);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desconectar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Desconectar de ${nombre}`}
      onClose={onClose}
      busy={busy}
      width={480}
      footer={
        <>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} disabled={busy}
            style={{ height: 36, padding: "0 14px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            Cancelar
          </button>
          <button type="button" onClick={desconectar} disabled={!coincide || busy}
            style={{
              height: 36, padding: "0 14px", border: "none", borderRadius: "var(--r-md)", fontSize: 14, fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
              background: coincide ? "var(--danger)" : "var(--border-strong)", color: "#FFFFFF",
              cursor: coincide && !busy ? "pointer" : "default",
            }}>
            {busy && <Loader2 size={14} className="animate-spin" />} Desconectar
          </button>
        </>
      }
    >
      <p style={{ margin: 0, lineHeight: 1.55 }}>
        {soyDueno
          ? <>Ya no podrás enviarle OTs a <strong style={{ fontWeight: 500 }}>{nombre}</strong>.</>
          : <><strong style={{ fontWeight: 500 }}>{nombre}</strong> ya no podrá enviarte OTs.</>}
        {n > 0 && (soyDueno
          ? <> Las <strong style={{ fontWeight: 500 }}>{n} {n === 1 ? "OT abierta que tiene" : "OTs abiertas que tiene"}</strong> vuelven a tu bandeja sin técnicos asignados.</>
          : <> Dejarás de ver <strong style={{ fontWeight: 500 }}>{n} {n === 1 ? "OT abierta" : "OTs abiertas"}</strong>: vuelven a {nombre} para que las reasigne.</>)}
        {" "}Las OTs cerradas se conservan.
      </p>
      <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-2, var(--surface-hover))", color: "var(--fg-2)", lineHeight: 1.5 }}>
        Avisaremos a {nombre}. Si fue un error, podrás reconectar durante {DIAS_PARA_RECONECTAR} días
        y {n === 1 ? "esa OT vuelve" : "esas OTs vuelven"} tal como estaban.
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>Escribe <strong style={{ fontWeight: 500 }}>{nombre}</strong> para confirmar</span>
        <input
          value={texto} autoFocus onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && coincide) desconectar(); }}
          style={{ height: 36, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit" }}
        />
      </label>
      {error && <p style={{ margin: 0, color: "var(--danger)" }}>{error}</p>}
    </Modal>
  );
}
