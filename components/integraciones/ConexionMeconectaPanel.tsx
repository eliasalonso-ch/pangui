"use client";

/**
 * Panel de conexión MeConecta (columna derecha de /integraciones/meconecta).
 *
 * La clave va del formulario directo a Vault (RPC set_meconecta_credentials) y
 * nunca vuelve: después solo se muestra el usuario. "Probar" pide al servidor
 * un login + lectura y refresca el estado guardado.
 */

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Loader2, X } from "lucide-react";
import {
  getConexionMeconecta, guardarCredencialesMeconecta, desconectarMeconecta, probarMeconecta,
  estadoVisible, type ConexionMeconecta,
} from "@/lib/meconecta-conexion";
import { EstadoBadge } from "@/components/integraciones/Logos";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";

// Mismos estilos de formulario que los diálogos de la app (RegistrarLecturaDialog).
const labelStyle: CSSProperties = {
  fontSize: 14, fontWeight: 400, color: "var(--fg-2)", marginBottom: 5, display: "block",
};
const inputStyle: CSSProperties = {
  width: "100%", height: 38, padding: "0 12px",
  border: "1px solid var(--border)", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", color: "var(--fg-1)",
  background: "var(--surface-1)", outline: "none", boxSizing: "border-box",
};

const btn = (primario: boolean): CSSProperties => ({
  height: 38, width: "100%", borderRadius: "var(--r-md)", fontSize: 14, fontWeight: 500, cursor: "pointer",
  border: primario ? "none" : "1px solid var(--border-strong)",
  background: primario ? "var(--brand)" : "var(--surface-1)",
  color: primario ? "var(--fg-on-brand)" : "var(--fg-1)",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
});

function fechaHora(iso: string | null): string {
  if (!iso) return "Todavía no";
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

export default function ConexionMeconectaPanel() {
  const [conexion, setConexion] = useState<ConexionMeconecta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [probando, setProbando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [confirmarBaja, setConfirmarBaja] = useState(false);

  const cargar = useCallback(async () => {
    try { setConexion(await getConexionMeconecta()); }
    catch { setAviso({ ok: false, texto: "No se pudo cargar el estado de la conexión" }); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function probar() {
    setProbando(true);
    setAviso(null);
    const r = await probarMeconecta();
    setAviso(r.ok ? { ok: true, texto: "Conexión verificada" } : { ok: false, texto: r.error ?? "La prueba falló" });
    await cargar();
    setProbando(false);
  }

  // ConfirmDeleteModal muestra el error y queda abierto si esto lanza.
  async function desconectar() {
    await desconectarMeconecta();
    setAviso({ ok: true, texto: "MeConecta desconectado. La clave se borró." });
    await cargar();
  }

  const estado = estadoVisible(conexion);

  return (
    <div style={{ padding: 20, border: "1px solid var(--border)", borderRadius: "var(--r-lg)", background: "var(--surface-1)", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--fg-1)" }}>Conexión</p>
        {!cargando && <EstadoBadge estado={estado} />}
      </div>

      {cargando ? (
        <div style={{ display: "grid", placeItems: "center", minHeight: 80, color: "var(--fg-3)" }}><Loader2 size={18} className="animate-spin" /></div>
      ) : conexion ? (
        <dl style={{ margin: 0, display: "grid", gap: 10, fontSize: 14 }}>
          <div><dt style={{ color: "var(--fg-3)" }}>Conectado como</dt><dd style={{ margin: 0, color: "var(--fg-1)", wordBreak: "break-all" }}>{conexion.username}</dd></div>
          <div><dt style={{ color: "var(--fg-3)" }}>Última sincronización</dt><dd style={{ margin: 0, color: "var(--fg-1)" }}>{fechaHora(conexion.last_sync_at)}</dd></div>
          {conexion.status !== "conectado" && conexion.last_error && (
            <div><dt style={{ color: "var(--fg-3)" }}>Último error</dt><dd style={{ margin: 0, color: "var(--danger)" }}>{conexion.last_error}</dd></div>
          )}
        </dl>
      ) : (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)" }}>
          Conecta la cuenta MeConecta de tu empresa para recibir aviso de cada solicitud nueva.
        </p>
      )}

      {aviso && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: aviso.ok ? "var(--success)" : "var(--danger)" }}>{aviso.texto}</p>
      )}

      {!cargando && (
        <div style={{ display: "grid", gap: 8 }}>
          {conexion ? (
            <>
              <button type="button" style={btn(true)} onClick={probar} disabled={probando}>
                {probando && <Loader2 size={15} className="animate-spin" />} Probar conexión
              </button>
              <button type="button" style={btn(false)} onClick={() => setDialogo(true)}>Cambiar clave</button>
              <button type="button" onClick={() => setConfirmarBaja(true)} style={{ ...btn(false), border: "none", background: "transparent", color: "var(--danger)" }}>
                Desconectar
              </button>
            </>
          ) : (
            <button type="button" style={btn(true)} onClick={() => setDialogo(true)}>Conectar</button>
          )}
        </div>
      )}

      <CredencialesDialog
        abierto={dialogo}
        usuarioInicial={conexion?.username ?? ""}
        onCerrar={() => setDialogo(false)}
        onGuardado={async (r) => {
          setAviso(r.ok ? { ok: true, texto: "Conectado. Pangui ya puede revisar MeConecta." } : { ok: false, texto: r.error ?? "La prueba falló" });
          await cargar();
        }}
      />

      <ConfirmDeleteModal
        pending={confirmarBaja ? {
          title: "¿Desconectar MeConecta?",
          description: "Se borra la clave guardada y Pangui deja de revisar el portal. Puedes volver a conectarlo cuando quieras.",
          confirmLabel: "Desconectar",
          onConfirm: desconectar,
        } : null}
        onClose={() => setConfirmarBaja(false)}
      />
    </div>
  );
}

function CredencialesDialog({ abierto, usuarioInicial, onCerrar, onGuardado }: {
  abierto: boolean;
  usuarioInicial: string;
  onCerrar: () => void;
  onGuardado: (r: { ok: boolean; error?: string }) => Promise<void>;
}) {
  const [usuario, setUsuario] = useState(usuarioInicial);
  const [clave, setClave] = useState("");
  const [autoriza, setAutoriza] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada apertura parte limpia: la clave nunca queda en memoria entre intentos.
  useEffect(() => {
    if (abierto) { setUsuario(usuarioInicial); setClave(""); setAutoriza(false); setError(null); }
  }, [abierto, usuarioInicial]);

  const listo = autoriza && usuario.trim() !== "" && clave !== "";

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      await guardarCredencialesMeconecta(usuario.trim(), clave, autoriza);
      setClave("");
      const r = await probarMeconecta();
      await onGuardado(r);
      if (r.ok) onCerrar();
      else setError(r.error ?? "MeConecta no aceptó la conexión");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto || typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onCerrar(); }}
    >
      <form
        onSubmit={enviar}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meconecta-dialog-titulo"
        style={{
          width: "100%", maxWidth: 460, maxHeight: "calc(100vh - 48px)",
          background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "var(--shadow-lg)", overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <h2 id="meconecta-dialog-titulo" style={{ margin: 0, fontSize: 14, fontWeight: 400, color: "var(--fg-1)" }}>
            Conectar MeConecta
          </h2>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} disabled={guardando}
            style={{ background: "none", border: "none", cursor: guardando ? "default" : "pointer", color: "var(--fg-4)", display: "flex", padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 16, overflowY: "auto" }}>
          <p style={{ margin: 0, fontSize: 14, color: "var(--fg-3)", lineHeight: 1.5 }}>
            Usa la cuenta de tu empresa en meconecta.udec.cl. La clave se guarda cifrada y no se vuelve a mostrar.
          </p>
          <div>
            <label htmlFor="meconecta-usuario" style={labelStyle}>Usuario (correo)</label>
            <input id="meconecta-usuario" type="email" autoComplete="off" required autoFocus disabled={guardando}
              value={usuario} onChange={(e) => setUsuario(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="meconecta-clave" style={labelStyle}>Clave</label>
            <input id="meconecta-clave" type="password" autoComplete="new-password" required disabled={guardando}
              value={clave} onChange={(e) => setClave(e.target.value)} style={inputStyle} />
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, lineHeight: 1.5, color: "var(--fg-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={autoriza} disabled={guardando} onChange={(e) => setAutoriza(e.target.checked)}
              style={{ marginTop: 3, accentColor: "var(--brand)" }} />
            Autorizo a Pangui a sincronizar mis solicitudes de MeConecta.
          </label>
          {error && (
            <p role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: 0, fontSize: 14, color: "var(--danger)", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
            </p>
          )}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={onCerrar} disabled={guardando}
            style={{ height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-1)", color: "var(--fg-2)", cursor: guardando ? "default" : "pointer" }}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando || !listo}
            style={{
              height: 34, padding: "0 14px", fontSize: 14, fontFamily: "inherit", borderRadius: 8,
              border: `1px solid ${guardando || !listo ? "var(--border)" : "var(--brand)"}`,
              background: guardando || !listo ? "var(--surface-2)" : "var(--brand)",
              color: guardando || !listo ? "var(--fg-4)" : "var(--fg-on-brand)",
              cursor: guardando || !listo ? "default" : "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
            {guardando && <Loader2 size={13} className="animate-spin" />}
            {guardando ? "Probando…" : "Guardar y probar"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
