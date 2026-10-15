"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ConfirmarDesconexion from "@/components/ConfirmarDesconexion";
import {
  fetchMisVinculos, reconectarVinculo, DIAS_PARA_RECONECTAR, type MiVinculo,
} from "@/lib/envios-api";

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
const boton: React.CSSProperties = {
  height: 32, padding: "0 12px", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
  background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit",
  display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0,
};

/**
 * Lado contratista: los clientes que le envían OTs desde su propio workspace.
 * Desde acá se corta la conexión (y se deshace el corte durante 30 días). No
 * renderiza nada si este workspace no es contratista de nadie.
 */
export default function ClientesConectados() {
  const [vinculos, setVinculos] = useState<MiVinculo[] | null>(null);
  const [confirmando, setConfirmando] = useState<MiVinculo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const recargar = () => fetchMisVinculos()
    .then(v => setVinculos(v.filter(x => x.contraparte_es === "cliente" && (x.estado === "activo" || x.puedo_reconectar))))
    .catch(() => setVinculos([]));
  useEffect(() => { recargar(); }, []);

  if (!vinculos?.length) return null;

  const reconectar = async (v: MiVinculo) => {
    setBusy(v.id);
    try {
      const n = await reconectarVinculo(v.id);
      await recargar();
      if (n > 0) alert(`Reconectado: ${n} ${n === 1 ? "OT volvió" : "OTs volvieron"} a tu bandeja.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo reconectar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
      <p style={{ fontSize: 14, color: "var(--fg-1)", margin: 0 }}>Clientes conectados</p>
      <p style={{ fontSize: 14, color: "var(--fg-3)", margin: "4px 0 12px" }}>
        Empresas que te envían órdenes de trabajo desde su propio Pangui. Solo ves lo que te envían.
      </p>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {vinculos.map((v, i) => (
          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, color: "var(--fg-1)" }}>{v.contraparte}</p>
              <p style={{ margin: "2px 0 0", fontSize: 14, color: "var(--fg-3)" }}>
                {v.estado === "activo"
                  ? `Conectado${v.aceptado_at ? ` desde el ${fechaCorta(v.aceptado_at)}` : ""} · ${v.ots_abiertas} ${v.ots_abiertas === 1 ? "OT abierta" : "OTs abiertas"}`
                  : `Desconectado el ${fechaCorta(v.revocado_at!)} · puedes reconectar por ${DIAS_PARA_RECONECTAR} días`}
              </p>
            </div>
            {v.estado === "activo" ? (
              <button type="button" style={boton} onClick={() => setConfirmando(v)}>
                Desconectar
              </button>
            ) : (
              <button type="button" style={{ ...boton, background: "var(--brand)", border: "none", color: "var(--fg-on-brand)" }}
                disabled={busy !== null} onClick={() => reconectar(v)}>
                {busy === v.id && <Loader2 size={14} className="animate-spin" />} Reconectar
              </button>
            )}
          </div>
        ))}
      </div>
      <ConfirmarDesconexion vinculo={confirmando} onClose={() => setConfirmando(null)} onDone={recargar} />
    </div>
  );
}
