"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, CheckCircle2, Clock } from "lucide-react";
import { btnSecundario, btnPrimarioDetalle, seccionDetalle } from "@/components/catalogo/PanelCatalogo";
import ConfirmarDesconexion from "@/components/ConfirmarDesconexion";
import {
  fetchVinculoDeProveedor, invitarContratista, revocarVinculo, reconectarVinculo,
  DIAS_PARA_RECONECTAR, type MiVinculo,
} from "@/lib/envios-api";

const texto: React.CSSProperties = { fontSize: 14, color: "var(--fg-2)", margin: 0, lineHeight: 1.6 };

const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
const limiteReconexion = (iso: string) =>
  fechaCorta(new Date(new Date(iso).getTime() + DIAS_PARA_RECONECTAR * 86_400_000).toISOString());

/**
 * Conecta este proveedor con su propio workspace de Pangui para enviarle OTs.
 * La conexión la acepta un owner/admin del contratista, entrando con el correo
 * invitado: nunca se conecta sola por RUT ni por nombre.
 */
export default function ConexionPangui({ proveedorId, emailSugerido, isAdmin }: {
  proveedorId: string;
  emailSugerido: string | null;
  isAdmin: boolean;
}) {
  const [vinculo, setVinculo] = useState<MiVinculo | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const recargar = () => fetchVinculoDeProveedor(proveedorId).then(setVinculo).catch(() => setVinculo(null));

  useEffect(() => {
    setVinculo(undefined);
    setEditando(false);
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId]);

  const correr = async (fn: () => Promise<unknown>, aviso?: (r: unknown) => string | null) => {
    setBusy(true);
    try {
      const r = await fn();
      await recargar();
      setEditando(false);
      const msg = aviso?.(r);
      if (msg) alert(msg);
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  if (vinculo === undefined) return null;

  return (
    <div style={seccionDetalle}>
      <p style={{ fontSize: 14, color: "var(--fg-1)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <Link2 size={16} /> Conexión con Pangui
      </p>

      {editando ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={texto}>
            Correo de un owner o admin del proveedor. Entrando a Pangui con ese correo verá la invitación.
          </p>
          <input
            type="email" value={email} autoFocus onChange={e => setEmail(e.target.value)}
            placeholder="admin@proveedor.cl"
            style={{ height: 34, padding: "0 10px", border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-1)", color: "var(--fg-1)", fontSize: 14, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnPrimarioDetalle} disabled={busy || !email.trim()}
              onClick={() => correr(() => invitarContratista(proveedorId, email))}>
              {busy && <Loader2 size={14} className="animate-spin" />} Invitar
            </button>
            <button style={btnSecundario} onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : vinculo?.estado === "activo" ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={{ ...texto, display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={16} style={{ color: "var(--st-done-dot)" }} />
            Conectado. Envíale OTs desde cada orden con “Compartir externamente”.
          </p>
          {isAdmin && (
            <button style={btnSecundario} disabled={busy} onClick={() => setConfirmando(true)}>
              Desconectar
            </button>
          )}
        </div>
      ) : vinculo?.estado === "invitado" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ ...texto, display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={16} style={{ color: "var(--st-wait-dot)" }} />
            Invitación pendiente para {vinculo.email_invitado}.
          </p>
          {isAdmin && (
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btnSecundario} onClick={() => { setEmail(vinculo.email_invitado); setEditando(true); }}>Cambiar correo</button>
              <button style={btnSecundario} disabled={busy} onClick={() => correr(() => revocarVinculo(vinculo.id))}>Cancelar invitación</button>
            </div>
          )}
        </div>
      ) : vinculo?.puedo_reconectar && vinculo.revocado_at ? (
        // Corte reciente hecho desde este lado: se deshace sin invitación nueva.
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={texto}>
            Desconectado el {fechaCorta(vinculo.revocado_at)}. Puedes reconectar hasta el {limiteReconexion(vinculo.revocado_at)}
            {" "}y vuelven las OTs abiertas que tenía.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnPrimarioDetalle} disabled={busy}
              onClick={() => correr(() => reconectarVinculo(vinculo.id), r =>
                (r as number) > 0 ? `Reconectado: ${r} ${r === 1 ? "OT volvió" : "OTs volvieron"} a ${vinculo.contraparte}.` : null)}>
              {busy && <Loader2 size={14} className="animate-spin" />} Reconectar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <p style={texto}>Si este proveedor usa Pangui, envíale OTs y míralas avanzar en vivo.</p>
          {isAdmin && (
            <button style={btnSecundario} onClick={() => { setEmail(emailSugerido ?? ""); setEditando(true); }}>
              Conectar con Pangui
            </button>
          )}
        </div>
      )}

      <ConfirmarDesconexion
        vinculo={confirmando ? vinculo : null}
        onClose={() => setConfirmando(false)}
        onDone={recargar}
      />
    </div>
  );
}
