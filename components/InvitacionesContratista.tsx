"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchInvitaciones, aceptarInvitacion, type InvitacionContratista } from "@/lib/envios-api";

/**
 * Aviso para el contratista: un cliente lo invitó a recibir OTs. Aparece a
 * quien entró con el correo invitado; aceptar exige ser owner/admin (lo valida
 * la RPC). Sin invitaciones no renderiza nada.
 */
export default function InvitacionesContratista() {
  const [invitaciones, setInvitaciones] = useState<InvitacionContratista[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitaciones().then(setInvitaciones).catch(() => {});
  }, []);

  if (!invitaciones.length) return null;

  const aceptar = async (inv: InvitacionContratista) => {
    setBusy(inv.id);
    try {
      await aceptarInvitacion(inv.id);
      setInvitaciones(prev => prev.filter(i => i.id !== inv.id));
      alert(`Listo: ${inv.cliente} ya puede enviarte OTs. Aparecerán en tu bandeja de Órdenes.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo aceptar la invitación.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {invitaciones.map(inv => (
        <div key={inv.id} style={{
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          padding: "10px 20px", borderBottom: "1px solid var(--border)",
          background: "var(--brand-tint)", color: "var(--fg-1)", fontSize: 14,
        }}>
          <span style={{ flex: 1, minWidth: 200 }}>
            <strong style={{ fontWeight: 500 }}>{inv.cliente}</strong> quiere enviarte órdenes de trabajo por Pangui.
            Verás solo las OTs que te envíe; tus datos siguen siendo tuyos.
          </span>
          <button type="button" disabled={busy !== null} onClick={() => aceptar(inv)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 12px",
            border: "none", borderRadius: "var(--r-md)", background: "var(--brand)",
            color: "var(--fg-on-brand)", fontSize: 14, cursor: "pointer", fontFamily: "inherit",
          }}>
            {busy === inv.id && <Loader2 size={14} className="animate-spin" />} Aceptar
          </button>
        </div>
      ))}
    </div>
  );
}
